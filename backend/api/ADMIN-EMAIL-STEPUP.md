# Administrator email verification: server integration and safe setup

**Source preparation only.** This document is not evidence of a live deployment,
configured secret, verified sender, applied migration or delivered email. Publication,
preview activation and credential configuration are separate coordinated steps.

## Runtime contract

The existing `functions/api/admin/[[path]].js` imports `backend/api/handler.mjs`.
That router mounts `admin-stepup.mjs`; no new site-wide interception or Functions
route manifest is needed. The reviewed test directory is never imported into the
Pages bundle. Its compatibility wrapper is test-only.

The production switch is **`COMMUNITY_EMAIL_STEPUP_ENABLED`**, exact string `true`.
`COMMUNITY_EMAIL_STEPUP_REVIEW_ENABLED` is ignored by production code. Missing,
false or other values do not enable email mode. With both runtime and database
email mode disabled, the original live MFA/AAL2 rules remain authoritative.
A runtime/database disagreement fails closed: a database response selecting
email mode is never relabeled as TOTP because the Pages flag is off, even if the
JWT still reports `aal2`. Turning off only the UI is not a rollback of authority.

When the runtime flag is enabled, malformed/missing mail or HMAC bindings block
admin APIs. Public community reads and member functions retain their existing
configuration. Known-ID cancellation is a deliberate least-authority exception:
it requires both enable flags and valid origin/Supabase/Auth configuration, but
can revoke the caller's existing challenge without either mail/HMAC secret.

## Cloudflare Pages bindings

Set bindings only on the **approved Pages project and intended environment**.
An approved preview does not authorize copying these bindings to Production.
There is no wildcard origin support: the preview needs one exact, approved,
canonical HTTPS origin, with the frontend and API served together. An unrelated
preview alias/branch host will be rejected until explicitly configured.

| Name | Cloudflare type | Purpose / required form |
| --- | --- | --- |
| `COMMUNITY_BACKEND_ENABLED` | Plain text variable | Existing base gate, exact `true` |
| `SUPABASE_URL` | Plain text variable | `https://<approved-project-ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Plain text variable | Approved `sb_publishable_…` application identifier; never a secret/service-role/legacy JWT key |
| `COMMUNITY_ALLOWED_ORIGIN` | Plain text variable | Exact canonical HTTPS site origin, no path/trailing slash/wildcard |
| `COMMUNITY_EMAIL_STEPUP_ENABLED` | Plain text variable | Exact `true` only after coordinated readiness; default off |
| `ADMIN_STEPUP_RESEND_KEY` | **Encrypted secret** | Dedicated restricted Resend sending key, `re_…` |
| `ADMIN_STEPUP_HMAC_KEY` | **Encrypted secret** | Shared signing key, 32–128 base64url-safe ASCII characters, `[A-Za-z0-9_-]` |

Cloudflare documents the dashboard path as Workers & Pages → select project →
Settings → Variables and Secrets → Add; choose **Encrypt** for the two secrets.
Select and verify the intended Preview/Production environment before saving.
Bindings must be in place before the deployment that uses them. Do not use
Wrangler plaintext `vars`, repository config, build command arguments, browser
config, HTML, screenshots or chat to carry real secrets.
[Cloudflare Pages binding documentation](https://developers.cloudflare.com/pages/functions/bindings/)

The separate public `emailStepupEnabled` setting is a UI discovery flag only.
It cannot grant admission, enable server routes, replace a token, or select an
owner. It must stay false until coordinated server/DB readiness. The browser
receives neither encrypted binding. Runtime configuration must never be copied
wholesale into frontend JSON.

## Restricted Resend key handoff

The account owner configures this in the verified
[Resend API keys dashboard](https://resend.com/api-keys), using a separate key
with **Sending access** and a **domain restriction to the verified `thedexs.com`
sending domain**. Do not reuse a full-access management key or the Supabase SMTP
credential. The fixed sender is `noreply@thedexs.com`; domain verification and
sender authorization must be checked in the approved environment before live
activation. This integration does not modify Supabase SMTP or Auth email flows.
[Resend key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key),
[domain restriction and key management](https://resend.com/docs/dashboard/api-keys/introduction)

The server sends that key only in `Authorization` to the fixed HTTPS endpoint
`https://api.resend.com/emails`. The request contains the authenticated owner's
verified email, a fresh six-digit code and minimal purpose metadata. Action
messages include the allowlisted operation, target UUID and expected version;
post content, titles and private moderation reasons are excluded. The recipient
cannot be supplied by the browser. The send is therefore an explicit disclosure
to Resend for delivery, and its message/log retention needs review before use.
[Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)

