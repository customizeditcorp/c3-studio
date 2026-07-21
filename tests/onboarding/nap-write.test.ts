/**
 * F-078 — T-21 (NAP write reconciliation, R-17) + T-23 (backward-compat load, R-19).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNapCheckPayload,
  parseNapCheckRow,
  napRiskFor,
  NAP_WRITABLE_COLUMNS
} from '../../src/lib/onboarding/nap-check.ts';

const VALID_NAP_RISK = new Set(['consistent', 'partial', 'inconsistent']);
// Columns that DO NOT exist in the real schema and caused the 0-rows drift.
const DRIFT_COLUMNS = [
  'business_name',
  'city',
  'check_items',
  'items_total',
  'completed_by'
];

// --- T-21: payload only contains real columns + valid nap_risk enum ---
test('T-21 nap payload contains only real columns (no drift columns)', () => {
  const payload = buildNapCheckPayload({
    clientId: 'c1',
    checklist: {
      google_name_match: true,
      cslb_name_match: true,
      address_consistent: true,
      phone_consistent: true,
      cslb_active: true,
      entity_verified: true
    },
    notes: 'ok',
    checkedBy: 'u1'
  });
  for (const key of Object.keys(payload)) {
    assert.ok(
      NAP_WRITABLE_COLUMNS.includes(key),
      `unexpected column in payload: ${key}`
    );
  }
  for (const drift of DRIFT_COLUMNS) {
    assert.ok(!(drift in payload), `drift column present: ${drift}`);
  }
});

test('T-21 risk_level is always a valid nap_risk enum value', () => {
  const all = buildNapCheckPayload({
    clientId: 'c1',
    checklist: {
      google_name_match: true,
      cslb_name_match: true,
      address_consistent: true,
      phone_consistent: true,
      cslb_active: true,
      entity_verified: true
    },
    notes: '',
    checkedBy: null
  });
  assert.ok(VALID_NAP_RISK.has(all.risk_level));
  assert.equal(all.risk_level, 'consistent');
  assert.equal(all.items_passed, 6);

  const none = buildNapCheckPayload({
    clientId: 'c1',
    checklist: {},
    notes: '',
    checkedBy: null
  });
  assert.equal(none.risk_level, 'inconsistent');
  assert.equal(none.items_passed, 0);

  const some = buildNapCheckPayload({
    clientId: 'c1',
    checklist: { google_name_match: true },
    notes: '',
    checkedBy: null
  });
  assert.equal(some.risk_level, 'partial');
});

test('napRiskFor maps enum + color deterministically', () => {
  assert.deepEqual(napRiskFor(6, 6), {
    level: 'consistent',
    label: 'Consistente',
    color: 'default'
  });
  assert.equal(napRiskFor(0, 6).level, 'inconsistent');
  assert.equal(napRiskFor(3, 6).level, 'partial');
});

// --- T-23: backward-compat load — parse both shapes without throwing (R-19) ---
test('T-23 parseNapCheckRow rebuilds checklist from real boolean columns', () => {
  const { checklist, notes } = parseNapCheckRow({
    google_name_match: true,
    cslb_name_match: false,
    address_consistent: true,
    phone_consistent: true,
    cslb_active: true,
    entity_verified: false,
    notes: 'hi'
  });
  assert.equal(checklist.google_name_match, true);
  assert.equal(checklist.cslb_name_match, false);
  assert.equal(checklist.entity_verified, false);
  assert.equal(notes, 'hi');
});

test('T-23 parseNapCheckRow tolerates a legacy check_items array (no throw)', () => {
  const { checklist } = parseNapCheckRow({
    check_items: ['google_name_match', 'address_consistent']
  });
  assert.equal(checklist.google_name_match, true);
  assert.equal(checklist.address_consistent, true);
});

test('T-23 parseNapCheckRow handles null / empty row without throwing', () => {
  assert.deepEqual(parseNapCheckRow(null), { checklist: {}, notes: '' });
  assert.deepEqual(parseNapCheckRow(undefined), { checklist: {}, notes: '' });
});
