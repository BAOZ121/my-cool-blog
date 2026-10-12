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

test('all four Pages entrypoints bundle the shared handler as browser-compatible ESM', async () => {
  for (const entry of entrypoints) {
    const { module, source, metadata } = await bundledAdapter(entry, async () => { throw new Error('Unexpected network'); });
    assert.deepEqual(Object.keys(module), ['onRequest']);
    assert.equal(typeof module.onRequest, 'function');
    assert.deepEqual(Object.keys(metadata.inputs).sort(), ['backend/api/handler.mjs', entry].sort());
    assert.ok(!source.includes('node:'));
    assert.ok(!source.includes('process.env'));
    assert.ok(!source.includes('SUPABASE_SECRET_KEY'));
    assert.ok(!source.includes('SUPABASE_SERVICE_ROLE_KEY'));
  }
});

test('real Pages adapters remain closed with absent, partial or false configuration', async () => {
  let calls = 0;
  for (const entry of entrypoints) {
    const { module } = await bundledAdapter(entry, async () => { calls += 1; throw new Error('Network forbidden'); });
    for (const env of [undefined, {}, { ...ENV, COMMUNITY_BACKEND_ENABLED: 'false' },
      { COMMUNITY_BACKEND_ENABLED: 'true' }]) {
      const request = new Request(`${ORIGIN}/api/community/topics`);
      const result = await module.onRequest({ request, env, next: () => { throw new Error('No static fallthrough'); } });
      assert.equal(result.status, 503);
      assert.equal((await result.json()).error.code, 'backend_disabled');
      assert.equal(result.headers.get('Cache-Control'), 'no-store');
      assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
    }
  }
  assert.equal(calls, 0);
});

test('exact namespace base and unknown routes yield guarded JSON without static fallback', async () => {
  let calls = 0;
  for (const [entry, paths] of [
    ['functions/api/community/index.js', ['/api/community', '/api/community/']],
    ['functions/api/admin/index.js', ['/api/admin', '/api/admin/']],
    ['functions/api/community/[[path]].js', ['/api/community/unknown', '/api/community/topics/invalid-uuid']],
    ['functions/api/admin/[[path]].js', ['/api/admin/unknown', '/api/admin/auth/register']],
  ]) {
    const { module } = await bundledAdapter(entry, async () => { calls += 1; throw new Error('Network forbidden'); });
    for (const path of paths) {
      const result = await module.onRequest({ request: new Request(`${ORIGIN}${path}`), env: ENV,
        next: () => { throw new Error('No static fallthrough'); } });
      assert.equal(result.status, path.endsWith('invalid-uuid') ? 400 : 404);
      assert.match(result.headers.get('Content-Type'), /^application\/json/);
    }
  }
  assert.equal(calls, 0);
});

test('adapter preserves configured origins, method allowlist and protected-route checks', async () => {
  let calls = 0;
  const { module } = await bundledAdapter('functions/api/admin/[[path]].js', async () => {
    calls += 1; throw new Error('Network forbidden');
  });
  const cases = [
    [new Request(`${ORIGIN}/api/admin/session`), 401],
    [new Request(`${ORIGIN}/api/admin/session`, { headers: { Origin: 'https://evil.example' } }), 403],
    [new Request(`${ORIGIN}/api/admin/session`, { method: 'DELETE' }), 405],
    [new Request(`${ORIGIN}/api/admin/posts/22222222-2222-4222-8222-222222222222/hide`, { method: 'POST' }), 403],
  ];
  for (const [request, status] of cases) assert.equal((await module.onRequest({ request, env: ENV })).status, status);
  assert.equal(calls, 0);
});

test('adapter forwards public reads only to controlled Supabase origin without caller credentials', async () => {
  const calls = [];
  const { module } = await bundledAdapter('functions/api/community/[[path]].js', async (url, init) => {
    calls.push({ url: new URL(url), init });
    return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
  });
  const response = await module.onRequest({ request: new Request(`${ORIGIN}/api/community/topics`, {
    headers: { Authorization: 'Bearer not-a-real-user-token', Cookie: 'private=do-not-forward' },
  }), env: ENV });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, ENV.SUPABASE_URL);
  assert.equal(calls[0].url.pathname, '/rest/v1/community_posts');
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.headers.Cookie, undefined);
  assert.equal(calls[0].init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(calls[0].init.redirect, 'manual');
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
