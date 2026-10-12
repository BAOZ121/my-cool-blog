# Database deployment record

## Authorized application: 2026-10-12 UTC

The coordinating deployment task reported that it received explicit user approval, applied the frozen foundation and the separately approved automatic-RLS EXECUTE repair, and verified the target afterward. This record preserves that reported execution evidence; the local database worker performed only file/history reconciliation and local tests.

- Target Supabase project reference: `ltopqphxiulyfaivdjfq`
- Target database: PostgreSQL `17.11`
- Authoritative hosted migration version `20261012030809`, name `dex_community_foundation`
- Authoritative hosted migration version `20261012030835`, name `harden_auto_rls_execute`
- Foundation source SHA-256: `2b642b6dce8b73dd7633ec704152673ba5d1d4af9a611150d5e82fa6eaf8ce52`

The original preparation filename `20261012025436_dex_community_foundation.sql` was removed in favor of the authoritative version without changing its SQL bytes. The second migration contains only:

```sql
begin;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
commit;
```

There is no duplicate review-only repair file and no automatic/bootstrap owner grant. Both local filenames match the hosted migration history so a later CLI operation does not mistake the foundation for a new pending migration.

## Reported hosted verification

The coordinating task reported successful checks after both applications:

- Five community tables have RLS enabled
- Ten public community RPC wrappers use SECURITY INVOKER
- Private table access and internal helper execution remain denied to client roles
- Community accounts, roles and posts each contain zero rows
- Anonymous public SELECT works; anonymous RPC access, private access and missing-session authenticated calls are denied
- These hosted database runtime checks changed no user/content rows
- The pre-existing automatic-RLS function and enabled event trigger remain intact
- The automatic-RLS EXECUTE warning is absent after the repair
- Security/performance advisors returned only four intentional private-table/no-policy informational findings and five unused-index informational findings; no warning was reported

No credentials, tokens, email addresses, user IDs or private account contents are recorded here. Project references and migration versions are deployment identifiers, not secrets.

## Local regression after reconciliation

`npm test --prefix backend/supabase` runs the two authoritative migration files in order after test-only Auth and pre-existing automatic-RLS fixtures. It also runs a separate repair regression proving automatic RLS still fires for CREATE TABLE, CREATE TABLE AS and SELECT INTO. The foundation remains byte-for-byte identical to the reviewed/applied hash.

## Still unverified or not performed

- Genuine sign-in/email-confirmation/recovery/SMTP delivery flows
- Full signed-user HTTP PostgREST calls, moderator/owner MFA flows and browser integration
- Real owner signup/identity grant; accounts and roles remain empty at the recorded checkpoint
- Actual multi-connection PostgreSQL 17 races: simultaneous edits, parent locks, suspension, role revocation and owner-state changes
- Cloudflare application deployment or switching the live frontend
- A production-readiness assessment or any paid-plan change

The PGlite regression suite uses PostgreSQL 18.3 and test-controlled claims; it does not replace signed Auth/PostgREST or true multi-connection acceptance tests. Future changes require review and applicable authorization, and should be added as new migrations rather than modifying these applied migrations.
