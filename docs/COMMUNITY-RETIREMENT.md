# Community retirement — 2026-10-23

Discussions, message board, sign-in, registration, recovery and community administration are retired at the owner's request. Research articles, Library, search and contact are unchanged.

- `data/community.json` has `retired: true` and `enabled: false`. Retirement overrides enabled configuration and suppresses both live and demo UI, account hints, SDK bundles and navigation links.
- Existing four `/test/` routes remain as non-indexed closed notices. Callback/recovery URL credentials are stripped by the existing theme initialization script; no Auth exchange occurs.
- Both exact and nested `/api/community` and `/api/admin` Pages endpoints return JSON HTTP 410 for every method, without inspecting environment credentials or making upstream requests. Keeping the route manifest prevents accidental static fallback.
- Supabase project, data, roles, Auth users and credentials were not changed, restored or deleted. This shutdown does not claim credential revocation or changes to direct hosted Supabase access; the existing project remains inactive.
- Archived source modules and synthetic tests are retained for reversibility. Re-enabling would require a separate approved change to the retired flag and API adapters, followed by fresh deployment validation. Merely restoring the database or changing an environment flag cannot reactivate site APIs.

Validation includes frontend/backend tests, retired-mode build checks, desktop/mobile retirement smoke coverage, and normal site validation. No user passwords or live sessions are used.