The user enters the real Resend key directly into the approved encrypted
Cloudflare secret field. Do not send it to an assistant or paste it into SQL,
terminal arguments, issue comments, test fixtures or source control. Verification
of setup should reveal only binding names/presence and non-sensitive test results.

## Shared HMAC key handoff

The user creates the key privately with a trusted cryptographic generator:
**32 random bytes encoded as unpadded base64url (43 characters)** is the recommended
form. This source task has not generated a real key. Both sides consume the
exact text's UTF-8 bytes; they do **not** base64-decode it. Newlines, whitespace,
standard-base64 `+`, `/`, `=` and values outside 32–128 characters are rejected.

The same value belongs in only two approved server-side secret destinations:
1. Cloudflare's encrypted `ADMIN_STEPUP_HMAC_KEY` in the intended Pages environment.
2. The approved Supabase project's Vault, configured by the database runbook.

Only the resulting Vault secret UUID belongs in private application configuration.
The key must not be written as a SQL-editor literal, migration, public row, RPC
argument, query URL or request log. Follow the [database Vault setup and rotation runbook](../supabase/EMAIL-STEPUP.md).
Its private configuration stores `hmac_secret_id` (UUID), `transport_configured`,
`enabled` and `generation`. The ungranted internal helper
`community_private.stepup_hmac_key(boolean)` resolves the key only for checked
server-side operations. Do not expose `vault.decrypted_secrets` to API roles
or copy decrypted material into a returned function result. Actual creation and
persistent access configuration require the separate approved user handoff.

The HMAC key never leaves Pages in an HTTP request. Only fixed-domain,
challenge-bound HMAC digests/signatures go to Supabase under the **caller's same
original password-session bearer token**. No service-role key is used. The mail
key is never sent to Supabase. Domain-separated canonical field lists are tested
against the SQL implementation; neither the browser nor mail provider chooses
the code hash, challenge identity, recipient or action binding.

## Capability and routes

`GET /api/admin/session` continues to require a network Auth `/auth/v1/user`
check and same-user `community_me()` result. In email mode, SQL must identify the
configured active, verified owner with allowed password-session AMR. A separate
checked status RPC confirms enabled/admitted state. It returns only these fields:

- Existing `user_id`, `email_verified`, `state`, `role`, `aal`, `version`,
  `can_post`, `can_moderate`.
- `admin_auth_method`: `email` or `totp`.
- `can_request_email_stepup`, `admitted`.
- `idle_expires_epoch`, `absolute_expires_epoch` (null before email admission and
  in TOTP mode).
- Email mode only: `session_id`, an opaque self-session UUID from checked status.
  It fences UI token-refresh/session changes; it is never accepted as an
  authorization input, put in HTML, or logged.

The eligible email owner can receive HTTP 200 before admission with
`admitted:false` and `can_moderate:false`. This does not open admin data reads or
mutations. Other users cannot obtain that capability. The original `aal` is not
rewritten: custom email approval does not claim Supabase AAL2. TOTP moderators
and other owners still need the original live MFA gate.

| Method | Route | Exact request / public result |
| --- | --- | --- |
| POST | `/api/admin/stepup/begin` | `{scope:'admission'}` or exact action context; result `{id,scope,expires_epoch}` |
| POST | `/api/admin/stepup/verify` | `{challenge_id,code}`; six ASCII digits; result verified grant metadata or bounded failed-attempt outcome |
| GET | `/api/admin/stepup/status` | Explicit read only; enabled/admitted and expiry epochs; no idle extension |
| POST | `/api/admin/stepup/cancel` | `{challenge_id}`; cancellation/already-used/unavailable outcome |

Every success uses `{data:…}`. There are no Pages registration or activation
routes. The authenticated Supabase register/activate RPCs are callable directly
but independently require valid server HMAC attestations. There are no custom
password, native OTP, recipient-selection or caller-role Pages endpoints. `begin`
action context is `{scope:'action',action,target_id,expected_version,payload}`:

- `admin_edit_post`: payload exactly `{title,body,reason}`.
- `moderate_post`: payload exactly `{action,reason}`, operation hide/restore/pin/
  unpin/lock/unlock.
