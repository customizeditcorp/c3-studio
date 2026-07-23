/**
 * F-083 — Readiness modo crear-vs-existe.
 * T-12 (motor `computeReadiness` con `gbp_mode`), T-13 (`mapVerificationStatus` +
 * `buildReadinessInputs` sin falso positivo), T-14 (adapter/insert `snap_gbp_mode`).
 *
 * Ejercita el code-path REAL (§6.1): motor puro + adapter con fake store (sin DB).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReadiness,
  type ReadinessLegalInput,
  type ReadinessPresenceInput
} from '../../src/lib/gbp-slice/readiness.ts';
import {
  assessReadiness,
  buildReadinessInputs,
  mapVerificationStatus,
  type ReadinessStore,
  type ReadinessAssessmentInsert,
  type CredentialEvidence,
  type NapCheckEvidence,
  type GbpProfileEvidence,
  type LocationRef
} from '../../src/lib/gbp-slice/readiness-repo.ts';
import type { ReadinessAssessment } from '../../src/types/c3-domain.ts';

const PASS_LEGAL: ReadinessLegalInput = {
  sos_status: 'active',
  cslb_active: true,
  cslb_name_match: true,
  legal_name_verified: true
};

/** In create mode the presence signals are irrelevant (routed to no_aplica). We pass
 * deliberately absent/empty GBP evidence to prove they do not degrade the verdict. */
const CREATE_PRESENCE: ReadinessPresenceInput = {
  nap_risk: null,
  nap_consistent: null,
  gbp_exists: null,
  gbp_duplicate: null,
  gbp_mode: 'create'
};

// ===================================================================
// T-12 — motor con gbp_mode (tabla de casos)
// ===================================================================

// R-07/R-09/R-10: create mode + legales OK → elegible (GBP+NAP no_aplica)
test('T-12 create mode + SoS pass + CSLB pass → elegible (GBP+NAP no_aplica)', () => {
  const r = computeReadiness({ legal: PASS_LEGAL, presence: CREATE_PRESENCE });
  assert.equal(r.verdict, 'elegible');
  assert.deepEqual(r.blockers, []);
});

// R-08: create mode NEVER emits gbp_missing, even with zero GBP evidence
test('T-12 create mode never emits gbp_missing (no GBP evidence)', () => {
  const r = computeReadiness({
    legal: PASS_LEGAL,
    presence: { ...CREATE_PRESENCE, gbp_exists: false } // would be gbp_missing in existing mode
  });
  assert.ok(!r.blockers.includes('gbp_missing'));
  assert.equal(r.verdict, 'elegible');
});

// R-09: a partial NAP in create mode does NOT degrade the verdict (no_aplica)
test('T-12 create mode: nap_risk=partial does not degrade (elegible)', () => {
  const r = computeReadiness({
    legal: PASS_LEGAL,
    presence: { ...CREATE_PRESENCE, nap_risk: 'partial', nap_consistent: false }
  });
  assert.equal(r.verdict, 'elegible');
});

// R-11: legal gating intact in create mode — SoS suspended → bloqueado
test('T-12 create mode + SoS suspended → bloqueado (legal gating intact)', () => {
  const r = computeReadiness({
    legal: { ...PASS_LEGAL, sos_status: 'suspended' },
    presence: CREATE_PRESENCE
  });
  assert.equal(r.verdict, 'bloqueado');
  assert.deepEqual(r.blockers, ['sos_inactive']);
});

// R-11: legal absent in create mode → datos_insuficientes (never elegible)
test('T-12 create mode + legal ausente → datos_insuficientes', () => {
  const r = computeReadiness({ legal: null, presence: CREATE_PRESENCE });
  assert.equal(r.verdict, 'datos_insuficientes');
  assert.notEqual(r.verdict, 'elegible');
});

test('T-12 create mode + single null legal (sos) → datos_insuficientes', () => {
  const r = computeReadiness({
    legal: { ...PASS_LEGAL, sos_status: null },
    presence: CREATE_PRESENCE
  });
  assert.equal(r.verdict, 'datos_insuficientes');
});

