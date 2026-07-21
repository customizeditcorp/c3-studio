/**
 * F-078 — Readiness core engine (R-06..R-14).
 *
 * PURE and READ-ONLY: `computeReadiness` consumes already-fetched signal values and
 * decides. It never mutates its inputs, never writes, never repairs or regenerates
 * evidence (R-14) — the same contract as `precondition.ts` / `operational-state.ts`
 * (F-066).
 *
 * Aggregates the 4 MVP signals with a HYBRID unit (design §3):
 *   - LEGAL signals (SoS, CSLB active+name) are evaluated per-CLIENT and inherited
 *     to each location (R-07). The caller passes the same `legal` to each location.
 *   - PRESENCE signals (NAP consistency, GBP existence/duplicates) are evaluated
 *     per-LOCATION (R-08).
 *
 * Degradation is HONEST (R-11): absent/null signals never yield `elegible` by
 * default — they yield `datos_insuficientes` (or `necesita_fix` when a present
 * signal also fails). Contradictory evidence never silently resolves to `elegible`
 * (R-12). A signal marked `no_aplica` does not count as absent nor as a blocker (R-13).
 */
import type {
  SosStatus,
  NapRisk,
  EligibilityVerdict,
  ReadinessBlocker
} from '../../types/c3-domain.ts';

export type { SosStatus, NapRisk, EligibilityVerdict, ReadinessBlocker };

/** LEGAL evidence, evaluated per-CLIENT and inherited to each location (R-07). */
export interface ReadinessLegalInput {
  sos_status: SosStatus | null;
  cslb_active: boolean | null;
  cslb_name_match: boolean | null;
  legal_name_verified: boolean | null;
  /** R-13: when false, the whole CSLB signal is `no_aplica` (client without a CSLB
   * requirement) and is excluded from the eligibility computation. Defaults to true. */
  cslb_applicable?: boolean;
}

/** PRESENCE evidence, evaluated per-LOCATION (R-08). */
export interface ReadinessPresenceInput {
  nap_risk: NapRisk | null;
  nap_consistent: boolean | null;
  gbp_exists: boolean | null;
  gbp_duplicate: boolean | null;
}

/** Snapshot persisted alongside the verdict (R-04). Mirrors the `snap_*` columns. */
export interface ReadinessSnapshot {
  sos_status: SosStatus | null;
  cslb_active: boolean | null;
  cslb_name_match: boolean | null;
  nap_risk: NapRisk | null;
  nap_consistent: boolean | null;
  gbp_exists: boolean | null;
  gbp_duplicate: boolean | null;
}

export interface ReadinessResult {
  verdict: EligibilityVerdict;
  blockers: ReadinessBlocker[];
  snapshot: ReadinessSnapshot;
  rationale: string;
  /** Contradictions detected between redundant signals (R-12). Empty when none. */
  conflicts: string[];
}

type SignalStatus = 'pass' | 'fail' | 'unknown' | 'partial' | 'no_aplica';

interface SignalEval {
  status: SignalStatus;
  blockers: ReadinessBlocker[];
}

/** SoS legal signal (per-client). */
function evalSos(legal: ReadinessLegalInput): SignalEval {
  const s = legal.sos_status;
  if (s === null || s === undefined || s === 'unknown') {
    return { status: 'unknown', blockers: [] };
  }
  if (s === 'active') return { status: 'pass', blockers: [] };
  // 'suspended' | 'dissolved'
  return { status: 'fail', blockers: ['sos_inactive'] };
}

/** CSLB legal signal: active AND name coincide (per-client). Traceability table
 * folds "CSLB activo/nombre" into a single signal that passes only when both hold. */
function evalCslb(legal: ReadinessLegalInput): SignalEval {
  if (legal.cslb_applicable === false) {
    return { status: 'no_aplica', blockers: [] }; // R-13
  }
  const active = legal.cslb_active;
  const nameMatch = legal.cslb_name_match;
  // Presence requires both the active flag and the name-match flag.
  if (
    active === null ||
    active === undefined ||
    nameMatch === null ||
    nameMatch === undefined
  ) {
    // legal_name_verified === false is still an active failure even if incomplete.
    if (legal.legal_name_verified === false) {
      return { status: 'fail', blockers: ['legal_name_mismatch'] };
    }
    return { status: 'unknown', blockers: [] };
  }
  const blockers: ReadinessBlocker[] = [];
  if (active === false) blockers.push('cslb_inactive');
  if (nameMatch === false || legal.legal_name_verified === false) {
    blockers.push('legal_name_mismatch');
  }
  if (blockers.length > 0) return { status: 'fail', blockers };
  return { status: 'pass', blockers: [] };
}

/** NAP presence signal (per-location). */
function evalNap(presence: ReadinessPresenceInput): SignalEval {
  const risk = presence.nap_risk;
  if (risk === null || risk === undefined) {
    return { status: 'unknown', blockers: [] };
  }
  if (risk === 'consistent') return { status: 'pass', blockers: [] };
  if (risk === 'partial') return { status: 'partial', blockers: [] };
  // 'inconsistent'
  return { status: 'fail', blockers: ['nap_inconsistent'] };
}

/** GBP existence/duplicates presence signal (per-location). */
function evalGbp(presence: ReadinessPresenceInput): SignalEval {
  const exists = presence.gbp_exists;
  if (exists === null || exists === undefined) {
    return { status: 'unknown', blockers: [] };
  }
  if (exists === false) return { status: 'fail', blockers: ['gbp_missing'] };
  // exists === true
  const dup = presence.gbp_duplicate;
  if (dup === null || dup === undefined)
    return { status: 'unknown', blockers: [] };
  if (dup === true) return { status: 'fail', blockers: ['gbp_duplicate'] };
  return { status: 'pass', blockers: [] };
}

