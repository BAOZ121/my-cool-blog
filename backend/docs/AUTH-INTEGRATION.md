# Real Auth integration: local preparation

## Status and dependencies

The controller, SDK bundle inputs, tests and local UI wiring are prepared for an explicitly enabled future release. **Production remains unchanged: no real Auth account, credential entry, email, OAuth consent, MFA enrollment, remote setting, role grant or deployment was performed here.** `createSupabaseAuthController` defaults to `enabled: false`; separate frontend/backend enablement and approved configuration are required. Never use demo credentials or data as a fallback after a real Auth/API failure.

`backend/package.json` pins `@supabase/supabase-js` to **2.117.3**. The committed lockfile resolves `@supabase/auth-js` to **2.117.3**, with registry integrity hashes. The version, official registry tarball and Node `>=22` requirement were checked using the official npm registry on 2026-10-12. Installation used `--ignore-scripts`. An official-registry production dependency audit on 2026-10-12 reported zero known vulnerabilities; this is a point-in-time advisory check, not a security guarantee. The database tests have a separate package under `backend/supabase`; this package does not change it. Self-host the reviewed frontend bundle; do not import an unpinned SDK from a CDN.

Local installation/test commands:

```sh
npm --prefix backend ci --ignore-scripts
npm --prefix backend run test:auth
```

## Controller contract

`createSupabaseAuthController(options)` is exported from `backend/client/auth-controller.mjs`.

Required when enabled:

- `enabled: true` explicitly; false is the safe default.
- `createClient`: the pinned SDK's factory, injected for testing.
- `origin`: one exact HTTPS application origin, without a slash, path, credentials or wildcard.
- `supabaseUrl`: one HTTPS hosted `*.supabase.co` origin. Custom hosts and HTTP/local Supabase are deliberately excluded by this starter.
- `publishableKey`: only an `sb_publishable_…` application key. Secret/service-role and legacy JWT keys are rejected. Do not check a real value into source.
- `tabStorage`: browser `sessionStorage`, explicitly supplied. **Do not substitute localStorage.** Storage read/write/remove availability is checked before SDK creation or credential submission.
- `replaceUrl(path)`: normally `history.replaceState(null, '', path)`; callback handling invokes this before constructing the SDK, because SDK initialization may refresh a persisted session.
- `callbackPath` and `recoveryPath`: two distinct exact same-origin paths. Controller defaults are `/auth/callback` and `/auth/recovery`; the prepared test-site wiring passes `/test/auth/callback-v1/` and `/test/auth/recovery-v1/`. Match those exact trailing slashes in later approved redirect settings.

Optional fetch, clock, UUID and scheduler injections are test seams. Production uses native fetch/WebCrypto and the real clock. SDK requests are pinned to the exact Auth origin, with omitted cookies, no redirects, no referrer, a 12-second per-request deadline and a 256 KiB response limit covering streamed bodies.

| Method | Purpose |
| --- | --- |
| `initialize()` | Read the tab session, validate its user and refresh presentation state. |
| `signUp({email,password})` | Fixed-callback email signup; show `verification_required` for a null session. A returned user alone is not a login. |
| `signIn({email,password})` | Email/password login, validated identity and verified-email check. |
| `signInWithGoogle()` | Return `{url}` containing a vetted Supabase OAuth URL. The UI navigates only following the user's Google sign-in action. |
| `handleCallback(location.href)` | Scrub, validate and exchange a matching, initiated PKCE callback once. Handles either configured callback path. |
| `refresh()` | Revalidate user/MFA/admin state, renewing the session when needed. Use on foreground/focus and before opening admin controls. |
| `getAccessToken()` | Async `createCommunityClient` token provider; returns a usable access token or `null`, with coalesced near-expiry refresh. Always returns null in recovery mode. |
| `enrollMfa()` | Return TOTP enrollment `{factorId,secret,qrCode,uri}` to the enrollment view only. |
| `challengeMfa(factorId)` | Return `{factorId,challengeId,expiresAt}` for a verified factor or the factor currently being enrolled. |
| `verifyMfa({...challenge,code})` | Verify a six-digit challenge and reread current identity, assurance and capability. |
| `requestPasswordReset({email})` | Initiate PKCE recovery to the fixed recovery path. Success state is generic `reset_email_sent`. |
| `completePasswordReset({password,confirmPassword})` | Accept a user-entered password only in a validated recovery window, update once, clear tokens and request local-scope logout. Return `{passwordChanged:true,signOutConfirmed}`. |
| `signOut()` | Fence local state immediately, drain in-flight SDK work, revoke the current server session with `scope:'local'`, and remove tab session/PKCE/recovery data. |
| `getState()` / `subscribe(listener)` | Sanitized state; no password, bearer/refresh/provider token, verifier, code or TOTP secret. |
| `dispose()` | Fence late callbacks/writes and close SDK listeners/BroadcastChannel. Preserve valid tab persistence for same-origin navigation; this is not logout. |

