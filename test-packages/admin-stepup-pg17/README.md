# Disposable PostgreSQL 17.11 concurrency fixture

**Prepared, not executed successfully.** The restricted cloud environment rejected Unix-socket creation with `Operation not permitted`, including one formally escalated retry. PGlite tests passed separately, but they do not establish multi-connection correctness. This package needs a supported environment where the user is allowed to run a local test database.

No Supabase project, public API key, production database URL, real email, password or service credential is needed. Auth and Vault are synthetic test-only interfaces. Do not run the fixture against any existing application database. The runner does not accept a connection URL or external host: it uses only `/tmp/dex-pg-test/socket`, port 55439, database `postgres`, role `agent`, requires version 17.11, `listen_addresses=''`, and the exact data directory `/tmp/dex-pg-test/data`.

It creates one random `dex_stepup_races_<UUID>` database, applies the included migrations and fixtures, opens separate PostgreSQL backend connections and waits for observable lock contention. Cleanup drops only the database this test itself created. Cluster-scoped synthetic roles remain until the disposable cluster is removed. Do not reuse a production cluster.

## Contents and cases

Pinned `pg@8.16.3` package/lock, three migration copies, test-only Auth/Vault/auto-RLS fixtures, disable script, race runner and optional Compose file. No real configuration or secret. MANIFEST.json records exact file hashes when packaged.

Seven scenarios:

1. Cancel commits before blocked mutation: consumed grant denied.
2. Mutation commits before cancellation: already_used, no undo.
3. Cancel precedes verification: no new grant.
4. Verify precedes cancellation: new grant revoked.
5. Duplicate same-operation pending proof cannot recreate revoked permission.
6. Begin versus verify: admission/challenge locks do not form a deadlock.
7. Disable waits for an in-flight admin transaction; later email access is denied.

These assertions are unrun here; passing them elsewhere is still synthetic database evidence, not proof of hosted Auth/mail/browser behavior.

## Option A: existing PostgreSQL 17.11 + Node 22 on a permitted Linux environment

Use only a new disposable directory. If `/tmp/dex-pg-test/data` already exists, stop and identify it; do not overwrite an unknown database.

```sh
mkdir -p /tmp/dex-pg-test/socket
chmod 700 /tmp/dex-pg-test /tmp/dex-pg-test/socket
initdb -D /tmp/dex-pg-test/data -U agent --no-locale --encoding=UTF8 --auth-local=trust --auth-host=reject
pg_ctl -D /tmp/dex-pg-test/data -l /tmp/dex-pg-test/server.log \
  -o "-c listen_addresses='' -c unix_socket_directories='/tmp/dex-pg-test/socket' -c port=55439" -w start
npm ci --ignore-scripts
DEX_RUN_LOCAL_POSTGRES_RACES=true npm test
pg_ctl -D /tmp/dex-pg-test/data -m fast -w stop
```

The standalone package's `npm test` runs only this race fixture. From the original repository use `DEX_RUN_LOCAL_POSTGRES_RACES=true npm run test:postgres --prefix backend/supabase`. Stop the cluster even if tests fail. Remove only the synthetic data directory you just created after preserving test output. Local trust authentication is limited to this private test socket; it is not a production configuration.

## Option B: Docker Desktop already available (including Windows)

Do not install Docker or accept licensing/permissions without the user's decision. If the user already has an authorized working Docker environment, from the standalone package directory:

```sh
docker compose -f tests/postgres/compose.yaml up --abort-on-container-exit --exit-code-from tests
docker compose -f tests/postgres/compose.yaml down -v
```

This optional Compose path is **unrun**, including image pulls. It names official version tags `postgres:17.11` and `node:22-bookworm-slim`; immutable image digests have not been verified and are not invented here. Resolve/review digests before relying on reproducibility. No host ports are published; PostgreSQL has networking disabled and communicates only through a shared fixture socket volume. Data lives in tmpfs. The test container needs npm registry access to install pinned dependencies. `down -v` removes only this Compose project's synthetic socket volume. Do not reuse its project name for an unrelated stack.

## Packaging from the repository

```sh
node backend/supabase/tests/postgres/package.mjs /tmp/dex-postgres-race-package
```

The packaging script copies an explicit allowlist and writes hashes. It does not install, start, connect to or alter any database. Inspect MANIFEST.json and the files before running elsewhere. Do not copy node_modules, .env, CLI login state or real credentials into the package.

## Recorded restricted-environment attempt

Official Debian snapshot package version: `17.11-0+deb13u1`, extracted without system installation under `/tmp/dex-pg-root`. Startup environment/call:

```sh
export LD_LIBRARY_PATH=/tmp/dex-pg-root/usr/lib/x86_64-linux-gnu
/tmp/dex-pg-root/usr/lib/postgresql/17/bin/pg_ctl \
  -D /tmp/dex-pg-test/data -l /tmp/dex-pg-test/server.log \
  -o "-c listen_addresses='' -c unix_socket_directories='/tmp/dex-pg-test/socket' -c port=55439" -w start
```

Both normal and formally escalated attempts reported:

```text
could not create Unix socket for address "/tmp/dex-pg-test/socket/.s.PGSQL.55439": Operation not permitted
FATAL: could not create any Unix-domain sockets
LOG: database system is shut down
```

No further startup attempts, different socket paths or TCP fallbacks were made. A subsequent `pg_ctl status` reported no server running.
