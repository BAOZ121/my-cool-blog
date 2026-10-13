# Community API and Pages adapter preparation

This is **local-only release preparation, not a deployment**. The shared handler lives here; deployable Cloudflare Pages entrypoints now live under the repository's `functions/api/` directory. They are disabled by default. These source files do not configure a Cloudflare account, runtime binding, Supabase project, credential or live route. A later source push/deployment could publish the adapters and still requires explicit approval.

## Configuration and adapter

The actual local Pages entries are `functions/api/community/[[path]].js`, `functions/api/admin/[[path]].js`, and an `index.js` in each directory. Each exports `onRequest({ request, env })` and delegates to `handler.mjs`. Catch-all routes cover only `/api/community/*` and `/api/admin/*`; the index entries claim the exact namespace bases so those return guarded JSON errors rather than a static HTML fallback. Once valid configuration enables the handler, namespace bases and unknown API paths return 404. With no enable flag, all these API requests fail closed with 503.

`static/_routes.json` is copied by Hugo into `public/_routes.json` and limits Function invocation to the exact two API bases and their descendants. Ordinary pages, articles, assets and the community/admin HTML remain static. There is no site-wide middleware, `/api/*` catch-all, `_worker.js` committed to static output, or new root Wrangler configuration. The theme's own `themes/stack/wrangler.toml` belongs to its separate theme/demo project and must not be used to configure this application.

`pages-template.mjs` remains an unused interface fixture for older handler tests; it is not a second deployed route. `handler.mjs` exports a standard `Request → Response` handler and a factory accepting injected `fetch`, timeout and safe logger for tests. Adapter code has no runtime package dependencies and needs no Node compatibility flag.

All four base settings must be explicitly valid or every call returns HTTP 503:

- `COMMUNITY_BACKEND_ENABLED=true` (exact string; disabled by default).
- `SUPABASE_URL=https://<project-ref>.supabase.co` (HTTPS hosted Supabase origin only; custom domains/local Supabase are deliberately not enabled in this starter).
- `SUPABASE_PUBLISHABLE_KEY=sb_publishable_…` (publishable key only; legacy JWT and secret/service-role keys are rejected).
- `COMMUNITY_ALLOWED_ORIGIN=https://<approved-community-host>` (one exact origin, no wildcard, path or trailing slash).

The optional `COMMUNITY_EMAIL_STEPUP_ENABLED=true` gate now mounts dedicated owner
email verification. Its two encrypted server bindings, exact request/session
contracts, unchanged mutation payloads and user-controlled credential handoff are
specified in [ADMIN-EMAIL-STEPUP.md](ADMIN-EMAIL-STEPUP.md). Missing/off preserves
legacy MFA when database email mode is also disabled. An enabled incomplete
configuration or DB/runtime mode disagreement fails closed; it never silently
weakens admin checks. The old `COMMUNITY_EMAIL_STEPUP_REVIEW_ENABLED` name is not
recognized by production code.

Never put real key values in this repository. The publishable key identifies the application, not a user. Protected routes require a caller's short-lived Supabase Auth access token on `Authorization: Bearer …`; no key is substituted for it.

## Authorization boundary

Protected requests first call Supabase Auth `/auth/v1/user` over HTTPS, require a verified-email non-anonymous authenticated user, then call `community_me()` using the **same token**. No unverified JWT decoding or user-editable profile metadata is used. The database must independently check the live `auth.users`, `auth.sessions`, app suspension, UUID-owned role and `aal2` for each relevant RPC. Removing an app role or suspending an account therefore takes effect even with a previously issued access token. A lost role between preflight and mutation is denied again by the mutation RPC.

Member endpoints use self-only RPCs. Moderators and owners can use post moderation/history. User listings, account suspension/restoration and the full audit list are owner-only in this template. By default admin access requires the live database response's moderator/owner role
and `aal2`. The explicitly enabled email mode applies only to the database-configured
owner password session, requiring checked admission instead; it never rewrites AAL.
Before admission only the bounded self-session capability is exposed. All other
admin reads/mutations remain denied. SQL consumes a fresh exact-bound one-use
action grant atomically for important email-mode mutations. API guards are defense in depth; direct Supabase REST/RPC access must remain safe under the SQL permissions without this adapter.