UI state includes `status`, `busy`, own `user:{id,email,emailVerified}`, `mfa:{currentLevel,nextLevel,required,factors,pendingFactorId}`, `admin:{status,role,canModerate,canManageUsers,canReadAudit}`, safe `error:{code,message}` and optional `recovery:{expiresAt}`. Password signup/reset validation requires at least 12 characters; the Auth server's configured policy also applies. Render data with text-safe DOM operations. Clear password/TOTP fields and enrollment material promptly.

## Session storage, navigation and browser isolation

### Per-tab bearer session

This phase intentionally changes the earlier memory-only proposal to **project-scoped sessionStorage sessions** so same-origin community/admin navigation and refresh retain login. Supabase access and refresh tokens, plus its necessary session/user metadata, are stored in that tab. Unused Google/provider access and refresh tokens are removed from serialized session data. No cookies, localStorage or IndexedDB are used.

**This is neither HttpOnly nor XSS-proof.** Same-origin JavaScript can read sessionStorage, and a compromised page can steal active tokens. A browser may restore sessionStorage after reopening a tab/session; some opener/duplicate-tab flows copy it. Do not promise that closing a tab reliably signs the user out, or that copied browser storage represents an independent server session. Server expiry, live-session revocation, account suspension and SQL/API authorization remain authoritative.

The pinned SDK uses `persistSession:true` to select the custom storage adapter. `persistSession:false` would ignore the adapter. The option does not imply localStorage here. `detectSessionInUrl:false` prevents SDK auto-consumption of unvalidated callbacks. `autoRefreshToken:false` leaves explicit refresh initiation to the controller; SDK session reads can still refresh when required.

Supabase opens a BroadcastChannel named by its SDK `storageKey` and broadcasts full sessions. Therefore the controller creates a **fresh cryptographically random SDK key for every document/controller**, even when sessionStorage was cloned. The adapter maps that ephemeral prefix to stable logical project-scoped session keys and PKCE verifier suffixes. It never reuses a persisted SDK channel name. No undocumented SDK property is patched. Tests exercise actual SDK browser-mode channel behavior across cloned stores and verify no cross-channel token/logout event delivery. Intrinsically copied tokens still refer to the same server session and are subject to its revocation.

`getAccessToken()` can return a previously validated unexpired token without a new network call. It is not a per-call live identity guarantee. Every protected API/SQL operation must independently validate identity, current session, suspension, ownership, role and MFA. The UI should refresh after an authorization failure and never blindly retry a possibly committed write.

### PKCE records

Signup, Google and recovery persist only flow type, fixed callback, creation time, verifier values and verifier-index metadata in a separate tab record. No password or email is stored in that record. Verifier records expire 30 minutes after initiation; Supabase's Auth code has its separate shorter server expiry and single-use constraint.

The adapter supports the pinned SDK's legacy verifier, per-flow verifier and index keys using logical suffixes. Old preparation records containing the previous full SDK-prefixed keys are normalized on read, without reusing their BroadcastChannel. An unknown explicit `sb_flow_id` never falls back to another verifier. A new flow replaces the previous pending flow. Processed callback success/failure or signout removes pending PKCE data; ordinary disposal/navigation preserves it.

Only one flow per project/tab is supported. Email links opened in a different tab/browser may lack the verifier. For ordinary signup, ask the user to sign in after email verification; for password recovery, restart recovery in the tab they will use. Never accept implicit access-token fragments or fall back to demo authentication.

The exact callback/recovery path is checked, then codes/errors/fragments are removed from the address bar **before SDK construction or network work**. Unexpected/duplicate parameters, remote URLs, `next`, `returnTo`, fragments and unsolicited/expired callbacks are refused. Raw provider error descriptions are not displayed. Experimental redirect rewriting is not enabled.

## Recovery safety and limits

`requestPasswordReset` calls the real SDK's `resetPasswordForEmail(email,{redirectTo:fixedRecoveryUrl})`. A pending recovery marker is written before code exchange; only the matching pending recovery flow/path and SDK `redirectType:'recovery'` can create a ready recovery state. A crash/interruption with only a pending marker cannot become a normal accepted login on reload.

