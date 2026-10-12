-- DEX Community: local-review migration. Never applied automatically.
-- Requires Supabase-managed auth.users/auth.sessions/auth.uid()/auth.jwt().
-- API authorization is the signed end-user JWT, never a service-role key.
begin;

create schema community_private;
revoke all on schema community_private from public, anon, authenticated, service_role;
grant usage on schema community_private to anon, authenticated;
alter default privileges in schema community_private revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema community_private revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema community_private revoke execute on functions from public, anon, authenticated, service_role;

create table community_private.community_accounts (
  user_id uuid primary key,
  state text not null default 'active' check (state in ('active','suspended')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table community_private.community_roles (
  user_id uuid primary key references community_private.community_accounts(user_id),
  role text not null check (role in ('moderator','owner')),
  granted_at timestamptz not null default now()
);
-- No trigger, signup hook, RPC or seed creates a role. Initial owner is an
-- independently approved, manually verified UUID grant by the project operator.
create table public.community_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('topic','reply','message')),
  topic_id uuid references public.community_posts(id) on delete restrict,
  title text not null default '',
  body text not null,
  author_id uuid not null references community_private.community_accounts(user_id),
  version integer not null default 1 check (version > 0),
  hidden boolean not null default false,
  pinned boolean not null default false,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_post_shape check (
    (kind = 'topic' and topic_id is null and char_length(btrim(title)) between 1 and 160)
    or (kind = 'reply' and topic_id is not null and title = '')
    or (kind = 'message' and topic_id is null and title = '')
  ),
  constraint community_post_body check (
    char_length(btrim(body)) between 1 and 20000
    and (kind <> 'message' or char_length(body) <= 5000)
  ),
  constraint community_post_flags check (kind = 'topic' or (not pinned and not locked))
);
create index community_posts_visible_order on public.community_posts(kind, pinned desc, created_at desc, id) where not hidden;
create index community_posts_topic_order on public.community_posts(topic_id, created_at, id) where topic_id is not null;
create index community_posts_author_time on public.community_posts(author_id, created_at desc);

create table community_private.community_revisions (
  post_id uuid not null references public.community_posts(id),
  version integer not null,
  actor_id uuid not null,
  action text not null,
  reason text,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (post_id, version)
);
create table community_private.community_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  action text not null,
  entity_type text not null check (entity_type in ('post','account')),
  entity_id uuid not null,
  reason text,
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
create index community_audit_actor_time on community_private.community_audit(actor_id,created_at desc);
create index community_audit_entity on community_private.community_audit(entity_type,entity_id,id desc);

alter table public.community_posts enable row level security;
alter table community_private.community_accounts enable row level security;
alter table community_private.community_roles enable row level security;
alter table community_private.community_revisions enable row level security;
alter table community_private.community_audit enable row level security;
-- Private tables deliberately have no browser-role policies or grants.
revoke all on public.community_posts from public, anon, authenticated, service_role;
revoke all on all tables in schema community_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema community_private from public, anon, authenticated, service_role;
grant select on public.community_posts to anon, authenticated;

-- This narrowly callable predicate avoids a recursive self-table RLS policy.
-- It reveals only whether a topic is public, never private content or metadata.
create function community_private.topic_is_visible(p_topic_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.community_posts where id = p_topic_id and kind = 'topic' and not hidden);
$$;
create policy community_public_read on public.community_posts for select to anon, authenticated
using (not hidden and (topic_id is null or community_private.topic_is_visible(topic_id)));

create function community_private.deny_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise sqlstate 'PT403' using message = 'immutable_record';
end;
$$;
create trigger community_revisions_immutable before update or delete on community_private.community_revisions for each row execute function community_private.deny_mutation();
create trigger community_audit_immutable before update or delete on community_private.community_audit for each row execute function community_private.deny_mutation();
create trigger community_posts_no_delete before delete on public.community_posts for each row execute function community_private.deny_mutation();
create trigger community_accounts_no_delete before delete on community_private.community_accounts for each row execute function community_private.deny_mutation();

