import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

const root=new URL('../',import.meta.url);
const id=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const user={alice:id(1),bob:id(2),moderator:id(3),owner:id(4),unverified:id(5),anonymous:id(6),newUser:id(7)};
const session=(uid)=>uid.replace('00000000-','10000000-');
let db;
async function runAs(uid,sql,args=[],extra={}) {
  return db.transaction(async tx=>{
    const role=uid ? 'authenticated' : 'anon';
    await tx.exec(`set local role ${role}`);
    const claims=uid ? {sub:uid,role,session_id:session(uid),aal:'aal1',...extra} : {};
    await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);
    return (await tx.query(sql,args)).rows;
  });
}
async function rpc(uid,name,args=[],extra={}) {
  assert.match(name,/^community_[a-z_]+$/);
  return (await runAs(uid,`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`,args,extra))[0].value;
}
const admin={aal:'aal2'};
const create=(uid,kind='topic',title='A topic',body='A plain-text body',topic=null)=>rpc(uid,'community_create_post',[kind,title,body,topic]);
const moderate=(post,action)=>rpc(user.moderator,'community_moderate_post',[post.id,post.version,action,'Moderation test'],admin);
async function denied(action,code,message) {
  await assert.rejects(action,e=>{ assert.equal(e.code,code,e.message); if(message) assert.match(e.message,message); return true; });
}
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];