// R-06: purity — inputs not mutated with gbp_mode present
test('T-12 computeReadiness does not mutate inputs with gbp_mode (purity)', () => {
  const legal: ReadinessLegalInput = { ...PASS_LEGAL };
  const presence: ReadinessPresenceInput = { ...CREATE_PRESENCE };
  const legalSnap = JSON.stringify(legal);
  const presenceSnap = JSON.stringify(presence);
  Object.freeze(legal);
  Object.freeze(presence);
  const r = computeReadiness({ legal, presence });
  assert.equal(r.verdict, 'elegible');
  assert.equal(JSON.stringify(legal), legalSnap);
  assert.equal(JSON.stringify(presence), presenceSnap);
});

// R-15: snapshot carries gbp_mode with the input value
test('T-12 snapshot includes gbp_mode with the input value', () => {
  const created = computeReadiness({
    legal: PASS_LEGAL,
    presence: CREATE_PRESENCE
  });
  assert.equal(created.snapshot.gbp_mode, 'create');

  const existing = computeReadiness({
    legal: PASS_LEGAL,
    presence: {
      nap_risk: 'consistent',
      nap_consistent: true,
      gbp_exists: true,
      gbp_duplicate: false,
      gbp_mode: 'existing'
    }
  });
  assert.equal(existing.snapshot.gbp_mode, 'existing');
});

// R-12/R-13/R-16: existing mode — gbp_exists honest from verification_status
test('T-12 existing mode: verified → gbp_exists=true → elegible', () => {
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
      nap_consistent: true,
      duplicate_check_status: 'clean',
      verification_status: 'verified',
      gbp_mode: 'existing'
    }
  });
  const r = computeReadiness(inputs);
  assert.equal(inputs.presence.gbp_exists, true);
  assert.equal(r.verdict, 'elegible');
});

test('T-12 existing mode: not_found → gbp_exists=false → gbp_missing + bloqueado', () => {
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
      nap_consistent: true,
      duplicate_check_status: 'clean',
      verification_status: 'not_found',
      gbp_mode: 'existing'
    }
  });
  const r = computeReadiness(inputs);
  assert.equal(inputs.presence.gbp_exists, false);
  assert.ok(r.blockers.includes('gbp_missing'));
  assert.equal(r.verdict, 'bloqueado');
});

test('T-12 existing mode: pending → gbp_exists NOT true → datos_insuficientes (never true by default)', () => {
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
      nap_consistent: true,
      duplicate_check_status: 'clean',
      verification_status: 'pending',
      gbp_mode: 'existing'
    }
  });
  const r = computeReadiness(inputs);
  assert.notEqual(inputs.presence.gbp_exists, true);
  assert.equal(inputs.presence.gbp_exists, null);
  assert.equal(r.verdict, 'datos_insuficientes');
});

// ===================================================================
// T-13 — mapVerificationStatus + buildReadinessInputs (falso positivo muerto)
// ===================================================================

test('T-13 mapVerificationStatus maps status → boolean|null', () => {
  assert.equal(mapVerificationStatus('verified'), true);
  assert.equal(mapVerificationStatus('VERIFIED'), true); // case-insensitive
  assert.equal(mapVerificationStatus('claimed'), true);
  assert.equal(mapVerificationStatus('not_found'), false);
  assert.equal(mapVerificationStatus('does_not_exist'), false);
  assert.equal(mapVerificationStatus('pending'), null);
  assert.equal(mapVerificationStatus('whatever'), null);
  assert.equal(mapVerificationStatus(null), null);
  assert.equal(mapVerificationStatus(undefined), null);
});

test('T-13 draft row with verification_status=pending → gbp_exists is NOT true (false positive regression)', () => {
  const inputs = buildReadinessInputs({
    credential: null,
    napCheck: null,
    gbpProfile: {
      id: 'draft',
      nap_consistent: true,
      duplicate_check_status: 'pending',
      verification_status: 'pending'
    }
  });
  assert.notEqual(inputs.presence.gbp_exists, true);
  assert.equal(inputs.presence.gbp_exists, null);
});

