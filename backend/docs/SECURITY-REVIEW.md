# Security review and release gates

Status: approved database initialization applied; website/API/Auth UI locally implemented, disabled by default and not deployed. Checkmarks below must be supported by concrete tests, not just text or static SQL searches.

## Design review

- [x] No user_metadata/email/localStorage authorization.
- [x] No plaintext/embedded passwords; no service-role key in browser code.
- [x] No real project or credentials in examples.
- [x] Frontend demo remains separate from backend feature flag.
- [x] Runtime database tests confirm explicit GRANT + RLS for anonymous/member/moderator/owner.
- [x] Private tables/RPC implementation have narrow privileges; SECURITY DEFINER search_path pinned; no PUBLIC EXECUTE exposure.
- [x] Public reads exclude hidden content and replies of hidden topics without exposing private moderation reasons.
- [x] Live account-state and role checks defeat revoked-role/suspended-session writes.
- [x] Admin operations require MFA; sensitive sessions checked against current Auth session where supported.
- [x] Expected-version conflicts prevent silent stale edits; revision/audit changes atomic.
- [x] API tests prove method/path/origin/body allowlists, failure sanitization and disabled defaults.
- [x] Owner protection prevents accidental last-owner suspension; no public role-grant API.

## Hosted checks required before launch (not run)

- DONE: Real Supabase PG17.11 migration applied to the explicitly approved project; schema/GRANT/RLS reviewed.
- DONE: Security/performance advisors inspected; only intentional private-table no-policy INFO and unused-new-index INFO remain.
- Direct PostgREST API cannot bypass application authorization or abuse controls.
- Actual email signup/verification/recovery, Google PKCE redirect, token refresh/logout and TOTP flows tested.
- Verified account UUID granted first owner under specific approval, with audit entry.
- Durable rate limits and spam controls prevent unbounded writes and audit-growth abuse.
- Backups and restoration tested; free-tier pause/quotas accepted; privacy and retention notice completed.
- Dependency audit/lockfiles and frontend output checked for secrets.
- Explicit approval obtained for deployment, credentials/permissions, SMTP/OAuth and any paid plan separately.

Local SQL tests use synthetic users only. Separately approved hosted migrations were applied and metadata/anonymous-denial checks run; no hosted Auth users or roles were created.

## Verification evidence, 2026-10-12

- PostgreSQL via pinned PGlite 0.5.8 (engine 18.3), not a mocked SQL parser: 28 tests passed. Auth tables/functions and JWT context are synthetic fixtures. Selected hosted project reports PostgreSQL 17.11; hosted execution is still a separate gate.
- API injected-fetch + client transport + Auth-controller tests: 70 passed (33 API, 6 transport, 31 Auth). These prove routing/validation/expected upstream contracts, not real network or Auth correctness.
- Independent review fixed stale-MFA acceptance, owner self-suspension, revision-growth quotas, and API/client response/error mapping gaps before this snapshot.
- Separate autoRLS regression proves revoked anon/authenticated EXECUTE while CREATE TABLE, CREATE TABLE AS, and SELECT INTO still auto-enable RLS. The exact approved repair was then applied remotely; the existing trigger remains enabled and anon/authenticated EXECUTE are false.
- Existing site tests: 121 passed. Hugo production/minified/panicOnWarning build and 151-page/7,625-link validator passed. No live site files changed.
- True multi-connection lock contention, hosted gateway/JWT behavior, real Auth callback/session lifecycle and final browser UI integration remain unverified.

Auth-controller verification uses a synthetic injected SDK and mocked network. Its unit tests exercise verification-pending status, strict callback/PKCE flows, MFA gating, safe errors, project-scoped per-tab session storage, refresh/logout, concurrent/interrupted flows and reentrant observers. They do not prove live provider behavior or secure password-entry UI. The local PGlite package audit reported zero known vulnerabilities at this check; that is not a security guarantee.

## Hosted verification after explicit approval

Both approved migrations succeeded on PostgreSQL 17.11. Verified five RLS-enabled tables, ten invoker public RPC wrappers, no direct client writes, no client reads of private tables, anonymous RPC denial and missing-session rejection. No posts/accounts/roles were created. Security advisors returned zero WARN/ERROR, with four intentional private-table no-policy INFO items; performance advisors returned five unused-index INFO items in the empty database. These checks do not replace real signed-user/PostgREST/browser acceptance.

## Integration checkpoint

At the 03:21 UTC local checkpoint, all 86 API, transport, Auth, actual-SDK and adapter tests passed. Actual SDK tests intercept requests with synthetic identities; no real login or token was used. A fresh per-document SDK storage key maps to stable tab-local storage slots, preventing the SDK BroadcastChannel from distributing full sessions between tabs, including cloned storage fixtures. Recovery UI quarantines its session from the application token provider; this does not claim that Supabase recovery JWTs lack ordinary account privileges at the database layer. The real frontend DOM/browser suite remains in progress and must be reviewed before release.

## Final local freeze, 03:40 UTC

Independent review found no unresolved blocking source finding. Final counts are 145 site tests (121 existing and 24 mock-DOM), 96 backend tests (33 API, 48 Auth including 9 actual pinned-SDK intercepted cases, 9 transport, 6 adapters), and 28 SQL tests. Traversal normalization and admin-query transport regressions passed; MFA setup can resume without deleting factors; private DOM clears on privilege downgrade and BFCache departure. Default/synthetic-enabled Hugo tests verify CSP parity and route isolation. Site validator checked 153 HTML pages and 7,673 internal links. Source configuration remains disabled with no real project URL/key. Actual desktop/mobile rendering, native browser CSP enforcement, hosted sessions/mail/OAuth and true multi-connection SQL remain unverified. Wrangler emitted a compiled Pages bundle, but final CLI exit was not confirmed after its status poll was cancelled by review; no retry or deployment occurred.

## Current Pages compatibility, 04:22 UTC

The existing Pages configuration uses plain `hugo` with HUGO_VERSION=0.164.0. The official Hugo Extended0.164.0 download was checksum-verified and exercised locally. Plain default build, disabled/synthetic-enabled artifact checks, and production minified validation passed. Against the current main baseline rendered with the same version, all149 non-test HTML files are unchanged apart from inter-tag whitespace. Exactly two new HTML paths are the callback and recovery test pages. The general site validator assumes minified markup; its raw-output href-format assertion is not a missing-link finding, and the required minified validation passed153 pages/7,673 links. This closed compatibility check does not authorize changing Pages settings or enabling Auth.
