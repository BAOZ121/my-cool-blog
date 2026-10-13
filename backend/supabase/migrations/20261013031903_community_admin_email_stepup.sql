-- Default-disabled purpose-specific email step-up. No real key, role grant,
-- user creation, Auth setting change, or activation is performed by this migration.
-- Promoted from reviewed local prototype; changes: Vault ID lookup and me metadata.
-- Requires the existing foundation and pgcrypto in extensions, Supabase Vault.
begin;
-- Fail atomically before creating any objects when prerequisites are absent.
do $$
begin
  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('extensions.hmac(bytea,bytea,text)') is null
     or to_regprocedure('community_private.session_user()') is null then
    raise exception 'stepup_prerequisites_missing';
  end if;
end;
$$;

create table community_private.community_admin_stepup_config (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  project text not null default 'ltopqphxiulyfaivdjfq' check(project ~ '^[a-z0-9]{20}$'),
  target_user_id uuid not null default 'ff34f10e-53b0-45b9-951a-34bcbb032dad' check(target_user_id = 'ff34f10e-53b0-45b9-951a-34bcbb032dad'),
  generation bigint not null default 1 check(generation > 0),
  hmac_secret_id uuid, -- Vault reference only; never a plaintext credential
  transport_configured boolean not null default false,
  check(not enabled or (hmac_secret_id is not null and transport_configured))
);
insert into community_private.community_admin_stepup_config(singleton) values(true);
create table community_private.community_admin_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  original_session_id uuid not null,
  email text not null,
  generation bigint not null,
  scope text not null check(scope in ('admission','action')),
  action text,
  target_id uuid,
  expected_version integer,
  payload jsonb,
  payload_digest text,
  binding_digest text not null,
  salt text not null check(salt ~ '^[a-f0-9]{32}$'),
  admission_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  expires_epoch bigint not null,
  state text not null default 'pending' check(state in ('pending','prepared','active','verified','invalidated','expired','exhausted','cancelled')),
  otp_digest text check(otp_digest is null or otp_digest ~ '^[a-f0-9]{64}$'),
  attempts integer not null default 0 check(attempts between 0 and 5),
  signature_attempts integer not null default 0 check(signature_attempts between 0 and 5),
  verified_at timestamptz,
  cancelled_at timestamptz,
  cancellation_already_used boolean not null default false
);
create index community_admin_challenges_user_time on community_private.community_admin_challenges(user_id,created_at desc);
create table community_private.community_admin_admissions (
  original_session_id uuid primary key,
  id uuid not null unique default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  generation bigint not null,
  admitted_at timestamptz not null,
  last_activity_at timestamptz not null,
  absolute_expires_at timestamptz not null
);
create table community_private.community_admin_action_grants (
  challenge_id uuid primary key references community_private.community_admin_challenges(id),
  user_id uuid not null,
  original_session_id uuid not null,
  admission_id uuid not null,
  generation bigint not null,
  binding_digest text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz
);
create index community_admin_action_grants_lookup on community_private.community_admin_action_grants(original_session_id,binding_digest) where consumed_at is null and revoked_at is null;

alter table community_private.community_admin_stepup_config enable row level security;
alter table community_private.community_admin_challenges enable row level security;
alter table community_private.community_admin_admissions enable row level security;
alter table community_private.community_admin_action_grants enable row level security;
revoke all on community_private.community_admin_stepup_config,community_private.community_admin_challenges,
  community_private.community_admin_admissions,community_private.community_admin_action_grants
  from public,anon,authenticated,service_role;

create function community_private.stepup_config_generation()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Any configuration update invalidates all prior challenges and admissions.
  new.generation := old.generation + 1;
  return new;
end;
$$;
create trigger stepup_config_generation before update on community_private.community_admin_stepup_config
for each row execute function community_private.stepup_config_generation();

create function community_private.stepup_password_amr()
returns boolean language sql stable set search_path = '' as $$
 select jsonb_typeof(auth.jwt()->'amr') = 'array'
   and (auth.jwt()->'amr') @> '[{"method":"password"}]'::jsonb
   and not exists(select 1 from jsonb_array_elements(
     case when jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end) x
     where coalesce(x->>'method','') not in ('password','token_refresh','totp'));
$$;

