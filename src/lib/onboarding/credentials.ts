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
 * `items_total` is intentionally absent (does not exist); `items_completed` is an
 * INTEGER. `sos_status`/`cslb_active`/`legal_name_verified` are the F-078 additions. */
export const CREDENTIALS_WRITABLE_COLUMNS: readonly string[] = [
  'client_id',
  'entity_type',
  'legal_name',
  'dba_number',
  'cslb_number',
  'city_license',
  'items_completed',
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
  items_completed: number;
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
  const completedCount = Object.values(args.checklist).filter(Boolean).length;
  return {
    client_id: args.clientId,
    entity_type: args.entityType,
    legal_name: args.legalName,
    dba_number: args.dbaNumber,
    cslb_number: args.cslbNumber,
    city_license: args.cityLicense,
    items_completed: completedCount,
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
