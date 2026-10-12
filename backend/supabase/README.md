# DEX community database foundation

The database foundation and the separately approved automatic-RLS privilege repair were applied to the authorized Supabase project on 2026-10-12 by the coordinating deployment task. See [the deployment record](DEPLOYMENT.md) for the verified scope and remaining gates. No user signup, real owner grant, Auth credential change, Cloudflare application deployment or paid service was performed by these database changes. SMTP/Auth delivery and full application rollout remain separate gates.

## Files and local verification

- `migrations/20261012030809_dex_community_foundation.sql`: the applied atomic foundation migration. It was initially generated with official pinned Supabase CLI `2.120.0` (`supabase migration new dex_community_foundation --workdir backend`); its filename was reconciled to the authoritative hosted migration version after approval and application. SQL content is unchanged at SHA-256 `2b642b6dce8b73dd7633ec704152673ba5d1d4af9a611150d5e82fa6eaf8ce52`.
- `tests/community.test.mjs`: policy and mutation tests running actual PostgreSQL through pinned `@electric-sql/pglite` `0.5.8`.
- `tests/auth-stubs.sql`: TEST ONLY simplified Auth tables and request claims. Never apply these stubs to Supabase.
- `migrations/20261012030835_harden_auto_rls_execute.sql`: the separately approved and applied EXECUTE revoke for the pre-existing `public.rls_auto_enable()` function; preserves the function and its event trigger.
- `tests/auto-rls-fixture.sql`: TEST ONLY emulation of the pre-existing automatic-RLS function/event trigger, loaded before both migrations. Never deploy this fixture.
- `tests/auto-rls-repair.test.mjs`: a separate regression proving the approved EXECUTE revoke leaves automatic RLS working for CREATE TABLE, CREATE TABLE AS and SELECT INTO.

Run from the repository root (Node 22+):

```sh
npm ci --prefix backend/supabase
npm test --prefix backend/supabase
```

Verified locally on 2026-10-12: 28 passing tests, including the suite wrapper, with both authoritative migration files applied after the test-only existing-trigger fixture. PGlite reports PostgreSQL 18.3. These local tests do not create real Supabase Auth, PostgREST or browser sessions. Separately, the coordinator verified the actual hosted PostgreSQL 17.11 objects, grants, advisors and anonymous/missing-session denial checks after application; see the deployment record.

PGlite queues transactions on a single connection. The competing-edit test proves expected-version compare-and-set behavior, not true multi-connection lock scheduling. Full signed-in Supabase Auth/PostgREST flows and multi-connection PostgreSQL 17 races remain acceptance gates below. Hosted advisor/object checks already completed are recorded separately.

Both filenames now match the hosted migration history. Do not retain or reapply the earlier preparation filename `20261012025436_dex_community_foundation.sql`: that would incorrectly present the already-applied foundation as another pending migration. The repair intentionally requires the inspected pre-existing automatic-RLS function; do not install the test fixture on a fresh production target.

## Data and visibility

Public `community_posts` contains only:

`id, kind, topic_id, title, body, author_id, version, hidden, pinned, locked, created_at, updated_at`

`kind` is `topic`, `reply` or `message`. A reply belongs to exactly one topic; nested replies are not supported. Topic title is 1–160 characters, reply/message title is an empty string. Topic/reply body is 1–20,000 characters; message body is 1–5,000. Whitespace-only content is rejected. Strings are plain text; render them using `textContent` or equivalent escaping, never HTML. Author UUID is public and immutable; email is never copied into public content.

Private schema `community_private`:

| Table | Purpose |
| --- | --- |
| `community_accounts` | UUID, active/suspended state, version and timestamps |
| `community_roles` | Explicit UUID-based moderator/owner role; no member row required |
| `community_revisions` | Immutable full snapshot for every successful post version |
| `community_audit` | Immutable actor/action/reason and before/after snapshots for successful post/account mutations |

Every table has RLS. Public SELECT returns only non-hidden posts, and a reply disappears whenever its topic is hidden. Moderator direct SELECT also sees only this public projection; hidden content requires an authorized RPC. Private tables have no client-role policies or table privileges. No public column stores a moderation reason, email, ban detail or role.

There are no direct client INSERT/UPDATE/DELETE grants. All newly created DEX objects explicitly revoke inherited/default PUBLIC, anon, authenticated and service_role access before granting the narrow intended capability. This works with both legacy auto-exposure grants and newer explicit Data API grants. The migration does not change unrelated public-schema default privileges or pre-existing event triggers.

## Authentication and authorization