-- Internal, fixed-config Vault lookup. Never accepts arbitrary secret IDs.
-- The only plaintext returned is between private functions inside this transaction.
create function community_private.stepup_hmac_key(p_required boolean default true)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_c community_private.community_admin_stepup_config; v_key text; v_uid uuid;
begin
  v_uid := community_private.session_user();
  select * into v_c from community_private.community_admin_stepup_config where singleton;
  if v_uid <> v_c.target_user_id or community_private.stepup_password_amr() is not true then
    if p_required then raise sqlstate 'PT403' using message='password_owner_required'; end if;
    return null;
  end if;
  if v_c.enabled and v_c.transport_configured and v_c.hmac_secret_id is not null then
    begin
      select decrypted_secret into v_key from vault.decrypted_secrets where id=v_c.hmac_secret_id;
    exception when others then
      -- Do not expose Vault/decryption internals, SQL context, or secret content.
      v_key := null;
    end;
  end if;
  if v_key is null or v_key !~ '^[A-Za-z0-9_-]{32,128}$' then
    if p_required then raise sqlstate 'PT403' using message='stepup_key_unavailable'; end if;
    return null;
  end if;
  return v_key;
end;
$$;
revoke execute on function community_private.stepup_hmac_key(boolean) from public,anon,authenticated,service_role;

create function community_private.stepup_target(p_enabled boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := community_private.session_user(); v_c community_private.community_admin_stepup_config;
begin
  select * into v_c from community_private.community_admin_stepup_config where singleton for share;
  if not found or (p_enabled and (not v_c.enabled or v_c.hmac_secret_id is null or not v_c.transport_configured)) then
    raise sqlstate 'PT403' using message='stepup_disabled';
  end if;
  if v_uid <> v_c.target_user_id or community_private.stepup_password_amr() is not true then
    raise sqlstate 'PT403' using message='password_owner_required';
  end if;
  perform 1 from auth.users u where u.id=v_uid and u.email is not null and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now());
  if not found then raise sqlstate 'PT403' using message='verified_email_required'; end if;
  perform 1 from community_private.community_accounts a where a.user_id=v_uid and a.state='active' for share;
  if not found then raise sqlstate 'PT403' using message='account_suspended'; end if;
  perform 1 from community_private.community_roles r where r.user_id=v_uid and r.role='owner' for share;
  if not found then raise sqlstate 'PT403' using message='owner_required'; end if;
  if p_enabled then perform community_private.stepup_hmac_key(); end if;
  return v_uid;
end;
$$;