The ready window is 10 minutes, bound to the validated user, and survives same-origin navigation. The token provider always refuses it for community/admin calls; admin capability is never probed or enabled from this mode. If an enrolled factor requires AAL2, the user must complete the supported MFA challenge before submitting a new password. An unsolicited callback, wrong flow kind, stale window, mismatched password, missing MFA or replay cannot cause `updateUser`.

The **end user enters, confirms and submits the new password** in the approved UI. Assistant tooling does not enter or submit a real replacement password. Passwords/codes are never put in URLs, logs, UI state or persistence. The recovery window is consumed before `updateUser({password})`; a network failure may follow a successful remote change, so do not retry automatically. Success clears tab tokens and requests `scope:'local'` logout, then requires ordinary sign-in. If logout cannot be confirmed, report that accurately even though the password change succeeded.

This is **UI/token-provider containment**, not a claim that Supabase recovery JWTs are restricted to password updates at the server. The official JWT reference documents `amr.method:'recovery'`; synthetic tests model it, including MFA. A client storage marker or unsigned JWT decode must never be used for database authorization. Additional server-side recovery exclusion would need separately reviewed signed/live-verified claims, tested Auth semantics and an approved database/API change. No such hosted change is made here.

## Verified identity, MFA and admin

Session acceptance calls `getUser(accessToken)`, checks returned UUID against the session user, requires the authenticated role, rejects anonymous users, and requires confirmed email. PKCE signup must use email confirmation. Unexpected auto-confirm sessions are rejected, local-scope logout is requested, and persisted session data is cleared even if remote logout fails.

TOTP enrollment alone grants nothing. Challenges are factor/ID/expiry-bound and are not automatically retried. Verification rereads the SDK's current session/AAL. Secret, URI and QR data are returned only to the enrollment view. Render QR SVG as an image using a reviewed safe image source; never insert it with `innerHTML` or send it to a third-party QR service. Display secret/URI as text. Closing the enrollment view clears the displayed secret/QR but retains only `mfa.pendingFactorId`, a nonsecret identity learned from the authenticated factor list. Reopening offers a challenge for the authenticator already added; an unfinished factor is also rediscovered after navigation. Starting another enrollment returns `MFA_PENDING` instead of accumulating duplicate factors. If the setup key was not saved, the UI gives explicit account-support guidance; it cannot safely restart or redisplay that key.

There is deliberately no discard/unenroll method. Supabase's public factor deletion takes a factor ID without an expected-unverified-status condition, so a client read-then-delete could race verification elsewhere and remove a now-verified factor. Closing a dialog never removes an Auth factor. Unfinished-factor cleanup, recovery codes, unenrollment and lost-factor recovery require separately reviewed, explicitly user-authorized handling; they must not be performed automatically by an assistant.

With email step-up absent or disabled, admin controls retain the existing AAL2 requirement plus a live same-origin `GET /api/admin/session` response with the same `user_id`, confirmed email, active state, `aal2`, `can_post:true`, `can_moderate:true`, and role moderator/owner. Owner-only flags come only from that response. No email whitelist, avatar, user metadata, decoded JWT role or Google login grants admin rights. `admin.status:'mfa_required'` means MFA is needed before checking admin capability, not that a role already exists. Backend/SQL recheck each mutation even if the rendered UI is stale.

## Optional email administrator step-up

The locally integrated email flow is selected only when `data/community.json` explicitly sets `emailStepupEnabled:true` **and** the live server returns `admin_auth_method:'email'` with a validated eligible owner capability. The new public flag is committed as `false`. Server enablement, database configuration, HMAC/mailer credentials, approved recipient setup and deployment remain separate gates. Public configuration contains no HMAC or mailer secret. Missing/mismatched rollout configuration fails closed; it cannot reinterpret email admission as legacy AAL2.

Email-mode `/api/admin/session` must match the live verified user, active account, owner role, `can_post`, `can_request_email_stepup`, current AAL, and consistent `admitted`/`can_moderate` values. Admitted state requires bounded future idle and absolute expiries; pre-admission requires null expiries. A strict UUID `session_id` from the authenticated server is retained only internally as a lifecycle marker. UI state gets a local `sessionGeneration` integer. Ordinary refresh with the same server session preserves an in-flight challenge; another same-user login, signout or account replacement fences it. This marker never grants authority or becomes a mutation input.

The Auth controller still rejects recovery-mode bearer use, and the API/DB must reject recovery and OTP-only administrative sessions from trusted live claims. Neither browser email comparison, metadata nor unsigned JWT decoding selects an administrator. The custom email challenge uses the original password bearer and creates no secondary Supabase Auth session.

