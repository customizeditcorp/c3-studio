/**
 * F-078 — T-15 — Credentials capture reconciliation to the REAL `credentials`
 * schema (R-18) + per-client legal signal capture (R-16).
 *
 * DRIFT ROOT CAUSE (design §4): the onboarding/credentials UI wrote `items_completed`
 * as an ARRAY (the real column is INTEGER) and a non-existent `items_total` column →
 * every insert/update failed → `credentials` = 0 rows. This module is the MINIMAL
 * reconciliation: `items_completed` is written as the INTEGER count and `items_total`
 * is dropped. It ADDS capture of the legal signal columns (`sos_status`,
 * `cslb_active`, `legal_name_verified`) that feed the readiness engine's inherited
 * per-client LEGAL input (R-16). It does NOT redesign onboarding (DT-04 containment).
 *
 * Pure + framework-free → unit-testable without a DOM.
 */
import type { SosStatus } from '../../types/c3-domain.ts';

/** UI checklist (client-side working state; produces the integer count). Ids are the
 * onboarding checklist ids, NOT DB columns — only the COUNT is persisted (R-18). */
export const CREDENTIALS_CHECKLIST: ReadonlyArray<{
  id: string;
  label: string;
  required: boolean;
  description: string;
}> = [
  {
    id: 'google_account',
    label: 'Google Account (Gmail)',
    required: true,
    description: 'Cuenta Google del negocio'
  },
  {
    id: 'gbp_access',
    label: 'Acceso a Google Business Profile',
    required: true,
    description: 'Acceso al GBP del negocio'
  },
  {
    id: 'cslb_license',
    label: 'Licencia CSLB',
    required: false,
    description: 'Número de licencia CSLB de California'
  },
  {
    id: 'city_license',
    label: 'Licencia de la ciudad',
    required: false,
    description: 'Licencia municipal del negocio'
  },
  {
    id: 'sos_registration',
    label: 'Registro CA SOS',
    required: false,
    description: 'Registro con el Secretario de Estado de California'
  },
  {
    id: 'website_access',
    label: 'Acceso al sitio web',
    required: false,
    description: 'Credenciales del sitio web / hosting'
  },
  {
    id: 'social_media',
    label: 'Redes Sociales',
    required: false,
    description: 'Facebook, Instagram, etc.'
  },
  {
    id: 'domain_access',
    label: 'Acceso al dominio',
    required: false,
    description: 'GoDaddy, Namecheap, Cloudflare, etc.'
  }
];

export const SOS_STATUS_OPTIONS: ReadonlyArray<{
  value: SosStatus;
  label: string;
}> = [
  { value: 'unknown', label: 'Desconocido / sin verificar' },
  { value: 'active', label: 'Activa' },
  { value: 'suspended', label: 'Suspendida' },
  { value: 'dissolved', label: 'Disuelta' }
];

/** Writable, real columns of `credentials` accepted by the reconciled write. NOTE:
 * `items_total` is intentionally absent (does not exist). `items_completed` is a
 * GENERATED ALWAYS column (F-080 R-02/R-03): the DB computes it from the 8 `*_access`
 * booleans, so writing a value triggers Postgres 400 → 0 rows. It is intentionally
 * absent from this list and from the write payload; it is still returned on GET.
 * `sos_status`/`cslb_active`/`legal_name_verified` are the F-078 additions. */
export const CREDENTIALS_WRITABLE_COLUMNS: readonly string[] = [
  'client_id',
  'entity_type',
  'legal_name',
  'dba_number',
  'cslb_number',
  'city_license',
  'sos_status',
  'cslb_active',
  'legal_name_verified',
  'notes'
];

export interface CredentialsPayload {
  client_id: string;
  entity_type: string;
  legal_name: string;
  dba_number: string;
  cslb_number: string;
  city_license: string;
  // NO `items_completed`: GENERATED ALWAYS column, computed by the DB (F-080 R-02).
  sos_status: SosStatus;
  cslb_active: boolean;
  legal_name_verified: boolean;
}

/**
 * Builds a `credentials` insert/update payload — `items_completed` as the INTEGER
 * count, NO `items_total`, plus the legal signal columns (R-18/R-16).
 */
export function buildCredentialsPayload(args: {
  clientId: string;
  entityType: string;
  legalName: string;
  dbaNumber: string;
  cslbNumber: string;
  cityLicense: string;
  checklist: Record<string, boolean>;
  sosStatus: SosStatus;
  cslbActive: boolean;
  legalNameVerified: boolean;
}): CredentialsPayload {
  // NOTE (F-080): the completed count is NOT written back — `items_completed` is a
  // generated column. Callers that need the count (e.g. activity metadata) derive it
  // locally from the checklist (see `credentials/[clientId]/page.tsx`, R-09).
  return {
    client_id: args.clientId,
    entity_type: args.entityType,
    legal_name: args.legalName,
    dba_number: args.dbaNumber,
    cslb_number: args.cslbNumber,
    city_license: args.cityLicense,
    sos_status: args.sosStatus,
    cslb_active: args.cslbActive,
    legal_name_verified: args.legalNameVerified
  };
}

