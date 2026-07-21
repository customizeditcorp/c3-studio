/**
 * F-078 — Readiness repository / action (R-01, R-03, R-04, R-20).
 *
 * Fetches the evidence rows (`credentials` per-client, latest `nap_checks`,
 * `gbp_profiles` per-location), feeds the PURE engine (`computeReadiness`), and
 * APPENDS a new `readiness_assessments` row with the snapshot + evidence FKs
 * (append-only historization, R-01; never overwrites a prior verdict).
 *
 * Also exposes the read-only accessor `getLatestReadiness` (R-20). F-078 does NOT
 * wire the Phase-E creation gate — it only exposes the latest verdict per-location.
 *
 * DEPENDENCY-INJECTED: the orchestration functions take a `ReadinessStore` so they
 * are unit-testable OFFLINE with a fake store (no DB). `createSupabaseReadinessStore`
 * is the thin live adapter (exercised in the gated LIVE tasks, not the unit suite).
 */
import {
  computeReadiness,
  type ReadinessLegalInput,
  type ReadinessPresenceInput
} from './readiness.ts';
import type {
  ReadinessAssessment,
  ReadinessBlocker,
  EligibilityVerdict,
  SosStatus,
  NapRisk
} from '../../types/c3-domain.ts';

// --- Evidence row shapes (loose; only the fields the engine consumes) ---------

export interface CredentialEvidence {
  id: string;
  sos_status?: SosStatus | null;
  cslb_active?: boolean | null;
  legal_name_verified?: boolean | null;
  cslb_applicable?: boolean | null;
}

export interface NapCheckEvidence {
  id: string;
  cslb_name_match?: boolean | null;
  cslb_active?: boolean | null;
  risk_level?: NapRisk | null;
}

export interface GbpProfileEvidence {
  id: string;
  nap_consistent?: boolean | null;
  duplicate_check_status?: string | null;
}

export interface ReadinessEvidence {
  credential: CredentialEvidence | null;
  napCheck: NapCheckEvidence | null;
  gbpProfile: GbpProfileEvidence | null;
}

/** Row inserted into `readiness_assessments`. */
export interface ReadinessAssessmentInsert {
  client_id: string;
  location_label: string | null;
  gbp_profile_id: string | null;
  nap_check_id: string | null;
  credential_id: string | null;
  verdict: EligibilityVerdict;
  blockers: ReadinessBlocker[];
  snap_sos_status: SosStatus | null;
  snap_cslb_active: boolean | null;
  snap_cslb_name_match: boolean | null;
  snap_nap_risk: NapRisk | null;
  snap_nap_consistent: boolean | null;
  snap_gbp_exists: boolean | null;
  snap_gbp_duplicate: boolean | null;
  rationale: string | null;
  assessed_by: string | null;
}

export interface LocationRef {
  gbpProfileId?: string | null;
  locationLabel?: string | null;
}

/** Narrow persistence port (design §3 "thin action"). Implemented by the supabase
 * adapter live, and by a fake in the unit suite. */
export interface ReadinessStore {
  fetchCredential(clientId: string): Promise<CredentialEvidence | null>;
  fetchLatestNapCheck(clientId: string): Promise<NapCheckEvidence | null>;
  fetchGbpProfile(
    clientId: string,
    ref: LocationRef
  ): Promise<GbpProfileEvidence | null>;
  insertAssessment(
    row: ReadinessAssessmentInsert
  ): Promise<ReadinessAssessment>;
  fetchLatestAssessment(
    clientId: string,
    ref: LocationRef
  ): Promise<ReadinessAssessment | null>;
}

/** Maps `gbp_profiles.duplicate_check_status` (text) to the boolean signal. */
export function mapDuplicateStatus(
  status: string | null | undefined
): boolean | null {
  if (status === null || status === undefined) return null;
  const s = status.toLowerCase();
  if (s === 'duplicate' || s === 'duplicates' || s === 'found') return true;
  if (s === 'clean' || s === 'clear' || s === 'none' || s === 'no_duplicates') {
    return false;
  }
  return null; // 'pending' / unknown → not yet determined
}

/**
 * PURE mapping from fetched evidence rows to the engine inputs (design §3). No I/O.
 * `gbp_exists` derives from the presence of a `gbp_profiles` row (R-08).
 */
export function buildReadinessInputs(evidence: ReadinessEvidence): {
  legal: ReadinessLegalInput;
  presence: ReadinessPresenceInput;
} {
  const { credential, napCheck, gbpProfile } = evidence;

  const legal: ReadinessLegalInput = {
    sos_status: credential?.sos_status ?? null,
    // `cslb_active` home is credentials (R-16); fall back to the nap_check flag.
    cslb_active: credential?.cslb_active ?? napCheck?.cslb_active ?? null,
    cslb_name_match: napCheck?.cslb_name_match ?? null,
    legal_name_verified: credential?.legal_name_verified ?? null,
    cslb_applicable: credential?.cslb_applicable ?? undefined
  };

  const presence: ReadinessPresenceInput = {
    nap_risk: napCheck?.risk_level ?? null,
    nap_consistent: gbpProfile?.nap_consistent ?? null,
    gbp_exists: gbpProfile ? true : null,
    gbp_duplicate: mapDuplicateStatus(gbpProfile?.duplicate_check_status)
  };

  return { legal, presence };
}

