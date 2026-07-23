/**
 * F-078 — T-18 — computeReadiness engine unit suite (R-06..R-14).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReadiness,
  type ReadinessLegalInput,
  type ReadinessPresenceInput
} from '../../src/lib/gbp-slice/readiness.ts';

const PASS_LEGAL: ReadinessLegalInput = {
  sos_status: 'active',
  cslb_active: true,
  cslb_name_match: true,
  legal_name_verified: true
};

const PASS_PRESENCE: ReadinessPresenceInput = {
  nap_risk: 'consistent',
  nap_consistent: true,
  gbp_exists: true,
  gbp_duplicate: false
};

// --- R-06, R-09: 4 signals present + all pass -> elegible ---
test('T-18 four signals present and passing -> elegible', () => {
  const r = computeReadiness({ legal: PASS_LEGAL, presence: PASS_PRESENCE });
  assert.equal(r.verdict, 'elegible');
  assert.deepEqual(r.blockers, []);
  assert.equal(r.conflicts.length, 0);
});

// --- R-07, R-08: legal inherited per-client, presence per-location ---
test('T-18 same legal inherited to 2 locations with different presence -> different verdicts', () => {
  const locA = computeReadiness({
    legal: PASS_LEGAL,
    presence: PASS_PRESENCE // consistent
  });
  const locB = computeReadiness({
    legal: PASS_LEGAL, // same client-legal, inherited
    presence: {
      nap_risk: 'inconsistent',
      nap_consistent: false,
      gbp_exists: true,
      gbp_duplicate: false
    }
  });
  assert.equal(locA.verdict, 'elegible');
  assert.equal(locB.verdict, 'bloqueado');
  assert.notEqual(locA.verdict, locB.verdict);
  assert.ok(locB.blockers.includes('nap_inconsistent'));
});

// --- R-10: each blocker isolated -> its enum + bloqueado ---
test('T-18 sos suspended -> sos_inactive + bloqueado', () => {
  const r = computeReadiness({
    legal: { ...PASS_LEGAL, sos_status: 'suspended' },
    presence: PASS_PRESENCE
  });
  assert.equal(r.verdict, 'bloqueado');
  assert.deepEqual(r.blockers, ['sos_inactive']);
});

test('T-18 cslb inactive -> cslb_inactive + bloqueado', () => {
  const r = computeReadiness({
    legal: { ...PASS_LEGAL, cslb_active: false },
    presence: PASS_PRESENCE
  });
  assert.equal(r.verdict, 'bloqueado');
  assert.deepEqual(r.blockers, ['cslb_inactive']);
});

test('T-18 cslb name mismatch -> legal_name_mismatch + bloqueado', () => {
  const r = computeReadiness({
    legal: { ...PASS_LEGAL, cslb_name_match: false },
    presence: PASS_PRESENCE
  });
  assert.equal(r.verdict, 'bloqueado');
  assert.deepEqual(r.blockers, ['legal_name_mismatch']);
});

test('T-18 nap inconsistent (coherent booleans) -> nap_inconsistent + bloqueado', () => {
  const r = computeReadiness({
    legal: PASS_LEGAL,
    presence: {
      nap_risk: 'inconsistent',
      nap_consistent: false,
      gbp_exists: true,
      gbp_duplicate: false
    }
  });
  assert.equal(r.verdict, 'bloqueado');
  assert.deepEqual(r.blockers, ['nap_inconsistent']);
  assert.equal(r.conflicts.length, 0);
});

test('T-18 gbp missing -> gbp_missing + bloqueado', () => {
  const r = computeReadiness({
    legal: PASS_LEGAL,
    presence: {
      nap_risk: 'consistent',
      nap_consistent: true,
      gbp_exists: false,
      gbp_duplicate: false
    }
  });
  assert.equal(r.verdict, 'bloqueado');
  assert.deepEqual(r.blockers, ['gbp_missing']);
});

test('T-18 gbp duplicate -> gbp_duplicate + bloqueado', () => {
  const r = computeReadiness({
    legal: PASS_LEGAL,
    presence: {
      nap_risk: 'consistent',
      nap_consistent: true,
      gbp_exists: true,
      gbp_duplicate: true
    }
  });
  assert.equal(r.verdict, 'bloqueado');
  assert.deepEqual(r.blockers, ['gbp_duplicate']);
});

// --- R-11: absent/null -> datos_insuficientes, NEVER elegible ---
test('T-18 missing legal side -> datos_insuficientes, never elegible', () => {
  const r = computeReadiness({ legal: null, presence: PASS_PRESENCE });
  assert.equal(r.verdict, 'datos_insuficientes');
  assert.notEqual(r.verdict, 'elegible');
});

test('T-18 a single null signal (sos) with rest passing -> datos_insuficientes', () => {
  const r = computeReadiness({
    legal: { ...PASS_LEGAL, sos_status: null },
    presence: PASS_PRESENCE
  });
  assert.equal(r.verdict, 'datos_insuficientes');
  assert.notEqual(r.verdict, 'elegible');
});

test('T-18 empty evidence both sides -> datos_insuficientes', () => {
  const r = computeReadiness({ legal: null, presence: null });
  assert.equal(r.verdict, 'datos_insuficientes');
});

test('T-18 mixed: one fail + one absent -> necesita_fix (not bloqueado, not elegible)', () => {
  const r = computeReadiness({
    legal: { ...PASS_LEGAL, cslb_active: false }, // fail
    presence: {
      nap_risk: null, // absent
      nap_consistent: null,
      gbp_exists: true,
      gbp_duplicate: false
    }
  });
  assert.equal(r.verdict, 'necesita_fix');
  assert.ok(r.blockers.includes('cslb_inactive'));
});

// --- R-12: contradictory evidence -> never elegible ---
test('T-18 nap_risk=inconsistent but nap_consistent=true -> conflict, never elegible', () => {
  const r = computeReadiness({
    legal: PASS_LEGAL,
    presence: {
      nap_risk: 'inconsistent',
      nap_consistent: true, // contradicts risk
      gbp_exists: true,
      gbp_duplicate: false
    }
  });
  assert.notEqual(r.verdict, 'elegible');
  assert.ok(r.conflicts.length > 0);
});

test('T-18 sos_status=unknown with rest passing -> not elegible (datos_insuficientes)', () => {
  const r = computeReadiness({
    legal: { ...PASS_LEGAL, sos_status: 'unknown' },
    presence: PASS_PRESENCE
  });
  assert.notEqual(r.verdict, 'elegible');
  assert.equal(r.verdict, 'datos_insuficientes');
});

// --- partial NAP -> necesita_fix (all present, no hard fail) ---
test('T-18 nap partial (all else pass) -> necesita_fix', () => {
  const r = computeReadiness({
    legal: PASS_LEGAL,
    presence: {
      nap_risk: 'partial',
      nap_consistent: false,
      gbp_exists: true,
      gbp_duplicate: false
    }
  });
  assert.equal(r.verdict, 'necesita_fix');
});

// --- R-13: no_aplica does not degrade ---
test('T-18 cslb no_aplica with other 3 passing -> elegible', () => {
  const r = computeReadiness({
    legal: {
      sos_status: 'active',
      cslb_active: null,
      cslb_name_match: null,
      legal_name_verified: null,
      cslb_applicable: false // no_aplica
    },
    presence: PASS_PRESENCE
  });
  assert.equal(r.verdict, 'elegible');
});

test('T-18 cslb no_aplica overrides what would be a cslb blocker', () => {
  const r = computeReadiness({
    legal: {
      sos_status: 'active',
      cslb_active: false, // would be cslb_inactive
      cslb_name_match: false,
      legal_name_verified: false,
      cslb_applicable: false
    },
    presence: PASS_PRESENCE
  });
  assert.equal(r.verdict, 'elegible');
  assert.deepEqual(r.blockers, []);
});

// --- R-14: purity — inputs not mutated ---
test('T-18 computeReadiness does not mutate its inputs (purity)', () => {
  const legal: ReadinessLegalInput = { ...PASS_LEGAL };
  const presence: ReadinessPresenceInput = { ...PASS_PRESENCE };
  const legalSnap = JSON.stringify(legal);
  const presenceSnap = JSON.stringify(presence);
  Object.freeze(legal);
  Object.freeze(presence);
  const r = computeReadiness({ legal, presence }); // must not throw on frozen input
  assert.equal(r.verdict, 'elegible');
  assert.equal(JSON.stringify(legal), legalSnap);
  assert.equal(JSON.stringify(presence), presenceSnap);
});

// --- snapshot reflects the input signal values (R-04 support) ---
test('T-18 snapshot captures the signal values used', () => {
  const r = computeReadiness({ legal: PASS_LEGAL, presence: PASS_PRESENCE });
  assert.deepEqual(r.snapshot, {
    sos_status: 'active',
    cslb_active: true,
    cslb_name_match: true,
    nap_risk: 'consistent',
    nap_consistent: true,
    gbp_exists: true,
    gbp_duplicate: false,
    // F-083 (R-15): snapshot gained gbp_mode; absent input → null (backward-compat).
    gbp_mode: null
  });
});
