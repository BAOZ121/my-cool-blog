/** Offline artifact validation. All feature-mode builds are temporary; source config is preserved. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { COMMUNITY_PATHS, communityHeaders, communityCsp, validateCommunityConfig } from '../assets/js/community-config.mjs';

const root = resolve('.');
const temporary = await mkdtemp(join(tmpdir(), 'dex-community-build-'));
const original = await readFile('data/community.json', 'utf8');
validateCommunityConfig(JSON.parse(original));
const sourceConfig = { enabled: false, googleEnabled: false, emailStepupEnabled: false, allowedOrigin: '', supabaseUrl: '', publishableKey: '' };
const enabled = { enabled: true, googleEnabled: false, emailStepupEnabled: false, allowedOrigin: 'https://community.test', supabaseUrl: 'https://test-project.supabase.co', publishableKey: 'sb_publishable_synthetic_only_1234567890' };
const secretSentinels = ['SYNTHETIC_BUILD_HMAC_SENTINEL_DO_NOT_SERIALIZE', 'SYNTHETIC_BUILD_MAIL_SENTINEL_DO_NOT_SERIALIZE'];
const buildEnv = { ...process.env, ADMIN_STEPUP_HMAC_KEY: secretSentinels[0], ADMIN_STEPUP_RESEND_KEY: secretSentinels[1] };
let referenceHome;
async function checkNoSecrets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await checkNoSecrets(path);
    else if (/\.(?:html|js|json|map|css)$/.test(entry.name) || entry.name === '_headers') {
      const text = await readFile(path, 'utf8');
      for (const sentinel of secretSentinels) assert.ok(!text.includes(sentinel), 'A server-secret environment value reached a public artifact.');
    }
  }
}
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1]] = match[2] ?? match[3] ?? match[4];
  return result;
}
try {
  // Use the normal self-hosted bundle pipeline under synthetic server-secret
  // environment values, then prove those values never enter public artifacts.
  execFileSync(process.execPath, ['scripts/build-community.mjs'], { cwd: root, env: buildEnv, stdio: 'pipe' });
  for (const [name, config] of [['disabled', sourceConfig], ['totp-enabled', enabled], ['email-enabled', { ...enabled, emailStepupEnabled: true }]]) {
    const fixture = join(temporary, name), data = join(fixture, 'data'), staticDir = join(fixture, 'static'), output = join(fixture, 'public');
    await mkdir(fixture); await cp(resolve('data'), data, { recursive: true }); await mkdir(staticDir);
    await writeFile(join(data, 'community.json'), JSON.stringify(config));
    // Same generator used by build:community, written only to this build's overlay.
    await writeFile(join(staticDir, '_headers'), communityHeaders(config));
    await writeFile(join(fixture, 'config.json'), JSON.stringify({ dataDir: data, staticDir: [resolve('static'), staticDir] }));
    execFileSync(process.env.HUGO || 'hugo', ['--environment', 'production', '--minify', '--panicOnWarning', '--config', `${resolve('hugo.toml')},${join(fixture, 'config.json')}`, '--destination', output, '--baseURL', 'https://community.test/'], { cwd: root, env: buildEnv, stdio: 'pipe' });
    const headers = await readFile(join(output, '_headers'), 'utf8');
    assert.equal(headers, communityHeaders(config), 'Generated HTTP CSP must agree with the active data config.');
    for (const path of Object.values(COMMUNITY_PATHS)) {
      const html = await readFile(join(output, path, 'index.html'), 'utf8');
      const cspTag = [...html.matchAll(/<meta\b[^>]*>/g)].map(match => attributes(match[0])).find(attrs => attrs['http-equiv'] === 'Content-Security-Policy');
      const decode = text => text.replaceAll('&#39;', "'").replaceAll('&#34;', '"').replaceAll('&amp;', '&');
      assert.equal(decode(cspTag?.content || ''), communityCsp(config));
      assert.match(html, /noindex, ?nofollow/);
      assert.equal([...html.matchAll(/<meta\b[^>]*>/g)].map(match => attributes(match[0])).find(attrs => attrs.name === 'referrer')?.content, 'no-referrer');
      assert.doesNotMatch(html, /<style\b|\son(?:click|load|change|submit)=|unsafe-inline|unsafe-eval|fonts\.google/);
      for (const script of html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)) {
        const attrs = attributes(script[0]); assert.ok(attrs.src?.startsWith('/'), 'All executable scripts must be same-origin external assets.');
        assert.doesNotMatch(script[0].replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''), /\S/);
      }
      if (config.enabled) {
        assert.match(html, /data-community-mode=/); assert.doesNotMatch(html, /dex-onsite-forum|Enter member demo|Enter moderator demo/);
        assert.match(html, /dex-community-publishable-key/);
        const emailMeta = [...html.matchAll(/<meta\b[^>]*>/g)].map(match => attributes(match[0])).find(attrs => attrs.name === 'dex-community-email-stepup');
        assert.equal(emailMeta?.content, String(config.emailStepupEnabled), 'Template email-mode flag must exactly match validated public config.');
        assert.match(html, /community-real\.[a-f0-9]+\.js/);
        for (const form of html.matchAll(/<form\b[^>]*>/g)) assert.match(form[0], /method=(?:post|"post")/);
      } else {
        assert.doesNotMatch(html, /dex-community-email-stepup|dex-community-publishable-key|community-real\.[a-f0-9]+\.js/);
        if (path.includes('/auth/')) { assert.match(html, /backend is disabled/); assert.doesNotMatch(html, /<input\b|<form\b/); assert.match(html, /data-disabled-callback=true|data-disabled-callback="true"/); }
      }
    }
    const home = await readFile(join(output, 'index.html'), 'utf8'); assert.doesNotMatch(home, /dex-community-publishable-key|data-community-mode|community-real\.[a-f0-9]+\.js/);
    if (referenceHome === undefined) referenceHome = home; else assert.equal(home, referenceHome, 'Feature flags must not alter home or its navigation.');
    await checkNoSecrets(output);
    const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8'); for (const path of Object.values(COMMUNITY_PATHS)) assert.ok(!sitemap.includes(path), 'Test routes must stay out of the sitemap.');
    process.stdout.write(`${name}: four test routes, CSP/header parity, local scripts, noindex, native form safety secret exclusion, email-mode flag parity and unchanged home/navigation verified.\n`);
  }
  assert.equal(await readFile('data/community.json', 'utf8'), original);
} finally { await rm(temporary, { recursive: true, force: true }); }
