/**
 * F-067 — T-08 (R-01) — generateGbp discriminated result preserves
 * status + blocked + reason + error across the route's response codes.
 *
 * Uses a mocked global fetch. NEVER hits the real route/OpenAI (CL-030 part 2 is
 * a separate gated step, out of F-067 scope).
 */
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateGbp } from '../../src/lib/edge-functions.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  })) as unknown as typeof fetch;
}

test('T-08 200 success -> ok:true with data (profile+preview+url)', async () => {
  const body = {
    success: true,
    gbp_profile: { id: 'gp_1' },
    preview: { id: 'pv_1', token: 'tok_1', url: '/preview/tok_1' },
    asset_status: 'review',
    method_grounding: { applied: true, reason: null }
  };
  mockFetch(200, body);
  const r = await generateGbp('client_1');
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.data.gbp_profile.id, 'gp_1');
  assert.equal(r.ok === true && r.data.preview.url, '/preview/tok_1');
});

test('T-08 409 blocked -> ok:false, preserves status+blocked+reason+error', async () => {
  mockFetch(409, {
    success: false,
    blocked: true,
    reason: 'no_approved_brandboard',
    error: 'Precondición incumplida'
  });
  const r = await generateGbp('client_1');
  assert.equal(r.ok, false);
  if (r.ok === false) {
    assert.equal(r.status, 409);
    assert.equal(r.blocked, true);
    assert.equal(r.reason, 'no_approved_brandboard');
    assert.equal(r.message, 'Precondición incumplida');
  }
});

test('T-08 422/503/401/403/400 -> ok:false, status preserved, blocked false', async () => {
  for (const status of [422, 503, 401, 403, 400]) {
    mockFetch(status, { error: `err ${status}` });
    const r = await generateGbp('client_1');
    assert.equal(r.ok, false);
    if (r.ok === false) {
      assert.equal(r.status, status);
      assert.equal(r.blocked, false);
      assert.equal(r.reason, null);
      assert.equal(r.message, `err ${status}`);
    }
  }
});

test('T-08 non-2xx with unparseable body -> ok:false with fallback message', async () => {
  globalThis.fetch = (async () => ({
    ok: false,
    status: 500,
    json: async () => {
      throw new Error('not json');
    }
  })) as unknown as typeof fetch;
  const r = await generateGbp('client_1');
  assert.equal(r.ok, false);
  if (r.ok === false) {
    assert.equal(r.status, 500);
    assert.equal(r.blocked, false);
    assert.equal(r.message, 'Error 500');
  }
});
