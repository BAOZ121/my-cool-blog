import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { validateCommunityConfig, communityHeaders } from '../assets/js/community-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const config = validateCommunityConfig(JSON.parse(await readFile(resolve(root, 'data/community.json'), 'utf8')));
const sdk = JSON.parse(await readFile(resolve(root, 'backend/node_modules/@supabase/supabase-js/package.json'), 'utf8'));
if (sdk.version !== '2.117.3') throw new Error('Install the pinned backend lockfile before bundling community Auth.');
const outdir = resolve(root, 'assets/js/generated');
await mkdir(outdir, { recursive: true });
await build({ absWorkingDir: root, entryPoints: ['assets/js/community-entry.mjs'], outfile: resolve(outdir, 'community-real.js'),
  nodePaths: [resolve(root, 'backend/node_modules')], bundle: true, platform: 'browser', format: 'esm', target: ['es2022'],
  minify: true, sourcemap: false, legalComments: 'eof', metafile: true,
}).then(async result => {
  // Dependency paths/byte counts only. No runtime configuration or session data.
  await writeFile(resolve(outdir, 'community-real.meta.json'), JSON.stringify(result.metafile, null, 2) + '\n');
});
await writeFile(resolve(root, 'static/_headers'), communityHeaders(config));
process.stdout.write('Community bundle and exact test-route headers generated. Real mode remains controlled by data/community.json.\n');
