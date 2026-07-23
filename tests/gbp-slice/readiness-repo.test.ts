/**
 * F-078 — T-19 (repo/action insert) + T-20 (getLatestReadiness accessor).
 * Uses a fake ReadinessStore (no DB).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessReadiness,
  getLatestReadiness,
  buildReadinessInputs,
  mapDuplicateStatus,
  type ReadinessStore,
  type ReadinessAssessmentInsert,
  type CredentialEvidence,
  type NapCheckEvidence,
  type GbpProfileEvidence,
  type LocationRef
} from '../../src/lib/gbp-slice/readiness-repo.ts';
import type { ReadinessAssessment } from '../../src/types/c3-domain.ts';

const CLIENT_ID = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c';

function makeFakeStore(opts: {
  credential?: CredentialEvidence | null;
  napCheck?: NapCheckEvidence | null;
  gbpProfile?: GbpProfileEvidence | null;
}): {
  store: ReadinessStore;
  inserted: ReadinessAssessmentInsert[];
} {
  const inserted: ReadinessAssessmentInsert[] = [];
  const rows: ReadinessAssessment[] = [];
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
      const full: ReadinessAssessment = {
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
        snap_gbp_mode: row.snap_gbp_mode, // F-083 (R-15)
        rationale: row.rationale,
        assessed_by: row.assessed_by,
        assessed_at: new Date(2026, 6, 17, 10, 0, seq).toISOString(),
        created_at: new Date(2026, 6, 17, 10, 0, seq).toISOString()
      };
      rows.push(full);
      return full;
    },
    async fetchLatestAssessment(_clientId: string, _ref: LocationRef) {
      if (rows.length === 0) return null;
      // most recent by assessed_at
      return [...rows].sort((a, b) =>
        a.assessed_at < b.assessed_at ? 1 : -1
      )[0];
    }
  };
  return { store, inserted };
}

const ELIGIBLE_EVIDENCE = {
  credential: {
    id: 'cred-1',
    sos_status: 'active' as const,
    cslb_active: true,
    legal_name_verified: true
  },
  napCheck: {
    id: 'nap-1',
    cslb_name_match: true,
    cslb_active: true,
    risk_level: 'consistent' as const
  },
  gbpProfile: {
    id: 'gbp-1',
    nap_consistent: true,
    duplicate_check_status: 'clean',
    // F-083 (R-13): `gbp_exists` now derives from `verification_status`, NOT from the
    // mere presence of the row. An attested existing GBP is `verified` (mode `existing`).
    verification_status: 'verified',
    gbp_mode: 'existing' as const
  }
};

// --- T-19: inserts 1 row with snapshot (R-04) + FKs (R-03) + append (R-01) ---
test('T-19 assessReadiness inserts one row with snapshot + evidence FKs', async () => {
  const { store, inserted } = makeFakeStore(ELIGIBLE_EVIDENCE);
  const row = await assessReadiness(store, {
    clientId: CLIENT_ID,
    assessedBy: 'user-1'
  });

  assert.equal(inserted.length, 1);
  const ins = inserted[0];
  // FKs (R-03)
  assert.equal(ins.client_id, CLIENT_ID);
  assert.equal(ins.credential_id, 'cred-1');
  assert.equal(ins.nap_check_id, 'nap-1');
  assert.equal(ins.gbp_profile_id, 'gbp-1');
  // snapshot (R-04)
  assert.equal(ins.snap_sos_status, 'active');
  assert.equal(ins.snap_cslb_active, true);
  assert.equal(ins.snap_cslb_name_match, true);
  assert.equal(ins.snap_nap_risk, 'consistent');
  assert.equal(ins.snap_nap_consistent, true);
  assert.equal(ins.snap_gbp_exists, true);
  assert.equal(ins.snap_gbp_duplicate, false);
  // verdict is coherent
  assert.equal(row.verdict, 'elegible');
  assert.ok(row.assessed_at); // historization (R-01)
});

// --- T-19: append — second insert does NOT overwrite the first (R-01) ---
test('T-19 second assessment appends, does not overwrite the first', async () => {
  const { store, inserted } = makeFakeStore(ELIGIBLE_EVIDENCE);
  const first = await assessReadiness(store, { clientId: CLIENT_ID });
  const second = await assessReadiness(store, { clientId: CLIENT_ID });
  assert.equal(inserted.length, 2);
  assert.notEqual(first.id, second.id);
});

// --- T-19: verdict reflects blocking evidence ---
test('T-19 blocking evidence yields bloqueado + blockers persisted', async () => {
  const { store, inserted } = makeFakeStore({
    credential: {
      id: 'cred-2',
      sos_status: 'suspended',
      cslb_active: true,
      legal_name_verified: true
    },
    napCheck: {
      id: 'nap-2',
      cslb_name_match: true,
      risk_level: 'consistent'
    },
    gbpProfile: {
      id: 'gbp-2',
      nap_consistent: true,
      duplicate_check_status: 'clean',
      // F-083 (R-13): verified existing GBP so the only failing signal is SoS → bloqueado.
      verification_status: 'verified',
      gbp_mode: 'existing' as const
    }
  });
  const row = await assessReadiness(store, { clientId: CLIENT_ID });
  assert.equal(row.verdict, 'bloqueado');
  assert.ok(inserted[0].blockers.includes('sos_inactive'));
});

// --- T-20: getLatestReadiness returns the most recent; does not wire a gate ---
test('T-20 getLatestReadiness returns most recent of two assessments', async () => {
  const { store } = makeFakeStore(ELIGIBLE_EVIDENCE);
  await assessReadiness(store, { clientId: CLIENT_ID }); // assess-1
  const second = await assessReadiness(store, { clientId: CLIENT_ID }); // assess-2
  const latest = await getLatestReadiness(store, CLIENT_ID);
  assert.ok(latest);
  assert.equal(latest?.id, second.id);
});

test('T-20 getLatestReadiness returns null when none exists', async () => {
  const { store } = makeFakeStore(ELIGIBLE_EVIDENCE);
  const latest = await getLatestReadiness(store, CLIENT_ID);
  assert.equal(latest, null);
});

// --- buildReadinessInputs mapping. F-083 (R-12/R-13): `gbp_exists` derives from
// `verification_status`, NOT from the mere presence of the (draft) row. The old
// `gbpProfile ? true : null` false positive is gone. ---
test('buildReadinessInputs: gbp_exists derives from verification_status, not row presence', () => {
  // A draft row WITHOUT verification (the JD Valley shape) is NOT `true` anymore.
  const draftRow = buildReadinessInputs({
    credential: null,
    napCheck: null,
    gbpProfile: {
      id: 'g',
      nap_consistent: true,
      duplicate_check_status: 'clean'
      // no verification_status → pending/unknown → null (no false positive)
    }
  });
  assert.equal(draftRow.presence.gbp_exists, null);
  assert.equal(draftRow.presence.gbp_duplicate, false);
  assert.equal(draftRow.presence.gbp_mode, 'existing'); // R-02 default

  // A verified row → true.
  const verifiedRow = buildReadinessInputs({
    credential: null,
    napCheck: null,
    gbpProfile: {
      id: 'g',
      duplicate_check_status: 'clean',
      verification_status: 'verified'
    }
  });
  assert.equal(verifiedRow.presence.gbp_exists, true);

  const withoutRow = buildReadinessInputs({
    credential: null,
    napCheck: null,
    gbpProfile: null
  });
  assert.equal(withoutRow.presence.gbp_exists, null);
  assert.equal(withoutRow.presence.gbp_mode, 'existing');
});

test('mapDuplicateStatus maps text status to boolean signal', () => {
  assert.equal(mapDuplicateStatus('duplicate'), true);
  assert.equal(mapDuplicateStatus('clean'), false);
  assert.equal(mapDuplicateStatus('pending'), null);
  assert.equal(mapDuplicateStatus(null), null);
});
