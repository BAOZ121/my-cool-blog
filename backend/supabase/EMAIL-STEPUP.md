# Administrator email step-up: migration and operator runbook

## Status and approval boundary

The coordinating task reports the approved frozen migration was applied to `ltopqphxiulyfaivdjfq` as authoritative version `20261013031903`, name `community_admin_email_stepup`. The local deployable filename is now `20261013031903_community_admin_email_stepup.sql`. SQL bytes remain SHA-256 `2eb48221bc5f7d4e304680ea68870137db186e5d68856e0cb0e208dc9d5eb751`; only the filename changed from preparation version `20261013024643`. No duplicate pending migration should remain.

Post-apply metadata was reported as `enabled=false`, `transport_configured=false`, `hmac_secret_id=NULL`, generation 1. There are zero new challenges, admissions or action grants. The migration creates no real secret, user/role assignment or Auth configuration change. The two earlier deployed migrations also remain byte-for-byte unchanged. See [DEPLOYMENT.md](DEPLOYMENT.md).

The new migration promotes the reviewed custom email-code protocol. Relative to the prototype it replaces a plaintext private key field with a Vault UUID, renames the operator readiness flag to `transport_configured`, adds explicit `community_me` authentication-method metadata, and serializes configuration changes with administrator transactions. Native Supabase OTP/recovery JWTs are not administrator email proofs. Actual JWT `aal` is never upgraded by this application feature.

The schema apply is already approved and recorded; verify hosted migration history instead of replaying it. Credential creation/configuration and activation remain separately approved user-performed secure setup. No service-role key belongs in the browser or Pages implementation.

## Exact object and permission changes

Four new RLS-enabled tables in the existing, unexposed `community_private` schema:

- `community_admin_stepup_config`: singleton, enabled (false), project, fixed target_user_id, generation, hmac_secret_id (NULL), transport_configured (false). The UUID points to Vault; no plaintext key column exists.
- `community_admin_challenges`: id, user_id, original_session_id, verified email snapshot, generation, scope, action, target_id, expected_version, normalized payload, payload_digest, binding_digest, random salt, admission_id, created_at, expires_epoch, state, otp_digest, attempts, signature_attempts, verified_at, cancelled_at, cancellation_already_used.
- `community_admin_admissions`: original_session_id, id, user_id, email, generation, admitted_at, last_activity_at, absolute_expires_at.
- `community_admin_action_grants`: challenge_id, user_id, original_session_id, admission_id, generation, binding_digest, expires_at, consumed_at, revoked_at.

Two lookup indexes and one config-generation trigger are added. All four tables have all privileges explicitly revoked from PUBLIC, anon, authenticated and service_role. They have no client RLS policies. There is no new schema/table SELECT grant.

Six new public SECURITY INVOKER wrappers, and their six checked private implementations, receive EXECUTE only for authenticated:

1. `community_admin_stepup_begin(p_scope text='admission', p_action text=null, p_target_id uuid=null, p_expected_version integer=null, p_payload jsonb=null)`
2. `community_admin_stepup_register(p_challenge_id uuid, p_otp_digest text, p_signature text)`
3. `community_admin_stepup_activate(p_challenge_id uuid, p_signature text)`
4. `community_admin_stepup_verify(p_challenge_id uuid, p_code text)`
5. `community_admin_stepup_cancel(p_challenge_id uuid)`
6. `community_admin_stepup_status()`

The 13 other new private functions are internal-only: `stepup_config_generation`, `stepup_password_amr`, `stepup_hmac_key`, `stepup_target`, `stepup_equal`, `stepup_payload`, `stepup_binding`, `stepup_admission`, `stepup_can_admin`, `stepup_admin_gate`, `stepup_signature`, `stepup_issue`, `stepup_consume_action`. All client EXECUTE is revoked. Privileged implementations have empty search paths. The Vault lookup accepts no secret ID, selects only the configured UUID, checks the live caller/password identity, and sanitizes lookup/decryption failures. `stepup_signature` is STABLE because it now reads database-backed key state.

Five existing private definitions are replaced, with original public signatures preserved: `require_actor`, `community_me`, `edit_post`, `community_moderate_post`, `community_set_account_state`. All administrator reads use the common guard; three important mutation types consume their exact operation grant inside the same transaction. Ordinary self-edits do not acquire administrator authority.

