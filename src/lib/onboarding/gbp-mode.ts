/**
 * F-083 — Onboarding capture of the create-vs-existing axis (R-03/R-04/R-14).
 *
 * The axis lives on `gbp_profiles` (DT-01, per-location home, co-located with
 * `verification_status`). The onboarding NAP page owns the ROOT QUESTION ("does the
 * business already have a GBP on Google?") and the verification ATTESTATION; both
 * persist to `gbp_profiles`. This module is the pure + framework-free seam so the page
 * handler and the unit tests exercise the SAME code path (verification lesson §6.1:
 * test the real path, not a re-implementation — pattern of F-080/F-081).
 *
 * It does NOT touch the `nap_checks` / `credentials` writes (those keep their existing
 * modules); it only owns the `gbp_profiles.{gbp_mode, verification_status}` capture and
 * the pure "which items are N/A in create mode" rule shared by both onboarding screens.
 */
import type { GbpMode } from '../../types/c3-domain.ts';

export type { GbpMode };

/** Root-question options for the onboarding branch (R-03). */
export const GBP_MODE_OPTIONS: ReadonlyArray<{
  value: GbpMode;
  label: string;
}> = [
  {
    value: 'existing',
    label: 'Sí, el negocio ya tiene un Google Business Profile'
  },
  {
    value: 'create',
    label: 'No, hay que crear el GBP desde cero'
  }
];

/** NAP checklist items that assume an EXISTING GBP (external presence). In create mode
 * these are N/A (R-04): the business/legal name coincidence across Google/directories is
 * unanswerable before any listing exists. The LEGAL items (`cslb_name_match`,
 * `cslb_active`, `entity_verified`) are NOT here — they still apply in create mode. */
export const NAP_PRESENCE_ITEM_IDS: readonly string[] = [
  'google_name_match',
  'address_consistent',
  'phone_consistent'
];

/** Credentials checklist items that assume an existing GBP (R-04). */
export const CREDENTIALS_PRESENCE_ITEM_IDS: readonly string[] = ['gbp_access'];

/**
 * Whether a checklist item is N/A (disabled, not required, not penalizing) given the
 * capture mode (R-04). Only presence-dependent items become N/A, and only in create
 * mode; every item stays applicable in existing mode. Absent/null mode → treated as
 * `existing` (R-02, backward-compat) → nothing is N/A.
 */
export function isPresenceItemNA(
  itemId: string,
  gbpMode: GbpMode | null | undefined
): boolean {
  if (gbpMode !== 'create') return false;
  return (
    NAP_PRESENCE_ITEM_IDS.includes(itemId) ||
    CREDENTIALS_PRESENCE_ITEM_IDS.includes(itemId)
  );
}

/** Payload persisted to `gbp_profiles` for the axis + attestation capture. */
export interface GbpPresencePayload {
  gbp_mode: GbpMode;
  /** R-14: set to `'verified'` when the operator attests an existing GBP is
   * verified/claimed. Left undefined (not written) when there is nothing to attest. */
  verification_status?: string;
}

/**
 * Builds the `gbp_profiles` capture payload. In create mode the attestation is
 * meaningless (there is no GBP to verify) so `verification_status` is omitted; in
 * existing mode it is written only when the operator attests (`attested === true`).
 */
export function buildGbpPresencePayload(args: {
  gbpMode: GbpMode;
  attested: boolean;
}): GbpPresencePayload {
  const payload: GbpPresencePayload = { gbp_mode: args.gbpMode };
  if (args.gbpMode === 'existing' && args.attested) {
    payload.verification_status = 'verified';
  }
  return payload;
}

/* ------------------------------------------------------------------------- *
 * Persist / load seams (framework-free, no DOM). Structural client views —
 * the real `@supabase/supabase-js` client satisfies them (call sites cast).
 * ------------------------------------------------------------------------- */

export interface GbpPresenceWriteClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: unknown | null }>;
    };
  };
}

export interface GbpPresenceReadClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        order(
          column: string,
          opts: { ascending: boolean }
        ): {
          limit(n: number): {
            maybeSingle(): PromiseLike<{
              data: Record<string, unknown> | null;
              error: unknown | null;
            }>;
          };
        };
      };
    };
  };
}

/**
 * Loads the latest `gbp_profiles` row for a client using `.maybeSingle()` so 0 rows
 * resolve to null (no 406) and the page loads with safe defaults (backward-compat R-16):
 * missing/legacy rows report `gbp_mode='existing'`.
 */
export async function loadGbpPresence(
  supabase: GbpPresenceReadClient,
  clientId: string
): Promise<{
  gbpProfileId: string | null;
  gbpMode: GbpMode;
  verificationStatus: string | null;
}> {
  const { data } = await supabase
    .from('gbp_profiles')
    .select('id, gbp_mode, verification_status')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = (data ?? null) as Record<string, unknown> | null;
  const gbpProfileId =
    row && typeof row.id === 'string' ? (row.id as string) : null;
  const gbpMode: GbpMode = row?.gbp_mode === 'create' ? 'create' : 'existing';
  const verificationStatus =
    row && typeof row.verification_status === 'string'
      ? (row.verification_status as string)
      : null;
  return { gbpProfileId, gbpMode, verificationStatus };
}

/**
 * Persists the axis + attestation to an existing `gbp_profiles` row (update by id),
 * reading `error` and throwing on failure (F-080 R-04 pattern). Returns nothing; the
 * caller surfaces the error. Requires a `gbpProfileId` (create-of-content already made
 * the draft row, DT-01) — with none, there is no home to write and it is a no-op.
 */
export async function persistGbpPresence(deps: {
  supabase: GbpPresenceWriteClient;
  gbpProfileId: string | null;
  payload: GbpPresencePayload;
  now?: () => string;
}): Promise<boolean> {
  const { supabase, gbpProfileId, payload } = deps;
  if (!gbpProfileId) return false;
  const { error } = await supabase
    .from('gbp_profiles')
    .update({
      ...payload,
      updated_at: deps.now?.() ?? new Date().toISOString()
    })
    .eq('id', gbpProfileId);
  if (error) throw error;
  return true;
}
