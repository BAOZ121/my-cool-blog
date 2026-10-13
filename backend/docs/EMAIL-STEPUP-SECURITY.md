# Owner email step-up: production-source security review

Review date: 2026-10-13. This covers the locally integrated API, Auth/client, UI and migration. It supplements the historical 2026-10-12 isolated-prototype review.

## Decision and release boundary

The reviewed design keeps authorization in the database and can proceed through the remaining controlled acceptance gates. No critical authorization bypass was found in the inspected final local source and synthetic tests. This is a bounded code/test review, not certification or production activation approval.

The new public feature flag remains false, and the new migration defaults to disabled with no Vault reference. This review did not change hosted database objects, Auth settings, roles, factors, secrets or deployment. Local server startup remained blocked in this environment. A separately approved, isolated GitHub Actions run subsequently passed the real multi-connection PostgreSQL cases on the unchanged migration. This closes the synthetic concurrency gate, not the remaining hosted Auth/Vault/mail/browser acceptance gates.

## Inspected boundaries

- **Default and alternate paths:** Missing/off Pages and public flags cannot select email admission. When the database is disabled, existing live `aal2`/verified-factor checks remain intact. Only the exact configured existing owner can enter email mode after explicit database enablement. Other administrators retain the existing MFA path. A Pages-off/database-email disagreement is rejected, even if an old JWT reports `aal2`.
- **Identity:** Every call uses the original caller bearer. Supabase verifies it; private SQL checks the live `auth.sessions` row, current user, verified email, active account and current role. Email mode requires password AMR and rejects native OTP, recovery, SMS/other methods and mixed recovery/password claims. No role derives from editable user metadata. Completed sign-out/session removal invalidates later bound requests; already-committed operations cannot be undone.
- **Capability:** A pending owner may inspect their own admission status, but cannot read administrator data or mutate content. The literal Supabase `aal` is preserved. The checked self-session UUID is an internal lifecycle marker, never a browser-selected authority, logged field or rendered value. Same-session token refresh preserves a pending challenge; new user/session and sign-out fence stale work.
- **Proof:** Server-generated cryptographic codes, purpose-specific HMAC domains and the database-created challenge bind owner, original session, current email snapshot, generation, action, target, version and canonical payload. Signed registration prepares an inactive challenge; explicit mail acceptance followed by signed activation makes it usable. A browser cannot select a known code or assert delivery. No service-role key is used.
- **Storage and permissions:** New tables remain private with RLS and revoked client table grants. Public invoker RPC wrappers call independently checked private implementations. Internal helpers, including the secret-returning helper, have no client execute grant. Authenticated callers can reach register/activate RPCs directly, but must present valid server attestations; there are no corresponding Pages routes.
- **Vault:** Configuration stores only a fixed secret UUID. The private lookup accepts no arbitrary secret ID, validates format and fails closed on missing/decryption failures without returning internal errors. The signature function is STABLE because it now reads database state. Existing Vault permissions are not broadened. Rotation requires a new Vault entry plus configuration update/generation advancement; changing a secret value in place is unsupported.
- **Timeout and usage:** Challenges last five minutes and allow five code attempts; failed-attempt responses commit counters. The shared per-user limit is one begin per minute and five per hour. Admission is limited to 15 minutes idle and one hour absolute. Status, Auth refresh and rendering do not count as administrator activity. Single-operation grants last up to two minutes and may expire sooner with admission.
- **Mutations:** Existing mutation bodies stay unchanged. SQL reconstructs the binding from actual normalized arguments and consumes an unexpired, unused, unrevoked exact-operation grant inside the same transaction as content/account changes and audit records. A failed transaction restores consumption only for the same operation/version before expiry. Ordinary author-owned editing retains its existing separate permissions.
- **Client/UI:** A verified action requires a separate explicit confirmation of frozen values. Concurrent clicks, timeouts, aborts and late responses cannot automatically replay it. Uncertain mutation/cancellation outcomes retain a known cancellation handle for explicit reconciliation. BFCache suspension blocks confirmation without pretending to revoke server authority.

## Findings corrected during integration

