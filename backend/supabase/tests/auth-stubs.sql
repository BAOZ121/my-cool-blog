-- TEST ONLY. Never run on Supabase, never use for real authentication.
-- PGlite runs actual PostgreSQL/RLS/PLpgSQL, but it has no GoTrue or PostgREST.
-- Request JWT claims below are controlled by test code to exercise DB policy.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'
);
create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  not_after timestamptz,
  aal text,
  factor_id uuid
);
create table auth.mfa_factors (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  status text not null
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb;
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt()->>'sub','')::uuid;
$$;
grant usage on schema public,auth to anon,authenticated;
grant execute on function auth.jwt(),auth.uid() to anon,authenticated;
-- Emulate legacy permissive Supabase defaults. The migration MUST override
-- both explicit grants and PostgreSQL's inherited PUBLIC function execution.
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;