test('DEX community authorization and mutations on actual PostgreSQL (PGlite)',async t=>{
  db=new PGlite();
  t.after(()=>db.close());
  await db.exec(await readFile(new URL('tests/auth-stubs.sql',root),'utf8'));
  await db.exec(await readFile(new URL('tests/auto-rls-fixture.sql',root),'utf8'));
  const migrations=(await readdir(new URL('migrations/',root))).filter(x=>x.endsWith('.sql')).sort();
  assert.deepEqual(migrations,['20261012030809_dex_community_foundation.sql','20261012030835_harden_auto_rls_execute.sql']);
  for(const file of migrations) {
    try { await db.exec(await readFile(new URL(`migrations/${file}`,root),'utf8')); } catch(e) { delete e.query; throw e; }
  }
  for(const [name,uid] of Object.entries(user)) {
    await db.query(`insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,$3,$4)`,
      [uid,`${name}@example.invalid`,name==='unverified'?null:new Date().toISOString(),name==='anonymous']);
    await db.query('insert into auth.sessions(id,user_id,aal,factor_id) values($1,$2,$3,$4)',[session(uid),uid,'aal2',uid]);
    await db.query("insert into auth.mfa_factors(id,user_id,status) values($1,$1,'verified')",[uid]);
    if(name!=='newUser') await db.query('insert into community_private.community_accounts(user_id) values($1)',[uid]);
  }
  await db.query("insert into community_private.community_roles(user_id,role) values($1,'moderator'),($2,'owner')",[user.moderator,user.owner]);
  let topic,reply,message;

  await t.test('migration restricts legacy grants and pins every definer search_path',async()=>{
    assert.equal(await scalar("select has_function_privilege('anon','public.rls_auto_enable()','execute')"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','public.rls_auto_enable()','execute')"),false);
    assert.equal(await scalar("select evtenabled from pg_event_trigger where evtname='ensure_rls'"),'O');
    assert.equal(await scalar("select has_table_privilege('anon','public.community_posts','select')"),true);
    assert.equal(await scalar("select has_table_privilege('authenticated','public.community_posts','insert,update,delete')"),false);
    assert.equal(await scalar("select has_function_privilege('anon','public.community_create_post(text,text,text,uuid)','execute')"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','community_private.edit_post(uuid,integer,text,text,boolean,text)','execute')"),false);
    assert.equal(await scalar("select has_function_privilege('authenticated','community_private.require_actor(boolean)','execute')"),false);
    const funcs=(await db.query(`select n.nspname,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='community_private' or (n.nspname='public' and p.proname like 'community_%')`)).rows;
    const entries=new Set(['topic_is_visible','community_me','community_create_post','community_edit_post','community_admin_edit_post','community_moderate_post','community_admin_list','community_admin_accounts','community_set_account_state','community_post_history','community_admin_audit']);
    const privateFunctions=(await db.query("select p.oid::regprocedure::text as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='community_private'")).rows;
    for(const f of privateFunctions) {
      if(!entries.has(f.proname)) {
        for(const role of ['anon','authenticated']) assert.equal(await scalar("select has_function_privilege($1,$2,'execute')",[role,f.signature]),false,f.signature);
      }
    }
    for(const f of funcs) {
      assert.ok(f.proconfig.includes('search_path=""'),f.proname);
      if(f.nspname==='public') assert.equal(f.prosecdef,false,f.proname);
    }
    assert.equal(await scalar("select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and (n.nspname='community_private' or c.relname='community_posts') and not c.relrowsecurity"),0);
  });

  await t.test('anonymous RPC and direct table/private writes are forbidden',async()=>{
    await denied(()=>create(null),'42501');
    for(const uid of [null,user.alice,user.owner]) {
      await denied(()=>runAs(uid,"insert into public.community_posts(kind,title,body,author_id) values('topic','X','X',$1)",[user.alice],admin),'42501');
      await denied(()=>runAs(uid,"select * from community_private.community_roles",[],admin),'42501');
      await denied(()=>runAs(uid,"insert into community_private.community_roles(user_id,role) values($1,'owner')",[user.bob],admin),'42501');
    }
  });

  await t.test('new account status is read-only; no user or metadata becomes owner',async()=>{
    const me=await rpc(user.newUser,'community_me',[],{user_metadata:{role:'owner'},app_metadata:{role:'owner'}});
    assert.equal(me.role,'member'); assert.equal(me.version,0); assert.equal(me.can_post,true); assert.equal(me.can_moderate,false);
    assert.equal(await scalar('select count(*)::int from community_private.community_accounts where user_id=$1',[user.newUser]),0);
    await denied(()=>rpc(user.newUser,'community_admin_list',[],{...admin,user_metadata:{role:'owner'}}),'PT403',/moderator_required/);
  });

  await t.test('unverified and anonymous-authenticated identities cannot post',async()=>{
    await denied(()=>create(user.unverified),'PT403',/verified_email_required/);
    await denied(()=>create(user.anonymous),'PT403',/verified_email_required/);
    assert.equal((await rpc(user.unverified,'community_me')).can_post,false);
  });

  await t.test('invalid, absent, revoked or expired session cannot authenticate',async()=>{
    for(const value of [null,'invalid',id(99)]) await denied(()=>rpc(user.alice,'community_me',[],{session_id:value}),'PT401');
    await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where user_id=$1',[user.alice]);
    await denied(()=>create(user.alice),'PT401',/session_revoked/);
    await db.query('update auth.sessions set not_after=null where user_id=$1',[user.alice]);
    await db.query('delete from auth.sessions where user_id=$1',[user.moderator]);
    await denied(()=>rpc(user.moderator,'community_admin_list',[],admin),'PT401',/session_revoked/);
    await db.query("insert into auth.sessions(id,user_id,aal,factor_id) values($1,$2,'aal2',$2)",[session(user.moderator),user.moderator]);
  });

  await t.test('verified members create all post kinds; author comes from auth.uid',async()=>{
    topic=await create(user.alice);
    reply=await create(user.bob,'reply','','A response',topic.id);
    message=await create(user.alice,'message','','A message');
    assert.equal(topic.author_id,user.alice); assert.equal(reply.author_id,user.bob);
    assert.equal(topic.version,1); assert.equal(topic.hidden,false); assert.equal(reply.topic_id,topic.id);
    assert.equal((await runAs(null,'select id from public.community_posts')).length,3);
  });

  await t.test('input shape, content lengths and parent type are enforced',async()=>{
    await denied(()=>create(user.alice,'topic','','body'),'PT422');
    await denied(()=>create(user.alice,'reply','forbidden title','body',topic.id),'PT422');
    await denied(()=>create(user.alice,'message','','x'.repeat(5001)),'PT422');
    await denied(()=>create(user.alice,'topic','x'.repeat(161)),'PT422');
    await denied(()=>create(user.alice,'reply','','body'),'PT422');
    await denied(()=>create(user.alice,'reply','','body',message.id),'PT404');
    await denied(()=>create(user.alice,'topic','Title','body',topic.id),'PT422');
    await denied(()=>create(user.alice,null),'PT422');
  });

  await t.test('self edit rejects another author and uses transactional expected_version',async()=>{
    await denied(()=>rpc(user.bob,'community_edit_post',[topic.id,1,'Hijack','body']),'PT403',/post_owner_required/);
    topic=await rpc(user.alice,'community_edit_post',[topic.id,1,'Edited title','Edited body']);
    assert.equal(topic.version,2); assert.equal(topic.author_id,user.alice);
    await denied(()=>rpc(user.alice,'community_edit_post',[topic.id,1,'Stale title','body']),'PT409',/version_conflict/);
    const rows=await runAs(null,'select * from public.community_posts where id=$1',[topic.id]);
    assert.equal(rows[0].title,'Edited title'); assert.equal(rows[0].version,2);
  });

  await t.test('two submitted stale-client edits yield exactly one success',async()=>{
    const version=topic.version;
    const results=await Promise.allSettled([
      rpc(user.alice,'community_edit_post',[topic.id,version,'Client A','A']),
      rpc(user.alice,'community_edit_post',[topic.id,version,'Client B','B'])
    ]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(results.find(x=>x.status==='rejected').reason.code,'PT409');
    topic=results.find(x=>x.status==='fulfilled').value;
    assert.equal(topic.version,version+1);
    // PGlite queues transactions on one connection. This verifies CAS failure,
    // not multi-connection PostgreSQL lock scheduling; see README acceptance gate.
  });

  await t.test('member, AAL1 moderator, missing AAL cannot use admin APIs',async()=>{
    for(const [uid,claims] of [[user.alice,admin],[user.moderator,{}],[user.moderator,{aal:null}]]) {
      await denied(()=>rpc(uid,'community_admin_list',[],claims),'PT403');
      await denied(()=>rpc(uid,'community_moderate_post',[topic.id,topic.version,'hide','Reason'],claims),'PT403');
      await denied(()=>rpc(uid,'community_admin_edit_post',[topic.id,topic.version,'Edited','Body','Reason'],claims),'PT403');
      await denied(()=>rpc(uid,'community_post_history',[topic.id],claims),'PT403');
    }
    assert.equal((await rpc(user.moderator,'community_me')).can_moderate,false);
    assert.equal((await rpc(user.moderator,'community_me',[],admin)).can_moderate,true);
  });

  await t.test('stale AAL2 token cannot survive live session downgrade or factor removal',async()=>{
    await db.query("update auth.sessions set aal='aal1' where user_id=$1",[user.moderator]);
    assert.equal((await rpc(user.moderator,'community_me',[],admin)).can_moderate,false);
    await denied(()=>rpc(user.moderator,'community_admin_list',[],admin),'PT403',/mfa_required/);
    await db.query("update auth.sessions set aal='aal2' where user_id=$1",[user.moderator]);
    await db.query("update auth.mfa_factors set status='unverified' where user_id=$1",[user.moderator]);
    await denied(()=>moderate(topic,'hide'),'PT403',/mfa_required/);
    await db.query('delete from auth.mfa_factors where user_id=$1',[user.moderator]);
    await denied(()=>rpc(user.moderator,'community_post_history',[topic.id],admin),'PT403',/mfa_required/);
    await db.query("insert into auth.mfa_factors(id,user_id,status) values($1,$1,'verified')",[user.moderator]);
    await denied(()=>rpc(user.alice,'community_me',[],{session_id:session(user.moderator)}),'PT401',/session_revoked/);
  });

  await t.test('hide removes topic and all child replies, including authenticated direct SELECT',async()=>{
    topic=await moderate(topic,'hide');
    for(const uid of [null,user.alice,user.moderator]) {
      const rows=await runAs(uid,'select id from public.community_posts',[],admin);
      assert.deepEqual(rows.map(x=>x.id),[message.id]);
    }
    const all=await rpc(user.moderator,'community_admin_list',[],admin);
    assert.equal(all.length,3); assert.equal(all.find(x=>x.id===topic.id).hidden,true);
    assert.equal((await rpc(user.moderator,'community_admin_list',[null,'',false,50,0],admin)).length,1);
    await denied(()=>create(user.bob,'reply','','Hidden parent reply',topic.id),'PT404');
    await denied(()=>rpc(user.bob,'community_edit_post',[reply.id,reply.version,'','Edit hidden-parent reply']),'PT404');
    topic=await moderate(topic,'restore');
    assert.equal((await runAs(null,'select id from public.community_posts')).length,3);
  });

  await t.test('topic lock blocks reply create/self edits; moderator can edit with reason',async()=>{
    topic=await moderate(topic,'lock');
    await denied(()=>create(user.bob,'reply','','Locked topic reply',topic.id),'PT403',/topic_locked/);
    await denied(()=>rpc(user.alice,'community_edit_post',[topic.id,topic.version,'Title','Body']),'PT403',/topic_locked/);
    await denied(()=>rpc(user.bob,'community_edit_post',[reply.id,reply.version,'','Edit']),'PT403',/topic_locked/);
    await denied(()=>rpc(user.moderator,'community_admin_edit_post',[reply.id,reply.version,'','Moderation edit',''],admin),'PT422',/reason_required/);
    reply=await rpc(user.moderator,'community_admin_edit_post',[reply.id,reply.version,'','Moderation edit','Remove personal data'],admin);
    assert.equal(reply.author_id,user.bob); assert.equal(reply.version,2);
    topic=await moderate(topic,'unlock');
    topic=await moderate(topic,'pin'); assert.equal(topic.pinned,true);
    topic=await moderate(topic,'unpin'); assert.equal(topic.pinned,false);
    await denied(()=>moderate(reply,'pin'),'PT422',/topic_action_required/);
  });

  await t.test('live role revocation defeats an existing AAL2 session and stale claims',async()=>{
    await db.query('delete from community_private.community_roles where user_id=$1',[user.moderator]);
    const stale={...admin,app_metadata:{role:'owner'},user_metadata:{role:'moderator'}};
    assert.equal((await rpc(user.moderator,'community_me',[],stale)).can_moderate,false);
    await denied(()=>rpc(user.moderator,'community_admin_list',[],stale),'PT403',/moderator_required/);
    await denied(()=>rpc(user.moderator,'community_moderate_post',[topic.id,topic.version,'hide','Reason'],stale),'PT403');
    await db.query("insert into community_private.community_roles(user_id,role) values($1,'moderator')",[user.moderator]);
  });

  await t.test('owner-only account/audit APIs, suspension immediately defeats old session',async()=>{
    for(const name of ['community_admin_accounts','community_admin_audit']) {
      await denied(()=>rpc(user.moderator,name,[],admin),'PT403',/owner_required/);
    }
    await denied(()=>rpc(user.moderator,'community_set_account_state',[user.alice,1,'suspended','Reason'],admin),'PT403',/owner_required/);
    let account=await rpc(user.owner,'community_set_account_state',[user.alice,1,'suspended','Spam'],admin);
    assert.equal(account.state,'suspended'); assert.equal(account.version,2);
    assert.equal((await rpc(user.alice,'community_me')).can_post,false);
    await denied(()=>create(user.alice),'PT403',/account_suspended/);
    await denied(()=>rpc(user.alice,'community_edit_post',[topic.id,topic.version,'Title','Body']),'PT403',/account_suspended/);
    await denied(()=>rpc(user.owner,'community_set_account_state',[user.alice,1,'active','Stale'],admin),'PT409');
    account=await rpc(user.owner,'community_set_account_state',[user.alice,2,'active','Reviewed'],admin);
    assert.equal(account.version,3); assert.equal((await rpc(user.alice,'community_me')).can_post,true);
  });

  await t.test('last active owner cannot suspend self; suspended admin cannot moderate',async()=>{
    await denied(()=>rpc(user.owner,'community_set_account_state',[user.owner,1,'suspended','Self'],admin),'PT409',/last_active_owner/);
    await rpc(user.owner,'community_set_account_state',[user.moderator,1,'suspended','Review'],admin);
    await denied(()=>rpc(user.moderator,'community_admin_list',[],admin),'PT403',/account_suspended/);
    await rpc(user.owner,'community_set_account_state',[user.moderator,2,'active','Restored'],admin);
  });

  await t.test('self suspension is denied even when another owner exists',async()=>{
    await db.query("insert into community_private.community_roles(user_id,role) values($1,'owner')",[user.bob]);
    await denied(()=>rpc(user.owner,'community_set_account_state',[user.owner,1,'suspended','Self'],admin),'PT403',/self_suspension_forbidden/);
    await db.query('delete from community_private.community_roles where user_id=$1',[user.bob]);
  });

  await t.test('live auth user ban, email loss and deletion disable previous valid session',async()=>{
    await db.query('update auth.users set banned_until=now()+interval \'1 hour\' where id=$1',[user.bob]);
    await denied(()=>create(user.bob),'PT401',/account_unavailable/);
    await db.query('update auth.users set banned_until=null,email_confirmed_at=null where id=$1',[user.bob]);
    await denied(()=>create(user.bob),'PT403',/verified_email_required/);
    await db.query('update auth.users set email_confirmed_at=now(),deleted_at=now() where id=$1',[user.bob]);
    await denied(()=>create(user.bob),'PT401',/account_unavailable/);
    await db.query('update auth.users set deleted_at=null where id=$1',[user.bob]);
  });

  await t.test('history/audit contain all successful versions and no failed writes',async()=>{
    const history=await rpc(user.moderator,'community_post_history',[topic.id],admin);
    assert.equal(history.length,topic.version);
    assert.deepEqual(history.map(x=>x.version),Array.from({length:topic.version},(_,i)=>topic.version-i));
    assert.equal(history[0].snapshot.author_id,user.alice);
    const audit=await rpc(user.owner,'community_admin_audit',[],admin);
    assert.ok(audit.some(x=>x.action==='suspend' && x.entity_id===user.alice));
    assert.ok(audit.some(x=>x.action==='admin_edit' && x.reason==='Remove personal data'));
    const before=await scalar('select count(*)::int from community_private.community_audit');
    await denied(()=>rpc(user.alice,'community_edit_post',[topic.id,1,'Stale','Body']),'PT409');
    assert.equal(await scalar('select count(*)::int from community_private.community_audit'),before);
  });

  await t.test('audit INSERT failure rolls back post change and revision atomically',async()=>{
    const count=await scalar('select count(*)::int from community_private.community_revisions');
    await db.exec(`create function community_private.test_fail_audit() returns trigger language plpgsql as $$
      begin raise sqlstate 'PT503' using message='test_audit_unavailable'; end; $$;
      create trigger test_fail_audit before insert on community_private.community_audit for each row execute function community_private.test_fail_audit();`);
    await denied(()=>rpc(user.alice,'community_edit_post',[topic.id,topic.version,'Should roll back','Changed']),'PT503');
    assert.equal(await scalar('select count(*)::int from community_private.community_revisions'),count);
    assert.equal(await scalar('select version from public.community_posts where id=$1',[topic.id]),topic.version);
    assert.equal(await scalar('select title from public.community_posts where id=$1',[topic.id]),topic.title);
    await db.exec('drop trigger test_fail_audit on community_private.community_audit; drop function community_private.test_fail_audit();');
  });

  await t.test('direct private entry calls enforce identity and audit list excludes content',async()=>{
    await denied(()=>runAs(user.alice,'select community_private.community_admin_list()',[],admin),'PT403');
    await denied(()=>runAs(user.moderator,'select community_private.community_moderate_post($1,$2,$3,$4)',[topic.id,topic.version,'hide','Reason'],{aal:'aal1'}),'PT403');
    const audit=await rpc(user.owner,'community_admin_audit',[],admin);
    assert.ok(audit.every(x=>!('before_data' in x) && !('after_data' in x)));
    const page=await rpc(user.moderator,'community_post_history',[topic.id,2,1],admin);
    assert.deepEqual(page.map(x=>x.version),[topic.version-1,topic.version-2]);
    await denied(()=>rpc(user.moderator,'community_post_history',[topic.id,51,0],admin),'PT422');
  });

  await t.test('no-op edits and whitespace/oversize reasons cannot append audit',async()=>{
    await denied(()=>rpc(user.alice,'community_edit_post',[topic.id,topic.version,topic.title,topic.body]),'PT409',/no_changes/);
    await denied(()=>moderate(topic,'unpin'),'PT409',/no_changes/);
    await denied(()=>rpc(user.moderator,'community_admin_edit_post',[topic.id,topic.version,'Title','Body',' '.repeat(501)+'x'],admin),'PT422');
    await denied(()=>rpc(user.moderator,'community_moderate_post',[topic.id,topic.version,'hide','\n\t'],admin),'PT422');
    await denied(()=>create(user.alice,'topic','Title','\n\t'),'PT422');
  });

  await t.test('immutable identities, audit/history and permanent deletion guards hold',async()=>{
    await denied(()=>db.query('update public.community_posts set author_id=$1,version=version+1 where id=$2',[user.bob,topic.id]),'PT403',/immutable_post_identity/);
    await denied(()=>db.query('delete from public.community_posts where id=$1',[message.id]),'PT403',/immutable_record/);
    await denied(()=>db.query("update community_private.community_audit set reason='Changed'"),'PT403',/immutable_record/);
    await denied(()=>db.query('delete from community_private.community_revisions'),'PT403',/immutable_record/);
    for(const table of ['community_audit','community_revisions','community_accounts']) {
      await denied(()=>runAs(user.owner,`delete from community_private.${table}`,[],admin),'42501');
    }
  });

  await t.test('bounded literal search and input validation avoid wildcard injection',async()=>{
    assert.equal((await rpc(user.moderator,'community_admin_list',[null,'% OR 1=1',true,50,0],admin)).length,0);
    assert.equal((await rpc(user.moderator,'community_admin_list',['reply','Moderation',true,50,0],admin)).length,1);
    await denied(()=>rpc(user.moderator,'community_admin_list',[null,'',true,101,0],admin),'PT422');
    await denied(()=>rpc(user.owner,'community_admin_audit',[10,-1],admin),'PT422');
  });

  await t.test('direct member self edits cannot bypass database mutation quota',async()=>{
    const used=await scalar("select count(*)::int from community_private.community_audit where actor_id=$1 and created_at > now()-interval '1 minute'",[user.bob]);
    for(let i=used;i<30;i++) reply=await rpc(user.bob,'community_edit_post',[reply.id,reply.version,'',`Edited ${i}`]);
    await denied(()=>rpc(user.bob,'community_edit_post',[reply.id,reply.version,'','One more edit']),'PT429',/mutation_rate_limit/);
  });

  await t.test('server-side posting quota covers direct RPC calls and lazy account stays member',async()=>{
    for(let i=0;i<10;i++) await create(user.newUser,'message','',`Message ${i}`);
    await denied(()=>create(user.newUser,'message','','Message 11'),'PT429',/posting_rate_limit/);
    const me=await rpc(user.newUser,'community_me');
    assert.equal(me.role,'member'); assert.equal(me.version,1); assert.equal(me.can_post,true);
  });
});
