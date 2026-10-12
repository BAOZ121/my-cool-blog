# Local community frontend integration

## Status and approval boundary

Implemented locally, **disabled by default, not pushed or deployed**. No real sign-up, password, email, Google, MFA or content submission was executed. The existing live demo is unchanged. See [RELEASE-APPROVAL-SCOPE.md](RELEASE-APPROVAL-SCOPE.md) before changing any remote configuration or publishing.

The only affected page roots are:

- `/test/forum-v1/`: public topics, replies and independent message-board posts
- `/test/forum-admin-v1/`: server-authorized management
- `/test/auth/callback-v1/`: email/Google PKCE callback
- `/test/auth/recovery-v1/`: recovery-only password flow

Formal site navigation is unchanged. Existing demo storage and identities stay separate. Default mode retains the local demos and cannot collect real credentials; callback/recovery pages display a disabled notice. There is no demo-role fallback in real mode.

## Public configuration

`data/community.json` contains only public browser configuration. Its committed values are `enabled: false`, `googleEnabled: false`, and empty `allowedOrigin`, `supabaseUrl`, `publishableKey` strings. A future approved release needs an exact HTTPS site origin, exact hosted `https://<project>.supabase.co` origin and an `sb_publishable_...` key. Secret/service-role keys and wildcard origins are rejected. The runtime also checks that the page origin equals the configured origin.

The API has its own independently disabled server environment flag. Client configuration cannot enable the API, grant an account role, bypass email verification, or remove administrator MFA. Provider/SMTP settings, callback allowlists and owner UUID assignment require separate approval. Google remains visibly disabled until its public feature flag is explicitly enabled after provider setup.

## Exact future build command

Use pinned Hugo Extended `0.166.0` and Node `22+`. Once a release and its exact configuration have been approved, the Cloudflare build command must change from the current Hugo-only command to:

```sh
npm ci --ignore-scripts && npm ci --prefix backend --ignore-scripts && npm run build:community && hugo --environment production --minify --panicOnWarning
```

The deployment output remains `public`. The site/API publication itself is not authorized by this document.

`build:community` uses root `esbuild 0.28.2` and backend `@supabase/supabase-js 2.117.3` from lockfiles. It produces the same-origin `assets/js/generated/community-real.js` bundle and regenerates `static/_headers` from the same public config. The generated SDK bundle is ignored by Git; an enabled Hugo build fails when it is missing. No CDN, Google-hosted script/font or third-party executable asset is used on these test pages.

Always rerun the complete command after configuration changes. Do not change only Hugo data while retaining stale HTTP headers: an older `connect-src` can block sign-in even when the HTML meta policy allows the new project. The stricter policy wins. A default-disabled Hugo-only build still works without npm dependencies.

## Security and lifecycle

- Exact test routes use a dedicated head with CSP `script-src 'self'`, `style-src 'self'`, `connect-src 'self'` plus only the configured Supabase origin, and `form-action 'none'`. HTTP headers additionally set `frame-ancestors 'none'`, `no-store`, `nosniff`, `no-referrer` and deny camera/microphone/geolocation. Default pages allow no Supabase connection.
- Both HTTP and HTML CSP policies are generated/checked together. The native theme shell, palette and navigation are reused without inline scripts on these routes. Other site pages retain their original head and navigation.
- All actual forms are JavaScript-driven, default-disabled until initialization, and use native `method="post"` as a defense against accidental credential query strings. FormData is captured before disabling the submitted fieldset. CSP blocks fallback native submission.
- Dynamic account names, posts, message bodies, reasons and history are rendered with `textContent`; no user HTML or remotely supplied SVG is inserted. Avatar letters are derived from the signed-in user's email; remote avatar URLs are not loaded.
- Per-tab, project-scoped `sessionStorage` keeps the account through reloads and same-tab site navigation. Logout clears it. Tab closure is not a guaranteed logout, and storage is neither HttpOnly nor XSS-proof. No real session data is written to `localStorage`.
- Callback parameters/fragments are stripped before Auth initialization, including disabled and invalid-configuration pages. PKCE requires the tab that initiated registration, Google sign-in or recovery. Links opened elsewhere show safe same-tab/fresh-link guidance. There is no implicit-token fallback or arbitrary `returnTo` navigation.
- The application token provider refuses content/admin API tokens while its recovery UI is active; this is client containment, not a claim that Supabase recovery JWTs have no database privileges. Password update is enabled only after validated recovery and any required authenticator challenge. Completion signs out; an unconfirmed server sign-out is disclosed.
- Management entry and owner-only user/audit tabs follow the server-verified RBAC/MFA result, never an email comparison or browser-local role. Every mutation sends the current server version and a reason. Version conflicts preserve the draft and ask for review of the newest version.
- Sign-out, definitive role/AAL loss, owner-capability downgrade and Back/Forward-cache departure clear private lists, dialogs and editor fields. Generation checks prevent late reads or mutation completions from repopulating private UI. Back/Forward restoration requires a new live check.
- Authenticator setup displays a plain-text secret only in its temporary dialog; closing clears the secret, code and challenge. Reopening can continue a tracked unfinished setup without redisplaying its secret. If the key was not saved, the UI directs the user to account support. It never automatically deletes a factor or restarts enrollment, avoiding a verify-in-another-tab deletion race.

## What is implemented

Email registration/verification, sign-in, generic reset-email request, Google feature gating, profile/avatar/logout, callback/recovery pages, authenticator verification/setup, topics and paged replies, independent messages, and moderator/owner list/search/edit/hide/restore/pin/unpin/lock/unlock/history. Owner-only account suspension/restoration and audit browsing use the existing APIs. No permanent deletion, role-assignment UI, unsupported categories, public author-email lookup or file uploads were added. Public topic search is explicitly scoped to already loaded discussions; admin search is server-side.

## Offline validation

```sh
node --test tests/*.test.mjs
npm test --prefix backend
npm run build:community
HUGO=/path/to/hugo npm run test:community:build
hugo --environment production --minify --panicOnWarning
python3 scripts/validate_site.py public
python3 scripts/validate_breakdowns.py public
```

`test:community:build` creates temporary disabled and synthetic-enabled data/static overlays and Hugo builds. It checks all four routes, header/meta CSP parity, no remote/inline scripts or handlers, POST-only real forms, disabled callback scrubbing, noindex/sitemap exclusion, and no real-mode assets/config on the home page. It never modifies source config or contacts Auth/API. The exact same checks are added to site-validation CI.

`tests/community-real.test.mjs` uses a deterministic DOM fixture with disabled-fieldset FormData behavior and mocked Auth/API results, including interrupted/repeated forms, late responses, conflicts, downgraded roles and BFCache lifecycle. Auth SDK tests separately intercept all requests. These are **not browser-rendering tests**. No new real-browser execution, desktop/mobile visual layout, actual CSP enforcement, native focus/history behavior, real email delivery, Google redirect, hosted Auth or live write path has been verified in this task. Those remain explicit pre-release acceptance checks after the required permission and environment are available.
