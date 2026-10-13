import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHmac,webcrypto} from 'node:crypto';
import {createCommunityHandler} from '../../api/handler.mjs';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
const root=new URL('../',import.meta.url),base=root;
const owner='ff34f10e-53b0-45b9-951a-34bcbb032dad';
const sid='10000000-0000-4000-8000-000000000001';
const mod='00000000-0000-4000-8000-000000000002',bob='00000000-0000-4000-8000-000000000003';
const sid2='10000000-0000-4000-8000-000000000002';
const key='SYNTHETIC_TEST_ONLY_NOT_A_REAL_KEY_0123456789abcdef';
let db;
async function asUser(uid,sql,args=[],claims={}){
 return db.transaction(async tx=>{
  await tx.exec(`set local role ${uid?'authenticated':'anon'}`);
  await tx.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify(uid?{sub:uid,role:'authenticated',session_id:uid===owner?sid:uid,aal:'aal1',amr:[{method:'password'}],...claims}:{})]);
  return (await tx.query(sql,args)).rows;
 });
}
async function rpc(name,args=[],claims={},uid=owner){return (await asUser(uid,`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args,claims))[0].value;}
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function rejects(fn,code='PT403',match){await assert.rejects(fn,e=>{assert.equal(e.code,code,e.message);if(match)assert.match(e.message,match);return true;});}
const hmac=fields=>createHmac('sha256',key).update(fields.join('\n'),'utf8').digest('hex');
function codeDigest(c,code='001234'){return hmac(['otp-v1',c.project,c.generation,c.id,c.user_id,c.original_session_id,c.salt,code]);}
function sign(c,d,domain='register-v1'){return hmac([domain,c.project,c.generation,c.id,c.user_id,c.original_session_id,c.scope,c.binding_digest,String(c.expires_epoch),c.salt,d]);}
async function resetRate(){await db.query("update community_private.community_admin_challenges set created_at=clock_timestamp()-interval '2 hours'");}
async function begin(args=[]){await resetRate();const c=await rpc('community_admin_stepup_begin',args);assert.equal(c.created,true);return c;}
async function issue(c,code='001234'){
 const d=codeDigest(c,code);assert.equal((await rpc('community_admin_stepup_register',[c.id,d,sign(c,d)])).registered,true);
 assert.equal((await rpc('community_admin_stepup_activate',[c.id,sign(c,d,'activate-v1')])).active,true);return d;
}
async function admit(){const c=await begin();await issue(c);assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).verified,true);return c;}
async function action(action,target,version,payload){const c=await begin(['action',action,target,version,payload]);await issue(c);assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).verified,true);return c;}

test('production migration purpose-specific email step-up',async t=>{
 db=new PGlite({extensions:{pgcrypto}});t.after(()=>db.close());
 await db.exec(await readFile(new URL('tests/auth-stubs.sql',base),'utf8'));
 await db.exec(await readFile(new URL('tests/auto-rls-fixture.sql',base),'utf8'));
 await db.exec('create schema extensions; create extension pgcrypto with schema extensions;');
 await db.exec(await readFile(new URL('tests/vault-stub.sql',base),'utf8'));
 await db.query('insert into vault.test_secrets(id,decrypted_secret) values($1,$2)',['20000000-0000-4000-8000-000000000001',key]);
 for(const f of (await readdir(new URL('migrations/',base))).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile(new URL('migrations/'+f,base),'utf8'));
 for(const uid of [owner,mod,bob]){
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid,uid===owner?'owner@example.invalid':uid+'@example.invalid']);
  await db.query("insert into auth.sessions(id,user_id,aal,factor_id) values($1,$2,'aal2',$2)",[uid===owner?sid:uid,uid]);
  await db.query("insert into auth.mfa_factors(id,user_id,status) values($1,$1,'verified')",[uid]);
  await db.query('insert into community_private.community_accounts(user_id) values($1)',[uid]);
 }
 await db.query("insert into auth.sessions(id,user_id,aal,factor_id) values($1,$2,'aal2',$2)",[sid2,owner]);
 await db.query("insert into community_private.community_roles(user_id,role) values($1,'owner'),($2,'moderator')",[owner,mod]);
 const topic=await rpc('community_create_post',['topic','A topic','Content',null],{},bob);
 let version=1;
 await t.test('default disabled, no key, original MFA preserved and no privilege escalation',async()=>{
  assert.equal(await scalar('select enabled from community_private.community_admin_stepup_config'),false);
  assert.equal(await scalar('select hmac_secret_id from community_private.community_admin_stepup_config'),null);
  assert.equal(await scalar("select provolatile from pg_proc where pronamespace='community_private'::regnamespace and proname='stepup_signature'"),'s');
  await rejects(()=>rpc('community_admin_stepup_begin'),'PT403',/stepup_disabled/);
  assert.equal((await rpc('community_admin_stepup_status')).enabled,false);
  await rejects(()=>rpc('community_admin_list'),'PT403',/mfa_required/);
  assert.equal((await rpc('community_admin_list',[],{aal:'aal2'})).length,1);
  for(const name of ['community_admin_stepup_config','community_admin_challenges','community_admin_admissions','community_admin_action_grants'])
    await rejects(()=>asUser(owner,'select * from community_private.'+name), '42501');
  await rejects(()=>rpc('community_admin_stepup_begin',[],{},null),'42501');
  const fs=(await db.query("select p.oid::regprocedure::text as signature,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='community_private' and (p.proname like 'stepup_%' or p.proname like 'community_admin_stepup_%')")).rows;
  for(const f of fs){assert.ok(f.proconfig.includes('search_path=""'));if(f.proname.startsWith('stepup_'))assert.equal(await scalar("select has_function_privilege('authenticated',$1,'execute')",[f.signature]),false);}
  await db.query('update community_private.community_admin_stepup_config set hmac_secret_id=$1,transport_configured=true,enabled=true',['20000000-0000-4000-8000-000000000001']);
 });
 await t.test('only exact existing owner and original password AMR may begin',async()=>{
  for(const amr of [[],[{method:'otp'}],[{method:'recovery'}],[{method:'password'},{method:'recovery'}],[{method:'password'},{method:'otp'}],[{method:'magiclink'}]])
    await rejects(()=>rpc('community_admin_stepup_begin',[],{amr}),'PT403',/password_owner_required/);
  await rejects(()=>rpc('community_admin_stepup_begin',[],{},mod),'PT403');
  await rejects(()=>rpc('community_admin_stepup_begin',[],{session_id:sid2,amr:[{method:'otp'}]}),'PT403');
  await rejects(()=>rpc('community_admin_stepup_begin',[],{session_id:'10000000-0000-4000-8000-000000000099'}),'PT401');
 });
 await t.test('six digits preserve leading zero and require signed registration+activation',async()=>{
  const c=await begin();assert.match(c.salt,/^[a-f0-9]{32}$/);assert.equal(typeof c.generation,'string');
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).error,'challenge_not_active');
  const d=codeDigest(c);
  assert.equal((await rpc('community_admin_stepup_register',[c.id,d,'0'.repeat(64)])).error,'invalid_signature');
  assert.equal(await scalar('select signature_attempts from community_private.community_admin_challenges where id=$1',[c.id]),1);
  assert.equal((await rpc('community_admin_stepup_register',[c.id,d,sign(c,d)])).registered,true);
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).error,'challenge_not_active');
  assert.equal((await rpc('community_admin_stepup_activate',[c.id,sign(c,d)])).error,'invalid_signature');
  assert.equal((await rpc('community_admin_stepup_activate',[c.id,sign(c,d,'activate-v1')])).active,true);
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'1234'])).error,'invalid_code');
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).verified,true);
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).error,'challenge_unavailable');
  assert.equal((await rpc('community_admin_stepup_status')).admitted,true);
  assert.equal((await rpc('community_admin_stepup_status',[],{session_id:sid2})).admitted,false);
 });
 await t.test('recovery or native OTP tokens cannot register, activate, verify or query admission',async()=>{
  const c=await begin();const d=codeDigest(c);
  for(const amr of [[{method:'otp'}],[{method:'recovery'}],[{method:'password'},{method:'recovery'}]]){
   for(const [name,args] of [['register',[c.id,d,sign(c,d)]],['activate',[c.id,sign(c,d,'activate-v1')]],['verify',[c.id,'001234']],['status',[]]])
    await rejects(()=>rpc('community_admin_stepup_'+name,args,{amr}),'PT403');
  }
 });
 await t.test('wrong-code counters persist across calls and activation cannot reset attempts',async()=>{
  const c=await begin();const d=await issue(c);
  for(let i=1;i<=5;i++){
   const r=await rpc('community_admin_stepup_verify',[c.id,'999999']);assert.equal(r.verified,false);assert.equal(r.attempts_remaining,5-i);
   if(i<5)assert.equal((await rpc('community_admin_stepup_activate',[c.id,sign(c,d,'activate-v1')])).active,true);
  }
  assert.equal(await scalar('select attempts from community_private.community_admin_challenges where id=$1',[c.id]),5);
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).error,'attempts_exhausted');
 });
 await t.test('expired, different session, changed email and changed config invalidate proof',async()=>{
  let c=await begin();await issue(c);
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'],{session_id:sid2})).error,'challenge_unavailable');
  await db.query("update auth.users set email='changed@example.invalid' where id=$1",[owner]);
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).error,'challenge_unavailable');
  await db.query("update auth.users set email='owner@example.invalid' where id=$1",[owner]);
  await db.query('update community_private.community_admin_challenges set expires_epoch=0 where id=$1',[c.id]);
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).error,'challenge_expired');
  c=await begin();await issue(c);
  await db.query('update community_private.community_admin_stepup_config set hmac_secret_id=hmac_secret_id');
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).error,'challenge_unavailable');
  assert.equal((await rpc('community_admin_stepup_status')).admitted,false);
 });
 await t.test('status/me refresh never extends idle; successful admin read does',async()=>{
  await admit();const old=new Date(Date.now()-600000).toISOString();
  await db.query('update community_private.community_admin_admissions set last_activity_at=$1 where original_session_id=$2',[old,sid]);
  await rpc('community_admin_stepup_status');await rpc('community_me');
  assert.equal(new Date(await scalar('select last_activity_at from community_private.community_admin_admissions where original_session_id=$1',[sid])).toISOString(),old);
  await rpc('community_admin_list');
  assert.ok(new Date(await scalar('select last_activity_at from community_private.community_admin_admissions where original_session_id=$1',[sid]))>new Date(old));
  const prior=await scalar('select last_activity_at from community_private.community_admin_admissions where original_session_id=$1',[sid]);
  await rejects(()=>rpc('community_admin_list',[null,'',true,51,0]),'PT422');
  assert.equal(String(await scalar('select last_activity_at from community_private.community_admin_admissions where original_session_id=$1',[sid])),String(prior));
  await db.query("update community_private.community_admin_admissions set last_activity_at=now()-interval '16 minutes' where original_session_id=$1",[sid]);
  await rejects(()=>rpc('community_admin_list'),'PT403',/admin_stepup_required/);
  assert.equal((await rpc('community_admin_stepup_status')).admitted,false);
  await admit();await db.query("update community_private.community_admin_admissions set absolute_expires_at=now()-interval '1 second' where original_session_id=$1",[sid]);
  await rejects(()=>rpc('community_admin_list'),'PT403');
 });
 await t.test('all privileged read paths enforce admission; non-target admin remains MFA',async()=>{
  for(const [n,a] of [['community_admin_list',[]],['community_admin_accounts',[]],['community_admin_audit',[]],['community_post_history',[topic.id]]])
   await rejects(()=>rpc(n,a),'PT403');
  await rejects(()=>rpc('community_admin_list',[],{},mod),'PT403',/mfa_required/);
  assert.equal((await rpc('community_admin_list',[],{aal:'aal2'},mod)).length,1);
  await admit();
  for(const [n,a] of [['community_admin_list',[]],['community_admin_accounts',[]],['community_admin_audit',[]],['community_post_history',[topic.id]]])assert.ok(Array.isArray(await rpc(n,a)));
 });
 await t.test('every admin mutation requires exact single-use action grant',async()=>{
  const payload={title:'Admin title',body:'Admin body',reason:'Correction'};
  await rejects(()=>rpc('community_admin_edit_post',[topic.id,version,payload.title,payload.body,payload.reason]),'PT403',/action_stepup_required/);
  await action('admin_edit_post',topic.id,version,payload);
  await rejects(()=>rpc('community_admin_edit_post',[topic.id,version,payload.title,'Changed again',payload.reason]),'PT403',/action_stepup_required/);
  let p=await rpc('community_admin_edit_post',[topic.id,version,payload.title,payload.body,payload.reason]);version=p.version;
  await rejects(()=>rpc('community_moderate_post',[topic.id,version,'hide','Reason']),'PT403',/action_stepup_required/);
  await action('moderate_post',topic.id,version,{action:'hide',reason:'Reason'});
  p=await rpc('community_moderate_post',[topic.id,version,'hide','Reason']);version=p.version;assert.equal(p.hidden,true);
  await rejects(()=>rpc('community_set_account_state',[bob,1,'suspended','Reason']),'PT403',/action_stepup_required/);
  await action('set_account_state',bob,1,{state:'suspended',reason:'Reason'});
  assert.equal((await rpc('community_set_account_state',[bob,1,'suspended','Reason'])).state,'suspended');
 });
 await t.test('failed mutation atomically rolls back grant consumption',async()=>{
  const c=await action('moderate_post',topic.id,version,{action:'restore',reason:'Restore'});
  await db.exec("create function community_private.test_block_audit() returns trigger language plpgsql as $$ begin raise sqlstate 'PT503' using message='blocked'; end; $$; create trigger test_block_audit before insert on community_private.community_audit for each row execute function community_private.test_block_audit();");
  await rejects(()=>rpc('community_moderate_post',[topic.id,version,'restore','Restore']),'PT503');
  assert.equal(await scalar('select consumed_at from community_private.community_admin_action_grants where challenge_id=$1',[c.id]),null);
  await db.exec('drop trigger test_block_audit on community_private.community_audit; drop function community_private.test_block_audit();');
  version=(await rpc('community_moderate_post',[topic.id,version,'restore','Restore'])).version;
  assert.notEqual(await scalar('select consumed_at from community_private.community_admin_action_grants where challenge_id=$1',[c.id]),null);
 });
 await t.test('new admission invalidates previous action grants; same proof cannot serve another action',async()=>{
  const c=await action('moderate_post',topic.id,version,{action:'pin',reason:'Pin'});
  await admit();await rejects(()=>rpc('community_moderate_post',[topic.id,version,'pin','Pin']),'PT403',/action_stepup_required/);
  assert.equal(await scalar('select consumed_at from community_private.community_admin_action_grants where challenge_id=$1',[c.id]),null);
 });
 await t.test('live role/account/session revocation defeats custom admission',async()=>{
  await db.query('delete from community_private.community_roles where user_id=$1',[owner]);await rejects(()=>rpc('community_admin_list'),'PT403');
  await db.query("insert into community_private.community_roles(user_id,role) values($1,'owner')",[owner]);
  await db.query("update community_private.community_accounts set state='suspended' where user_id=$1",[owner]);await rejects(()=>rpc('community_admin_list'),'PT403');
  await db.query("update community_private.community_accounts set state='active' where user_id=$1",[owner]);
  await db.query('delete from auth.sessions where id=$1',[sid]);await rejects(()=>rpc('community_admin_list'),'PT401');
  await db.query("insert into auth.sessions(id,user_id,aal,factor_id) values($1,$2,'aal2',$2)",[sid,owner]);
 });
 await t.test('direct private RPC paths cannot bypass admission or action proof',async()=>{
  await rejects(()=>asUser(owner,'select community_private.community_admin_edit_post($1,$2,$3,$4,$5)',[topic.id,version,'Bypass','Body','Reason']),'PT403',/action_stepup_required/);
  await rejects(()=>asUser(owner,'select community_private.community_moderate_post($1,$2,$3,$4)',[topic.id,version,'pin','Reason']),'PT403',/action_stepup_required/);
  await rejects(()=>asUser(owner,'select community_private.stepup_consume_action($1,$2,$3,$4)',['moderate_post',topic.id,version,{action:'pin',reason:'Reason'}]),'42501');
  const c=await begin();await issue(c);
  await rejects(()=>asUser(owner,'select community_private.community_admin_stepup_verify($1,$2)',[c.id,'001234'],{amr:[{method:'otp'}]}),'PT403');
 });
 await t.test('expired action proof and changed version cannot be reused; failed version preserves proof',async()=>{
  const c=await action('moderate_post',topic.id,version,{action:'pin',reason:'Pin'});
  await rejects(()=>rpc('community_moderate_post',[topic.id,version-1,'pin','Pin']),'PT409');
  assert.equal(await scalar('select consumed_at from community_private.community_admin_action_grants where challenge_id=$1',[c.id]),null);
  await db.query("update community_private.community_admin_action_grants set expires_at=clock_timestamp()-interval '1 second' where challenge_id=$1",[c.id]);
  await rejects(()=>rpc('community_moderate_post',[topic.id,version,'pin','Pin']),'PT403',/action_stepup_required/);
 });
 await t.test('real API WebCrypto, independent Node HMAC and PGlite pgcrypto interoperate in all three domains',async()=>{
  await resetRate();
  const origin='https://community.example.com';const project='ltopqphxiulyfaivdjfq';
  const token='fixture_original_password_jwt_NOT_REAL';const captured=[];
  const order={begin:['p_scope','p_action','p_target_id','p_expected_version','p_payload'],register:['p_challenge_id','p_otp_digest','p_signature'],activate:['p_challenge_id','p_signature'],cancel:['p_challenge_id'],verify:['p_challenge_id','p_code'],status:[]};
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  const handler=createCommunityHandler({crypto:{subtle:webcrypto.subtle,getRandomValues(a){a[0]=1234;return a;}},fetch:async(url,init)=>{
    const u=new URL(url),body=init.body?JSON.parse(init.body):null;captured.push({url:u,body});
    if(u.pathname==='/auth/v1/user')return reply({id:owner,role:'authenticated',email:'owner@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false});
    if(u.hostname==='api.resend.com'){
      assert.match(body.text,/001234/);assert.deepEqual(body.to,['owner@example.invalid']);
      return reply({id:'10000000-0000-4000-8000-000000000999'});
    }
    assert.equal(init.headers.Authorization,'Bearer '+token);
    const rpcName=u.pathname.split('/').pop();
    if(rpcName==='community_me')return reply(await rpc('community_me'));
    if(rpcName==='community_moderate_post'){try{return reply(await rpc(rpcName,[body.p_post_id,body.p_expected_version,body.p_action,body.p_reason]));}catch(e){return reply({code:e.code},403);}}
    const name=rpcName.replace('community_admin_stepup_','');
    assert.ok(Object.hasOwn(order,name));
    try{return reply(await rpc('community_admin_stepup_'+name,order[name].map(k=>body[k])));}catch(e){return reply({code:e.code},403);}
  }});
  const env={COMMUNITY_BACKEND_ENABLED:'true',COMMUNITY_EMAIL_STEPUP_ENABLED:'true',COMMUNITY_ALLOWED_ORIGIN:origin,
    SUPABASE_URL:'https://'+project+'.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_not_a_real_key',
    ADMIN_STEPUP_HMAC_KEY:key,ADMIN_STEPUP_RESEND_KEY:'re_fixture_not_a_real_resend_key'};
  const req=(name,body)=>new Request(origin+'/api/admin/stepup/'+name,{method:'POST',headers:{Authorization:'Bearer '+token,Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},body:JSON.stringify(body)});
  const adminReq=(path,body)=>new Request(origin+'/api/admin/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,Origin:origin,'Sec-Fetch-Site':'same-origin',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  await db.query("update community_private.community_admin_admissions set absolute_expires_at=now()-interval '1 second' where original_session_id=$1",[sid]);
  const before=await handler(adminReq('session'),env);assert.equal(before.status,200);const beforeData=(await before.json()).data;assert.equal(beforeData.admitted,false);assert.equal(beforeData.admin_auth_method,'email');assert.equal(beforeData.aal,'aal1');
  const res=await handler(req('begin',{scope:'admission'}),env);const out=await res.json();assert.equal(res.status,200,JSON.stringify(out));
  const row=(await db.query('select * from community_private.community_admin_challenges where id=$1',[out.data.id])).rows[0];
  const c={...row,project,generation:String(row.generation)};const digest=codeDigest(c);
  const registration=captured.find(x=>x.url.pathname.endsWith('_register')).body;
  const activation=captured.find(x=>x.url.pathname.endsWith('_activate')).body;
  assert.equal(registration.p_otp_digest,digest);
  assert.equal(registration.p_signature,sign(c,digest));
  assert.equal(activation.p_signature,sign(c,digest,'activate-v1'));
  const verified=await handler(req('verify',{challenge_id:c.id,code:'001234'}),env);assert.equal(verified.status,200);assert.equal((await verified.json()).data.verified,true);
  assert.equal((await rpc('community_admin_stepup_status')).admitted,true);
  const after=await handler(adminReq('session'),env);assert.equal(after.status,200);assert.equal((await after.json()).data.admitted,true);
  let cancellation=await handler(req('cancel',{challenge_id:c.id}),env);assert.equal(cancellation.status,200);assert.deepEqual((await cancellation.json()).data,{cancelled:false,already_used:true});
  await resetRate();
  const actionBegin=await handler(req('begin',{scope:'action',action:'moderate_post',target_id:topic.id,expected_version:version,payload:{action:'pin',reason:'API cancel bridge'}}),env);
  assert.equal(actionBegin.status,200);const ac=(await actionBegin.json()).data;
  const actionVerify=await handler(req('verify',{challenge_id:ac.id,code:'001234'}),env);assert.equal((await actionVerify.json()).data.verified,true);
  cancellation=await handler(req('cancel',{challenge_id:ac.id}),env);assert.equal(cancellation.status,200);assert.deepEqual((await cancellation.json()).data,{cancelled:true,already_used:false});
  await rejects(()=>rpc('community_moderate_post',[topic.id,version,'pin','API cancel bridge']),'PT403',/action_stepup_required/);
  const denied=await handler(adminReq('posts/'+topic.id+'/pin',{expected_version:version,reason:'API cancel bridge'}),env);assert.equal(denied.status,403);
  await action('moderate_post',topic.id,version,{action:'pin',reason:'API commit bridge'});
  const committed=await handler(adminReq('posts/'+topic.id+'/pin',{expected_version:version,reason:'API commit bridge'}),env);assert.equal(committed.status,200,JSON.stringify(await committed.clone().json()));version=(await committed.json()).data.version;
  await action('moderate_post',topic.id,version,{action:'unpin',reason:'Restore fixture'});version=(await rpc('community_moderate_post',[topic.id,version,'unpin','Restore fixture'])).version;
 });
 await t.test('cancel is exact-user/session only, idempotent and rejects native/recovery sessions',async()=>{
  const c=await begin();
  assert.deepEqual(await rpc('community_admin_stepup_cancel',[c.id],{},mod),{cancelled:false,already_used:false,error:'challenge_unavailable'});
  assert.equal((await rpc('community_admin_stepup_cancel',[c.id],{session_id:sid2})).error,'challenge_unavailable');
  await rejects(()=>rpc('community_admin_stepup_cancel',[c.id],{amr:[{method:'otp'}]}),'PT403');
  await rejects(()=>rpc('community_admin_stepup_cancel',[c.id],{amr:[{method:'recovery'}]}),'PT403');
  await rejects(()=>rpc('community_admin_stepup_cancel',[c.id],{},null),'42501');
  const expected={cancelled:true,already_used:false};
  assert.deepEqual(await rpc('community_admin_stepup_cancel',[c.id]),expected);
  assert.deepEqual(await rpc('community_admin_stepup_cancel',[c.id]),expected);
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).error,'challenge_unavailable');
  const digest=codeDigest(c);
  assert.equal((await rpc('community_admin_stepup_register',[c.id,digest,sign(c,digest)])).error,'challenge_unavailable');
 });
 await t.test('logical ordering: cancel before registration, activation or verification prevents later admission',async()=>{
  for(const stage of ['pending','prepared','active']){
   const c=await begin();const digest=codeDigest(c);
   if(stage!=='pending')assert.equal((await rpc('community_admin_stepup_register',[c.id,digest,sign(c,digest)])).registered,true);
   if(stage==='active')assert.equal((await rpc('community_admin_stepup_activate',[c.id,sign(c,digest,'activate-v1')])).active,true);
   assert.equal((await rpc('community_admin_stepup_cancel',[c.id])).cancelled,true);
   assert.equal((await rpc('community_admin_stepup_activate',[c.id,sign(c,digest,'activate-v1')])).active,false);
   assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).verified,false);
  }
 });
 await t.test('logical ordering: completed admission is reported already_used without logout',async()=>{
  const c=await admit();assert.equal((await rpc('community_admin_stepup_status')).admitted,true);
  assert.deepEqual(await rpc('community_admin_stepup_cancel',[c.id]),{cancelled:false,already_used:true});
  assert.equal((await rpc('community_admin_stepup_status')).admitted,true);
 });
 await t.test('logical ordering: verified action cancel revokes grant before mutation and cannot affect another action',async()=>{
  const c=await action('moderate_post',topic.id,version,{action:'pin',reason:'Cancel test'});
  assert.equal((await rpc('community_admin_stepup_cancel',[c.id])).cancelled,true);
  assert.notEqual(await scalar('select revoked_at from community_private.community_admin_action_grants where challenge_id=$1',[c.id]),null);
  await rejects(()=>rpc('community_moderate_post',[topic.id,version,'pin','Cancel test']),'PT403',/action_stepup_required/);
  assert.equal((await rpc('community_admin_stepup_cancel',[c.id])).cancelled,true);
  const other=await action('moderate_post',topic.id,version,{action:'pin',reason:'Other operation'});
  assert.equal((await rpc('community_admin_stepup_cancel',[c.id])).cancelled,true);
  assert.equal(await scalar('select revoked_at from community_private.community_admin_action_grants where challenge_id=$1',[other.id]),null);
  version=(await rpc('community_moderate_post',[topic.id,version,'pin','Other operation'])).version;
  assert.deepEqual(await rpc('community_admin_stepup_cancel',[other.id]),{cancelled:false,already_used:true});
  assert.equal(await scalar('select pinned from public.community_posts where id=$1',[topic.id]),true);
 });
 await t.test('cancel revokes all duplicate exact-binding grants and pending replacements, but allows later explicit reauthorization',async()=>{
  const payload={action:'unpin',reason:'Duplicate test'};
  const first=await action('moderate_post',topic.id,version,payload);
  const second=await action('moderate_post',topic.id,version,payload);
  const pending=await begin(['action','moderate_post',topic.id,version,payload]);await issue(pending);
  assert.equal((await rpc('community_admin_stepup_cancel',[second.id])).cancelled,true);
  for(const c of [first,second])assert.notEqual(await scalar('select revoked_at from community_private.community_admin_action_grants where challenge_id=$1',[c.id]),null);
  assert.equal((await rpc('community_admin_stepup_verify',[pending.id,'001234'])).verified,false);
  await rejects(()=>rpc('community_moderate_post',[topic.id,version,'unpin',payload.reason]),'PT403',/action_stepup_required/);
  const newer=await action('moderate_post',topic.id,version,payload);
  assert.equal((await rpc('community_admin_stepup_cancel',[second.id])).cancelled,true);
  assert.equal(await scalar('select revoked_at from community_private.community_admin_action_grants where challenge_id=$1',[newer.id]),null);
  version=(await rpc('community_moderate_post',[topic.id,version,'unpin',payload.reason])).version;
 });
 await t.test('cancelling pending/prepared/active action also revokes older same-binding grants',async()=>{
  for(const stage of ['pending','prepared','active']){
   const payload={action:'pin',reason:'Pending cancellation '+stage};
   const old=await action('moderate_post',topic.id,version,payload);
   const c=await begin(['action','moderate_post',topic.id,version,payload]);const d=codeDigest(c);
   if(stage!=='pending')await rpc('community_admin_stepup_register',[c.id,d,sign(c,d)]);
   if(stage==='active')await rpc('community_admin_stepup_activate',[c.id,sign(c,d,'activate-v1')]);
   assert.equal((await rpc('community_admin_stepup_cancel',[c.id])).cancelled,true);
   assert.notEqual(await scalar('select revoked_at from community_private.community_admin_action_grants where challenge_id=$1',[old.id]),null);
   await rejects(()=>rpc('community_moderate_post',[topic.id,version,'pin',payload.reason]),'PT403',/action_stepup_required/);
  }
 });
 await t.test('cancel reduces authority even after app role/config change, without needing current admission',async()=>{
  const c=await begin();await issue(c);
  await db.query('delete from community_private.community_roles where user_id=$1',[owner]);
  await db.query('update community_private.community_admin_stepup_config set enabled=false');
  assert.equal((await rpc('community_admin_stepup_cancel',[c.id])).cancelled,true);
  await db.query("insert into community_private.community_roles(user_id,role) values($1,'owner')",[owner]);
  await db.query('update community_private.community_admin_stepup_config set enabled=true');
  assert.equal((await rpc('community_admin_stepup_status')).admitted,false);
 });
 await t.test('queued cancellation/verification orders have safe terminal outcomes (single-connection, not real concurrency)',async()=>{
  for(const cancelFirst of [true,false]){
   const c=await begin();await issue(c);
   const work=cancelFirst?[['cancel',[c.id]],['verify',[c.id,'001234']]]:[['verify',[c.id,'001234']],['cancel',[c.id]]];
   const outcomes=await Promise.all(work.map(([name,args])=>rpc('community_admin_stepup_'+name,args)));
   if(cancelFirst){assert.equal(outcomes[0].cancelled,true);assert.equal(outcomes[1].verified,false);}
   else{assert.equal(outcomes[0].verified,true);assert.equal(outcomes[1].already_used,true);}
  }
 });
 await t.test('begin/verify serialize before admission/challenge rows; cancel adds no admission lock',async()=>{
  const definition=async name=>await scalar("select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='community_private' and p.proname=$1",[name]);
  const b=await definition('community_admin_stepup_begin'),v=await definition('community_admin_stepup_verify'),c=await definition('community_admin_stepup_cancel');
  assert.ok(b.indexOf('pg_advisory_xact_lock')<b.indexOf('stepup_admission(v_uid,false)'));
  assert.ok(v.indexOf('pg_advisory_xact_lock')<v.indexOf('where id=p_challenge_id for update'));
  assert.ok(!c.includes('stepup_admission('));
  assert.ok(c.indexOf('pg_advisory_xact_lock')<c.indexOf('community_admin_challenges where id=p_challenge_id for update'));
  assert.ok(c.indexOf('community_admin_challenges where id=p_challenge_id for update')<c.indexOf('order by g.challenge_id for update'));
 });
 await t.test('resend invalidates pending/prepared/active and per-user rate cannot be bypassed with another session',async()=>{
  const c=await begin();await issue(c);
  assert.equal((await rpc('community_admin_stepup_begin')).error,'challenge_rate_limited');
  assert.equal((await rpc('community_admin_stepup_begin',[],{session_id:sid2})).error,'challenge_rate_limited');
  await resetRate();const n=await rpc('community_admin_stepup_begin');assert.equal(n.created,true);
  assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).error,'challenge_unavailable');
  await db.query("update community_private.community_admin_challenges set created_at=now()-interval '2 minutes'");
  assert.equal((await rpc('community_admin_stepup_begin')).error,'challenge_rate_limited');
 });
 await t.test('Vault-backed readiness preserves real aal and fails closed on missing, malformed or inaccessible key',async()=>{
  await admit();
  let me=await rpc('community_me');assert.equal(me.admin_auth_method,'email');assert.equal(me.can_request_email_stepup,true);assert.equal(me.aal,'aal1');assert.equal(me.can_moderate,true);
  me=await rpc('community_me',[],{aal:'aal2'},mod);assert.equal(me.admin_auth_method,'totp');assert.equal(me.can_request_email_stepup,false);assert.equal(me.can_moderate,true);
  me=await rpc('community_me',[],{amr:[{method:'otp'}]});assert.equal(me.admin_auth_method,'email');assert.equal(me.can_request_email_stepup,false);assert.equal(me.can_moderate,false);
  await rejects(()=>asUser(owner,'select community_private.stepup_hmac_key(false)'),'42501');
  await rejects(()=>asUser(owner,'select * from vault.decrypted_secrets'),'42501');
  await db.query("update community_private.community_admin_stepup_config set hmac_secret_id='20000000-0000-4000-8000-000000000099'");
  assert.equal((await rpc('community_me')).can_request_email_stepup,false);
  await rejects(()=>rpc('community_admin_stepup_begin'),'PT403',/^stepup_key_unavailable$/);
  await db.query("update community_private.community_admin_stepup_config set hmac_secret_id='20000000-0000-4000-8000-000000000001'");
  await db.query("update vault.test_secrets set decrypted_secret='bad secret' ");
  assert.equal((await rpc('community_me')).can_request_email_stepup,false);
  await rejects(()=>rpc('community_admin_stepup_begin'),'PT403',/^stepup_key_unavailable$/);
  await db.query('update vault.test_secrets set decrypted_secret=$1',[key]);
  await db.exec('alter view vault.decrypted_secrets rename to unavailable_secrets');
  assert.equal((await rpc('community_me')).can_request_email_stepup,false);
  await rejects(()=>rpc('community_admin_stepup_begin'),'PT403',/^stepup_key_unavailable$/);
  await db.exec('alter view vault.unavailable_secrets rename to decrypted_secrets');
  assert.equal((await rpc('community_me')).can_request_email_stepup,true);
 });
 await t.test('operator disable clears key reference and invalidates all prior generations without deleting history',async()=>{
  await admit();const c=await action('moderate_post',topic.id,version,{action:'pin',reason:'Disable test'});
  const gen=Number(await scalar('select generation from community_private.community_admin_stepup_config'));
  const count=Number(await scalar('select count(*) from community_private.community_admin_challenges'));
  await db.exec(await readFile(new URL('ops/disable-email-stepup.sql',root),'utf8'));
  assert.equal(Number(await scalar('select generation from community_private.community_admin_stepup_config')),gen+1);
  assert.equal(await scalar('select hmac_secret_id from community_private.community_admin_stepup_config'),null);
  assert.equal(Number(await scalar('select count(*) from community_private.community_admin_challenges')),count);
  assert.equal((await rpc('community_me')).admin_auth_method,'totp');
  await rejects(()=>rpc('community_admin_list'),'PT403',/mfa_required/);
  assert.ok(Array.isArray(await rpc('community_admin_list',[],{aal:'aal2'})));
  await db.query("update community_private.community_admin_stepup_config set hmac_secret_id='20000000-0000-4000-8000-000000000001',transport_configured=true,enabled=true");
  assert.equal((await rpc('community_admin_stepup_status')).admitted,false);
  await admit();await rejects(()=>rpc('community_moderate_post',[topic.id,version,'pin','Disable test']),'PT403',/action_stepup_required/);
  assert.equal(await scalar('select consumed_at from community_private.community_admin_action_grants where challenge_id=$1',[c.id]),null);
 });
 await t.test('full rollback restores exact original five definitions and denies every new client RPC',async()=>{
  await db.exec(await readFile(new URL('ops/rollback-email-stepup.sql',root),'utf8'));
  const baseline=new PGlite();
  try{
   await baseline.exec(await readFile(new URL('tests/auth-stubs.sql',root),'utf8'));
   await baseline.exec(await readFile(new URL('migrations/20261012030809_dex_community_foundation.sql',root),'utf8'));
   for(const name of ['require_actor','community_me','edit_post','community_moderate_post','community_set_account_state']){
    const q="select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='community_private' and p.proname=$1";
    assert.equal((await db.query(q,[name])).rows[0].d,(await baseline.query(q,[name])).rows[0].d);
   }
  }finally{await baseline.close();}
  for(const suffix of ['begin','register','activate','verify','cancel','status'])for(const schema of ['public','community_private']){
   const q="select bool_and(not has_function_privilege('authenticated',p.oid,'execute')) as denied from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=$1 and p.proname=$2";
   assert.equal((await db.query(q,[schema,'community_admin_stepup_'+suffix])).rows[0].denied,true);
  }
  await rejects(()=>rpc('community_admin_stepup_status'),'42501');
  await rejects(()=>rpc('community_admin_list'),'PT403',/mfa_required/);
  assert.ok(Array.isArray(await rpc('community_admin_list',[],{aal:'aal2'})));
  assert.equal(await scalar('select enabled from community_private.community_admin_stepup_config'),false);
  assert.ok(Number(await scalar('select count(*) from community_private.community_admin_challenges'))>0);
 });

});


test('missing Vault prerequisite aborts the email-step-up migration before creating new objects',async t=>{
 const local=new PGlite({extensions:{pgcrypto}});t.after(()=>local.close());
 await local.exec(await readFile(new URL('tests/auth-stubs.sql',root),'utf8'));
 await local.exec('create schema extensions;create extension pgcrypto with schema extensions;');
 await local.exec(await readFile(new URL('migrations/20261012030809_dex_community_foundation.sql',root),'utf8'));
 const sql=await readFile(new URL('migrations/20261013031903_community_admin_email_stepup.sql',root),'utf8');
 await assert.rejects(()=>local.exec(sql),e=>e.message==='stepup_prerequisites_missing');
 await local.exec('rollback');
 assert.equal((await local.query("select to_regclass('community_private.community_admin_stepup_config') as object")).rows[0].object,null);
});