The Data API must validate the end-user JWT. Use only the publishable API key plus the user's bearer token; the application does not need a service-role key. Do not expose SQL execution or request-claim configuration to clients.

Every authenticated RPC checks `auth.uid()`, the top-level authenticated role, the current `session_id` in `auth.sessions`, session expiry, and the live Auth user. Mutations additionally require a current confirmed email, a non-anonymous identity and active app account. Missing/deleted/banned users and removed/expired/mismatched sessions fail closed. An existing valid JWT does not bypass a later app suspension or role revocation.

Admin checks require all of:

1. Active verified user and live session
2. Moderator/owner row in the private UUID table
3. JWT `aal2`
4. That session's current database `aal2` and matching still-verified MFA factor owned by the same user

This also rejects stale AAL2 JWTs after factor removal or live session downgrade. Authorization never uses user metadata or a requested role. Public wrappers are SECURITY INVOKER; privileged implementation functions live in the private schema, pin `search_path = ''`, qualify relation names and perform the checks above. Internal helper EXECUTE is revoked. Narrow private entry functions remain checked even if someone mistakenly exposes the private schema later; nevertheless, keep `community_private` out of Data API exposed schemas.

Account state changes, role reads and content mutations take transactional locks. Topic locks block member reply creation and self-edits, including edits to replies; moderators may edit locked/hidden content with a reason. Account-state changes are serialized, self-suspension is forbidden, and suspending the last usable active owner is forbidden. There is no role-grant/demotion RPC. Role changes must be separately approved operator actions and must preserve a usable owner.

A new verified user receives an ordinary active account only on first authorized community mutation. `community_me` is read-only and returns version 0 before this first mutation. Account management lists/suspends existing community accounts, not every Supabase Auth signup. It never changes Auth passwords, email, sessions or credentials.

## Public RPC contract

All RPCs return JSONB: an object, or an array for list/history methods. Parameters below are exact PostgREST names. All calls require an authenticated end-user JWT. Public browsing uses SELECT on `community_posts`.

| RPC | Parameters | Access / result |
| --- | --- | --- |
| `community_me` | none | Current user status: `user_id,email_verified,state,role,aal,version,can_post,can_moderate` |
| `community_create_post` | `p_kind text,p_title text,p_body text,p_topic_id uuid = null` | Verified active member; new post |
| `community_edit_post` | `p_post_id uuid,p_expected_version int,p_title text,p_body text` | Post author only; visible unlocked content |
| `community_admin_edit_post` | edit parameters plus `p_reason text` | MFA moderator/owner; preserves original author |
| `community_moderate_post` | `p_post_id uuid,p_expected_version int,p_action text,p_reason text` | MFA moderator/owner; action hide/restore/pin/unpin/lock/unlock |
| `community_admin_list` | `p_kind text = null,p_search text = '',p_include_hidden bool = true,p_limit int = 50,p_offset int = 0` | MFA moderator/owner; post array |
| `community_admin_accounts` | `p_search text = '',p_limit int = 50,p_offset int = 0` | MFA owner only; account array with role, no email |
| `community_set_account_state` | `p_user_id uuid,p_expected_version int,p_state text,p_reason text` | MFA owner only; existing account active/suspended |
| `community_post_history` | `p_post_id uuid,p_limit int = 25,p_offset int = 0` | MFA moderator/owner; newest-first revision array with one full snapshot per entry |
| `community_admin_audit` | `p_limit int = 50,p_offset int = 0` | MFA owner only; newest-first metadata array, without bulk before/after content |

All list limits are 1–50; offsets 0–10,000; search at most 200 characters and interpreted literally. Account search is by UUID. A moderation reason is required, at most 500 raw characters, and stored trimmed. Pin/lock apply only to topics. Public `can_post` means authenticated/verified/active, independent of quota. `can_moderate` incorporates the current live MFA check; the `aal` field itself describes the JWT claim and may be stale.

Successful changes increment a version and append their revision and audit atomically. `p_expected_version` is mandatory for edit/moderation/state changes; a conflict never overwrites newer content. No-op changes are rejected. No operation permanently deletes content. Public API roles cannot change immutable author/kind/parent/creation identity or update/delete audit/history. A database operator can of course alter database protections; this is application-level immutability, not tamper-proof external storage.

Mutation quota: at most 30 successful mutations per actor per minute, including direct RPC calls. Creation additionally allows at most 10 posts per actor per minute. Checks are serialized per actor and count private audit/post rows; limits do not depend on an easily bypassed edge-only counter. These limits are an initial abuse guard, not a complete free-tier cost guarantee. Direct public Data API reads remain subject to project-level row limits and quotas.