create function community_private.guard_post()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id,new.kind,new.topic_id,new.author_id,new.created_at) is distinct from
     (old.id,old.kind,old.topic_id,old.author_id,old.created_at) then
    raise sqlstate 'PT403' using message = 'immutable_post_identity';
  end if;
  if new.version <> old.version + 1 then
    raise sqlstate 'PT409' using message = 'version_conflict';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger community_post_guard before update on public.community_posts for each row execute function community_private.guard_post();

-- auth.jwt() is trusted only because Supabase's Data API verifies the JWT.
-- Never expose SQL execution or allow callers to set request.jwt.claims.
-- A session lookup rejects tokens whose underlying session was removed.
create function community_private.session_user()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_session text := auth.jwt()->>'session_id';
begin
  if v_uid is null or auth.jwt()->>'role' is distinct from 'authenticated' then
    raise sqlstate 'PT401' using message = 'authentication_required';
  end if;
  if v_session is null or v_session !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise sqlstate 'PT401' using message = 'invalid_session';
  end if;
  if not exists(select 1 from auth.sessions s where s.id = v_session::uuid and s.user_id = v_uid
                and (s.not_after is null or s.not_after > now())) then
    raise sqlstate 'PT401' using message = 'session_revoked';
  end if;
  if not exists(select 1 from auth.users u where u.id = v_uid and u.deleted_at is null
                and (u.banned_until is null or u.banned_until <= now())) then
    raise sqlstate 'PT401' using message = 'account_unavailable';
  end if;
  return v_uid;
end;
$$;