-- Fixed-work 32-byte comparison: no matching-prefix early exit. PL/pgSQL is
-- not claimed to have formally proven microarchitectural constant-time behavior.
create function community_private.stepup_equal(p_a bytea,p_b bytea)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_diff integer:=0; i integer;
begin
  if p_a is null or p_b is null or octet_length(p_a)<>32 or octet_length(p_b)<>32 then return false; end if;
  for i in 0..31 loop v_diff:=v_diff | (get_byte(p_a,i) # get_byte(p_b,i)); end loop;
  return v_diff=0;
end;
$$;
create function community_private.stepup_payload(p_action text,p_payload jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v jsonb;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>150000 then
   raise sqlstate 'PT422' using message='invalid_action_payload';
 end if;
 if p_action='admin_edit_post' and (select array_agg(k order by k) from jsonb_object_keys(p_payload) k)=array['body','reason','title'] then
   if jsonb_typeof(p_payload->'title')<>'string' or jsonb_typeof(p_payload->'body')<>'string' or jsonb_typeof(p_payload->'reason')<>'string' then raise sqlstate 'PT422' using message='invalid_action_payload'; end if;
   if char_length(p_payload->>'title')>160 or char_length(p_payload->>'body') not between 1 and 20000 then raise sqlstate 'PT422' using message='invalid_action_payload'; end if;
   v:=jsonb_build_object('title',btrim(p_payload->>'title'),'body',btrim(p_payload->>'body'),'reason',btrim(p_payload->>'reason'));
 elsif p_action='moderate_post' and (select array_agg(k order by k) from jsonb_object_keys(p_payload) k)=array['action','reason'] then
   if jsonb_typeof(p_payload->'action')<>'string' or jsonb_typeof(p_payload->'reason')<>'string' or p_payload->>'action' not in ('hide','restore','pin','unpin','lock','unlock') then raise sqlstate 'PT422' using message='invalid_action_payload'; end if;
   v:=jsonb_build_object('action',p_payload->>'action','reason',btrim(p_payload->>'reason'));
 elsif p_action='set_account_state' and (select array_agg(k order by k) from jsonb_object_keys(p_payload) k)=array['reason','state'] then
   if jsonb_typeof(p_payload->'state')<>'string' or jsonb_typeof(p_payload->'reason')<>'string' or p_payload->>'state' not in ('active','suspended') then raise sqlstate 'PT422' using message='invalid_action_payload'; end if;
   v:=jsonb_build_object('state',p_payload->>'state','reason',btrim(p_payload->>'reason'));
 else raise sqlstate 'PT422' using message='invalid_action_payload'; end if;
 perform community_private.check_reason(p_payload->>'reason');
 return v;
end;
$$;
create function community_private.stepup_binding(p_generation bigint,p_scope text,p_email text,p_action text,p_target uuid,p_version integer,p_payload jsonb)
returns text language sql immutable set search_path = '' as $$
 select encode(sha256(convert_to(jsonb_build_object('protocol',1,'generation',p_generation,'scope',p_scope,'email',p_email,
   'action',p_action,'target',p_target,'expected_version',p_version,'payload',p_payload)::text,'UTF8')),'hex');
$$;
create function community_private.stepup_admission(p_uid uuid,p_touch boolean default false)
returns community_private.community_admin_admissions language plpgsql security definer set search_path = '' as $$
declare v_a community_private.community_admin_admissions; v_c community_private.community_admin_stepup_config; v_email text;
begin
 select * into v_c from community_private.community_admin_stepup_config where singleton;
 select email into v_email from auth.users where id=p_uid;
 select * into v_a from community_private.community_admin_admissions where original_session_id=(auth.jwt()->>'session_id')::uuid for update;
 if not found or not v_c.enabled or v_a.user_id<>p_uid or v_a.generation<>v_c.generation or v_a.email<>v_email
   or v_a.absolute_expires_at<=clock_timestamp() or v_a.last_activity_at+interval '15 minutes'<=clock_timestamp() then
   raise sqlstate 'PT403' using message='admin_stepup_required';
 end if;
 if p_touch then
   update community_private.community_admin_admissions set last_activity_at=clock_timestamp()
   where original_session_id=v_a.original_session_id returning * into v_a;
 end if;
 return v_a;
end;
$$;
create function community_private.stepup_can_admin(p_uid uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_c community_private.community_admin_stepup_config;
begin
 select * into v_c from community_private.community_admin_stepup_config where singleton;
 if not v_c.enabled or p_uid<>v_c.target_user_id then return community_private.has_live_mfa(p_uid); end if;
 return community_private.stepup_password_amr() is true
   and community_private.stepup_hmac_key(false) is not null
   and exists(select 1 from community_private.community_roles where user_id=p_uid and role='owner')
   and exists(select 1 from community_private.community_admin_admissions a join auth.users u on u.id=a.user_id
     where a.original_session_id=(auth.jwt()->>'session_id')::uuid and a.user_id=p_uid and a.email=u.email
       and a.generation=v_c.generation and a.absolute_expires_at>clock_timestamp() and a.last_activity_at+interval '15 minutes'>clock_timestamp());
end;
$$;
create function community_private.stepup_admin_gate(p_uid uuid,p_touch boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_c community_private.community_admin_stepup_config;
begin
 select * into v_c from community_private.community_admin_stepup_config where singleton for share;
 if v_c.enabled and p_uid=v_c.target_user_id then
   perform community_private.stepup_target(); perform community_private.stepup_admission(p_uid,p_touch);
 else
   if community_private.has_live_mfa(p_uid) is not true then raise sqlstate 'PT403' using message='mfa_required'; end if;
 end if;
end;
$$;
create function community_private.community_admin_stepup_begin(p_scope text default 'admission',p_action text default null,p_target_id uuid default null,p_expected_version integer default null,p_payload jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=community_private.stepup_target(); v_c community_private.community_admin_stepup_config;
 v_ch community_private.community_admin_challenges; v_a community_private.community_admin_admissions;
 v_email text; v_payload jsonb; v_time timestamptz:=clock_timestamp(); v_last timestamptz; v_count integer;
begin
 select * into v_c from community_private.community_admin_stepup_config where singleton;
 select email into v_email from auth.users where id=v_uid;
 -- Serialize begin/verify before either admission or challenge row locks.
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,481739));
 v_time:=clock_timestamp();
 if p_scope='admission' then
   if p_action is not null or p_target_id is not null or p_expected_version is not null or p_payload is not null then raise sqlstate 'PT422' using message='invalid_scope'; end if;
 elsif p_scope='action' then
   if p_target_id is null or p_expected_version is null or p_expected_version<1 then raise sqlstate 'PT422' using message='invalid_action_payload'; end if;
   v_a:=community_private.stepup_admission(v_uid,false);
   v_payload:=community_private.stepup_payload(p_action,p_payload);
 else raise sqlstate 'PT422' using message='invalid_scope'; end if;
 select max(created_at),count(*) into v_last,v_count from community_private.community_admin_challenges where user_id=v_uid and created_at>v_time-interval '1 hour';
 if v_last>v_time-interval '60 seconds' or v_count>=5 then
   return jsonb_build_object('created',false,'error','challenge_rate_limited','retry_after_seconds',case when v_count>=5 then 3600 else 60 end);
 end if;
 update community_private.community_admin_challenges set state='invalidated' where user_id=v_uid and state in ('pending','prepared','active');
 insert into community_private.community_admin_challenges(user_id,original_session_id,email,generation,scope,action,target_id,expected_version,payload,payload_digest,binding_digest,salt,admission_id,created_at,expires_epoch)
 values(v_uid,(auth.jwt()->>'session_id')::uuid,v_email,v_c.generation,p_scope,p_action,p_target_id,p_expected_version,v_payload,
   case when v_payload is null then null else encode(sha256(convert_to(v_payload::text,'UTF8')),'hex') end,
   community_private.stepup_binding(v_c.generation,p_scope,v_email,p_action,p_target_id,p_expected_version,v_payload),
   encode(extensions.gen_random_bytes(16),'hex'),v_a.id,v_time,floor(extract(epoch from v_time))::bigint+300) returning * into v_ch;
 return jsonb_build_object('created',true,'id',v_ch.id,'user_id',v_uid,'email',v_email,'original_session_id',v_ch.original_session_id,
   'scope',p_scope,'action',p_action,'target_id',p_target_id,'expected_version',p_expected_version,'payload_digest',v_ch.payload_digest,
   'binding_digest',v_ch.binding_digest,'salt',v_ch.salt,'created_at',v_ch.created_at,'expires_at',to_timestamp(v_ch.expires_epoch),
   'expires_epoch',v_ch.expires_epoch,'project',v_c.project,'generation',v_c.generation::text);
end;
$$;
create function community_private.stepup_signature(p_domain text,p_c community_private.community_admin_stepup_config,p_ch community_private.community_admin_challenges,p_digest text)
returns bytea language sql stable set search_path = '' as $$
 select extensions.hmac(convert_to(array_to_string(array[p_domain,p_c.project,p_ch.generation::text,p_ch.id::text,p_ch.user_id::text,
   p_ch.original_session_id::text,p_ch.scope,p_ch.binding_digest,p_ch.expires_epoch::text,p_ch.salt,p_digest],E'\n'),'UTF8'),convert_to(community_private.stepup_hmac_key(),'UTF8'),'sha256');
$$;
create function community_private.stepup_issue(p_id uuid,p_digest text,p_signature text,p_activate boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=community_private.stepup_target(); v_c community_private.community_admin_stepup_config;
 v_ch community_private.community_admin_challenges; v_email text; v_key text:=case when p_activate then 'active' else 'registered' end; v_expected bytea;
begin
 select * into v_c from community_private.community_admin_stepup_config where singleton;
 select email into v_email from auth.users where id=v_uid;
 select * into v_ch from community_private.community_admin_challenges where id=p_id for update;
 if not found or v_ch.user_id<>v_uid or v_ch.original_session_id<>(auth.jwt()->>'session_id')::uuid or v_ch.generation<>v_c.generation or v_ch.email<>v_email
   or v_ch.state in ('invalidated','verified','expired','exhausted','cancelled') then return jsonb_build_object(v_key,false,'error','challenge_unavailable'); end if;
 if to_timestamp(v_ch.expires_epoch)<=clock_timestamp() then
   update community_private.community_admin_challenges set state='expired' where id=p_id;
   return jsonb_build_object(v_key,false,'error','challenge_expired');
 end if;
 if v_ch.signature_attempts>=5 then return jsonb_build_object(v_key,false,'error','attempts_exhausted'); end if;
 if p_activate then p_digest:=v_ch.otp_digest; end if;
 if p_signature is null or p_signature !~ '^[a-f0-9]{64}$' or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' then
   update community_private.community_admin_challenges set signature_attempts=signature_attempts+1 where id=p_id;
   return jsonb_build_object(v_key,false,'error','invalid_signature');
 end if;
 v_expected:=community_private.stepup_signature(case when p_activate then 'activate-v1' else 'register-v1' end,v_c,v_ch,p_digest);
 if not community_private.stepup_equal(v_expected,decode(p_signature,'hex')) then
   update community_private.community_admin_challenges set signature_attempts=signature_attempts+1 where id=p_id;
   return jsonb_build_object(v_key,false,'error','invalid_signature');
 end if;
 if p_activate then
   if v_ch.state='active' then return jsonb_build_object('active',true); end if;
   if v_ch.state<>'prepared' then return jsonb_build_object('active',false,'error','challenge_not_prepared'); end if;
   update community_private.community_admin_challenges set state='active' where id=p_id;
 else
   if v_ch.state<>'pending' then return jsonb_build_object('registered',false,'error','challenge_unavailable'); end if;
   update community_private.community_admin_challenges set state='prepared',otp_digest=p_digest where id=p_id;
 end if;
 return jsonb_build_object(v_key,true);
end;
$$;
create function community_private.community_admin_stepup_register(p_challenge_id uuid,p_otp_digest text,p_signature text)
returns jsonb language sql security definer set search_path = '' as $$
 select community_private.stepup_issue(p_challenge_id,p_otp_digest,p_signature,false);
$$;
create function community_private.community_admin_stepup_activate(p_challenge_id uuid,p_signature text)
returns jsonb language sql security definer set search_path = '' as $$
 select community_private.stepup_issue(p_challenge_id,null,p_signature,true);
$$;
create function community_private.community_admin_stepup_verify(p_challenge_id uuid,p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=community_private.stepup_target(); v_c community_private.community_admin_stepup_config; v_ch community_private.community_admin_challenges;
 v_a community_private.community_admin_admissions; v_email text; v_expected bytea; v_time timestamptz:=clock_timestamp(); v_expires timestamptz;
begin
 select * into v_c from community_private.community_admin_stepup_config where singleton;
 select email into v_email from auth.users where id=v_uid;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,481739));
 select * into v_ch from community_private.community_admin_challenges where id=p_challenge_id for update;
 v_time:=clock_timestamp();
 if not found or v_ch.user_id<>v_uid or v_ch.original_session_id<>(auth.jwt()->>'session_id')::uuid or v_ch.generation<>v_c.generation or v_ch.email<>v_email
   or v_ch.state in ('invalidated','verified','cancelled') then return jsonb_build_object('verified',false,'error','challenge_unavailable','attempts_remaining',0); end if;
 if v_ch.attempts>=5 or v_ch.state='exhausted' then return jsonb_build_object('verified',false,'error','attempts_exhausted','attempts_remaining',0); end if;
 if to_timestamp(v_ch.expires_epoch)<=v_time or v_ch.state='expired' then
   update community_private.community_admin_challenges set state='expired' where id=p_challenge_id;
   return jsonb_build_object('verified',false,'error','challenge_expired','attempts_remaining',0);
 end if;
 if v_ch.state<>'active' then return jsonb_build_object('verified',false,'error','challenge_not_active','attempts_remaining',5-v_ch.attempts); end if;
 update community_private.community_admin_challenges set attempts=attempts+1 where id=p_challenge_id returning * into v_ch;
 if p_code is not null and p_code ~ '^[0-9]{6}$' then
   v_expected:=extensions.hmac(convert_to(array_to_string(array['otp-v1',v_c.project,v_ch.generation::text,v_ch.id::text,v_uid::text,
     v_ch.original_session_id::text,v_ch.salt,p_code],E'\n'),'UTF8'),convert_to(community_private.stepup_hmac_key(),'UTF8'),'sha256');
 end if;
 if not community_private.stepup_equal(v_expected,decode(v_ch.otp_digest,'hex')) then
   if v_ch.attempts=5 then update community_private.community_admin_challenges set state='exhausted' where id=p_challenge_id; end if;
   return jsonb_build_object('verified',false,'error','invalid_code','attempts_remaining',5-v_ch.attempts);
 end if;
 if v_ch.scope='admission' then
   v_expires:=v_time+interval '1 hour';
   insert into community_private.community_admin_admissions(original_session_id,user_id,email,generation,admitted_at,last_activity_at,absolute_expires_at)
   values(v_ch.original_session_id,v_uid,v_email,v_c.generation,v_time,v_time,v_expires)
   on conflict(original_session_id) do update set id=gen_random_uuid(),user_id=excluded.user_id,email=excluded.email,generation=excluded.generation,
     admitted_at=excluded.admitted_at,last_activity_at=excluded.last_activity_at,absolute_expires_at=excluded.absolute_expires_at;
 else
   select * into v_a from community_private.community_admin_admissions where original_session_id=v_ch.original_session_id for update;
   v_time:=clock_timestamp();
   if to_timestamp(v_ch.expires_epoch)<=v_time then
     update community_private.community_admin_challenges set state='expired' where id=p_challenge_id;
     return jsonb_build_object('verified',false,'error','challenge_expired','attempts_remaining',0);
   end if;
   if v_a.id is null or v_a.id<>v_ch.admission_id or v_a.generation<>v_c.generation or v_a.email<>v_email
      or v_a.absolute_expires_at<=v_time or v_a.last_activity_at+interval '15 minutes'<=v_time then
     update community_private.community_admin_challenges set state='invalidated' where id=p_challenge_id;
     return jsonb_build_object('verified',false,'error','admission_expired','attempts_remaining',0);
   end if;
   v_expires:=least(v_time+interval '2 minutes',v_a.absolute_expires_at,v_a.last_activity_at+interval '15 minutes');
   insert into community_private.community_admin_action_grants(challenge_id,user_id,original_session_id,admission_id,generation,binding_digest,expires_at)
   values(v_ch.id,v_uid,v_ch.original_session_id,v_a.id,v_c.generation,v_ch.binding_digest,v_expires);
 end if;
 update community_private.community_admin_challenges set state='verified',verified_at=v_time where id=p_challenge_id;
 return jsonb_build_object('verified',true,'id',v_ch.id,'scope',v_ch.scope,'original_session_id',v_ch.original_session_id,'expires_epoch',floor(extract(epoch from v_expires))::bigint);
end;
$$;
create function community_private.community_admin_stepup_status()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=community_private.stepup_target(false); v_c community_private.community_admin_stepup_config;
 v_a community_private.community_admin_admissions; v_ok boolean:=false;
begin
 select * into v_c from community_private.community_admin_stepup_config where singleton;
 if v_c.enabled then v_ok:=community_private.stepup_can_admin(v_uid); end if;
 if v_ok then select * into v_a from community_private.community_admin_admissions where original_session_id=(auth.jwt()->>'session_id')::uuid; end if;
 return jsonb_build_object('enabled',v_c.enabled,'admitted',v_ok,'original_session_id',auth.jwt()->>'session_id',
   'idle_expires_epoch',case when v_ok then floor(extract(epoch from least(v_a.last_activity_at+interval '15 minutes',v_a.absolute_expires_at)))::bigint else null end,
   'absolute_expires_epoch',case when v_ok then floor(extract(epoch from v_a.absolute_expires_at))::bigint else null end);
end;
$$;
create function community_private.stepup_consume_action(p_action text,p_target uuid,p_version integer,p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid:=auth.uid(); v_c community_private.community_admin_stepup_config; v_a community_private.community_admin_admissions;
 v_email text; v_digest text; v_id uuid;
begin
 select * into v_c from community_private.community_admin_stepup_config where singleton;
 if not v_c.enabled or v_uid<>v_c.target_user_id then return; end if;
 perform community_private.stepup_target(); v_a:=community_private.stepup_admission(v_uid,false);
 select email into v_email from auth.users where id=v_uid;
 v_digest:=community_private.stepup_binding(v_c.generation,'action',v_email,p_action,p_target,p_version,community_private.stepup_payload(p_action,p_payload));
 select challenge_id into v_id from community_private.community_admin_action_grants
 where user_id=v_uid and original_session_id=(auth.jwt()->>'session_id')::uuid and admission_id=v_a.id and generation=v_c.generation
   and binding_digest=v_digest and consumed_at is null and revoked_at is null and expires_at>clock_timestamp()
 order by expires_at limit 1 for update;
 if not found then raise sqlstate 'PT403' using message='action_stepup_required'; end if;
 update community_private.community_admin_action_grants set consumed_at=clock_timestamp()
   where challenge_id=v_id and consumed_at is null and revoked_at is null and expires_at>clock_timestamp() returning challenge_id into v_id;
 if not found then raise sqlstate 'PT403' using message='action_stepup_required'; end if;
end;
$$;

-- Cancellation only reduces this caller's own exact challenge authority.
-- It intentionally does not require current app-role/config/admission state:
-- revocation remains possible after those have changed. Live password session
-- and exact original user/session ownership remain mandatory.
create function community_private.community_admin_stepup_cancel(p_challenge_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_uid uuid:=community_private.session_user();
 v_ch community_private.community_admin_challenges;
 v_used boolean:=false;
 v_time timestamptz;
begin
 if community_private.stepup_password_amr() is not true then
   raise sqlstate 'PT403' using message='password_owner_required';
 end if;
 -- Same serialization lock as begin/verify, always before challenge/grant rows.
 -- Cancellation never takes an admission or content-row lock.
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text,481739));
 select * into v_ch from community_private.community_admin_challenges where id=p_challenge_id for update;
 if not found or v_ch.user_id<>v_uid or v_ch.original_session_id<>(auth.jwt()->>'session_id')::uuid then
   return jsonb_build_object('cancelled',false,'already_used',false,'error','challenge_unavailable');
 end if;
 -- Retrying an old cancellation cannot cancel an intentionally NEW challenge.
 if v_ch.cancelled_at is not null then
   return jsonb_build_object('cancelled',not v_ch.cancellation_already_used,'already_used',v_ch.cancellation_already_used);
 end if;
 if v_ch.scope='admission' and v_ch.state='verified' then
   return jsonb_build_object('cancelled',false,'already_used',true);
 end if;
 v_time:=clock_timestamp();
 if v_ch.scope='action' then
   -- Public mutations consume any exact-binding grant, so revoke the complete
   -- pre-existing authority for THIS operation, not only the supplied row.
   -- All matching grant locks use deterministic order; consumers lock one row.
   perform 1 from community_private.community_admin_action_grants g
   where g.user_id=v_ch.user_id and g.original_session_id=v_ch.original_session_id
     and g.admission_id=v_ch.admission_id and g.generation=v_ch.generation and g.binding_digest=v_ch.binding_digest
   order by g.challenge_id for update;
   select exists(select 1 from community_private.community_admin_action_grants g
     where g.user_id=v_ch.user_id and g.original_session_id=v_ch.original_session_id
       and g.admission_id=v_ch.admission_id and g.generation=v_ch.generation and g.binding_digest=v_ch.binding_digest
       and g.consumed_at is not null) into v_used;
   update community_private.community_admin_action_grants g set revoked_at=coalesce(g.revoked_at,v_time)
   where g.user_id=v_ch.user_id and g.original_session_id=v_ch.original_session_id
     and g.admission_id=v_ch.admission_id and g.generation=v_ch.generation and g.binding_digest=v_ch.binding_digest
     and g.consumed_at is null;
   -- In-flight matching challenges created before this serialized cancellation
   -- cannot later verify into a replacement grant. A subsequent explicit begin
   -- is a new authorization request and remains allowed.
   update community_private.community_admin_challenges c set state='cancelled',cancelled_at=v_time,cancellation_already_used=v_used
   where c.user_id=v_ch.user_id and c.original_session_id=v_ch.original_session_id
     and c.admission_id=v_ch.admission_id and c.generation=v_ch.generation and c.binding_digest=v_ch.binding_digest
     and c.state in ('pending','prepared','active');
 end if;
 update community_private.community_admin_challenges set state='cancelled',cancelled_at=v_time,cancellation_already_used=v_used where id=p_challenge_id;
 return jsonb_build_object('cancelled',not v_used,'already_used',v_used);
end;
$$;

create function public.community_admin_stepup_begin(p_scope text default 'admission',p_action text default null,p_target_id uuid default null,p_expected_version integer default null,p_payload jsonb default null)
returns jsonb language sql security invoker set search_path = '' as $$
 select community_private.community_admin_stepup_begin(p_scope,p_action,p_target_id,p_expected_version,p_payload);
$$;

create function public.community_admin_stepup_register(p_challenge_id uuid,p_otp_digest text,p_signature text)
returns jsonb language sql security invoker set search_path = '' as $$
 select community_private.community_admin_stepup_register(p_challenge_id,p_otp_digest,p_signature);
$$;

create function public.community_admin_stepup_activate(p_challenge_id uuid,p_signature text)
returns jsonb language sql security invoker set search_path = '' as $$
 select community_private.community_admin_stepup_activate(p_challenge_id,p_signature);
$$;

create function public.community_admin_stepup_verify(p_challenge_id uuid,p_code text)
returns jsonb language sql security invoker set search_path = '' as $$
 select community_private.community_admin_stepup_verify(p_challenge_id,p_code);
$$;

create function public.community_admin_stepup_status()
returns jsonb language sql security invoker set search_path = '' as $$
 select community_private.community_admin_stepup_status();
$$;
create function public.community_admin_stepup_cancel(p_challenge_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
 select community_private.community_admin_stepup_cancel(p_challenge_id);
$$;
revoke execute on function community_private.community_admin_stepup_cancel from public,anon,authenticated,service_role;
revoke execute on function public.community_admin_stepup_cancel from public,anon,authenticated,service_role;
grant execute on function public.community_admin_stepup_cancel,community_private.community_admin_stepup_cancel to authenticated;

revoke execute on function community_private.stepup_config_generation from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_password_amr from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_target from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_equal from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_payload from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_binding from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_admission from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_can_admin from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_admin_gate from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_begin from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_signature from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_issue from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_register from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_activate from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_verify from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_status from public,anon,authenticated,service_role;
revoke execute on function community_private.stepup_consume_action from public,anon,authenticated,service_role;
revoke execute on function public.community_admin_stepup_begin from public,anon,authenticated,service_role;
grant execute on function public.community_admin_stepup_begin,community_private.community_admin_stepup_begin to authenticated;
revoke execute on function public.community_admin_stepup_register from public,anon,authenticated,service_role;
grant execute on function public.community_admin_stepup_register,community_private.community_admin_stepup_register to authenticated;
revoke execute on function public.community_admin_stepup_activate from public,anon,authenticated,service_role;
grant execute on function public.community_admin_stepup_activate,community_private.community_admin_stepup_activate to authenticated;
revoke execute on function public.community_admin_stepup_verify from public,anon,authenticated,service_role;
grant execute on function public.community_admin_stepup_verify,community_private.community_admin_stepup_verify to authenticated;
revoke execute on function public.community_admin_stepup_status from public,anon,authenticated,service_role;
grant execute on function public.community_admin_stepup_status,community_private.community_admin_stepup_status to authenticated;


-- Integrate every existing administrator guard/mutation.


create or replace function community_private.require_actor(p_admin boolean default false)
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
    perform community_private.stepup_admin_gate(v_uid,true);
  end if;
  return v_uid;
end;
$$;

create or replace function community_private.community_me()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := community_private.session_user();
  v_verified boolean;
  v_state text;
  v_version integer;
  v_role text;
  v_aal text := coalesce(auth.jwt()->>'aal','aal1');
  v_c community_private.community_admin_stepup_config;
  v_email_mode boolean;
  v_can_request boolean := false;
begin
  select u.email_confirmed_at is not null and u.email is not null and not coalesce(u.is_anonymous,false)
    into v_verified from auth.users u where u.id = v_uid;
  select state,version into v_state,v_version from community_private.community_accounts where user_id = v_uid;
  select role into v_role from community_private.community_roles where user_id = v_uid;
  v_state := coalesce(v_state,'active');
  v_role := coalesce(v_role,'member');
  select * into v_c from community_private.community_admin_stepup_config where singleton;
  v_email_mode := coalesce(v_c.enabled and v_uid=v_c.target_user_id,false);
  if v_email_mode and v_verified and v_state='active' and v_role='owner'
     and community_private.stepup_password_amr() is true then
    v_can_request := community_private.stepup_hmac_key(false) is not null;
  end if;
  return jsonb_build_object('user_id',v_uid,'email_verified',v_verified,'state',v_state,'role',v_role,
    'aal',v_aal,'admin_auth_method',case when v_email_mode then 'email' else 'totp' end,
    'can_request_email_stepup',v_can_request,'version',coalesce(v_version,0),'can_post',v_verified and v_state = 'active',
    'can_moderate',v_verified and v_state = 'active' and v_role in ('moderator','owner') and community_private.stepup_can_admin(v_uid));
end;
$$;

create or replace function community_private.edit_post(p_post_id uuid,p_expected_version integer,p_title text,p_body text,p_admin boolean,p_reason text)
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
  if p_admin then perform community_private.stepup_consume_action('admin_edit_post',p_post_id,p_expected_version,jsonb_build_object('title',p_title,'body',p_body,'reason',p_reason)); end if;
  update public.community_posts set title = btrim(p_title), body = btrim(p_body), version = version + 1
    where id = p_post_id returning * into v_after;
  perform community_private.record_post(to_jsonb(v_before),v_after,case when p_admin then 'admin_edit' else 'self_edit' end,btrim(p_reason));
  return to_jsonb(v_after);
end;
$$;

create or replace function community_private.community_moderate_post(p_post_id uuid,p_expected_version integer,p_action text,p_reason text)
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
  perform community_private.stepup_consume_action('moderate_post',p_post_id,p_expected_version,jsonb_build_object('action',p_action,'reason',p_reason));
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

create or replace function community_private.community_set_account_state(p_user_id uuid,p_expected_version integer,p_state text,p_reason text)
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
  perform community_private.stepup_consume_action('set_account_state',p_user_id,p_expected_version,jsonb_build_object('state',p_state,'reason',p_reason));
  update community_private.community_accounts set state = p_state,version = version + 1,updated_at = clock_timestamp()
    where user_id = p_user_id returning * into v_after;
  insert into community_private.community_audit(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_uid,case p_state when 'suspended' then 'suspend' else 'restore_account' end,'account',p_user_id,btrim(p_reason),to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;


notify pgrst, 'reload schema';
commit;
