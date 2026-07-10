/**
 * F-067 — T-10 (mapGbpError, R-06..R-10) + T-09 logic (derivePrecondition, R-03)
 *          + T-16 (selectLatestGbpProfile, R-15) + offer-non-empty mirror.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  derivePrecondition,
  mapGbpError,
  offerRowNonEmpty,
  selectLatestGbpProfile
} from '../../src/lib/gbp-trigger-state.ts';

// --- R-03: derivePrecondition ------------------------------------------------

test('R-03 both signals present -> enabled, no reason', () => {
  const s = derivePrecondition({
    offerApprovedNonEmpty: true,
    brandboardApproved: true
  });
  assert.equal(s.enabled, true);
  assert.equal(s.reason, null);
});

test('R-03 missing OFV -> disabled with OFV motive (checked first)', () => {
  const s = derivePrecondition({
    offerApprovedNonEmpty: false,
    brandboardApproved: true
  });
  assert.equal(s.enabled, false);
  assert.match(s.reason ?? '', /OFV/);
});

test('R-03 OFV ok but no brandboard -> disabled with brandboard motive', () => {
  const s = derivePrecondition({
    offerApprovedNonEmpty: true,
    brandboardApproved: false
  });
  assert.equal(s.enabled, false);
  assert.match(s.reason ?? '', /brandboard/i);
});

// --- R-03 mirror: offerRowNonEmpty ------------------------------------------

test('offerRowNonEmpty: flat big_promise counts', () => {
  assert.equal(offerRowNonEmpty({ big_promise: 'promesa real' }), true);
});
test('offerRowNonEmpty: content.big_promise counts', () => {
  assert.equal(
    offerRowNonEmpty({ content: { big_promise: 'promesa en jsonb' } }),
    true
  );
});
test('offerRowNonEmpty: empty/whitespace/null -> false', () => {
  assert.equal(offerRowNonEmpty({ big_promise: '   ' }), false);
  assert.equal(offerRowNonEmpty({ big_promise: null, content: null }), false);
  assert.equal(offerRowNonEmpty({}), false);
});

// --- R-06..R-10: mapGbpError -------------------------------------------------

test('R-06 409 blocked -> each reason maps to actionable blocked message', () => {
  const off = mapGbpError({
    status: 409,
    blocked: true,
    reason: 'no_approved_offer'
  });
  assert.equal(off.kind, 'blocked');
  assert.match(off.message, /OFV aprobada/);

  const empty = mapGbpError({
    status: 409,
    blocked: true,
    reason: 'empty_offer'
  });
  assert.equal(empty.kind, 'blocked');
  assert.match(empty.message, /vacía/);

  const bb = mapGbpError({
    status: 409,
    blocked: true,
    reason: 'no_approved_brandboard'
  });
  assert.equal(bb.kind, 'blocked');
  assert.match(bb.message, /brandboard/i);
});

test('R-06 409 blocked with unknown reason -> generic blocked message', () => {
  const r = mapGbpError({ status: 409, blocked: true, reason: 'weird' });
  assert.equal(r.kind, 'blocked');
  assert.match(r.message, /precondiciones/i);
});

test('R-07 422 -> gen', () => {
  const r = mapGbpError({ status: 422 });
  assert.equal(r.kind, 'gen');
  assert.match(r.message, /perfil válido/);
});

test('R-08 503 -> env', () => {
  const r = mapGbpError({ status: 503 });
  assert.equal(r.kind, 'env');
  assert.match(r.message, /IA no está configurado/);
});

test('R-09 401 and 403 -> auth (differentiated messages)', () => {
  const a = mapGbpError({ status: 401 });
  assert.equal(a.kind, 'auth');
  assert.match(a.message, /sesión/);
  const b = mapGbpError({ status: 403 });
  assert.equal(b.kind, 'auth');
  assert.match(b.message, /permiso/);
});

test('R-10 400/404/500/unmapped -> generic including status', () => {
  for (const status of [400, 404, 500, 418]) {
    const r = mapGbpError({ status });
    assert.equal(r.kind, 'generic');
    assert.match(r.message, new RegExp(String(status)));
  }
});

// --- R-15: selectLatestGbpProfile -------------------------------------------

test('R-15 empty/null -> null (no throw)', () => {
  assert.equal(selectLatestGbpProfile([]), null);
  assert.equal(selectLatestGbpProfile(null), null);
  assert.equal(selectLatestGbpProfile(undefined), null);
});

test('R-15 single row -> that row', () => {
  const row = { id: 'a', created_at: '2026-01-01T00:00:00Z' };
  assert.equal(selectLatestGbpProfile([row]), row);
});

test('R-15 ≥2 rows -> most recent by created_at (tolerates duplicates)', () => {
  const older = { id: 'old', created_at: '2026-01-01T00:00:00Z' };
  const newer = { id: 'new', created_at: '2026-07-08T12:00:00Z' };
  assert.equal(selectLatestGbpProfile([older, newer])?.id, 'new');
  assert.equal(selectLatestGbpProfile([newer, older])?.id, 'new');
});