-- Require the current Auth session's MFA state and its still-verified factor,
-- not merely a possibly stale aal2 claim after factor removal/downgrade.
create function community_private.has_live_mfa(p_uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.jwt()->>'aal' = 'aal2' and exists(
    select 1 from auth.sessions s join auth.mfa_factors f on f.id = s.factor_id
    where s.id = (auth.jwt()->>'session_id')::uuid and s.user_id = p_uid
      and s.aal::text = 'aal2' and f.user_id = p_uid and f.status::text = 'verified'
      and (s.not_after is null or s.not_after > now())
  );
$$;

create function community_private.require_actor(p_admin boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := community_private.session_user();
  v_state text;
  v_role text;
begin
  if not exists(select 1 from auth.users u where u.id = v_uid and u.email_confirmed_at is not null
                and u.email is not null and not coalesce(u.is_anonymous,false)) then
    raise sqlstate 'PT403' using message = 'verified_email_required';
  end if;
  insert into community_private.community_accounts(user_id) values(v_uid) on conflict do nothing;
  -- SHARE makes a concurrent suspension wait until this operation commits.
  select state into v_state from community_private.community_accounts where user_id = v_uid for share;
  if v_state <> 'active' then raise sqlstate 'PT403' using message = 'account_suspended'; end if;
  if p_admin then
    select role into v_role from community_private.community_roles where user_id = v_uid for share;
    if v_role is null or v_role not in ('moderator','owner') then raise sqlstate 'PT403' using message = 'moderator_required'; end if;
    if community_private.has_live_mfa(v_uid) is not true then raise sqlstate 'PT403' using message = 'mfa_required'; end if;
  end if;
  return v_uid;
end;
$$;

create function community_private.require_owner()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := community_private.require_actor(true);
begin
  if not exists(select 1 from community_private.community_roles where user_id = v_uid and role = 'owner') then
    raise sqlstate 'PT403' using message = 'owner_required';
  end if;
  return v_uid;
end;
$$;

create function community_private.check_content(p_kind text,p_title text,p_body text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_kind is null or p_kind not in ('topic','reply','message')
     or p_title is null or p_body is null or p_body !~ '[^[:space:]]'
     or char_length(p_body) > (case when p_kind = 'message' then 5000 else 20000 end)
     or (p_kind = 'topic' and (char_length(p_title) not between 1 and 160 or p_title !~ '[^[:space:]]'))
     or (p_kind <> 'topic' and p_title <> '') then
    raise sqlstate 'PT422' using message = 'invalid_content';
  end if;
end;
$$;
create function community_private.check_reason(p_reason text)
returns void language plpgsql set search_path = '' as $$
begin
  if p_reason is null or char_length(p_reason) > 500 or btrim(p_reason) !~ '[^[:space:]]' then
    raise sqlstate 'PT422' using message = 'reason_required';
  end if;
end;
$$;
-- Applies at the database boundary, including direct RPC bypass of the edge.
-- Shared advisory key serializes each actor's mutation quota check+audit append.
create function community_private.limit_mutation(p_uid uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text,481731));
  if (select count(*) from community_private.community_audit where actor_id = p_uid
      and created_at > now() - interval '1 minute') >= 30 then
    raise sqlstate 'PT429' using message = 'mutation_rate_limit';
  end if;
end;
$$;

create function community_private.record_post(p_before jsonb,p_after public.community_posts,p_action text,p_reason text default null)
returns void language plpgsql set search_path = '' as $$
begin
  insert into community_private.community_revisions(post_id,version,actor_id,action,reason,snapshot)
    values(p_after.id,p_after.version,auth.uid(),p_action,p_reason,to_jsonb(p_after));
  insert into community_private.community_audit(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(auth.uid(),p_action,'post',p_after.id,p_reason,p_before,to_jsonb(p_after));
end;
$$;

create function community_private.community_me()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := community_private.session_user();
  v_verified boolean;
  v_state text;
  v_version integer;
  v_role text;
  v_aal text := coalesce(auth.jwt()->>'aal','aal1');
begin
  select u.email_confirmed_at is not null and u.email is not null and not coalesce(u.is_anonymous,false)
    into v_verified from auth.users u where u.id = v_uid;
  select state,version into v_state,v_version from community_private.community_accounts where user_id = v_uid;
  select role into v_role from community_private.community_roles where user_id = v_uid;
  v_state := coalesce(v_state,'active');
  v_role := coalesce(v_role,'member');
  return jsonb_build_object('user_id',v_uid,'email_verified',v_verified,'state',v_state,'role',v_role,
    'aal',v_aal,'version',coalesce(v_version,0),'can_post',v_verified and v_state = 'active',
    'can_moderate',v_verified and v_state = 'active' and v_role in ('moderator','owner') and community_private.has_live_mfa(v_uid));
end;
$$;

create function community_private.community_create_post(p_kind text,p_title text,p_body text,p_topic_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := community_private.require_actor();
  v_parent public.community_posts;
  v_post public.community_posts;
begin
  perform community_private.limit_mutation(v_uid);
  perform community_private.check_content(p_kind,p_title,p_body);
  if (p_kind = 'reply') <> (p_topic_id is not null) then raise sqlstate 'PT422' using message = 'invalid_topic_id'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,481731));
  if (select count(*) from public.community_posts where author_id = v_uid and created_at > now() - interval '1 minute') >= 10 then
    raise sqlstate 'PT429' using message = 'posting_rate_limit';
  end if;
  if p_kind = 'reply' then
    select * into v_parent from public.community_posts where id = p_topic_id and kind = 'topic' for share;
    if not found or v_parent.hidden then raise sqlstate 'PT404' using message = 'topic_unavailable'; end if;
    if v_parent.locked then raise sqlstate 'PT403' using message = 'topic_locked'; end if;
  end if;
  insert into public.community_posts(kind,topic_id,title,body,author_id)
    values(p_kind,p_topic_id,btrim(p_title),btrim(p_body),v_uid) returning * into v_post;
  perform community_private.record_post(null,v_post,'create');
  return to_jsonb(v_post);
end;
$$;

-- One internal implementation; only the separately checked public wrappers are granted.
create function community_private.edit_post(p_post_id uuid,p_expected_version integer,p_title text,p_body text,p_admin boolean,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := community_private.require_actor(p_admin);
  v_before public.community_posts;
  v_after public.community_posts;
  v_parent public.community_posts;
begin
  perform community_private.limit_mutation(v_uid);
  if p_admin then perform community_private.check_reason(p_reason); end if;
  select * into v_before from public.community_posts where id = p_post_id for update;
  if not found then raise sqlstate 'PT404' using message = 'post_unavailable'; end if;
  if not p_admin then
    if v_before.author_id <> v_uid then raise sqlstate 'PT403' using message = 'post_owner_required'; end if;
    if v_before.hidden then raise sqlstate 'PT404' using message = 'post_unavailable'; end if;
    if v_before.locked then raise sqlstate 'PT403' using message = 'topic_locked'; end if;
    if v_before.topic_id is not null then
      select * into v_parent from public.community_posts where id = v_before.topic_id for share;
      if not found or v_parent.hidden then raise sqlstate 'PT404' using message = 'topic_unavailable'; end if;
      if v_parent.locked then raise sqlstate 'PT403' using message = 'topic_locked'; end if;
    end if;
  end if;
  if p_expected_version is null or p_expected_version <> v_before.version then raise sqlstate 'PT409' using message = 'version_conflict'; end if;
  perform community_private.check_content(v_before.kind,p_title,p_body);
  if (btrim(p_title),btrim(p_body)) = (v_before.title,v_before.body) then raise sqlstate 'PT409' using message = 'no_changes'; end if;
  update public.community_posts set title = btrim(p_title), body = btrim(p_body), version = version + 1
    where id = p_post_id returning * into v_after;
  perform community_private.record_post(to_jsonb(v_before),v_after,case when p_admin then 'admin_edit' else 'self_edit' end,btrim(p_reason));
  return to_jsonb(v_after);
end;
$$;
create function community_private.community_edit_post(p_post_id uuid,p_expected_version integer,p_title text,p_body text)
returns jsonb language sql security definer set search_path = '' as $$
  select community_private.edit_post(p_post_id,p_expected_version,p_title,p_body,false,null);
$$;
create function community_private.community_admin_edit_post(p_post_id uuid,p_expected_version integer,p_title text,p_body text,p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select community_private.edit_post(p_post_id,p_expected_version,p_title,p_body,true,p_reason);
$$;

create function community_private.community_moderate_post(p_post_id uuid,p_expected_version integer,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := community_private.require_actor(true);
  v_before public.community_posts;
  v_after public.community_posts;
begin
  perform community_private.limit_mutation(v_uid);
  perform community_private.check_reason(p_reason);
  if p_action is null or p_action not in ('hide','restore','pin','unpin','lock','unlock') then raise sqlstate 'PT422' using message = 'invalid_action'; end if;
  select * into v_before from public.community_posts where id = p_post_id for update;
  if not found then raise sqlstate 'PT404' using message = 'post_unavailable'; end if;
  if p_expected_version is null or p_expected_version <> v_before.version then raise sqlstate 'PT409' using message = 'version_conflict'; end if;
  if p_action in ('pin','unpin','lock','unlock') and v_before.kind <> 'topic' then raise sqlstate 'PT422' using message = 'topic_action_required'; end if;
  if (p_action = 'hide' and v_before.hidden) or (p_action = 'restore' and not v_before.hidden)
    or (p_action = 'pin' and v_before.pinned) or (p_action = 'unpin' and not v_before.pinned)
    or (p_action = 'lock' and v_before.locked) or (p_action = 'unlock' and not v_before.locked) then
    raise sqlstate 'PT409' using message = 'no_changes';
  end if;
  update public.community_posts set
    hidden = case p_action when 'hide' then true when 'restore' then false else hidden end,
    pinned = case p_action when 'pin' then true when 'unpin' then false else pinned end,
    locked = case p_action when 'lock' then true when 'unlock' then false else locked end,
    version = version + 1
    where id = p_post_id returning * into v_after;
  perform community_private.record_post(to_jsonb(v_before),v_after,p_action,btrim(p_reason));
  return to_jsonb(v_after);
end;
$$;

create function community_private.community_admin_list(p_kind text default null,p_search text default '',p_include_hidden boolean default true,p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform community_private.require_actor(true);
  if (p_kind is not null and p_kind not in ('topic','reply','message')) or p_search is null or char_length(p_search) > 200
     or p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000 or p_include_hidden is null then
    raise sqlstate 'PT422' using message = 'invalid_filter';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id),'[]'::jsonb) from (
    select * from public.community_posts where (p_kind is null or kind = p_kind)
      and (p_include_hidden or (not hidden and (topic_id is null or community_private.topic_is_visible(topic_id))))
      and (p_search = '' or strpos(lower(title || ' ' || body),lower(p_search)) > 0 or id::text = p_search)
    order by created_at desc,id limit p_limit offset p_offset
  ) p);
end;
$$;

create function community_private.community_admin_accounts(p_search text default '',p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform community_private.require_owner();
  if p_search is null or char_length(p_search) > 200 or p_limit is null or p_limit not between 1 and 50
     or p_offset is null or p_offset not between 0 and 10000 then raise sqlstate 'PT422' using message = 'invalid_filter'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.user_id),'[]'::jsonb) from (
    select a.*,coalesce(r.role,'member') as role from community_private.community_accounts a
      left join community_private.community_roles r using(user_id)
      where p_search = '' or strpos(a.user_id::text,lower(p_search)) > 0
      order by a.created_at desc,a.user_id limit p_limit offset p_offset
  ) a);
end;
$$;

create function community_private.community_set_account_state(p_user_id uuid,p_expected_version integer,p_state text,p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_role text;
  v_before community_private.community_accounts;
  v_after community_private.community_accounts;
begin
  -- Serialize account-state changes before acquiring actor/target row locks.
  perform pg_advisory_xact_lock(481732,1);
  v_uid := community_private.require_actor(true);
  perform community_private.limit_mutation(v_uid);
  select role into v_role from community_private.community_roles where user_id = v_uid;
  if v_role is distinct from 'owner' then raise sqlstate 'PT403' using message = 'owner_required'; end if;
  perform community_private.check_reason(p_reason);
  if p_state is null or p_state not in ('active','suspended') then raise sqlstate 'PT422' using message = 'invalid_state'; end if;
  select * into v_before from community_private.community_accounts where user_id = p_user_id for update;
  if not found then raise sqlstate 'PT404' using message = 'account_unavailable'; end if;
  if p_expected_version is null or p_expected_version <> v_before.version then raise sqlstate 'PT409' using message = 'version_conflict'; end if;
  if p_state = 'suspended' and exists(select 1 from community_private.community_roles where user_id = p_user_id and role = 'owner')
     and not exists(select 1 from community_private.community_roles r join community_private.community_accounts a using(user_id)
       join auth.users u on u.id = r.user_id
       where r.role = 'owner' and a.state = 'active' and r.user_id <> p_user_id
         and u.deleted_at is null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
         and (u.banned_until is null or u.banned_until <= now())) then
    raise sqlstate 'PT409' using message = 'last_active_owner';
  end if;
  if p_state = 'suspended' and p_user_id = v_uid then raise sqlstate 'PT403' using message = 'self_suspension_forbidden'; end if;
  if p_state = v_before.state then raise sqlstate 'PT409' using message = 'no_changes'; end if;
  update community_private.community_accounts set state = p_state,version = version + 1,updated_at = clock_timestamp()
    where user_id = p_user_id returning * into v_after;
  insert into community_private.community_audit(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_uid,case p_state when 'suspended' then 'suspend' else 'restore_account' end,'account',p_user_id,btrim(p_reason),to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create function community_private.community_post_history(p_post_id uuid,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform community_private.require_actor(true);
  if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000 then
    raise sqlstate 'PT422' using message = 'invalid_filter';
  end if;
  if not exists(select 1 from public.community_posts where id = p_post_id) then raise sqlstate 'PT404' using message = 'post_unavailable'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.version desc),'[]'::jsonb)
    from (select * from community_private.community_revisions where post_id = p_post_id order by version desc limit p_limit offset p_offset) r);
end;
$$;
create function community_private.community_admin_audit(p_limit integer default 50,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform community_private.require_owner();
  if p_limit is null or p_limit not between 1 and 50 or p_offset is null or p_offset not between 0 and 10000 then
    raise sqlstate 'PT422' using message = 'invalid_filter';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc),'[]'::jsonb) from (
    select id,actor_id,action,entity_type,entity_id,reason,created_at from community_private.community_audit order by id desc limit p_limit offset p_offset
  ) a);
