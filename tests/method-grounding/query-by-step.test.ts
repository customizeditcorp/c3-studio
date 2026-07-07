/**
 * F-065 method grounding — query-by-step map (T-V02) + no client signals (T-V15).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUERY_BY_STEP } from '../../src/lib/method-grounding/query-by-step.ts';

const ELEVEN_STEPS = [
  'ofv',
  'buyer_persona',
  'brief',
  'gbp_description',
  'campaign_copy',
  'gbp_posts',
  'social_content',
  'nurturing',
  'website_home',
  'website_service',
  'website_location'
];

// --- T-V02: completeness of the map ---
test('T-V02 QUERY_BY_STEP has a non-empty query for all 11 steps', () => {
  const keys = Object.keys(QUERY_BY_STEP).sort();
  assert.deepEqual(keys, [...ELEVEN_STEPS].sort());
  for (const step of ELEVEN_STEPS) {
    const q = (QUERY_BY_STEP as Record<string, string>)[step];
    assert.equal(typeof q, 'string', `${step} query not a string`);
    assert.ok(q.trim().length > 0, `${step} query is empty`);
  }
});

// --- T-V15: no client/industry/brief tokens in the queries ---
test('T-V15 queries carry no client/industry adaptive signals', () => {
  const forbidden = [
    'industria',
    'industry',
    'client_id',
    'business_name',
    '${',
    'brief.',
    'persona.'
  ];
  for (const step of ELEVEN_STEPS) {
    const q = (QUERY_BY_STEP as Record<string, string>)[step].toLowerCase();
    for (const tok of forbidden) {
      assert.equal(
        q.includes(tok.toLowerCase()),
        false,
        `${step} query contains forbidden token "${tok}"`
      );
    }
  }
});