Public reads always use the publishable `apikey` **without a caller bearer token**, fixed selected columns and `hidden=eq.false`, preserving anonymous visible-only RLS even if the requester is an administrator. The database also excludes replies to hidden topics. Public author UUIDs are part of the agreed post schema; no public email/profile/account lookup is exposed here.

## Routes and payloads

All successful JSON uses `{ "data": … }`; list/detail pages additionally contain `{ "page": { "limit": 25, "offset": 0 } }`. Pagination supports `limit` 1–50 and `offset` 0–10000. Audit pages return metadata only; immutable before-and-after snapshots remain in the private database audit records. Other public query parameters, repeated parameters, arbitrary PostgREST selectors and unknown fields are rejected.

| Method | Path | Payload / query |
| --- | --- | --- |
| GET | `/api/community/topics` | `limit`, `offset` |
| GET | `/api/community/topics/:id` | `limit`, `offset` for replies; returns `{topic,replies}` |
| POST | `/api/community/topics` | `title`, `body` |
| POST | `/api/community/topics/:id/replies` | `body` |
| GET | `/api/community/messages` | `limit`, `offset` |
| POST | `/api/community/messages` | `body` |
| PATCH | `/api/community/posts/:id` | `expected_version`, `title`, `body`; self only |
| GET | `/api/admin/session` | Verified live admin session; eligible email owner can receive bounded pre-admission capability |
| POST | `/api/admin/stepup/{begin,verify,cancel}` | Dedicated email step-up contract; see linked setup document |
| GET | `/api/admin/stepup/status` | Explicit checked admission status; does not extend idle time |
| GET | `/api/admin/posts` | `kind`, `search`, `include_hidden`, `limit`, `offset` |
| GET | `/api/admin/users` | Owner only; `search`, `limit`, `offset` |
| GET | `/api/admin/audit` | Owner only; `limit`, `offset` |
| GET | `/api/admin/posts/:id/history` | Checked admin history RPC; `limit`, `offset` |
| POST | `/api/admin/posts/:id/edit` | `expected_version`, `title`, `body`, `reason` |
| POST | `/api/admin/posts/:id/{hide,restore,pin,unpin,lock,unlock}` | `expected_version`, `reason` |
| POST | `/api/admin/users/:id/{suspend,restore}` | Owner only; `expected_version`, `reason` |

The exact RPC names, payloads and SQLSTATE mapping are tested against the coordinated schema contract. Post titles are 1–160 Unicode characters for topics; replies/messages use the empty title string. Bodies are 1–20000 characters (messages 1–5000). Reasons are 1–500 characters. All are trimmed; empty content and NUL are refused. Edit payloads require all fields; use `title: ""` for a reply or message. The SQL applies kind-specific bounds again. `expected_version` is a positive 32-bit integer and versions are checked atomically by SQL. Actor UUID, role, moderation flags and audit fields can never come from a browser payload.

## Request and failure handling

- Writes require an exact configured `Origin`, request-URL origin, and `Sec-Fetch-Site: same-origin`. Cross-site/same-site browser reads are refused too. No wildcard or other CORS response is emitted. CLI test clients must explicitly send the write headers; they are CSRF defense, not authentication.
- JSON is UTF-8, at most 100000 bytes, with strict content type and streamed size limits. Upstream JSON is capped at 8000000 bytes, enough for the maximum allowed post/revision pages even with six-byte JSON escaping; audit responses contain metadata only. Streamed UTF-8 decoding avoids a second full byte buffer. Every fetch and request-body read has an 8-second deadline, with a shared 20-second operation deadline and incoming request-abort cancellation; there are no automatic retries of potentially committed mutations.
- Every response is `no-store`; cookies are neither consumed as authentication nor forwarded/set. Redirect following is disabled and the configured upstream is restricted to HTTPS hosted Supabase.
- SQLSTATE `PT401`, `PT403`, `PT404`, `PT409`, `PT422`, `PT429` map to fixed public errors. Version conflicts are HTTP 409. Remote SQL text, stack traces, secrets, token contents and request URLs/bodies are never returned or logged. A supplied logger receives only fixed event/route/code/status values.
- A failed/timeout mutation may already have committed upstream. Reload authoritative state before offering a retry. The frontend must preserve typed text and show version conflicts; a robust idempotency design remains a release consideration for new-post retry UX.
- Stored text is plain user content, not trusted HTML. Any future UI must render with text-safe DOM APIs, never unsanitized `innerHTML`.

