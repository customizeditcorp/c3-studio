/**
 * F-066 — T-18 (R-14) — scope-out guardrail.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  assertGbpScope,
  SLICE_ASSET_TYPE,
  GbpDomainError
} from '../../src/lib/gbp-slice/profile.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SLICE_DIR = join(HERE, '../../src/lib/gbp-slice');

test('R-14 slice only touches asset_type=gbp', () => {
  assert.equal(SLICE_ASSET_TYPE, 'gbp');
  assert.doesNotThrow(() => assertGbpScope('gbp'));
  for (const other of ['website', 'seo', 'geo', 'social']) {
    assert.throws(() => assertGbpScope(other), GbpDomainError);
  }
});

test('R-14 slice lib contains no external-system publish/mutation code', () => {
  const forbidden = [
    'api.anthropic.com',
    'googleapis.com',
    'brightlocal',
    'gohighlevel',
    'ghl',
    'vercel',
    'deploy',
    'publish('
  ];
  const files = readdirSync(SLICE_DIR).filter((f) => f.endsWith('.ts'));
  for (const f of files) {
    const src = readFileSync(join(SLICE_DIR, f), 'utf8').toLowerCase();
    for (const needle of forbidden) {
      assert.ok(
        !src.includes(needle),
        `slice lib file ${f} must not reference external system "${needle}" (R-14)`
      );
    }
  }
});