1. **Disabled Pages flag could misclassify email admission as legacy MFA.** The API now rejects an explicit database email mode when its own feature flag is off/missing rather than relying on a stale `aal2` claim.
2. **Background Auth polling could prevent idle expiry.** Transient capability clearing used to trigger another automatic management-list request when status recovered. A separate initial-load marker now prevents routine refresh/error recovery from reloading management data. Explicit user reads still count as activity.
3. **Vault lookup invalidated an IMMUTABLE annotation.** The HMAC signature helper is now STABLE rather than allowing an incorrect immutable-result assumption across database/configuration dependencies.
4. **The real client returned an unsettled action-ready snapshot.** A reproduction showed `verify()` returning false while its post-operation state became true, leaving the UI confirmation blocked. State-returning methods now resolve after the single-flight guard clears, and the UI checks the settled client state after awaiting verification.
5. **Cached UI capability could outlast the displayed deadline.** Finite future idle/absolute timestamps now gate every local administrator action. A one-second local timer hides controls and clears private views at expiry without a network request or Auth refresh. It preserves the ordinary password session and known cancellation handle. The database remains authoritative, including while browser timers are suspended.

## Cancellation and ordering

Begin, verify and cancel use the same per-user advisory lock before their admission/challenge/grant row locks. Cancellation takes no admission/content lock. Mutation consumption does not wait for the step-up advisory lock or challenge rows. Matching grant locks have deterministic ordering; mutation consumption rechecks unused, unrevoked and unexpired state after waiting.

Cancellation revokes all pre-existing unused grants and pending/prepared/active challenges for the exact user/session/admission/configuration/binding. Unrelated operations, versions or sessions are unaffected. If verification commits first, cancellation revokes its unused authority; if cancellation commits first, later verification cannot recreate it. If a mutation commits first, cancellation reports already-used and does not claim undo. Stored outcomes make old cancellation retries stable without sweeping a later explicitly requested authorization.

Completed admission returns already-used rather than logging the user out. Local abort, disposal/reload and a lost begin ID cannot be represented as confirmed server revocation. An email may still arrive after a no-ID local stop. A grant may remain until expiry when cancellation or remote sign-out is unconfirmed.

The single-connection suite tests ordered outcomes and function contracts. The separate PostgreSQL runner asserts real distinct backend PIDs and observed lock waits for both cancel/mutation orders, both verify/cancel orders, duplicate-binding replacement, begin/verify locking and configuration-disable ordering. They could not run in the local workspace: normal startup and one formal escalation both failed when creating the Unix socket. No TCP, alternate-path or production-database workaround was attempted there. The separately approved isolated GitHub runner subsequently executed and passed all seven cases, as recorded below.

## Final local verification evidence

The independent reviewer ran the complete root, backend and promoted database suites after the last UI deadline correction: **392 tests passed, zero failed or skipped**. This includes the actual UI-to-canonical-client confirmation seam, Auth-to-main-API capability/session seam, main-API-to-PGlite admission/cancellation/mutation seam, HMAC interoperability, private RPC denial, missing-Vault atomic migration failure, disabled-mode MFA preservation and exact rollback checks.

```sh
node --test tests/*.test.mjs backend/tests/*.test.mjs backend/supabase/tests/*.test.mjs
```

The separate `tests/postgres/` concurrent runner is intentionally not part of that passed count. Its workflow and standalone package were source-reviewed for explicitly approved temporary-branch checks; publication or a prepared workflow does not establish a passing result.

