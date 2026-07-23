/**
 * F-078 — T-14 — NAP capture reconciliation to the REAL `nap_checks` schema (R-17).
 *
 * DRIFT ROOT CAUSE (design §4): the onboarding/nap UI used to write columns that do
 * NOT exist (`business_name`, `city`, `check_items`, `items_total`, `completed_by`)
 * and `risk_level ∈ {'low','medium','high'}` (OUTSIDE the `nap_risk` enum), so every
 * insert failed → `nap_checks` = 0 rows. This module is the MINIMAL reconciliation:
 * it builds a payload with ONLY real columns and a valid `nap_risk` enum value. It
 * does NOT redesign onboarding (DT-04 containment).
 *
 * Pure + framework-free → unit-testable without a DOM.
 */
import type { NapRisk } from '../../types/c3-domain.ts';

/** Real boolean columns of `nap_checks` (LIVE schema 2026-07-17). The checklist item
 * ids ARE these column names so the checklist maps 1:1 to persisted columns. */
export const NAP_CHECKLIST: ReadonlyArray<{
  id: string;
  label: string;
  description: string;
}> = [
  {
    id: 'google_name_match',
    label: 'Nombre coincide en Google/GBP',
    description:
      'El nombre del negocio aparece igual en Google Business Profile'
  },
  {
    id: 'cslb_name_match',
    // F-083 (R-05): reworded so it is answerable independently of GBP existence —
    // it is a LEGAL signal (name coincidence with the official record), applicable
    // in both create and existing modes. Was "…coincide con el GBP".
    label: 'Nombre en CSLB coincide',
    description:
      'El nombre registrado en CSLB coincide con el nombre legal del negocio'
  },
  {
    id: 'address_consistent',
    label: 'Dirección consistente',
    description: 'Misma dirección formateada en todos los directorios'
  },
  {
    id: 'phone_consistent',
    label: 'Teléfono consistente',
    description: 'Mismo número de teléfono en todos los sitios'
  },
  {
    id: 'cslb_active',
    label: 'Licencia CSLB activa',
    description: 'La licencia CSLB está vigente y activa'
  },
  {
    id: 'entity_verified',
    label: 'Entidad CA SOS verificada',
    description:
      'La entidad legal está verificada en el Secretario de Estado de CA'
  }
];

/** Writable, real columns of `nap_checks` accepted by the reconciled insert/update.
 * NOTE (F-080 R-01/R-03): `items_passed` is a GENERATED ALWAYS column — the DB computes
 * it from the 6 booleans. Writing a value to it triggers Postgres 400
 * (`cannot insert a non-DEFAULT value into a generated column`) → 0 rows. It is
 * intentionally absent here and from the write payload; it is still returned on GET. */
export const NAP_WRITABLE_COLUMNS: readonly string[] = [
  'client_id',
  'google_name_match',
  'cslb_name_match',
  'address_consistent',
  'phone_consistent',
  'cslb_active',
  'entity_verified',
  'risk_level',
  'notes',
  'checked_by'
];

/** Maps passed/total to the `nap_risk` enum + display metadata. */
export function napRiskFor(
  passed: number,
  total: number
): {
  level: NapRisk;
  label: string;
  color: 'default' | 'secondary' | 'destructive';
} {
  if (total > 0 && passed === total) {
    return { level: 'consistent', label: 'Consistente', color: 'default' };
  }
  if (passed === 0) {
    return {
      level: 'inconsistent',
      label: 'Inconsistente',
      color: 'destructive'
    };
  }
  return { level: 'partial', label: 'Parcial', color: 'secondary' };
}

export interface NapCheckPayload {
  client_id: string;
  google_name_match: boolean;
  cslb_name_match: boolean;
  address_consistent: boolean;
  phone_consistent: boolean;
  cslb_active: boolean;
  entity_verified: boolean;
  // NO `items_passed`: GENERATED ALWAYS column, computed by the DB (F-080 R-01).
  risk_level: NapRisk;
  notes: string;
  checked_by: string | null;
}

/**
 * Builds a `nap_checks` insert/update payload from the checklist state — ONLY real
 * columns, `risk_level` always a valid `nap_risk` enum value (R-17).
 */
