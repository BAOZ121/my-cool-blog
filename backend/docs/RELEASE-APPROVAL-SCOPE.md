# Test-path real-community release scope

This is a review checklist, not approval and not a record of deployment. Database initialization was separately approved and completed; see `../supabase/DEPLOYMENT.md`. Website and Auth configuration remain pending.

## Website release

- Existing frontend: `/test/forum-v1/`
- Existing independent management frontend: `/test/forum-admin-v1/`
- Exact Auth callback: `/test/auth/callback-v1/`
- Exact password-recovery callback: `/test/auth/recovery-v1/`
- Same-origin Pages Function routes only: `/api/community/*` and `/api/admin/*`
- Existing non-test articles and formal navigation are out of scope.
- Default-disabled integration must not use demo identities against real APIs. Existing local demo data must not be imported into the database.
- Before publication: record current remote main SHA, review exact diff, obtain deployment approval, push with an expected-SHA guard, verify that exact commit's Pages deployment and CI, then inspect the live paths.

## Public runtime/build configuration

The current API expects `COMMUNITY_BACKEND_ENABLED`, `COMMUNITY_ALLOWED_ORIGIN`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY`. The first is a feature flag; the others are public configuration, not server secrets. The frontend build configuration must be reviewed alongside its final implementation and must match these values. An `sb_publishable_` key intentionally permits public API access only within configured grants/RLS; it does not grant administrator powers.

Do not configure `service_role`, database passwords, SMTP credentials, Google client secrets, or any secret-bearing environment variable in Hugo, browser assets, Git, or public JSON. The content API does not require a service-role key.

## Supabase Auth configuration, separately approved

- Site URL: `https://thedexs.com`
- Exact redirect allowlist entries: `https://thedexs.com/test/auth/callback-v1/` and `https://thedexs.com/test/auth/recovery-v1/`; no wildcard preview-domain entry by default.
- Retain verified-email requirements. Do not enable anonymous accounts or disable verification as a mail-delivery workaround.
- Review and explicitly approve enabling real browser session persistence before actual login testing. The local implementation uses project-scoped per-tab sessionStorage, retaining refreshes and same-origin navigation. Browser restore can preserve that storage; tab close is not guaranteed logout. It is readable by same-origin JavaScript, not HttpOnly and not XSS-proof. Strict CSP, self-hosted scripts, plain-text rendering and short-lived/revocable server sessions are complementary controls.
- User performs real password entry/submission and any credential setup in a secure page. Never request passwords or recovery tokens in chat.

## Mail setup, separately approved

Use the user-selected free provider only. Verify its exact sending-domain DNS records first; do not replace website A/CNAME or existing root-domain mail delivery records. Authentication email click/open tracking should be disabled. Resend SMTP credentials belong only in the approved Supabase SMTP settings and are entered through a secure handoff. Domain verification does not authorize credential generation, wider account access, paid plans, or website deployment.

## Google login, separately approved

Review the provider configuration independently of email/password login. The intended web origin is `https://thedexs.com`; the provider callback is the selected Supabase project's `/auth/v1/callback` URL. Google Client ID is public; the client secret belongs only in the Supabase provider configuration. Request no Gmail or Drive scope. Do not automatically link accounts merely because an unverified email string matches.

## First administrator, separately approved

After the user securely registers, verifies email and enrolls MFA, identify the verified Auth user UUID. Grant the owner role only to that exact reviewed UUID through an approved operator transaction with an audit record. No email comparison, first-registrant bootstrap, frontend password or demo-role promotion is permitted.

## Acceptance and rollback

Use isolated synthetic content for authorized end-to-end tests. Verify anonymous/member/suspended/revoked-admin behavior against both Pages and direct Supabase APIs, MFA, recovery, session refresh/logout, multi-tab limitations and version conflicts. Before enabling public writes, review abuse controls, privacy/retention and backup/restore procedures. Disabling the backend feature flag should close writes; rollback must preserve the database and audit records rather than dropping tables or deleting accounts.