export interface ParsedCredentials {
  checklist: Record<string, boolean>;
  sosStatus: SosStatus;
  cslbActive: boolean;
  legalNameVerified: boolean;
}

/**
 * Rebuilds capture state from a persisted `credentials` row (backward-compat R-19).
 * Handles the current INTEGER `items_completed` AND (defensively) a legacy ARRAY of
 * item ids — without throwing on either. When only an integer count is present, the
 * per-item checklist cannot be reconstructed (no per-item column exists), so it is
 * returned empty; this never throws.
 */
export function parseCredentialsRow(
  row: Record<string, unknown> | null | undefined
): ParsedCredentials {
  const checklist: Record<string, boolean> = {};
  let sosStatus: SosStatus = 'unknown';
  let cslbActive = false;
  let legalNameVerified = false;

  if (row) {
    // Legacy shape: items_completed was an array of passed item ids.
    if (Array.isArray((row as { items_completed?: unknown }).items_completed)) {
      for (const item of (row as { items_completed: unknown[] })
        .items_completed) {
        if (typeof item === 'string') checklist[item] = true;
      }
    }
    const s = row.sos_status;
    if (
      s === 'active' ||
      s === 'suspended' ||
      s === 'dissolved' ||
      s === 'unknown'
    ) {
      sosStatus = s;
    }
    if (typeof row.cslb_active === 'boolean') cslbActive = row.cslb_active;
    if (typeof row.legal_name_verified === 'boolean') {
      legalNameVerified = row.legal_name_verified;
    }
  }

  return { checklist, sosStatus, cslbActive, legalNameVerified };
}

/* ------------------------------------------------------------------------- *
 * F-080 — testable persist/load seam (framework-free, no DOM).
 * Extracted so the page's autoSave and the unit tests exercise the SAME code path
 * (verification lesson §6.1: test the real path, not a re-implementation).
 * ------------------------------------------------------------------------- */

/** Minimal structural view of the Supabase client the write path needs. */
export interface CredentialsWriteClient {
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

export interface CredentialsReadClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): {
        maybeSingle(): PromiseLike<{
          data: Record<string, unknown> | null;
          error: unknown | null;
        }>;
      };
    };
  };
}

/**
 * Persists a `credentials` row (insert or update) reading `error` on BOTH branches and
 * throwing on failure (F-080 R-04). Returns the row id on success.
 */
export async function persistCredentials(deps: {
  supabase: CredentialsWriteClient;
  payload: CredentialsPayload;
  credentialId: string | null;
  now?: () => string;
}): Promise<string | null> {
  const { supabase, payload, credentialId } = deps;
  if (credentialId) {
    const { error } = await supabase
      .from('credentials')
      .update({
        ...payload,
        updated_at: deps.now?.() ?? new Date().toISOString()
      })
      .eq('id', credentialId);
    if (error) throw error;
    return credentialId;
  }
  const { data, error } = await supabase
    .from('credentials')
    .insert(payload as unknown as Record<string, unknown>)
    .select()
    .single();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * Orchestrates the credentials save: persist → log activity → report success/error via
 * injected callbacks. On any error the write is surfaced through `onError` and `ok` is
 * false, so the caller never shows a false success toast (F-080 R-04/R-05).
 */
export async function handleCredentialsSave(
  deps: {
    supabase: CredentialsWriteClient;
    payload: CredentialsPayload;
    credentialId: string | null;
    now?: () => string;
  },
  handlers: {
    logActivity: () => Promise<void> | void;
    onError: (error: unknown) => void;
  }
): Promise<{ ok: boolean; credentialId: string | null }> {
  try {
    const id = await persistCredentials(deps);
    await handlers.logActivity();
    return { ok: true, credentialId: id };
  } catch (error) {
    handlers.onError(error);
    return { ok: false, credentialId: deps.credentialId };
  }
}

/**
 * Loads the `credentials` row for a client using `.maybeSingle()` so 0 rows resolve to a
 * null row (no 406) and the page loads with safe defaults (F-080 R-06).
 */
export async function loadCredentials(
  supabase: CredentialsReadClient,
  clientId: string
): Promise<{
  credentialId: string | null;
  row: Record<string, unknown> | null;
}> {
  const { data } = await supabase
    .from('credentials')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  const row = (data ?? null) as Record<string, unknown> | null;
  const credentialId =
    row && typeof row.id === 'string' ? (row.id as string) : null;
  return { credentialId, row };
}
