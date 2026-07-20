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
    label: 'Nombre en CSLB coincide',
    description: 'El nombre registrado en CSLB coincide con el GBP'
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

/** Writable, real columns of `nap_checks` accepted by the reconciled insert/update. */
export const NAP_WRITABLE_COLUMNS: readonly string[] = [
  'client_id',
  'google_name_match',
  'cslb_name_match',
  'address_consistent',
  'phone_consistent',
  'cslb_active',
  'entity_verified',
  'items_passed',
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
  items_passed: number;
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
    items_passed: passed,
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
