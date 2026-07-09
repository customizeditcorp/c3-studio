/**
 * F-066 — T-13 (R-07/R-08) + T-14 (R-09) — operational-state model.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readOperationalStateGbp,
  assertNoSecrets,
  FORBIDDEN_OP_STATE_KEYS
} from '../../src/lib/gbp-slice/operational-state.ts';

// --- T-13 (R-07): degrade to pendiente when no source ---
test('T-13a no signal -> degrade to pendiente, source default', () => {
  const s = readOperationalStateGbp();
  assert.equal(s.system, 'gbp');
  assert.equal(s.status, 'pendiente');
  assert.equal(s.managed_by, null);
  assert.equal(s.source, 'default');
});

// --- T-13 (R-08): separation identity/access; never adopt credentials shape ---
test('T-13b assertNoSecrets rejects access booleans and legal identity', () => {
  for (const key of FORBIDDEN_OP_STATE_KEYS) {
    assert.throws(() => assertNoSecrets({ [key]: true }), /forbidden key/);
  }
});

test('T-13b readOperationalStateGbp throws if fed a credentials-shaped object', () => {
  assert.throws(
    () =>
      readOperationalStateGbp({
        // @ts-expect-error deliberately malformed (credentials shape)
        gbp_access: true
      }),
    /forbidden key/
  );
});

// --- T-14 (R-09): commercial vs operative; gbp_created is an operative signal ---
test('T-14 gbp_created consumed as operational signal (not commercial)', () => {
  const s = readOperationalStateGbp({ gbp_created: true, managed_by: 'c3' });
  assert.equal(s.status, 'activo');
  assert.equal(s.managed_by, 'c3');
  assert.equal(s.source, 'client_plans_signal');
});

test('T-14 gbp_created false -> pendiente (still generate)', () => {
  const s = readOperationalStateGbp({ gbp_created: false });
  assert.equal(s.status, 'pendiente');
});
