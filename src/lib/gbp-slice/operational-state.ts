/**
 * F-066 — T-03 — Modelo mínimo de estado operativo por sistema (R-07, R-08, R-09).
 *
 * This is an INVENTORY OF STATE, not a vault of secrets. It is limited to Google/GBP
 * for this slice, is READ-ONLY, and degrades to `pendiente` when no source is
 * populated (the live `credentials` table is empty; there is no operational_state
 * table yet — DT-F066-01). The operational state conditions PUBLICATION (scope-out,
 * R-14), NOT content generation: generation always proceeds.
 *
 * R-08 separation: the model reads only READINESS SIGNALS. It NEVER reads, stores or
 * exposes access secrets (`gbp_access`, `google_ads_access`, …) nor legal-identity
 * fields (`legal_name`, `dba_number`, `cslb_number`, `city_license`). The live
 * `credentials` table (a flat boolean checklist mixed with legal identity) is NOT
 * adopted as the model (R-08).
 *
 * R-09 separation: commercial/contract data (`client_plans`: fees, payment, dates)
 * is orthogonal to "ready to publish?". If an operational signal happens to live in
 * `client_plans` today (e.g. `gbp_created`), it is consumed as an OPERATIONAL signal
 * here, never as commercial data, and the slice NEVER writes `client_plans`.
 */

export type OpSystem = 'gbp';
export type OpStatus = 'pendiente' | 'activo' | 'no_aplica';
export type ManagedBy = 'c3' | 'cliente';

export interface OperationalState {
  system: OpSystem;
  status: OpStatus;
  managed_by: ManagedBy | null;
  /** Provenance of the state, for auditability. */
  source: 'default' | 'client_plans_signal';
}

/** Readiness signals the slice is allowed to read (R-08). Deliberately excludes
 * every access boolean and legal-identity field. */
export interface GbpReadinessSignal {
  /** Operational signal that may live in `client_plans.gbp_created` (R-09). */
  gbp_created?: boolean | null;
  managed_by?: ManagedBy | null;
}

/** Access/identity keys that must NEVER be adopted as operational state (R-08). */
export const FORBIDDEN_OP_STATE_KEYS: readonly string[] = [
  // access secrets
  'gbp_access',
  'google_ads_access',
  'meta_suite_access',
  'instagram_access',
  'facebook_page_access',
  'business_email_access',
  'website_access',
  'analytics_access',
  // legal identity
  'legal_name',
  'dba_number',
  'cslb_number',
  'city_license'
];

/**
 * Defensive guard (R-08): rejects any attempt to feed access secrets or legal
 * identity into the operational-state model. Throws instead of silently absorbing
 * a `credentials`-shaped object.
 */
export function assertNoSecrets(input: Record<string, unknown>): void {
  for (const key of FORBIDDEN_OP_STATE_KEYS) {
    if (key in input) {
      throw new Error(
        `assertNoSecrets: forbidden key "${key}" — the operational-state model is an ` +
          `inventory of readiness signals, not a vault of access secrets or legal identity (R-08).`
      );
    }
  }
}

/**
 * Reads the minimal operational state for GBP (R-07). Degrades to `pendiente` when
 * no readiness source is populated. NEVER reads secrets. Content generation must
 * proceed regardless of the returned status (R-07/R-14).
 */
export function readOperationalStateGbp(
  signal?: GbpReadinessSignal | null
): OperationalState {
  if (!signal) {
    return {
      system: 'gbp',
      status: 'pendiente',
      managed_by: null,
      source: 'default'
    };
  }

  // Reject accidental secret/identity payloads (R-08).
  assertNoSecrets(signal as Record<string, unknown>);

  if (signal.gbp_created === true) {
    return {
      system: 'gbp',
      status: 'activo',
      managed_by: signal.managed_by ?? null,
      source: 'client_plans_signal'
    };
  }

  return {
    system: 'gbp',
    status: 'pendiente',
    managed_by: signal.managed_by ?? null,
    source: signal.managed_by ? 'client_plans_signal' : 'default'
  };
}
