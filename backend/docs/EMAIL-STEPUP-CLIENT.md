# Email administrator step-up client integration

## Status and enablement

This is local production-source integration, not a deployed or live-email acceptance result. The existing test-route UI uses the canonical `client/email-stepup-client.mjs`; `stepup-review/client/email-stepup-prototype.mjs` is a test compatibility re-export. No offline mock UI is imported into the real bundle.

The new public `emailStepupEnabled` flag defaults to false. It must agree with the server's `COMMUNITY_EMAIL_STEPUP_ENABLED` flag and authenticated DB capability. Missing public/server/database/secret configuration fails closed. Legacy TOTP remains intact when email mode is off. No server HMAC or mailer key is read by the frontend build or placed in site data, HTML, JavaScript, browser storage or UI state.

The server identifies the configured verified owner UUID and checks password-session eligibility. Members, moderators, recovery sessions and OTP-only sessions cannot obtain email owner admission merely by changing browser state. The browser never accepts an arbitrary recipient and never constructs a secondary Supabase OTP/Auth session.

## Contract

`createEmailStepupClient({enabled:false,origin,fetchImpl,getAccessToken,now?,timeoutMs?})`

The explicit transport and same-origin HTTPS validation are preserved from the review. All requests use the original password-session bearer; cookies are omitted and redirects refused. Responses have a bounded body, requests have a 25-second client deadline, and the server has a 20-second total deadline. No automatic email, code submission, mutation, resend or cancellation retry occurs.

- `begin()` requests admission. `begin({scope:'action',action,targetId,expectedVersion,payload})` snapshots one exact operation.
- `verify(code)` accepts exactly six digits for the internally retained challenge, and clears transient code references. UI input is also cleared on submit, cancellation, session change and teardown.
- `status()` is an explicit nonmutating check. It cannot extend server idle expiry or resolve a particular content mutation.
- `consumeAction(async signal => request(...))` is available only for a verified, unexpired action proof. It is single-use, bounded and abortable; the callback receives no token or challenge ID. Existing mutation request bodies are unchanged. DB grant consumption binds original session, action, target, version and canonical payload.
- `cancel()` immediately blocks local confirmation and sends only the exact retained ID to `/api/admin/stepup/cancel`. Positive acknowledgment means cancelled; `already_used` means a completed mutation/admission was not undone; transport/unavailable failures keep the ID and controls for an explicit retry. See the [full cancellation contract](../stepup-review/docs/CLIENT.md#cancellation-and-lifecycle-contract).
- `suspend()` only fences/aborts local work and retains a known cancellation handle. It never claims server cancellation and never sends a write automatically. It is used for BFCache departure.
- `dispose()` is local teardown only. It does not cancel a server permission or sign the account out.

State includes safe presentation fields such as `actionReady`, `actionExpiresAt`, cancellation status and fixed notices. No bearer, refresh token, email code, session UUID or challenge UUID enters emitted state. JavaScript cannot guarantee secure memory zeroing; no code is persisted, logged or put in URLs.

## Real UI behavior

An eligible owner explicitly requests and verifies an admission code. The UI then asks Auth to reread the server capability before exposing private content. For each edit, moderation or account-state change, the existing editor first snapshots the original row UUID/version and full requested values. The user sends a separate code, verifies it, reviews that frozen operation and clicks the explicit final confirmation. Changing the operation requires a new proof. Successful code verification alone does not submit content.

An uncertain mutation is never repeated automatically. Its known cancellation handle remains available to revoke any unused permission; `already_used` cannot roll back a committed mutation. A version conflict retains explicit reconciliation guidance. Once a successful mutation is acknowledged, its local proof cannot be reused.

Auth keeps the server-validated self-session UUID internal and exposes only `sessionGeneration`. Same-session token rotation preserves a challenge. A different user or session disposes/recreates the controller and fences late responses. Signout immediately blocks work and invokes the existing Auth signout without waiting for email cancellation. A failed remote signout remains explicitly unconfirmed.

The server admission limits are 15 minutes idle and one hour absolute; action permission is two minutes. Auth/status checks must not reload an admin list to keep idle alive. Initial intentional entry and explicit user reads may touch idle; routine refresh, temporary status errors and rendering timers cannot. Status/idle expiration hides private controls and clears cached private views.

Before a begin response supplies its ID, a stopped request is local-only and email may still arrive. Page teardown/reload loses the in-memory cancellation handle. Neither event can be presented as confirmed revocation. The server's expiry and live original-session checks remain authoritative.

## Local verification

```sh
node --test backend/tests/*.test.mjs
node --test tests/community-real.test.mjs
node --test backend/stepup-review/tests/client*.test.mjs
HUGO=/path/to/hugo node scripts/validate-community-build.mjs
```

Tests use only synthetic SDK/Auth/DB/mail transport. They cover same-session refresh versus new-session fencing, pre-admission capability, exact action binding and unchanged mutation bodies, explicit confirmation, cancellation race/uncertainty, ordinary-role/recovery denial, response/deadline limits, and UI↔canonical-client and Auth↔real-API seams. The build validator renders disabled/TOTP/email modes, checks metadata/CSP parity, confirms unchanged home/navigation, and injects synthetic server-secret environment sentinels to prove they never appear in public artifacts.

Real multi-connection database races, hosted Auth claims, approved sender/recipient delivery, deployed browser behavior and final rollout remain separate acceptance gates. No real account, email, secret configuration or deployment is performed by these tests.