/** Detect contradictions between redundant signals (R-12). */
function detectConflicts(
  legal: ReadinessLegalInput,
  presence: ReadinessPresenceInput
): string[] {
  const conflicts: string[] = [];
  // NAP risk says inconsistent but the boolean claims consistent (or vice-versa).
  if (
    presence.nap_risk === 'inconsistent' &&
    presence.nap_consistent === true
  ) {
    conflicts.push('nap_risk=inconsistent contradice nap_consistent=true');
  }
  if (presence.nap_risk === 'consistent' && presence.nap_consistent === false) {
    conflicts.push('nap_risk=consistent contradice nap_consistent=false');
  }
  return conflicts;
}

/**
 * Aggregate the 4 MVP signals into a unified verdict (R-06). Pure — builds fresh
 * objects and never mutates `input.legal` / `input.presence` (R-14).
 */
export function computeReadiness(input: {
  legal: ReadinessLegalInput | null;
  presence: ReadinessPresenceInput | null;
}): ReadinessResult {
  const legal = input.legal;
  const presence = input.presence;

  const snapshot: ReadinessSnapshot = {
    sos_status: legal?.sos_status ?? null,
    cslb_active: legal?.cslb_active ?? null,
    cslb_name_match: legal?.cslb_name_match ?? null,
    nap_risk: presence?.nap_risk ?? null,
    nap_consistent: presence?.nap_consistent ?? null,
    gbp_exists: presence?.gbp_exists ?? null,
    gbp_duplicate: presence?.gbp_duplicate ?? null
  };

  // Whole-side absence → those signals are simply unknown.
  const safeLegal: ReadinessLegalInput = legal ?? {
    sos_status: null,
    cslb_active: null,
    cslb_name_match: null,
    legal_name_verified: null
  };
  const safePresence: ReadinessPresenceInput = presence ?? {
    nap_risk: null,
    nap_consistent: null,
    gbp_exists: null,
    gbp_duplicate: null
  };

  const evals: Record<string, SignalEval> = {
    sos: evalSos(safeLegal),
    cslb: evalCslb(safeLegal),
    nap: evalNap(safePresence),
    gbp: evalGbp(safePresence)
  };

  const conflicts = detectConflicts(safeLegal, safePresence);

  const blockers: ReadinessBlocker[] = [];
  let fails = 0;
  let unknowns = 0;
  let partials = 0;
  let applicable = 0;
  let passes = 0;

  for (const key of Object.keys(evals)) {
    const e = evals[key];
    if (e.status === 'no_aplica') continue; // R-13: does not count as present nor as blocker
    applicable += 1;
    if (e.status === 'fail') {
      fails += 1;
      for (const b of e.blockers) if (!blockers.includes(b)) blockers.push(b);
    } else if (e.status === 'unknown') {
      unknowns += 1;
    } else if (e.status === 'partial') {
      partials += 1;
    } else if (e.status === 'pass') {
      passes += 1;
    }
  }

  let verdict: EligibilityVerdict;
  if (conflicts.length > 0) {
    // R-12: contradictory evidence never resolves to elegible.
    verdict = fails > 0 && unknowns === 0 ? 'bloqueado' : 'necesita_fix';
  } else if (fails > 0) {
    // R-10 / R-11: all applicable present + a failure → bloqueado; mixed with
    // absent signals → necesita_fix.
    verdict = unknowns > 0 ? 'necesita_fix' : 'bloqueado';
  } else if (unknowns > 0) {
    // R-11: absent/null signals, none failing → datos_insuficientes (never elegible).
    verdict = 'datos_insuficientes';
  } else if (partials > 0) {
    // All present, none failing, but a partial (e.g. nap_risk=partial) → necesita_fix.
    verdict = 'necesita_fix';
  } else if (applicable > 0 && passes === applicable) {
    // R-09: the 4 (applicable) signals present AND all pass.
    verdict = 'elegible';
  } else {
    verdict = 'datos_insuficientes';
  }

  return {
    verdict,
    blockers,
    snapshot,
    rationale: buildRationale(verdict, blockers, conflicts, {
      fails,
      unknowns,
      partials,
      passes,
      applicable
    }),
    conflicts
  };
}

function buildRationale(
  verdict: EligibilityVerdict,
  blockers: ReadinessBlocker[],
  conflicts: string[],
  counts: {
    fails: number;
    unknowns: number;
    partials: number;
    passes: number;
    applicable: number;
  }
): string {
  const parts: string[] = [];
  switch (verdict) {
    case 'elegible':
      parts.push(
        `Elegible: las ${counts.applicable} señales aplicables presentes y todas pasan.`
      );
      break;
    case 'bloqueado':
      parts.push(
        `Bloqueado por ${blockers.length} bloqueador(es): ${blockers.join(', ')}.`
      );
      break;
    case 'necesita_fix':
      parts.push('Necesita corrección antes de ser elegible.');
      if (counts.partials > 0)
        parts.push(`${counts.partials} señal(es) parcial(es).`);
      if (blockers.length > 0)
        parts.push(`Bloqueadores presentes: ${blockers.join(', ')}.`);
      break;
    case 'datos_insuficientes':
      parts.push(
        `Datos insuficientes: ${counts.unknowns} señal(es) ausente(s)/desconocida(s); no se asume elegible.`
      );
      break;
  }
  if (conflicts.length > 0) {
    parts.push(`Conflicto de evidencia: ${conflicts.join('; ')}.`);
  }
  return parts.join(' ');
}
