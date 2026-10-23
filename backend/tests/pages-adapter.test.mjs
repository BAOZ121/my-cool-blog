import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));
const entrypoints = [
  'functions/api/community/[[path]].js',
  'functions/api/community/index.js',
  'functions/api/admin/[[path]].js',
  'functions/api/admin/index.js',
];
const ORIGIN = 'https://community.example.com';
const ENV = {
  COMMUNITY_BACKEND_ENABLED: 'true',
  COMMUNITY_ALLOWED_ORIGIN: ORIGIN,
  SUPABASE_URL: 'https://localtestfixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture_not_a_real_key',
};
let sequence = 0;

async function bundledAdapter(entry, fetchImpl) {
  // The already-pinned root esbuild dependency verifies browser-compatible bundling.
  // No installed Supabase SDK, Node-only module, credentials or environment value
  // belongs in the Pages server bundle.
  const output = await build({
    absWorkingDir: root, entryPoints: [entry], bundle: true, write: false,
    platform: 'browser', format: 'esm', target: 'es2022', metafile: true,
  });
  const source = `${output.outputFiles[0].text}\n// isolated adapter test ${++sequence}`;
  const previous = globalThis.fetch;
  try {
    globalThis.fetch = fetchImpl;
    const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    return { module, source, metadata: output.metafile };
  } finally { globalThis.fetch = previous; }
}

test('retired adapters bundle independently without backend or SDK dependencies', async () => {
  for (const entry of entrypoints) {
    const { module, source, metadata } = await bundledAdapter(entry, () => { throw new Error('Network forbidden'); });
    assert.deepEqual(Object.keys(module), ['onRequest']);
    assert.deepEqual(Object.keys(metadata.inputs), [entry]);
    assert.doesNotMatch(source, /node:|process\.env|SUPABASE|createCommunity|fetch\(/);
  }
});

test('all retired API namespaces return 410 for every method and configuration without side effects', async () => {
  let fetches = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { fetches++; throw new Error('Network forbidden'); };
  try {
  for (const entry of entrypoints) {
    const { module } = await bundledAdapter(entry, () => { fetches++; throw new Error('Network forbidden'); });
    for (const env of [undefined, {}, ENV, { ...ENV, COMMUNITY_BACKEND_ENABLED: 'false' }]) {
      for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
        for (const path of ['/api/community', '/api/community/', '/api/community/topics', '/api/community/unknown', '/api/admin', '/api/admin/', '/api/admin/session', '/api/admin/stepup/request', '/api/admin/stepup/verify', '/api/admin/stepup/cancel']) {
          const response = await module.onRequest({ env, request: new Request(`${ORIGIN}${path}`, { method }), next() { throw new Error('No static fallback'); } });
          assert.equal(response.status, 410);
          assert.equal((await response.json()).error.code, 'COMMUNITY_RETIRED');
          assert.equal(response.headers.get('Cache-Control'), 'no-store');
          assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
          assert.match(response.headers.get('Content-Type'), /^application\/json/);
          assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
        }
      }
    }
    const inaccessible = new Proxy({}, { get() { throw new Error('Retired adapter must not inspect context, credentials, requests or env'); } });
    assert.equal((await module.onRequest(inaccessible)).status, 410);
    assert.equal((await module.onRequest()).status, 410);
  }
  assert.equal(fetches, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test('Hugo invocation manifest includes only exact API namespaces and leaves site assets static', async () => {
  const routes = JSON.parse(await readFile(`${root}static/_routes.json`, 'utf8'));
  assert.deepEqual(routes, {
    version: 1,
    include: ['/api/community', '/api/community/*', '/api/admin', '/api/admin/*'],
    exclude: [],
  });
  const matches = (path) => routes.include.some((rule) => rule.endsWith('*') ? path.startsWith(rule.slice(0, -1)) : path === rule);
  for (const path of ['/api/community', '/api/community/', '/api/community/topics', '/api/admin',
    '/api/admin/', '/api/admin/posts/a/history']) assert.equal(matches(path), true);
  for (const path of ['/', '/post/article/', '/assets/app.js', '/test/forum-v1/', '/test/forum-admin-v1/',
    '/api/communityish/topics', '/api/administrator/session', '/api/contact']) assert.equal(matches(path), false);
  const deployedFiles = [];
  for (const directory of ['community', 'admin']) {
    const names = await readdir(`${root}functions/api/${directory}`);
    deployedFiles.push(...names.map((name) => `functions/api/${directory}/${name}`));
  }
  assert.deepEqual(deployedFiles.sort(), [...entrypoints].sort());
});