The first approved [GitHub Actions run 38339840691](https://github.com/BAOZ121/my-cool-blog/actions/runs/38339840691), commit `66c63a5`, failed before SQL execution: the PostgreSQL container exited and automatic removal prevented retention of its startup logs. The startup cause was not established. The official PostgreSQL image pulled successfully with digest `sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3`. This was not a concurrency test failure or a concurrency pass; those assertions did not run.

The second, separately approved [GitHub Actions run 38340448793](https://github.com/BAOZ121/my-cool-blog/actions/runs/38340448793), commit `174450f5b73abb5f730310bd9d3a170ce2a99c0a`, **succeeded**. The reviewer independently inspected its saved log: actual PostgreSQL 17.11 executed all seven lock-order cases; Node reports **8 passing tests including the enclosing suite, zero failures and zero skips**. Distinct backend-PID/lock-wait assertions are part of the reviewed runner, not simulated timers. The log records the pinned image digest and synthetic-container cleanup. The first attempt's exact startup cause remains unestablished.

This second workflow retained failure state/logs, detected early container exit and used the standard container socket directory. Network isolation, fixed local socket, exact disposable PGDATA checks and unchanged SQL/runner hashes were preserved. No site deployment, production database connection or real secret was part of either check. The tested migration SHA-256 is `2eb48221bc5f7d4e304680ea68870137db186e5d68856e0cb0e208dc9d5eb751`; the runner SHA-256 is `6dfea1f30cb66656c859a53d1d295cda41d4d342b1d8f59630ed9e815ed9ba5b`. These are actual PostgreSQL concurrency results with synthetic Auth/Vault fixtures, not hosted Supabase acceptance.

The recorded Hugo 0.164.0 checks passed in disabled, TOTP and email modes, including CSP/header parity, secret-sentinel exclusion, form safety and unchanged main navigation. The production minified Hugo build completed. Those build results do not substitute for a real browser/email acceptance run. Syntax checks and `git diff --check` were clean.

Reviewed source SHA-256:

- `backend/api/handler.mjs`: `c60a87bb905ea00eeb613a0dc7609b35039dea6897f76e2d6e955c003f5313c7`
- `backend/api/admin-stepup.mjs`: `1c86b82038db7735ddf1b1cf4753b0a51cfcba664360ca9e009c40fb84d75af6`
- `backend/client/auth-controller.mjs`: `a01dbe3bcc468e40d68182582e8fa1dd391dd7f32cd1850bbace16c934e36818`
- `backend/client/email-stepup-client.mjs`: `e1e4588ae7bd59f1776ee7a3e0bc3fac5c7ca9c2e9e227523f8c491271b4149b`
- `assets/js/community-ui.mjs`: `b9042847d2db87c50275520f08a747f3f14cdffeee2620dcdcaed26e1a3ce81c`
- `backend/supabase/migrations/20261013031903_community_admin_email_stepup.sql`: `2eb48221bc5f7d4e304680ea68870137db186e5d68856e0cb0e208dc9d5eb751`

## Deployment order

Follow [the rollout guide](EMAIL-STEPUP-ROLLOUT.md): first review/freeze and pass remaining acceptance gates, then apply the migration disabled. The user securely configures the separately approved restricted mail key and shared HMAC value. Publish the complete matching Pages/frontend code and selections while the database remains disabled and genuine MFA still applies. Enable the database owner policy last, under its separate approval.

Rollback disables the database mechanism first to advance generation and invalidate custom authority, then disables Pages/frontend selections. The full rollback restores the five original private definitions and revokes the new RPCs without deleting content, audit history, roles, users or Vault entries. A frontend or Pages flag alone is not revocation of direct-RPC authority.

## Remaining acceptance requirements

- The required synthetic multi-connection cases have passed on the exact recorded migration/runner. Material future SQL or locking changes require corresponding revalidation. The standalone Compose alternative itself remains unrun; do not present it as tested merely because the separate GitHub workflow passed.
- Test hosted Auth claims, PostgREST behavior, actual Vault lookup/permissions, approved sender and inbox delivery, deployed Pages behavior and owner-controlled browser flows. Local mocked transport and synthetic Vault fixtures do not establish these results.
- Confirm the exact remote commit, terminal CI/deployment status and approved environment before claiming publication or activation. No live activation is authorized by this report.
- Keep real secret entry under user control and out of source, chat, screenshots, migration literals and command history. Vault encrypts stored values; it is not a blanket guarantee about all query/API logs.
- Email also controls password recovery, so this mechanism has weaker factor independence than authenticator MFA. It is not Supabase `aal2` and does not solve XSS/session theft. HMAC comparison does fixed work across 32 bytes; it is not a formal microarchitectural constant-time guarantee.
- Confirm usability of the shared five-per-hour challenge cap and the retention/cleanup policy for private expired challenge records containing payload/email snapshots.

## Primary references

Current documentation and the changelog were checked on 2026-10-13. The reviewed recent pgcrypto legacy-PGP-cipher change does not change this SHA-256 HMAC design.

- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [Supabase session revocation and session IDs](https://supabase.com/docs/guides/auth/sessions)
- [Supabase JWT claims and AMR](https://supabase.com/docs/guides/auth/jwt-fields)
- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase PostgreSQL security upgrade](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes)
- [Resend API-key restrictions](https://resend.com/docs/dashboard/api-keys/introduction)