`community_me` adds `admin_auth_method` (`email` only for the enabled fixed target; otherwise `totp`) and `can_request_email_stepup`. The existing `aal` remains the actual claim. Private grants/role state, live Auth session, verified email and active account remain authoritative. The configured target is `ff34f10e-53b0-45b9-951a-34bcbb032dad` on `ltopqphxiulyfaivdjfq`; the migration does not grant that UUID a role.

No Vault grants/revokes or extension installation are performed. Preflight requires `vault.decrypted_secrets`, `extensions.hmac(bytea,bytea,text)` and the existing foundation. Parent-provided metadata-only inspection confirmed Vault and pgcrypto in those schemas. Existing hosted service_role has Vault USAGE/SELECT, while anon/authenticated do not; this migration does not change those pre-existing rights. Treat any service-role credential as powerful and keep it out of this application.

## Default-disabled behavior and protocol

While disabled, all administrators retain the original live AAL2 + verified factor requirement. After explicit activation, only the fixed current owner uses the password + custom email-code gate; other administrators retain live MFA. Config/key/transport failure for the email target never falls back to MFA or password-only access.

All six RPCs use the original password-session bearer. Each grant-producing step independently checks live session, exact UUID/current owner role, active account and unchanged verified email. The code is six digits, valid for five minutes, max five attempts, one begin per minute and five per hour. Register prepares an HMAC-bound digest; activate makes it usable only after signed provider acceptance. Failed/uncertain send stays unusable. Attempts are committed as JSON failures rather than exception rollbacks.

Admission expires after 15 idle minutes or one absolute hour. Only actual successful administrator RPC transactions touch idle activity. Status/session polling and token refresh do not extend it. An important mutation needs a single-use grant valid for at most two minutes and bound to original session, admission ID, configuration generation, action, target, expected version and normalized payload. A failed mutation rolls back consumption; retry remains limited to the exact same operation before expiry.

Cancellation revokes all unused permissions and pre-existing pending proofs for the same exact operation binding, preserving other operations. It reports a completed mutation/admission as already_used and never claims undo/logout. Stable repeated cancellation does not revoke a later intentionally requested new challenge. Begin/verify/cancel share a per-user advisory lock before row locks. A configuration SHARE lock makes enable/disable wait for already-authorized administrator transactions; once disable commits, subsequent email operations use the new generation/disabled gate.

## Secure user-performed setup, after approval

1. The user generates a new high-entropy key in their own password manager: at least 32 random bytes encoded as base64url (43 characters), or 64 random hex characters. Allowed characters are A-Z, a-z, 0-9, underscore, hyphen; length 32–128. The exact string is interpreted as UTF-8 bytes, not base64-decoded. Do not reuse a password, Supabase key, test fixture or existing credential.
2. In the project's **Vault dashboard UI**, the user creates a new secret and records its UUID. Paste the value only into the secure UI, not chat, migration source, SQL Editor, command-line arguments, screenshots, logs or repository. Do not ask the assistant to read/decrypt it. Vault encrypts storage, but platform logging still requires review; no claim is made that every service log is automatically secret-free.
3. In the intended Cloudflare Pages environment's secret UI, the user configures exactly the same string as `ADMIN_STEPUP_HMAC_KEY`. Configure `ADMIN_STEPUP_RESEND_KEY` separately as a sending-only credential limited to the verified sending domain where the provider supports that scope. No real key is included here. Preview and production environment scope must be chosen explicitly; never copy to unrelated projects.
4. Keep the database disabled. In a separately approved operator change, set only the non-secret Vault UUID in `hmac_secret_id`; leave `enabled=false`. Review the API origin/project/sender settings and credential scopes. `transport_configured=true` means this configuration review is complete, **not** that inbox delivery has already been tested.
5. After the release gates and explicit activation approval, configure the Pages feature flag `COMMUNITY_EMAIL_STEPUP_ENABLED=true` and the database `enabled=true, transport_configured=true` with the selected Vault UUID. A short mismatch window must fail closed. The first real owner challenge verifies provider acceptance and receipt; admission is granted only after the correct purpose-specific code under the same password session. If anything fails, do not substitute native OTP or recovery tokens.

A config UPDATE always increments generation automatically; operators must not set or reset generation themselves. No public configuration RPC exists. UUID-only configuration avoids placing the secret itself in SQL history. Missing Vault object/value, invalid format or lookup failure prevents admission.

### Rotation

