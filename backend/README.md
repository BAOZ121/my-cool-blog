# Community backend foundation (database initialized; website not deployed)

This directory contains the foundation for connecting the existing DEX community and separate management screens to Supabase Free. The explicitly approved database initialization and auto-RLS permission hardening were applied on 2026-10-12; see `supabase/DEPLOYMENT.md`. No website/API/Auth frontend deployment has occurred. It does not change either live test page. The current `/test/forum-v1/` and `/test/forum-admin-v1/` still use browser-local demonstration data.

## Boundaries

- No project, Auth account, real administrator, API credential, SMTP setup or OAuth client is created by this code.
- No hardcoded administrator email, password or secret. Administrator identity must eventually be bound to a verified Auth UUID through a separately approved operator action.
- `api/` contains the shared handler. Local-only Pages adapters under `functions/api/` and the `_routes.json` manifest are prepared for review; deploying this checkout would create those exact API namespaces. Publication is not approved yet, and no deployed endpoint is claimed.
- Backend feature flag defaults closed. Missing configuration fails closed rather than falling back to demo authentication.
- `client/` includes a transport interface and a default-disabled, dependency-injected Supabase Auth controller for email signup/sign-in, Google PKCE, session refresh/exit and TOTP flows. The actual SDK is pinned and tested with synthetic intercepted network responses; callback/recovery forms and test-page wiring are implemented locally and remain undeployed. See `docs/AUTH-INTEGRATION.md`. The integration uses project-scoped, per-tab sessionStorage for session continuity across reloads and same-origin frontend/admin navigation. Logout clears local session state; server expiry and revocation remain authoritative. Browser session restoration can preserve tab storage, so closing a tab is not guaranteed logout. This is not an HttpOnly-cookie session and does not protect tokens from XSS. Actual token storage and login testing remain gated by configuration approval.
- No service-role key is needed for the current content API. It forwards each verified user's own token so database authorization remains authoritative. Private Auth administration, should it later be requested, needs a separate server-only design and approval.

## Proposed architecture

Hugo/Cloudflare Pages serves the website and admin interface. A same-origin Pages Function validates requests and asks Supabase Auth to verify the bearer identity. The Data API and narrowly granted database RPCs enforce UUID ownership, current account state, current role and administrator MFA. Public table reads use RLS. Mutations update content, revisions and audit together with version-conflict checks. Independent message-board posts and topic replies remain distinct kinds.

The transport does not trust browser-supplied actor/role/author IDs. Email comparison is never authorization. A valid session alone is insufficient for management actions. A revoked role or suspended account is checked live at each sensitive operation.

## Local verification

- API/client tests: `node --test backend/tests/*.test.mjs`
- SQL runtime tests: see `supabase/README.md` and its pinned local test package.
- Existing site tests: `node --test tests/*.test.mjs`

The local database harness is not the hosted Supabase gateway. Even successful local SQL/RLS tests do not verify hosted Auth issuance, PostgREST configuration, Google redirects, real email delivery or Cloudflare deployment. Those remain explicitly gated integration tests.

## Remaining configuration and deployment gates

1. The user-created free project and its US-West region were verified read-only before initialization. Keep that existing project; do not create a second project or paid branch. Reconcile existing schema before any future migration.
2. The first schema/RLS/grant migration and exact existing auto-RLS EXECUTE revoke were approved and applied. Future permission changes still need specific approval. Security advisories now contain only documented INFO items; do not relax private-table access to silence them. No remote destructive reset.
3. Configure only approved public URL/key values and exact allowed origins. Keep server secrets out of Hugo/assets/Git/build output. `.env.example` contains names and placeholders only; never copy real values into it.
4. Implement and review the real Auth interface and session lifecycle. The user sets passwords securely. Test verification/recovery and administrator TOTP. Grant the approved verified UUID an owner role only after separate confirmation; never promote the first registrant automatically.
5. Configure SMTP and Google OAuth only after explicit permissions. User-selected free services only; stop on charges/paid upgrades. Do not silently disable email verification because default SMTP is limited.
6. Add durable abuse controls, quotas and backup/restore procedures. Verify exact private/public API behavior using anonymous, ordinary, suspended and revoked-admin sessions, including direct calls to Supabase rather than only through Pages.
7. Obtain deployment approval for exact production/test API paths and frontend integration. Keep demo data separate; do not import local demo roles or accounts. Confirm rollback before enabling real writes.

## Free-tier operating expectations

Free service selection is a budget boundary, not permission to buy upgrades or add credentials. Supabase Free can pause after inactivity and lacks automatic backups. Its default mail sender is restricted; a separate approved SMTP service and domain verification are needed for public email registration. Region selection should reflect the actual audience. No operational guarantee is made by these local files.

## Current official references (checked 2026-10-12)

- https://supabase.com/changelog.md
- https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically
- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/auth-getuser
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/getting-started/api-keys

The relevant 2026 Data API change makes explicit GRANTs necessary independently of RLS. The PostgreSQL 15.19/17.11 security-release notice was also reviewed; this new schema does not depend on legacy pgcrypto ciphers, ltree, btree_gist or custom operators.

## Existing automatic-RLS function repair

The approved repair is tracked in `supabase/migrations/20261012030835_harden_auto_rls_execute.sql`, alongside the foundation migration with its authoritative hosted version. Public EXECUTE was revoked without removing the automatic-RLS function or event trigger. Post-change catalog checks and local event-trigger regression passed.

## Local frontend freeze

See `docs/FRONTEND-INTEGRATION.md` for the exact build command, public flags and route scope. At the final local checkpoint, 145 site tests (including 24 new mock-DOM tests), 96 backend tests (including 9 actual-SDK intercepted tests), and 28 SQL tests passed. Default and synthetic-enabled Hugo builds and validators passed. These do not establish actual browser rendering or hosted Auth/SMTP/OAuth correctness. No code was pushed or deployed.
