/**
 * F-066 — T-09 (R-03) + T-10 (R-04) + T-11 (R-05) + T-12 (R-06) — context reader.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOffer,
  resolveLogo,
  resolveMedia,
  readGbpContext
} from '../../src/lib/gbp-slice/context.ts';
import {
  CLIENT,
  REAL_OFFER,
  APPROVED_BRANDBOARD,
  PHOTO_MARKED_LOGO,
  PHOTO_EXTERIOR
} from './fixtures.ts';

// --- T-09 (R-03): OFV content is consumed, flat cols + content merged ---
test('T-09 normalizeOffer merges flat columns and content jsonb', () => {
  const n = normalizeOffer(REAL_OFFER);
  assert.match(n.big_promise, /ColorBoost/);
  assert.ok(n.quick_win && n.quick_win.length > 0);
  assert.ok(n.guarantee && n.guarantee.length > 0);
  // deliverables/social_proof live only in flat columns on the pilot
  assert.equal(n.deliverables.length, 4);
  assert.equal(n.social_proof.length, 2);
  // urgency picked up from content.urgency_scarcity fallback
  assert.match(String(n.urgency), /5 espacios/);
});

// --- T-10 (R-04): brandboard tone consumed, not re-decided ---
test('T-10 context carries brandboard tone_voice verbatim (execution guideline)', () => {
  const ctx = readGbpContext({
    client: CLIENT,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD
  });
  assert.equal(
    ctx.brandboard.tone_voice.tone,
    APPROVED_BRANDBOARD.tone_voice!.tone
  );
  assert.equal(
    ctx.brandboard.tone_voice.donts,
    APPROVED_BRANDBOARD.tone_voice!.donts
  );
});

// --- T-11 (R-05): logo residence canonical; NULL degrades; is_logo not used ---
test('T-11a logo_url present -> used as logo', () => {
  const res = resolveLogo({
    ...APPROVED_BRANDBOARD,
    logo_url: 'https://x/logo.png'
  });
  assert.equal(res.status, 'present');
  assert.equal(res.logo_url, 'https://x/logo.png');
});

test('T-11b logo_url NULL -> degrade to pending, never uses client_photos.is_logo', () => {
  const res = resolveLogo(APPROVED_BRANDBOARD); // logo_url null on pilot
  assert.equal(res.status, 'pending');
  assert.equal(res.logo_url, null);
  // even with a photo flagged is_logo present, the context logo stays pending
  const ctx = readGbpContext({
    client: CLIENT,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    photos: [PHOTO_MARKED_LOGO]
  });
  assert.equal(ctx.logo.status, 'pending');
  assert.equal(ctx.logo.logo_url, null);
});

// --- T-12 (R-06): media optional; empty degrades; present consumed by category ---
test('T-12a empty media library -> degraded, generation still proceeds', () => {
  const m = resolveMedia([]);
  assert.equal(m.count, 0);
  assert.equal(m.degraded, true);
});

test('T-12b present approved photos consumed grouped by gbp_category', () => {
  const m = resolveMedia([PHOTO_MARKED_LOGO, PHOTO_EXTERIOR]);
  assert.equal(m.count, 2);
  assert.equal(m.degraded, false);
  assert.ok(m.byCategory.logo && m.byCategory.exterior);
});

test('T-12c unapproved photos are not consumed', () => {
  const m = resolveMedia([{ ...PHOTO_EXTERIOR, approved: false }]);
  assert.equal(m.count, 0);
  assert.equal(m.degraded, true);
});
