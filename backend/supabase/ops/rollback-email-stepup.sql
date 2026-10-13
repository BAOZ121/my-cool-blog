-- OPERATOR-ONLY full behavior rollback after explicit authorization.
-- Restores five original private definitions; retains private history/tables.
-- No deletion and no changes to roles, Auth users, sessions, or Vault secrets.
begin;
update community_private.community_admin_stepup_config
set enabled=false,transport_configured=false,hmac_secret_id=null where singleton;
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
    if community_private.has_live_mfa(v_uid) is not true then raise sqlstate 'PT403' using message = 'mfa_required'; end if;
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
  update community_private.community_accounts set state = p_state,version = version + 1,updated_at = clock_timestamp()
    where user_id = p_user_id returning * into v_after;
  insert into community_private.community_audit(actor_id,action,entity_type,entity_id,reason,before_data,after_data)
    values(v_uid,case p_state when 'suspended' then 'suspend' else 'restore_account' end,'account',p_user_id,btrim(p_reason),to_jsonb(v_before),to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

revoke execute on function public.community_admin_stepup_begin from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_begin from public,anon,authenticated,service_role;
revoke execute on function public.community_admin_stepup_register from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_register from public,anon,authenticated,service_role;
revoke execute on function public.community_admin_stepup_activate from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_activate from public,anon,authenticated,service_role;
revoke execute on function public.community_admin_stepup_verify from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_verify from public,anon,authenticated,service_role;
revoke execute on function public.community_admin_stepup_cancel from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_cancel from public,anon,authenticated,service_role;
revoke execute on function public.community_admin_stepup_status from public,anon,authenticated,service_role;
revoke execute on function community_private.community_admin_stepup_status from public,anon,authenticated,service_role;
notify pgrst, 'reload schema';
commit;
