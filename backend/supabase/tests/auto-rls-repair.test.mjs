import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('separate auto-RLS EXECUTE repair preserves the DDL event trigger',async t=>{
  const db=new PGlite(); t.after(()=>db.close());
  await db.exec('create role anon nologin; create role authenticated nologin;');
  await db.exec(await readFile(new URL('auto-rls-fixture.sql',import.meta.url),'utf8'));
  const allowed=async role=>(await db.query("select has_function_privilege($1,'public.rls_auto_enable()','execute') as allowed",[role])).rows[0].allowed;
  assert.equal(await allowed('anon'),true);
  assert.equal(await allowed('authenticated'),true);
  await db.exec(await readFile(new URL('../migrations/20261012030835_harden_auto_rls_execute.sql',import.meta.url),'utf8'));
  assert.equal(await allowed('anon'),false);
  assert.equal(await allowed('authenticated'),false);
  await db.exec('create table public.after_repair(id integer); create table public.after_repair_as as select 1 as id; select 1 as id into public.after_repair_select;');
  const tables=(await db.query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname")).rows;
  assert.equal(tables.length,3);
  assert.ok(tables.every(t=>t.relrowsecurity));
  const trigger=(await db.query("select evtenabled from pg_event_trigger where evtname='ensure_rls'")).rows;
  assert.equal(trigger[0].evtenabled,'O');
});