- `set_account_state`: payload exactly `{state,reason}`, state active/suspended.

After verification the existing mutation requests stay unchanged. They do not
accept a challenge ID, supplied digest, session ID, actor or role. SQL recomputes
the exact canonical operation binding and atomically consumes a matching
unexpired, unused, unrevoked grant in the mutation transaction. An edit to the
reason/title/body, target, operation or expected version requires a new approval.

## Lifetimes, uncertain results and cancellation

Challenges last five minutes with at most five code attempts. Admission has a
15-minute idle and one-hour absolute maximum. Only successful actual admin RPCs
extend idle activity; session/status checks do not. An action grant expires
after two minutes, or earlier when admission expires, and is one use. SQL owns
all rate, attempt, identity/session, generation, expiry and grant checks.

Issuance is pending → prepared/inactive → accepted mail → active. A fixed
challenge idempotency key accompanies the single send. Only a successful mail
response with a valid provider ID permits activation. A send timeout, redirect,
invalid response, failed activation or client disconnect never claims a usable
code and never triggers automatic mail/RPC retries. A prepared challenge remains
inactive. Provider acceptance alone does not prove inbox delivery.

`verify` can return HTTP 200 with `verified:false` and a bounded failure enum plus
`attempts_remaining`; clients must retain this negative business outcome. Rate
limits use HTTP 429, a bounded `Retry-After` and `error.retry_after_seconds`.

Known-ID cancellation can revoke pending/prepared/active challenges and verified
unused action grants for the same original password session. It cannot undo a
committed mutation or revoke completed admission; `already_used:true` means no
undo occurred. Unknown/wrong-user/wrong-session IDs return unavailable, never a
revocation success. If a begin response is lost before the ID is known, local
stop means only **request stopped; email may still arrive**. No cancel-latest or
invented cross-session revocation is supported. Lost cancel acknowledgment is
unconfirmed until explicit reconciliation. Races remain authoritative in SQL.

## Runtime protections and rollout checks

All stages use bounded JSON, strict method/path/field allowlists, no cookies,
no-store responses and fixed generic errors. POST requires the configured exact
Origin and same-origin Fetch Metadata. Incoming tokens are verified over the
Auth network endpoint; no JWT payload decoding supplies authority. Redirects are
manual and every upstream 3xx is rejected before reading; credentials cannot be
forwarded to redirect destinations. Supabase gets only the publishable `apikey`
and caller's original bearer. Each stage has an eight-second deadline and the
whole operation a 20-second deadline, with request-abort propagation. Browser
clients allow 25 seconds and must not auto-retry uncertain writes.
[Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser)

Roll out in a coordinated approved environment, with both email switches off
initially. Apply and verify the disabled migration and its permissions first.
Arrange restricted secret handoffs and sender readiness; publish matching code
and prepare the Pages/server/public UI flags while the database remains disabled.
**Enable database email mode last**, after the coordinated readiness checks.
Any intermediate disagreement denies email admin access instead of falling back.
Verify real password-session admission, live role/session revocation, wrong code,
expiry, exact-bound one-use mutation, cancel interleavings and mail delivery before
calling the preview operational. Roll back by **disabling database email mode
first**, then server/UI flags, restoring genuine legacy live MFA. Never treat
merely turning off the browser flag or Pages flag as a complete security rollback.

No hosted result is established by local unit tests. Real multi-connection SQL
races, Vault permissions, provider delivery, Cloudflare runtime and deployed
browser behavior require their separately approved checks. Avoid logging bearer
headers, code bodies, recipient data or secrets in provider/edge diagnostics.

## Local tests and documentation check

Run `node --test backend/tests/api.test.mjs backend/tests/admin-stepup*.test.mjs
backend/tests/pages-adapter.test.mjs` (as one shell command). Tests intercept
all HTTP traffic and use explicit fake keys; the Pages tests bundle actual
entrypoints with the pinned repository esbuild. The original review tests also
run against the canonical implementation through a test-only flag adapter.

Documentation checked 2026-10-13: Supabase's changelog, getUser, Cloudflare Pages
secret bindings, and Resend send/key permissions. The current Supabase notices
cover [older TLS cipher removal](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)
and [Postgres minor-update changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
This adapter uses runtime HTTPS and HMAC-SHA256, not custom TLS cipher selection
or legacy PGP encryption; hosted TLS/Vault/database compatibility still needs
release verification. No SDK or package dependency was added by this API change.