export function buildNapCheckPayload(args: {
  clientId: string;
  checklist: Record<string, boolean>;
  notes: string;
  checkedBy: string | null;
}): NapCheckPayload {
  const { clientId, checklist, notes, checkedBy } = args;
  const flags = NAP_CHECKLIST.map((item) => Boolean(checklist[item.id]));
  // `passed` stays local: it feeds `napRiskFor` → `risk_level` (a real, non-generated
  // column). It is NOT written back as `items_passed` (generated column; F-080 R-01).
  const passed = flags.filter(Boolean).length;
  const risk = napRiskFor(passed, NAP_CHECKLIST.length);
  return {
    client_id: clientId,
    google_name_match: Boolean(checklist['google_name_match']),
    cslb_name_match: Boolean(checklist['cslb_name_match']),
    address_consistent: Boolean(checklist['address_consistent']),
    phone_consistent: Boolean(checklist['phone_consistent']),
    cslb_active: Boolean(checklist['cslb_active']),
    entity_verified: Boolean(checklist['entity_verified']),
    risk_level: risk.level,
    notes,
    checked_by: checkedBy
  };
}

/**
 * Rebuilds checklist state from a persisted `nap_checks` row (backward-compat R-19).
 * Handles the new boolean-column shape AND (defensively) a legacy `check_items`
 * array — without throwing on either.
 */
export function parseNapCheckRow(
  row: Record<string, unknown> | null | undefined
): { checklist: Record<string, boolean>; notes: string } {
  const checklist: Record<string, boolean> = {};
  if (!row) return { checklist, notes: '' };

  // Legacy shape: an array of passed item ids under `check_items`.
  if (Array.isArray((row as { check_items?: unknown }).check_items)) {
    for (const item of (row as { check_items: unknown[] }).check_items) {
      if (typeof item === 'string') checklist[item] = true;
    }
  }
  // Current shape: one boolean column per checklist item.
  for (const item of NAP_CHECKLIST) {
    const v = row[item.id];
    if (typeof v === 'boolean') checklist[item.id] = v;
  }
  const notes = typeof row.notes === 'string' ? row.notes : '';
  return { checklist, notes };
}

/* ------------------------------------------------------------------------- *
 * F-080 — testable persist/load seam (framework-free, no DOM).
 * Extracted so the page handler and the unit tests exercise the SAME code path
 * (verification lesson §6.1: test the real path, not a re-implementation).
 * ------------------------------------------------------------------------- */

/** Minimal structural view of the Supabase client the write path needs. The real
 * `@supabase/supabase-js` client satisfies this (call sites cast). */
export interface NapWriteClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: unknown | null }>;
    };
    insert(values: Record<string, unknown>): {
      select(): {
        single(): PromiseLike<{
          data: { id?: string } | null;
          error: unknown | null;
        }>;
      };
    };
  };
}

export interface NapReadClient {
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
 * Persists a `nap_checks` row (insert or update) reading `error` on BOTH branches and
 * throwing on failure (F-080 R-04). Returns the row id on success.
 */
export async function persistNapCheck(deps: {
  supabase: NapWriteClient;
  payload: NapCheckPayload;
  napCheckId: string | null;
  now?: () => string;
}): Promise<string | null> {
  const { supabase, payload, napCheckId } = deps;
  if (napCheckId) {
    const { error } = await supabase
      .from('nap_checks')
      .update({
        ...payload,
        updated_at: deps.now?.() ?? new Date().toISOString()
      })
      .eq('id', napCheckId);
    if (error) throw error;
    return napCheckId;
  }
  const { data, error } = await supabase
    .from('nap_checks')
    .insert(payload as unknown as Record<string, unknown>)
    .select()
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * Orchestrates the NAP save: persist → log activity → report success/error via injected
 * callbacks. On any error the write is surfaced through `onError` and `ok` is false, so
 * the caller never shows a false success toast (F-080 R-04/R-05).
 */
export async function handleNapSave(
  deps: {
    supabase: NapWriteClient;
    payload: NapCheckPayload;
    napCheckId: string | null;
    now?: () => string;
  },
  handlers: {
    logActivity: () => Promise<void> | void;
    onError: (error: unknown) => void;
  }
): Promise<{ ok: boolean; napCheckId: string | null }> {
  try {
    const id = await persistNapCheck(deps);
    await handlers.logActivity();
    return { ok: true, napCheckId: id };
  } catch (error) {
    handlers.onError(error);
    return { ok: false, napCheckId: deps.napCheckId };
  }
}

/**
 * Loads the latest `nap_checks` row for a client using `.maybeSingle()` so 0 rows
 * resolve to a null row (no 406) and the page loads with an empty checklist (F-080 R-06).
 */
export async function loadLatestNapCheck(
  supabase: NapReadClient,
  clientId: string
): Promise<{
  napCheckId: string | null;
  checklist: Record<string, boolean>;
  notes: string;
}> {
  const { data } = await supabase
    .from('nap_checks')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = (data ?? null) as Record<string, unknown> | null;
  const parsed = parseNapCheckRow(row);
  const napCheckId =
    row && typeof row.id === 'string' ? (row.id as string) : null;
  return { napCheckId, ...parsed };
}