test('T-13 gbp_mode defaults to existing when the row omits it (R-02)', () => {
  const inputs = buildReadinessInputs({
    credential: null,
    napCheck: null,
    gbpProfile: { id: 'g', verification_status: 'verified' }
  });
  assert.equal(inputs.presence.gbp_mode, 'existing');
});

// ===================================================================
// T-14 — adapter/insert: snap_gbp_mode persistido + default existing
// ===================================================================

function makeFakeStore(opts: {
  credential?: CredentialEvidence | null;
  napCheck?: NapCheckEvidence | null;
  gbpProfile?: GbpProfileEvidence | null;
}): { store: ReadinessStore; inserted: ReadinessAssessmentInsert[] } {
  const inserted: ReadinessAssessmentInsert[] = [];
  let seq = 0;
  const store: ReadinessStore = {
    async fetchCredential() {
      return opts.credential ?? null;
    },
    async fetchLatestNapCheck() {
      return opts.napCheck ?? null;
    },
    async fetchGbpProfile() {
      return opts.gbpProfile ?? null;
    },
    async insertAssessment(row) {
      inserted.push(row);
      seq += 1;
      return {
        id: `assess-${seq}`,
        client_id: row.client_id,
        location_label: row.location_label,
        gbp_profile_id: row.gbp_profile_id,
        nap_check_id: row.nap_check_id,
        credential_id: row.credential_id,
        verdict: row.verdict,
        blockers: row.blockers,
        snap_sos_status: row.snap_sos_status,
        snap_cslb_active: row.snap_cslb_active,
        snap_cslb_name_match: row.snap_cslb_name_match,
        snap_nap_risk: row.snap_nap_risk,
        snap_nap_consistent: row.snap_nap_consistent,
        snap_gbp_exists: row.snap_gbp_exists,
        snap_gbp_duplicate: row.snap_gbp_duplicate,
        snap_gbp_mode: row.snap_gbp_mode,
        rationale: row.rationale,
        assessed_by: row.assessed_by,
        assessed_at: new Date(2026, 6, 22, 10, 0, seq).toISOString(),
        created_at: new Date(2026, 6, 22, 10, 0, seq).toISOString()
      } satisfies ReadinessAssessment;
    },
    async fetchLatestAssessment(_c: string, _r: LocationRef) {
      return null;
    }
  };
  return { store, inserted };
}

test('T-14 snap_gbp_mode persisted with the evaluated mode (create)', async () => {
  const { store, inserted } = makeFakeStore({
    credential: {
      id: 'c',
      sos_status: 'active',
      cslb_active: true,
      legal_name_verified: true
    },
    napCheck: { id: 'n', cslb_name_match: true, risk_level: 'consistent' },
    gbpProfile: { id: 'g', gbp_mode: 'create', verification_status: 'pending' }
  });
  const row = await assessReadiness(store, { clientId: 'client-1' });
  assert.equal(inserted[0].snap_gbp_mode, 'create');
  assert.equal(row.verdict, 'elegible'); // create precondition satisfied
  assert.ok(!inserted[0].blockers.includes('gbp_missing'));
});

test('T-14 snap_gbp_mode defaults to existing when the gbp row omits gbp_mode (R-02)', async () => {
  const { store, inserted } = makeFakeStore({
    credential: {
      id: 'c',
      sos_status: 'active',
      cslb_active: true,
      legal_name_verified: true
    },
    napCheck: { id: 'n', cslb_name_match: true, risk_level: 'consistent' },
    gbpProfile: {
      id: 'g',
      nap_consistent: true,
      duplicate_check_status: 'clean',
      verification_status: 'verified'
    }
  });
  await assessReadiness(store, { clientId: 'client-1' });
  assert.equal(inserted[0].snap_gbp_mode, 'existing');
});

test('T-14 no gbp row at all → snap_gbp_mode existing (backward-compat)', async () => {
  const { store, inserted } = makeFakeStore({
    credential: {
      id: 'c',
      sos_status: 'active',
      cslb_active: true,
      legal_name_verified: true
    },
    napCheck: { id: 'n', cslb_name_match: true, risk_level: 'consistent' },
    gbpProfile: null
  });
  await assessReadiness(store, { clientId: 'client-1' });
  assert.equal(inserted[0].snap_gbp_mode, 'existing');
});