`client/email-stepup-client.mjs` is the canonical controller used by the existing real UI. It snapshots action binding, retains known cancellation IDs, and only hands an AbortSignal to an explicit single-use `consumeAction` callback after verification. Mutation bodies stay unchanged: the DB consumes the permission by original session, action, target, version and canonical payload. The original edit/moderation/account/history/audit UI is used; the offline preview is not imported. See [email client contract](EMAIL-STEPUP-CLIENT.md).

Session/status checks do not touch administrator idle time. The UI must not reload private lists automatically after routine Auth refresh or temporary status errors; explicit user loads may do so. Signout immediately blocks and disposes the email workflow before existing Auth signout, without waiting on cancellation. Unconfirmed logout retains the existing warning, never a separate cancellation claim.

## Concurrency and failure semantics

Auth/MFA writes are single-flight and reserve their busy guard before synchronous subscriber notifications. Repeated submissions fail `AUTH_BUSY`. Signout immediately fences tokens/capabilities and invalidates pending sign-in, lookup, refresh and MFA results, then drains SDK work before requesting revocation. Fetch deadlines cancel stalled response readers. Disposal closes the storage adapter against late writes and uses the pinned SDK lifecycle cleanup.

`SIGN_OUT_UNCONFIRMED` means this controller is signed out locally but remote revocation or storage removal could not be fully confirmed. It never promises immediate JWT invalidation. Error strings are fixed and sanitized; SDK descriptions, credential values, callback URLs and stack traces are not exposed. A timed-out mutation may already have committed and must be resolved by an explicit recovery flow rather than a blind retry.

## Verification and remaining release gates

`backend/tests/auth-controller.test.mjs` covers synthetic state/race/error cases. `auth-sdk.test.mjs` imports the **actual pinned SDK** and intercepts all fetches with synthetic responses. It tests password login, user/MFA APIs, sessionStorage navigation, local logout, SDK S256 generation and actual per-flow storage, signup redirects, password recovery/update/logout, MFA token promotion, unused-provider-token removal, and browser-mode BroadcastChannel isolation for cloned stores. No test reaches a real Auth service. Synthetic JWTs test SDK parsing and controller behavior; they do not prove hosted JWT issuance, cryptographic verification, provider behavior or email delivery.

Before any live enablement:

1. Review/apply the database and backend configuration separately; verify live RLS, session revocation, role changes and MFA against an approved isolated project.
2. Approve Auth email confirmation, SMTP/provider settings and exact callback/recovery redirect allowlists. Google secrets stay in the Auth/provider service, never frontend source. No remote settings are authorized by these files.
3. Exercise actual browser sign-in, email delivery/expiry, same/different-tab links, Google consent/cancellation, storage denial, browser restore/cloning, refresh rotation, signout races and MFA/recovery using authorized test accounts. Intercepted SDK tests are not hosted/browser end-to-end sign-off.
4. Verify restrictive CSP, self-hosted reviewed scripts, plain-text user rendering, no token logging/DOM insertion, callback no-referrer/no-cache policies and no third-party callback-page requests. Review sessionStorage/XSS risks, rate/abuse controls, privacy copy and user-controlled password entry.
5. Keep real-mode flags disabled until separate deployment approval. Production deployment, remote Auth changes and real user credential handling remain outside this preparation.

## Official sources checked

- [Official SDK registry metadata](https://registry.npmjs.org/@supabase%2Fsupabase-js/2.117.3) and the committed package integrity lock.
- [Supabase changelog](https://supabase.com/changelog), reviewed 2026-10-13; official HTML fallback was used when the markdown index was unsupported.
- [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [signUp](https://supabase.com/docs/reference/javascript/auth-signup), [OAuth](https://supabase.com/docs/reference/javascript/auth-signinwithoauth), [code exchange](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession).
- [Password reset](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [JWT claims and recovery AMR](https://supabase.com/docs/guides/auth/jwt-fields).
- [Auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [callback-lock advisory](https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0), [signout semantics](https://supabase.com/docs/reference/javascript/auth-signout).
- [MFA enroll](https://supabase.com/docs/reference/javascript/auth-mfa-enroll), [challenge](https://supabase.com/docs/reference/javascript/auth-mfa-challenge), [verify](https://supabase.com/docs/reference/javascript/auth-mfa-verify), [AAL](https://supabase.com/docs/reference/javascript/auth-mfa-getauthenticatorassurancelevel).
- Installed `@supabase/auth-js@2.117.3` source for storage, callback, refresh, recovery and lifecycle contracts; [official source repository](https://github.com/supabase/supabase-js/tree/master/packages/core/auth-js) was used for cross-checks, not as an unpinned runtime dependency.
