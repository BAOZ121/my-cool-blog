# Owner email verification rollout

Status: application integration is local and not published. After the user approved the exact security scope, the frozen database migration was applied as hosted version `20261013031903` on 2026-10-13, verified disabled with a NULL Vault reference. See the database deployment record for the read-only checks. Credential entry remains user-controlled; the application publication and final database activation are later ordered steps, not completed by this record.

## Scope

- Existing `/test/forum-v1/` and `/test/forum-admin-v1/` only; normal site navigation remains unchanged.
- Existing password-based Supabase account and database-assigned owner role. No shared administrator password, new owner grant, native email-OTP elevation, role-management feature, permanent deletion or authenticator removal.
- A dedicated code grants short-lived administrative access to the original live password session. Each administrative content or account-state mutation needs an exact-operation, single-use approval consumed inside its database transaction.
- Other administrator identities retain their existing MFA gate. Missing or contradictory configuration must reject management requests.

## Credentials: user-controlled setup

Never put a real secret in this repository, a migration, chat, a screenshot, an attachment or a command supplied to an assistant.

1. In Resend, create a separately approved key with **Sending access** restricted to the existing `thedexs.com` domain. Keep existing Supabase Auth SMTP configuration unchanged. The user places the key in the existing Cloudflare Pages project's production **Secret** named `ADMIN_STEPUP_RESEND_KEY`.
2. The user generates a new independent high-entropy HMAC value in a trusted local password manager or secure local generation tool. The accepted format is 32–128 ASCII base64url characters; 32 random bytes encoded as unpadded base64url is the recommended 43-character form. Do not reuse an account password, Supabase key or Resend key.
3. The user enters that same HMAC value into the Supabase project's Vault UI and Cloudflare Pages production **Secret** `ADMIN_STEPUP_HMAC_KEY`. The migration contains only a Vault secret UUID reference, never the value. Vault encrypts stored data; do not infer that every service access path is automatically free of logs.
4. Only the non-secret Vault UUID is needed for the explicitly approved database configuration step. Never query or return `vault.decrypted_secrets` values during agent checks. Client roles receive no Vault access.

Rotation creates a **new Vault secret ID**, updates configuration and advances its generation, invalidating prior challenges and permissions. Updating an existing Vault value in place is not the supported rotation procedure.

## Ordered release gates

1. Freeze and review the complete local migration, API/client changes and test results. True multi-connection PostgreSQL verification is a separate gate from PGlite; the approved synthetic run below now satisfies that gate for the frozen migration. Validate a production Hugo build and rollback before enabling the new mechanism.
2. Obtain exact authorization for the database objects/permissions and the two secret destinations. Apply the new migration initially disabled, with no secret value embedded. Verify grants/RLS and preservation of the prior MFA guard.
3. The user securely configures the two Pages secrets and Vault entry. Public settings remain unchanged except the explicitly controlled `emailStepupEnabled` field. Secret values must never enter public build artifacts.
4. After the secrets are configured and validated, publish the complete code with Pages `COMMUNITY_EMAIL_STEPUP_ENABLED=true` and frontend `emailStepupEnabled=true`, while the database email mechanism remains disabled. Its checked capability still selects genuine legacy MFA. The database must remain the last activation gate; a frontend flag alone grants nothing. If a staged default-off code deployment is used first, verify it before this selection step.
5. Under the separately approved activation action, bind the Vault UUID, confirm sender/key configuration, and enable the database owner policy **last**, after the complete Pages/frontend deployment is verified. Do not enable the database first while the application flags are absent or off. Configuration readiness is not proof that an email reached an inbox. The first user-driven challenge verifies actual delivery; errors remain closed.
6. The owner personally signs in, receives/enters the code and confirms designated test actions. The assistant must not invent real accounts, enter the user's password, retrieve setup secrets or perform unspecified content changes. Verify ordinary-account denial, exact-operation cancellation, session expiry/revocation and direct-RPC rejection.
7. Confirm the exact remote commit, Cloudflare deployment and CI terminal states. Report remaining unverified stages separately.

## Rollback

Disable the **database mechanism first** using the reviewed non-destructive operator script. This advances configuration generation and invalidates custom permissions; Pages flag-off alone cannot revoke an already-issued direct-RPC capability. Then disable the Pages and frontend feature flags and redeploy the approved rollback code/config. Preserve content, audit records, accounts, roles, Auth sessions/factors and Vault entries. Full SQL rollback restores the prior private guards and revokes the new RPCs without deleting user data.

## Evidence and limitations

- On 2026-10-13 the existing hosted project was inspected for metadata only: Vault objects exist, pgcrypto is in `extensions`, and anon/authenticated have neither Vault schema usage nor decrypted-view SELECT. The pre-existing service_role can read Vault; the application never uses or exposes that key.
- The local cloud environment could initialize PostgreSQL 17.11 but both original and formally escalated Unix-socket startups failed with `Operation not permitted`; that route stopped. Two separately approved runs then used a standard GitHub-hosted runner with a network-disabled, synthetic PostgreSQL container. The first failed during container bootstrap before any SQL race; the second corrected only the startup workflow and passed all seven distinct-connection/lock-wait scenarios (eight tests including the suite, zero skipped). Evidence: https://github.com/BAOZ121/my-cool-blog/actions/runs/38340448793 at commit `174450f5b73abb5f730310bd9d3a170ce2a99c0a`. SQL and race assertions were unchanged. The temporary database/container were cleaned up. No production database was used.
- Password plus email verification is weaker in factor independence than authenticator MFA because email also controls password recovery. Existing per-tab sessionStorage remains vulnerable to same-origin script compromise; this work does not silently introduce an HttpOnly session redesign.
- The existing free services are retained. No paid upgrade, provider registration or automatic quota purchase is authorized. Delivery/limits failures reject management access rather than reducing protection.

## Official references

- https://supabase.com/docs/guides/database/vault
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/auth-mfa
- https://resend.com/docs/dashboard/api-keys/introduction