export interface AssessReadinessArgs {
  clientId: string;
  ref?: LocationRef;
  locationLabel?: string | null;
  assessedBy?: string | null;
}

/**
 * Orchestration (R-01/R-03/R-04): fetch evidence → compute → APPEND a new row.
 * Returns the inserted assessment.
 */
export async function assessReadiness(
  store: ReadinessStore,
  args: AssessReadinessArgs
): Promise<ReadinessAssessment> {
  const ref: LocationRef = args.ref ?? {};
  const [credential, napCheck, gbpProfile] = await Promise.all([
    store.fetchCredential(args.clientId),
    store.fetchLatestNapCheck(args.clientId),
    store.fetchGbpProfile(args.clientId, ref)
  ]);

  const evidence: ReadinessEvidence = { credential, napCheck, gbpProfile };
  const { legal, presence } = buildReadinessInputs(evidence);
  const result = computeReadiness({ legal, presence });

  const row: ReadinessAssessmentInsert = {
    client_id: args.clientId,
    location_label: args.locationLabel ?? ref.locationLabel ?? null,
    gbp_profile_id: gbpProfile?.id ?? ref.gbpProfileId ?? null,
    nap_check_id: napCheck?.id ?? null,
    credential_id: credential?.id ?? null,
    verdict: result.verdict,
    blockers: result.blockers,
    snap_sos_status: result.snapshot.sos_status,
    snap_cslb_active: result.snapshot.cslb_active,
    snap_cslb_name_match: result.snapshot.cslb_name_match,
    snap_nap_risk: result.snapshot.nap_risk,
    snap_nap_consistent: result.snapshot.nap_consistent,
    snap_gbp_exists: result.snapshot.gbp_exists,
    snap_gbp_duplicate: result.snapshot.gbp_duplicate,
    rationale: result.rationale,
    assessed_by: args.assessedBy ?? null
  };

  return store.insertAssessment(row);
}

/**
 * Read-only accessor (R-20): latest verdict per-location. Does NOT wire the Phase-E
 * gate — it only surfaces the most recent assessment.
 */
export async function getLatestReadiness(
  store: ReadinessStore,
  clientId: string,
  ref: LocationRef = {}
): Promise<ReadinessAssessment | null> {
  return store.fetchLatestAssessment(clientId, ref);
}

// --- Live supabase adapter ---------------------------------------------------

/** Minimal shape of the supabase client methods this adapter uses. */
interface SupabaseClientLike {
  from(table: string): any;
}

/**
 * Thin live adapter over the supabase client (browser or server). Not covered by
 * the offline unit suite — its persistence is confirmed in the gated LIVE tasks
 * (T-24) once the migration is applied.
 */
export function createSupabaseReadinessStore(
  supabase: SupabaseClientLike
): ReadinessStore {
  return {
    async fetchCredential(clientId) {
      const { data } = await supabase
        .from('credentials')
        .select('id, sos_status, cslb_active, legal_name_verified')
        .eq('client_id', clientId)
        .limit(1)
        .maybeSingle();
      return (data as CredentialEvidence | null) ?? null;
    },
    async fetchLatestNapCheck(clientId) {
      const { data } = await supabase
        .from('nap_checks')
        .select('id, cslb_name_match, cslb_active, risk_level')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as NapCheckEvidence | null) ?? null;
    },
    async fetchGbpProfile(clientId, ref) {
      let query = supabase
        .from('gbp_profiles')
        .select('id, nap_consistent, duplicate_check_status')
        .eq('client_id', clientId);
      if (ref.gbpProfileId) query = query.eq('id', ref.gbpProfileId);
      const { data } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as GbpProfileEvidence | null) ?? null;
    },
    async insertAssessment(row) {
      const { data, error } = await supabase
        .from('readiness_assessments')
        .insert(row)
        .select('*')
        .single();
      if (error) throw error;
      return data as ReadinessAssessment;
    },
    async fetchLatestAssessment(clientId, ref) {
      let query = supabase
        .from('readiness_assessments')
        .select('*')
        .eq('client_id', clientId);
      if (ref.gbpProfileId)
        query = query.eq('gbp_profile_id', ref.gbpProfileId);
      if (ref.locationLabel)
        query = query.eq('location_label', ref.locationLabel);
      const { data } = await query
        .order('assessed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as ReadinessAssessment | null) ?? null;
    }
  };
}
