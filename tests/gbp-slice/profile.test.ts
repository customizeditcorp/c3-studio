/**
 * F-066 — T-15 (R-10/R-11) + T-16 support (R-12/R-13) — production + transition.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGbpContext } from '../../src/lib/gbp-slice/context.ts';
import {
  parseGbpJson,
  toGbpProfileRow,
  buildPreviewSnapshot,
  assetStatusForDecision,
  GbpDomainError
} from '../../src/lib/gbp-slice/profile.ts';
import {
  CLIENT,
  REAL_OFFER,
  APPROVED_BRANDBOARD,
  VALID_GBP_JSON
} from './fixtures.ts';

const ctx = readGbpContext({
  client: CLIENT,
  offer: REAL_OFFER,
  brandboard: APPROVED_BRANDBOARD
});

// --- T-15a (R-10): eligible client -> row with all required fields ---
test('T-15a toGbpProfileRow maps all required fields', () => {
  const row = toGbpProfileRow(CLIENT.id, VALID_GBP_JSON, ctx);
  assert.equal(row.client_id, CLIENT.id);
  assert.equal(row.business_name, 'JD Valley Painting');
  assert.ok(row.primary_category && row.description && row.short_description);
  assert.ok(row.services && row.service_area);
  assert.equal(row.phone, CLIENT.phone); // client fallback
});

// --- T-15b (R-11): incomplete generation -> throws BEFORE write ---
test('T-15b missing required fields -> GbpDomainError listing them, no partial row', () => {
  const bad = { business_name: 'X', primary_category: 'Painter' }; // missing several
  assert.throws(
    () => toGbpProfileRow(CLIENT.id, bad, ctx),
    (e: unknown) =>
      e instanceof GbpDomainError &&
      /description/.test(e.message) &&
      /service_area/.test(e.message)
  );
});

test('T-15b malformed model output -> GbpDomainError before write', () => {
  assert.throws(() => parseGbpJson('not json at all'), GbpDomainError);
});

test('parseGbpJson strips code fences', () => {
  const parsed = parseGbpJson('```json\n{"a":1}\n```');
  assert.equal(parsed.a, 1);
});

test('T-15b empty client business_name -> GbpDomainError', () => {
  const ctx2 = readGbpContext({
    client: { ...CLIENT, business_name: '' },
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD
  });
  assert.throws(
    () => toGbpProfileRow(CLIENT.id, VALID_GBP_JSON, ctx2),
    GbpDomainError
  );
});

// --- T-16 (R-12): preview snapshot shape ---
test('T-16 buildPreviewSnapshot carries the GBP content + grounding provenance', () => {
  const row = toGbpProfileRow(CLIENT.id, VALID_GBP_JSON, ctx);
  const snap = buildPreviewSnapshot(row, ctx);
  assert.equal(snap.kind, 'gbp');
  const profile = snap.profile as Record<string, unknown>;
  assert.equal(profile.business_name, 'JD Valley Painting');
  const grounded = snap.grounded_in as Record<string, unknown>;
  assert.equal(grounded.offer_id, REAL_OFFER.id);
  const degr = snap.degradation as Record<string, unknown>;
  assert.equal(degr.logo, 'pending');
  assert.equal(degr.media_empty, true);
});

// --- T-16 (R-13): transition decision ---
test('T-16 assetStatusForDecision: approved->approved, rejected->review', () => {
  assert.equal(assetStatusForDecision(true), 'approved');
  assert.equal(assetStatusForDecision(false), 'review');
});
