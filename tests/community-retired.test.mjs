import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCommunityConfig, communityCsp } from '../assets/js/community-config.mjs';

test('production community is retired and cannot initialize hosted auth', () => {
  const config = JSON.parse(readFileSync(new URL('../data/community.json', import.meta.url)));
  assert.equal(config.retired, true);
  assert.equal(config.enabled, false);
  assert.equal(validateCommunityConfig({ ...config, enabled: true }).enabled, false);
  assert.doesNotMatch(communityCsp({ ...config, enabled: true }), /supabase/);
});