## Explicitly incomplete release work

Except for the dedicated email verification code endpoints documented above, these content/admin routes contain **no sign-in, signup, password, OAuth callback, cookie, refresh-token, MFA enrollment/challenge, role-assignment, upload or deletion endpoints**. Browser Auth and its SDK integration are separate code under `backend/client/`; see `backend/docs/AUTH-INTEGRATION.md` for PKCE/redirect handling, token lifecycle, verification, password and MFA boundaries. They are not custom credential-collection endpoints on this API. Existing local demo credentials/roles must never be accepted as real identities.

Enablement remains gated on the approved project/schema state, first-owner bootstrap, live permission/RLS/session/MFA tests, consent/privacy copy, security headers/CSP for the frontend, rate/abuse protections, recovery/backup plan, exact origin configuration and separately approved deployment. Database initialization records are tracked separately; these adapter tests cannot establish hosted state. Public read rate limiting and edge abuse controls are not implemented here; SQL write limits alone do not cover all request abuse.

## Local verification

Run `node --test backend/tests/api.test.mjs backend/tests/admin-stepup*.test.mjs` for the dependency-free handler tests. For adapter checks, install the repository's pinned root development dependencies with `npm ci`, then run `node --test backend/tests/pages-adapter.test.mjs`. Adapter tests bundle the actual `.js` Pages entrypoints as browser-compatible ESM using the already-pinned root esbuild and execute the resulting exports with intercepted fetch. They cover disabled defaults, guarded namespace-base errors, same-origin/auth/method guards, anonymous public reads and the narrowly scoped invocation manifest.

These tests do not call Supabase or prove real hosted RLS, Auth, Cloudflare behavior or an end-to-end sign-in. A local `wrangler pages functions build functions` can additionally verify Cloudflare's file-based route compilation; this is a build command only, not permission to run `pages deploy`, `login`, change bindings or upload anything. Keep generated Worker files outside `public/` during preparation to avoid accidentally switching Pages into advanced mode. The schema's separate permission tests and an approved isolated integration environment are required before release.

### Local compilation evidence (2026-10-12)

- Wrangler **4.149.0**, installed in an isolated temporary tools directory, emitted `Compiled Worker successfully`. No repository dependency/lockfile was changed for this tool.
- The generated Worker was 57226 bytes. The generated route configuration contained exactly `/api/community/:path*`, `/api/community`, `/api/admin/:path*`, and `/api/admin`; its invocation manifest matched the four patterns in `static/_routes.json`.
- Compiler artifacts were read and checked. The final CLI exit status was not observed. This records compilation evidence, not a deployed endpoint, a successful hosted request, or a Cloudflare runtime test.
- The existing handler's 33 tests and the 6 new bundled-adapter tests passed together. Adapter bundling used the repository's existing esbuild **0.28.2**.

The build-only command can be reproduced after making a local output directory, without account login or runtime configuration:

```sh
mkdir -p /tmp/dex-community-pages-build
CLOUDFLARE_SEND_METRICS=false npx --yes wrangler@4.149.0 pages functions build functions \
  --outdir /tmp/dex-community-pages-build/worker \
  --output-config-path /tmp/dex-community-pages-build/config.json \
  --output-routes-path /tmp/dex-community-pages-build/routes.json \
  --compatibility-date 2026-10-12
```

Documentation consulted: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Cloudflare Pages routing](https://developers.cloudflare.com/pages/functions/routing/), [Pages build commands](https://developers.cloudflare.com/workers/wrangler/commands/pages/), and the coordinated schema's current security references. Publishable keys go on `apikey`; only the caller's verified JWT goes on `Authorization`.

### Integrated email-step-up source checks (2026-10-13)

The canonical implementation is now `backend/api/admin-stepup.mjs`, reached through
the same actual Pages admin entrypoint. `backend/tests/admin-stepup.test.mjs` tests
its full security contract; `admin-stepup-router.test.mjs` covers legacy MFA,
flag/DB disagreement, pre-admission projection, original-session fencing, SQL-owned
mutation grants, cancellation and operation deadlines. Bundled adapter coverage
confirms no `stepup-review` import enters the Pages Worker. The reviewed tests'
compatibility wrapper is local test infrastructure only.