end;
$$;

-- Public RPC wrappers are SECURITY INVOKER; privileged code remains private.
-- Revoke every new DEX function's inherited/default API privileges, then grant
-- only named entry points. No project-wide grants/defaults in public are changed.
create function public.community_me()
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_me();
$$;
create function public.community_create_post(p_kind text,p_title text,p_body text,p_topic_id uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_create_post(p_kind,p_title,p_body,p_topic_id);
$$;
create function public.community_edit_post(p_post_id uuid,p_expected_version integer,p_title text,p_body text)
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_edit_post(p_post_id,p_expected_version,p_title,p_body);
$$;
create function public.community_admin_edit_post(p_post_id uuid,p_expected_version integer,p_title text,p_body text,p_reason text)
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_admin_edit_post(p_post_id,p_expected_version,p_title,p_body,p_reason);
$$;
create function public.community_moderate_post(p_post_id uuid,p_expected_version integer,p_action text,p_reason text)
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_moderate_post(p_post_id,p_expected_version,p_action,p_reason);
$$;
create function public.community_admin_list(p_kind text default null,p_search text default '',p_include_hidden boolean default true,p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_admin_list(p_kind,p_search,p_include_hidden,p_limit,p_offset);
$$;
create function public.community_admin_accounts(p_search text default '',p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_admin_accounts(p_search,p_limit,p_offset);
$$;
create function public.community_set_account_state(p_user_id uuid,p_expected_version integer,p_state text,p_reason text)
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_set_account_state(p_user_id,p_expected_version,p_state,p_reason);
$$;
create function public.community_post_history(p_post_id uuid,p_limit integer default 25,p_offset integer default 0)
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_post_history(p_post_id,p_limit,p_offset);
$$;
create function public.community_admin_audit(p_limit integer default 50,p_offset integer default 0)
returns jsonb language sql security invoker set search_path = '' as $$
  select community_private.community_admin_audit(p_limit,p_offset);
$$;

revoke execute on all functions in schema community_private from public, anon, authenticated, service_role;
grant execute on function community_private.topic_is_visible(uuid) to anon, authenticated;
revoke execute on function public.community_me() from public, anon, authenticated, service_role;
grant execute on function public.community_me() to authenticated;
grant execute on function community_private.community_me() to authenticated;
revoke execute on function public.community_create_post(text,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.community_create_post(text,text,text,uuid) to authenticated;
grant execute on function community_private.community_create_post(text,text,text,uuid) to authenticated;
revoke execute on function public.community_edit_post(uuid,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.community_edit_post(uuid,integer,text,text) to authenticated;
grant execute on function community_private.community_edit_post(uuid,integer,text,text) to authenticated;
revoke execute on function public.community_admin_edit_post(uuid,integer,text,text,text) from public, anon, authenticated, service_role;
grant execute on function public.community_admin_edit_post(uuid,integer,text,text,text) to authenticated;
grant execute on function community_private.community_admin_edit_post(uuid,integer,text,text,text) to authenticated;
revoke execute on function public.community_moderate_post(uuid,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.community_moderate_post(uuid,integer,text,text) to authenticated;
grant execute on function community_private.community_moderate_post(uuid,integer,text,text) to authenticated;
revoke execute on function public.community_admin_list(text,text,boolean,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.community_admin_list(text,text,boolean,integer,integer) to authenticated;
grant execute on function community_private.community_admin_list(text,text,boolean,integer,integer) to authenticated;
revoke execute on function public.community_admin_accounts(text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.community_admin_accounts(text,integer,integer) to authenticated;
grant execute on function community_private.community_admin_accounts(text,integer,integer) to authenticated;
revoke execute on function public.community_set_account_state(uuid,integer,text,text) from public, anon, authenticated, service_role;
grant execute on function public.community_set_account_state(uuid,integer,text,text) to authenticated;
grant execute on function community_private.community_set_account_state(uuid,integer,text,text) to authenticated;
revoke execute on function public.community_post_history(uuid,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.community_post_history(uuid,integer,integer) to authenticated;
grant execute on function community_private.community_post_history(uuid,integer,integer) to authenticated;
revoke execute on function public.community_admin_audit(integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.community_admin_audit(integer,integer) to authenticated;
grant execute on function community_private.community_admin_audit(integer,integer) to authenticated;

commit;
