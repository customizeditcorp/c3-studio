/**
 * F-087 — T-10 (mapVerificationStatus aditivo + no-regresión F-083) y T-12
 * (independencia de dimensiones: lifecycle ⊥ gbp_mode; create-mode sin cambio).
 *
 * Ejercita el code-path REAL: el map puro + el motor puro `computeReadiness` +
 * `buildReadinessInputs`. `Ref: R-08, R-10`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapVerificationStatus,
  buildReadinessInputs
} from '../../src/lib/gbp-slice/readiness-repo.ts';
import { computeReadiness } from '../../src/lib/gbp-slice/readiness.ts';
import { buildGbpAssetPayload } from '../../src/lib/gbp-slice/gbp-asset.ts';

// ===================================================================
// T-10 — mapVerificationStatus: created/live → true (aditivo) + NO-REGRESIÓN F-083
// ===================================================================
test('T-10 F-087 aditivo: created → true, live → true', () => {
  assert.equal(mapVerificationStatus('created'), true);
  assert.equal(mapVerificationStatus('CREATED'), true); // case-insensitive
  assert.equal(mapVerificationStatus('live'), true);
  assert.equal(mapVerificationStatus('LIVE'), true);
});

test('T-10 NO-REGRESIÓN F-083: salidas existentes BYTE-IDÉNTICAS', () => {
  // true-set previo intacto
  assert.equal(mapVerificationStatus('verified'), true);
  assert.equal(mapVerificationStatus('claimed'), true);
  assert.equal(mapVerificationStatus('confirmed'), true);
  // false-set intacto
  assert.equal(mapVerificationStatus('not_found'), false);
  assert.equal(mapVerificationStatus('does_not_exist'), false);
  assert.equal(mapVerificationStatus('missing'), false);
  // null-set intacto
  assert.equal(mapVerificationStatus('pending'), null);
  assert.equal(mapVerificationStatus('whatever'), null);
  assert.equal(mapVerificationStatus(null), null);
  assert.equal(mapVerificationStatus(undefined), null);
});

test('T-10 buildReadinessInputs: created → gbp_exists=true (existencia real)', () => {
  const inputs = buildReadinessInputs({
    credential: null,
    napCheck: null,
    gbpProfile: {
      id: 'g',
      verification_status: 'created',
      gbp_mode: 'existing'
    }
  });
  assert.equal(inputs.presence.gbp_exists, true);
});

// ===================================================================
// T-12 — independencia de dimensiones (R-10)
// ===================================================================

// (a) fijar el lifecycle vía buildGbpAssetPayload NO altera gbp_mode
test('T-12 buildGbpAssetPayload no muta gbp_mode (payload sin la clave)', () => {
  const payload = buildGbpAssetPayload({
    identity: { operationalEmail: '', gbpUrl: '', placeId: '' },
    status: 'created'
  });
  assert.ok(!('gbp_mode' in payload));
});

const PASS_LEGAL = {
  sos_status: 'active' as const,
  cslb_active: true,
  cslb_name_match: true,
  legal_name_verified: true
};

// (b) create-mode + verification_status='created' mantiene la presencia no_aplica del
// motor: el veredicto create-mode NO cambia por avanzar el lifecycle (reusa F-083).
test('T-12 create-mode + created: presencia no_aplica → veredicto sin cambio (elegible)', () => {
  const inputs = buildReadinessInputs({
    credential: {
      id: 'c',
      sos_status: 'active',
      cslb_active: true,
      legal_name_verified: true
    },
    napCheck: { id: 'n', cslb_name_match: true, risk_level: 'consistent' },
    gbpProfile: {
      id: 'g',
      gbp_mode: 'create',
      verification_status: 'created'
    }
  });
  // gbp_exists deriva a true (aditivo), pero en create-mode NO participa del veredicto.
  assert.equal(inputs.presence.gbp_exists, true);
  assert.equal(inputs.presence.gbp_mode, 'create');
  const r = computeReadiness(inputs);
  assert.equal(r.verdict, 'elegible');
  assert.deepEqual(r.blockers, []);
  assert.equal(r.snapshot.gbp_mode, 'create');
});

// (c) el mismo create-mode con verification_status='pending' da el MISMO veredicto:
// el lifecycle avanzando no cambia el resultado create-mode (idéntico a F-083).
test('T-12 create-mode: el veredicto es idéntico con pending vs created (lifecycle ⊥ motor)', () => {
  const base = {
    credential: {
      id: 'c',
      sos_status: 'active' as const,
      cslb_active: true,
      legal_name_verified: true
    },
    napCheck: {
      id: 'n',
      cslb_name_match: true,
      risk_level: 'consistent' as const
    }
  };
  const pending = computeReadiness(
    buildReadinessInputs({
      ...base,
      gbpProfile: {
        id: 'g',
        gbp_mode: 'create',
        verification_status: 'pending'
      }
    })
  );
  const created = computeReadiness(
    buildReadinessInputs({
      ...base,
      gbpProfile: {
        id: 'g',
        gbp_mode: 'create',
        verification_status: 'created'
      }
    })
  );
  assert.equal(pending.verdict, created.verdict);
  assert.deepEqual(pending.blockers, created.blockers);
});
