/** Offline artifact validation. Both builds are temporary; source config remains disabled. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { COMMUNITY_PATHS, communityHeaders, communityCsp, validateCommunityConfig } from '../assets/js/community-config.mjs';

const root = resolve('.');
const temporary = await mkdtemp(join(tmpdir(), 'dex-community-build-'));
const original = await readFile('data/community.json', 'utf8');
validateCommunityConfig(JSON.parse(original));
const sourceConfig = { enabled: false, googleEnabled: false, allowedOrigin: '', supabaseUrl: '', publishableKey: '' };
const enabled = { enabled: true, googleEnabled: false, allowedOrigin: 'https://community.test', supabaseUrl: 'https://test-project.supabase.co', publishableKey: 'sb_publishable_synthetic_only_1234567890' };
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1]] = match[2] ?? match[3] ?? match[4];
  return result;
}
try {
  for (const [name, config] of [['disabled', sourceConfig], ['enabled', enabled]]) {
    const fixture = join(temporary, name), data = join(fixture, 'data'), staticDir = join(fixture, 'static'), output = join(fixture, 'public');
    await mkdir(fixture); await cp(resolve('data'), data, { recursive: true }); await mkdir(staticDir);
    await writeFile(join(data, 'community.json'), JSON.stringify(config));
    // Same generator used by build:community, written only to this build's overlay.
    await writeFile(join(staticDir, '_headers'), communityHeaders(config));
    await writeFile(join(fixture, 'config.json'), JSON.stringify({ dataDir: data, staticDir: [resolve('static'), staticDir] }));
    execFileSync(process.env.HUGO || 'hugo', ['--environment', 'production', '--minify', '--panicOnWarning', '--config', `${resolve('hugo.toml')},${join(fixture, 'config.json')}`, '--destination', output, '--baseURL', 'https://community.test/'], { cwd: root, stdio: 'pipe' });
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
        assert.match(html, /dex-community-publishable-key/); assert.match(html, /community-real\.[a-f0-9]+\.js/);
        for (const form of html.matchAll(/<form\b[^>]*>/g)) assert.match(form[0], /method=(?:post|"post")/);
      } else {
        assert.doesNotMatch(html, /dex-community-publishable-key|community-real\.[a-f0-9]+\.js/);
        if (path.includes('/auth/')) { assert.match(html, /backend is disabled/); assert.doesNotMatch(html, /<input\b|<form\b/); assert.match(html, /data-disabled-callback=true|data-disabled-callback="true"/); }
      }
    }
    const home = await readFile(join(output, 'index.html'), 'utf8'); assert.doesNotMatch(home, /dex-community-publishable-key|data-community-mode|community-real\.[a-f0-9]+\.js/);
    const sitemap = await readFile(join(output, 'sitemap.xml'), 'utf8'); for (const path of Object.values(COMMUNITY_PATHS)) assert.ok(!sitemap.includes(path), 'Test routes must stay out of the sitemap.');
    process.stdout.write(`${name}: four test routes, CSP/header parity, local scripts, noindex, native form safety and unchanged home verified.\n`);
  }
  assert.equal(await readFile('data/community.json', 'utf8'), original);
} finally { await rm(temporary, { recursive: true, force: true }); }
