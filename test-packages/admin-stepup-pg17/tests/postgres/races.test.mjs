/** Real two-connection tests. Never connects to a remote or caller-supplied host.
 * Requires the isolated Unix-only PG17.11 cluster described in EMAIL-STEPUP.md.
 * Synthetic Auth/Vault fixtures only. These tests remain UNRUN where sockets fail.
 */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHmac,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import pg from 'pg';
const root=new URL('../../',import.meta.url);
const owner='ff34f10e-53b0-45b9-951a-34bcbb032dad',sid='10000000-0000-4000-8000-000000000001';
const key='SYNTHETIC_TEST_ONLY_NOT_A_REAL_KEY_0123456789abcdef';
const config={host:'/tmp/dex-pg-test/socket',port:55439,user:'agent',database:'postgres',connectionTimeoutMillis:2000};
const claims=JSON.stringify({sub:owner,role:'authenticated',session_id:sid,aal:'aal1',amr:[{method:'password'}]});
const mac=fields=>createHmac('sha256',key).update(fields.join('\n')).digest('hex');
const queryFor=(name,args)=>({text:`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,values:args});
test('real PG17.11 separate-connection step-up races',{
 skip:process.env.DEX_RUN_LOCAL_POSTGRES_RACES!=='true'?'Explicit local Unix-only fixture opt-in required; no concurrency claim from this skip.':false,
 timeout:60000,
},async t=>{
 const admin=new pg.Client(config);await admin.connect();
 const name='dex_stepup_races_'+randomUUID().replaceAll('-','');let created=false,db;const live=[];
 t.after(async()=>{
  for(const c of live){await c.query('rollback').catch(()=>{});await c.end().catch(()=>{});}
  if(db)await db.end().catch(()=>{});
  if(created)await admin.query('drop database '+name);
  await admin.end();
 });
 const settings=(await admin.query("select current_setting('server_version') as version,current_setting('listen_addresses') as listen,current_setting('data_directory') as data_directory")).rows[0];
 assert.match(settings.version,/^17\.11(?:\D|$)/);assert.equal(settings.listen,'');
 assert.equal(settings.data_directory,'/tmp/dex-pg-test/data','Refuse any cluster outside the exact disposable fixture data directory');
 await admin.query('create database '+name);created=true;
 db=new pg.Client({...config,database:name});await db.connect();
 let auth=await readFile(new URL('tests/auth-stubs.sql',root),'utf8');
 // Roles are cluster-scoped; only the disposable fixture cluster is supported.
 auth=auth.replace(/create role (anon|authenticated|service_role) (nologin(?: bypassrls)?);/g,(_,role,attrs)=>`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} ${attrs}; end if; end $$;`);
 await db.query(auth);await db.query(await readFile(new URL('tests/auto-rls-fixture.sql',root),'utf8'));
 await db.query('create schema extensions;create extension pgcrypto with schema extensions;');
 await db.query(await readFile(new URL('tests/vault-stub.sql',root),'utf8'));
 await db.query('insert into vault.test_secrets(id,decrypted_secret) values($1,$2)',['20000000-0000-4000-8000-000000000001',key]);
 for(const f of (await readdir(new URL('migrations/',root))).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile(new URL('migrations/'+f,root),'utf8'));
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[owner,'owner@example.invalid']);
 await db.query("insert into auth.sessions(id,user_id,aal) values($1,$2,'aal1')",[sid,owner]);
 await db.query('insert into community_private.community_accounts(user_id) values($1)',[owner]);
 await db.query("insert into community_private.community_roles(user_id,role) values($1,'owner')",[owner]);
 await db.query("update community_private.community_admin_stepup_config set hmac_secret_id='20000000-0000-4000-8000-000000000001',transport_configured=true,enabled=true");
 async function tx(){const c=new pg.Client({...config,database:name});await c.connect();live.push(c);await c.query("begin;set local statement_timeout='8s';set local lock_timeout='7s';set local role authenticated;");await c.query("select set_config('request.jwt.claims',$1,true)",[claims]);return c;}
 async function rpc(fn,args=[]){const c=await tx();try{const v=(await c.query(queryFor(fn,args))).rows[0].value;await c.query('commit');return v;}finally{await c.query('rollback');}}
 const invoke=(c,fn,args=[])=>c.query(queryFor(fn,args)).then(r=>({ok:true,value:r.rows[0].value}),e=>({ok:false,code:e.code,message:e.message}));
 async function blocked(c){for(let i=0;i<200;i++){const row=(await db.query('select wait_event_type from pg_stat_activity where pid=$1',[c.processID])).rows[0];if(row?.wait_event_type==='Lock')return;await delay(10);}assert.fail('Expected a real PostgreSQL lock wait between distinct backend PIDs');}
 async function challenge(args=[]){await db.query("update community_private.community_admin_challenges set created_at=now()-interval '2 hours'");const c=await rpc('community_admin_stepup_begin',args);assert.equal(c.created,true);const d=mac(['otp-v1',c.project,c.generation,c.id,c.user_id,c.original_session_id,c.salt,'001234']);const sig=domain=>mac([domain,c.project,c.generation,c.id,c.user_id,c.original_session_id,c.scope,c.binding_digest,String(c.expires_epoch),c.salt,d]);assert.equal((await rpc('community_admin_stepup_register',[c.id,d,sig('register-v1')])).registered,true);assert.equal((await rpc('community_admin_stepup_activate',[c.id,sig('activate-v1')])).active,true);return c;}
 async function admit(){const c=await challenge();assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).verified,true);}
 await admit();const topic=await rpc('community_create_post',['topic','Concurrent fixture','Synthetic body',null]);let version=1;
 const args=reason=>['action','moderate_post',topic.id,version,{action:'pin',reason}];
 async function grant(reason){const c=await challenge(args(reason));assert.equal((await rpc('community_admin_stepup_verify',[c.id,'001234'])).verified,true);return c;}
 await t.test('cancel commits first: blocked mutation cannot consume the revoked grant',async()=>{
  const c=await grant('cancel first'),a=await tx(),b=await tx();assert.notEqual(a.processID,b.processID);
  assert.equal((await invoke(a,'community_admin_stepup_cancel',[c.id])).value.cancelled,true);
  const pending=invoke(b,'community_moderate_post',[topic.id,version,'pin','cancel first']);await blocked(b);await a.query('commit');
  const result=await pending;assert.equal(result.ok,false);assert.equal(result.code,'PT403');await b.query('rollback');
 });
 await t.test('mutation commits first: cancellation waits then reports already_used without undo',async()=>{
  const c=await grant('mutation first'),a=await tx(),b=await tx();
  const result=await invoke(a,'community_moderate_post',[topic.id,version,'pin','mutation first']);assert.equal(result.ok,true);version=result.value.version;
  const pending=invoke(b,'community_admin_stepup_cancel',[c.id]);await blocked(b);await a.query('commit');assert.equal((await pending).value.already_used,true);await b.query('commit');
 });
 await t.test('cancel before verify serializes on advisory lock and blocks a new grant',async()=>{
  const c=await challenge(args('cancel verify')),a=await tx(),b=await tx();
  await invoke(a,'community_admin_stepup_cancel',[c.id]);const pending=invoke(b,'community_admin_stepup_verify',[c.id,'001234']);await blocked(b);await a.query('commit');assert.equal((await pending).value.verified,false);await b.query('commit');
 });
 await t.test('verify before cancel commits then revokes the newly issued action grant',async()=>{
  const c=await challenge(args('verify cancel')),a=await tx(),b=await tx();
  assert.equal((await invoke(a,'community_admin_stepup_verify',[c.id,'001234'])).value.verified,true);
  const pending=invoke(b,'community_admin_stepup_cancel',[c.id]);await blocked(b);await a.query('commit');assert.equal((await pending).value.cancelled,true);await b.query('commit');
  assert.notEqual((await db.query('select revoked_at from community_private.community_admin_action_grants where challenge_id=$1',[c.id])).rows[0].revoked_at,null);
 });
 await t.test('duplicate exact-binding pending verification cannot recreate cancelled permission',async()=>{
  const old=await grant('duplicate'),newer=await challenge(args('duplicate')),a=await tx(),b=await tx();
  await invoke(a,'community_admin_stepup_cancel',[old.id]);const pending=invoke(b,'community_admin_stepup_verify',[newer.id,'001234']);await blocked(b);await a.query('commit');assert.equal((await pending).value.verified,false);await b.query('commit');
 });
 await t.test('begin holding admission precedes verify without admission/challenge deadlock',async()=>{
  const old=await challenge(args('old')),a=await tx(),b=await tx();await db.query("update community_private.community_admin_challenges set created_at=now()-interval '2 hours'");
  assert.equal((await invoke(a,'community_admin_stepup_begin',args('new'))).value.created,true);
  const pending=invoke(b,'community_admin_stepup_verify',[old.id,'001234']);await blocked(b);await a.query('commit');assert.equal((await pending).value.verified,false);await b.query('commit');
 });
 await t.test('configuration disable waits for in-flight admin transaction, then rejects future email access',async()=>{
  const a=await tx();assert.equal((await invoke(a,'community_admin_list')).ok,true);
  const operator=new pg.Client({...config,database:name});await operator.connect();live.push(operator);
  const disabling=operator.query(await readFile(new URL('ops/disable-email-stepup.sql',root),'utf8'));await blocked(operator);await a.query('commit');await disabling;
  await assert.rejects(()=>rpc('community_admin_list'),e=>e.code==='PT403');
 });
});
