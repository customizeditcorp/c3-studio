/**
 * F-078 — T-22 (credentials write reconciliation, R-18/R-16) + T-23 (backward-compat, R-19).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCredentialsPayload,
  parseCredentialsRow,
  CREDENTIALS_WRITABLE_COLUMNS
} from '../../src/lib/onboarding/credentials.ts';

const baseArgs = {
  clientId: 'c1',
  entityType: 'llc',
  legalName: 'Acme LLC',
  dbaNumber: 'DBA-1',
  cslbNumber: '1012345',
  cityLicense: 'BL-1',
  checklist: { google_account: true, gbp_access: true, cslb_license: false },
  sosStatus: 'active' as const,
  cslbActive: true,
  legalNameVerified: true
};

// --- T-22: items_completed integer, no items_total, sos_status persisted ---
test('T-22 items_completed is an integer count (not an array)', () => {
  const p = buildCredentialsPayload(baseArgs);
  assert.equal(typeof p.items_completed, 'number');
  assert.equal(p.items_completed, 2); // two true items
  assert.ok(!Array.isArray(p.items_completed));
});

test('T-22 payload has NO items_total column', () => {
  const p = buildCredentialsPayload(baseArgs);
  assert.ok(!('items_total' in p));
});

test('T-22 payload contains only real writable columns', () => {
  const p = buildCredentialsPayload(baseArgs);
  for (const key of Object.keys(p)) {
    assert.ok(
      CREDENTIALS_WRITABLE_COLUMNS.includes(key),
      `unexpected column: ${key}`
    );
  }
});

test('T-22 legal signals persisted (sos_status/cslb_active/legal_name_verified)', () => {
  const p = buildCredentialsPayload(baseArgs);
  assert.equal(p.sos_status, 'active');
  assert.equal(p.cslb_active, true);
  assert.equal(p.legal_name_verified, true);
});

// --- T-23: backward-compat load (R-19) ---
test('T-23 parseCredentialsRow tolerates legacy items_completed array (no throw)', () => {
  const parsed = parseCredentialsRow({
    items_completed: ['google_account', 'gbp_access'],
    sos_status: 'suspended',
    cslb_active: true,
    legal_name_verified: false
  });
  assert.equal(parsed.checklist.google_account, true);
  assert.equal(parsed.checklist.gbp_access, true);
  assert.equal(parsed.sosStatus, 'suspended');
  assert.equal(parsed.cslbActive, true);
  assert.equal(parsed.legalNameVerified, false);
});

test('T-23 parseCredentialsRow handles integer items_completed without throwing', () => {
  const parsed = parseCredentialsRow({
    items_completed: 5,
    sos_status: 'active'
  });
  // Cannot rebuild per-item checklist from an integer; returns empty, no throw.
  assert.deepEqual(parsed.checklist, {});
  assert.equal(parsed.sosStatus, 'active');
});

test('T-23 parseCredentialsRow handles null row with safe defaults', () => {
  const parsed = parseCredentialsRow(null);
  assert.deepEqual(parsed.checklist, {});
  assert.equal(parsed.sosStatus, 'unknown');
  assert.equal(parsed.cslbActive, false);
  assert.equal(parsed.legalNameVerified, false);
});
