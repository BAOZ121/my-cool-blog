# Disposable PostgreSQL 17.11 concurrency fixture

**Seven real two-connection scenarios passed (8 tests including the suite, 0 failures, 0 skips)** in the separately authorized [GitHub Actions run 38340448793](https://github.com/BAOZ121/my-cool-blog/actions/runs/38340448793), commit `174450f5b73abb5f730310bd9d3a170ce2a99c0a`, on PostgreSQL 17.11. EVIDENCE.json records exact source/image hashes. The original restricted cloud environment rejected Unix-socket creation, including one formally escalated retry; the successful run used an independently approved Actions environment.

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

These seven assertions passed using genuine separate PostgreSQL backend connections and observed lock waits. This remains synthetic database evidence, not proof of hosted Auth/mail/browser behavior. Original foundation races outside these seven scenarios also remain separate coverage.

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

This optional Compose path is **unrun**. PostgreSQL is pinned to the official `postgres:17.11` digest `sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3`, verified by the separately approved Actions image pull. Node still uses `node:22-bookworm-slim`; its immutable digest has not been verified. Resolve/review that digest before relying on full image reproducibility. The image-default `/var/run/postgresql` socket is shared into the test container at its fixed `/tmp/dex-pg-test/socket` path, with PGPORT=55439 for initialization and final service. No host ports are published; PostgreSQL has networking disabled and communicates only through a shared fixture socket volume. Data lives in tmpfs. The test container needs npm registry access to install pinned dependencies. `down -v` removes only this Compose project's synthetic socket volume. Do not reuse its project name for an unrelated stack.

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


## First external runner observation

The separately authorized GitHub Actions run `38339840691` pulled the official PG17.11 image, then its database container exited before readiness; SQL/race tests did not start. Automatic container removal lost the failure log. Source review identified a likely custom-socket initialization mismatch: the official entrypoint clears PGHOST for its internal psql, so a custom-only socket path omits the image-default socket. The optional Compose file now uses the image-default socket internally and maps it to the fixed test path externally. The original missing log prevents proving its exact failure cause. The corrected image-default socket mapping was subsequently verified by successful run 38340448793, without changing the SQL migration or race assertions. The optional Compose wrapper itself has not been run.


## Hosted migration filename reconciliation

The successful historical Actions commit used `20261013024643_community_admin_email_stepup.sql`. After the separately approved hosted apply, Supabase returned authoritative version `20261013031903`; deployable local files and newly generated packages use `20261013031903_community_admin_email_stepup.sql`. Both names refer to identical SQL hash `2eb48221bc5f7d4e304680ea68870137db186e5d68856e0cb0e208dc9d5eb751`. The historical Actions package is not rewritten or replayed; its filename/hash remains recorded in EVIDENCE.json. Do not put both filenames in a migrations directory.
