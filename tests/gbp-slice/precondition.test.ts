/**
 * F-066 — T-07 (R-01) + T-08 (R-02) — precondition guard.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkPrecondition,
  selectEligibleOffer,
  isOfferNonEmpty
} from '../../src/lib/gbp-slice/precondition.ts';
import {
  EMPTY_OFFER,
  REAL_OFFER,
  DRAFT_OFFER,
  APPROVED_BRANDBOARD,
  DRAFT_BRANDBOARD
} from './fixtures.ts';

// --- T-07a: missing approved offer -> block ---
test('T-07a no approved offer -> blocked reason no_approved_offer', () => {
  const r = checkPrecondition({
    offers: [DRAFT_OFFER],
    brandboards: [APPROVED_BRANDBOARD]
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'no_approved_offer');
});

// --- T-07a: missing approved brandboard -> block ---
test('T-07a approved offer but no approved brandboard -> blocked', () => {
  const r = checkPrecondition({
    offers: [REAL_OFFER],
    brandboards: [DRAFT_BRANDBOARD]
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'no_approved_brandboard');
});

// --- T-07b: eligible (real OFV + approved brandboard) -> proceed ---
test('T-07b real approved OFV + approved brandboard -> ok, selects real offer', () => {
  const r = checkPrecondition({
    offers: [EMPTY_OFFER, REAL_OFFER], // empty first, must skip it
    brandboards: [APPROVED_BRANDBOARD]
  });
  assert.equal(r.ok, true);
  assert.equal(r.ok === true && r.offer.id, REAL_OFFER.id);
});

// --- T-07c: approved but EMPTY OFV -> block (CL-027, R-01 reinforced) ---
test('T-07c approved but empty OFV (big_promise empty) -> blocked reason empty_offer', () => {
  const r = checkPrecondition({
    offers: [EMPTY_OFFER],
    brandboards: [APPROVED_BRANDBOARD]
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, 'empty_offer');
});

test('isOfferNonEmpty: empty offer false, real offer true (flat or content)', () => {
  assert.equal(isOfferNonEmpty(EMPTY_OFFER), false);
  assert.equal(isOfferNonEmpty(REAL_OFFER), true);
  // content-only big_promise also counts
  assert.equal(
    isOfferNonEmpty({
      id: 'x',
      client_id: 'c',
      status: 'approved',
      content: { big_promise: 'algo real' }
    }),
    true
  );
});

// --- T-08: R-02 — a draft OFV is never selected/consumed ---
test('T-08 draft OFV is not eligible (no regeneration/consumption of drafts)', () => {
  assert.equal(selectEligibleOffer([DRAFT_OFFER]), null);
  const r = checkPrecondition({
    offers: [DRAFT_OFFER],
    brandboards: [APPROVED_BRANDBOARD]
  });
  assert.equal(r.ok, false);
});