### Errors

PostgREST uses these custom SQLSTATE values as HTTP statuses:

- `PT401`: missing, invalid, removed or expired session; unavailable Auth user
- `PT403`: unverified email, suspension, role/ownership/MFA failure, locked topic, self-suspension
- `PT404`: unavailable post/topic/account
- `PT409`: stale version, no changes, last active owner guard
- `PT422`: invalid content, reason, action, shape or pagination
- `PT429`: posting or mutation rate limit

Direct unauthorized table/function access returns PostgreSQL `42501`. Clients should map codes safely, not render database diagnostics as HTML.

## Covered locally

- Legacy grants are explicitly narrowed; all tables have RLS; private helpers have no client EXECUTE; public wrappers are invoker and all function search paths are pinned
- Anonymous writes, direct table writes, private reads and role self-grants denied
- Anonymous-authenticated/unverified/banned/deleted users, absent/revoked/expired/mismatched sessions denied
- Role metadata cannot create authority; live revocation defeats old sessions
- Valid topic/reply/message creation, shape and length checks, immutable author
- Self ownership and expected-version conflicts, including two queued stale clients
- AAL1/missing/stale AAL2 rejected, including live factor removal and session downgrade
- Hidden topic also hides replies; locked parent prevents create/edit
- Moderator edit retains author and requires a bounded reason
- Owner-only account/audit access, suspension/restore, self/last-owner guards
- Immutable history/audit, no permanent deletes, and rollback when audit insertion fails
- Search/pagination bounds, private entry-point authorization, no-op rejection and DB-level create/edit quotas
- Separate EXECUTE repair preserves the automatic RLS event trigger

## Remaining application-rollout gates and future environment setup

1. The target foundation and repair applications were approved and completed as recorded in `DEPLOYMENT.md`. Any additional target, schema/data change, identity grant or application deployment requires its own applicable authorization. Inspect existing objects/history first. Never run the Auth or automatic-RLS test fixtures against Supabase.
2. For any new environment, use a reviewed PostgreSQL 17/Supabase test environment first. Confirm current `auth.users` fields (`id,email,email_confirmed_at,banned_until,deleted_at,is_anonymous`), `auth.sessions` fields (`id,user_id,not_after,aal,factor_id`) and `auth.mfa_factors` fields (`id,user_id,status`). These column names were checked read-only against the intended target during preparation.
3. Run the full suite against genuine Auth sessions and Data API JWT validation. Verify HTTP schema exposure, anon publishable access, signed-in members, moderator/owner AAL1/AAL2, logout, factor removal, session expiry, suspension and role revocation. These full Auth/PostgREST flows have not been run. The coordinator already verified hosted database grants/denial checks and ran security/performance advisors; rerun after any subsequent changes and review findings.
4. Run true two-connection PostgreSQL tests for simultaneous edits, topic lock versus reply insertion/self-edit, actor suspension versus mutation, role revocation versus admin action, and owner-state changes. Expected versions, SHARE row locks and advisory locks are implemented but their concurrent scheduling has not been validated by single-connection PGlite.
5. Verify email confirmation, allowed redirect origins, CAPTCHA/abuse controls, free SMTP delivery and recovery, MFA enrollment and fresh challenge UX. No email/password/MFA flow is provided by this SQL.
6. Separately authorize and verify the first real owner's UUID and verified identity, then perform the minimum operator grant. Nothing here auto-promotes the first signup, trusts an email string for admin, or contains a bootstrap credential. Keep a documented recovery path and at least one usable owner.
7. Configure API response/row limits and free-tier alerts. Confirm escaped rendering, no secret keys in browser/build logs, no shared-cache leakage, and adequate privacy/retention policy for revision/audit snapshots. Hidden content is not erased; it persists in private history.
8. The two database migration versions are already recorded as applied. Verify history instead of replaying them. Test the actual application before switching the live frontend. There is no paid-plan change or production-readiness claim; database initialization is only one part of rollout.

## Official references checked

- [Supabase changelog](https://supabase.com/changelog), including [explicit Data API exposure](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Database functions, security and grants](https://supabase.com/docs/guides/database/functions)
- [MFA enforcement and stale assurance claims](https://supabase.com/docs/guides/auth/auth-mfa)
- [JWT claim reference](https://supabase.com/docs/guides/auth/jwt-fields)
- [Supabase Auth MFA schema](https://github.com/supabase/auth/blob/master/migrations/20221003041349_add_mfa_schema.up.sql) and [Auth factor-removal tests](https://github.com/supabase/auth/blob/master/internal/api/admin_test.go)