Disable first. Create a **new Vault secret ID** and new matching Pages secret using secure UIs, update the config reference (generation increments), verify configuration and explicitly re-enable. Never edit a referenced Vault value in place: that alone would not increment config generation or invalidate old admissions/grants. Re-enabling cannot revive an older generation. Old Vault-secret deletion is outside these artifacts and needs its own retention/approval decision.

## Rollback order

1. Apply the separately authorized `ops/disable-email-stepup.sql` first. It sets enabled/transport_configured false and clears hmac_secret_id, incrementing generation. It preserves records, revokes all old email authority by generation, and restores original live MFA behavior. It cannot undo transactions committed before it acquired the config lock. An owner without working MFA will intentionally lose administrator access until an approved recovery decision.
2. Verify disabled database state, then turn off the Pages feature flag and roll back UI/API if required. **Pages flag alone does not revoke direct RPC grants.** Do not present client cancellation or logout as a database-wide disable.
3. If full behavior rollback is needed, `ops/rollback-email-stepup.sql` restores the exact five original private function definitions and revokes all six public/private step-up entry points. It keeps the new private tables/history and does not delete users, roles, sessions, content, audit or Vault secrets. Re-enable after full rollback requires a reviewed forward migration; simply changing the flag is insufficient.

Both operator scripts are outside migrations and are never run by tests against a real project. Tests verify full rollback definitions against the original foundation, not a handwritten equivalent.

## Verification and known limits

- Existing CI command: `npm ci --prefix backend/supabase && npm test --prefix backend/supabase`.
- Latest local result: **58 passing PGlite tests**. This includes the 28 original foundation tests, promoted protocol/cancellation tests, actual main API router → PostgreSQL/pgcrypto HMAC interoperability, pre-admission session routing, action cancellation/commit, Vault failures/atomic missing-prerequisite rejection, original AAL2 preservation, disable/re-enable and exact full rollback. Claims/Auth and Vault storage are synthetic fixtures, not genuine GoTrue/Vault encryption.
- Real PostgreSQL **17.11** official Debian packages were verified, extracted under `/tmp` and initialized successfully. Starting its Unix-only server failed with `Operation not permitted`, including one formally escalated identical retry. `pg_ctl status` confirmed no server running. No TCP or alternate socket workaround was attempted.
- **Seven true two-connection scenarios passed (8/8 tests including suite, zero skipped)** on PostgreSQL 17.11 in the separately approved [Actions run 38340448793](https://github.com/BAOZ121/my-cool-blog/actions/runs/38340448793), commit `174450f5b73abb5f730310bd9d3a170ce2a99c0a`. Frozen migration SHA-256 `2eb48221bc5f7d4e304680ea68870137db186e5d68856e0cb0e208dc9d5eb751` and runner `6dfea1f30cb66656c859a53d1d295cda41d4d342b1d8f59630ed9e815ed9ba5b` match local sources. Coverage includes both cancellation/mutation and cancellation/verification orders, duplicate proof revocation, begin/verify deadlock ordering, and disable serialization. See `tests/postgres/EVIDENCE.json`. The first external run failed before SQL due to startup; the corrected runner succeeded. Other foundation races and genuine hosted acceptance remain distinct gates.
- Genuine hosted Auth/PostgREST claims, mail delivery, log redaction, Vault encryption/decryption and deployed browser flows still require controlled acceptance testing. The coordinator reports post-apply advisors showed eight expected private-RLS/no-policy informational findings and an Auth leaked-password-protection warning outside this migration; no Auth-setting repair was performed. Expired private challenge/history retention needs an explicit ongoing-use policy; these artifacts do not auto-delete records.

## Current documentation checked

- [Supabase changelog](https://supabase.com/changelog): reviewed 2026-10-13. PG17.11 legacy PGP cipher change does not affect this HMAC-SHA256 use; no legacy PGP cipher is used. Upcoming HTTP CBC TLS removal does not change the SQL protocol.
- [Supabase Vault](https://supabase.com/docs/guides/database/vault): encrypted storage, dashboard input and privileged decrypted view.
- [Database functions](https://supabase.com/docs/guides/database/functions): invoker wrappers, private definer functions, empty search path and explicit EXECUTE grants.
- [PostgreSQL 17 locking](https://www.postgresql.org/docs/17/explicit-locking.html): transaction-held row/advisory locks and consistent lock order.
