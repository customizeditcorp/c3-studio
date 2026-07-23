/**
 * F-087 — Seam del ACTIVO GBP creado a mano: identidad (metadata, NO secretos) +
 * lifecycle de verificación (R-01, R-04, R-05, R-06, R-10, R-11).
 *
 * La identidad (Gmail operativo de referencia, GBP URL, place_id) y el lifecycle
 * (`verification_status` promovido de flag binario a estado controlado) viven en la
 * tabla per-location `gbp_profiles` — la misma casa que F-083 usa para `gbp_mode` y
 * `verification_status`. Este módulo es la seam PURA + framework-free para que el
 * handler de la página y los unit tests ejerciten el MISMO code-path (lección §6.1:
 * testear el path real, no una re-implementación — patrón `gbp-mode.ts` de F-083).
 *
 * Independencia (R-10): `buildGbpAssetPayload` NO incluye `gbp_mode` — fijar el
 * lifecycle NUNCA muta el origen (create/existing). No-secretos (R-02): el payload
 * sólo lleva metadata de referencia; ningún campo captura passwords/recovery/secretos.
 */

/** Estados controlados del lifecycle de verificación (app-layer, no enum Postgres). */
export type VerificationLifecycleStatus =
  | 'pending'
  | 'created'
  | 'verified'
  | 'not_found';

/** Opciones del `<Select>` de estado del lifecycle (R-04). `pending` es el default. */
export const VERIFICATION_STATUS_OPTIONS: ReadonlyArray<{
  value: VerificationLifecycleStatus;
  label: string;
}> = [
  { value: 'pending', label: 'Pendiente (aún no se creó/verificó)' },
  { value: 'created', label: 'Creado en Google (pendiente de verificar)' },
  { value: 'verified', label: 'Verificado (postal/teléfono)' },
  { value: 'not_found', label: 'No existe (se buscó y no hay listing)' }
];

/** Los estados que registran una fecha de verificación en `verified_at` (R-05). */
const VERIFIED_AT_STATES: ReadonlySet<VerificationLifecycleStatus> =
  new Set<VerificationLifecycleStatus>(['created', 'verified']);

/** Identidad editable del activo (metadata de referencia, R-01). NO secretos (R-02). */
export interface GbpAssetIdentity {
  operationalEmail: string;
  gbpUrl: string;
  placeId: string;
}

/** Payload persistido a `gbp_profiles` para identidad + lifecycle. SIN `gbp_mode` (R-10). */
export interface GbpAssetPayload {
  operational_email: string | null;
  gbp_url: string | null;
  place_id: string | null;
  verification_status: VerificationLifecycleStatus;
  verification_method: string | null;
  verification_notes: string | null;
  /** R-05: fecha de la transición; sólo se setea cuando `status ∈ {created, verified}`. */
  verified_at: string | null;
}

/** Normaliza un texto opcional: trim + vacío → null (no persiste cadenas en blanco). */
function nullable(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Construye el payload de captura del activo (R-01/R-04/R-05/R-10). Setea `verified_at`
 * SÓLO cuando el estado pasa a `created`/`verified` (R-05); en `pending`/`not_found` lo
 * deja `null` (degradación honesta: sin verificación, sin fecha). NO incluye `gbp_mode`
 * (independencia de dimensiones, R-10) ni ningún campo de secreto (R-02).
 */
export function buildGbpAssetPayload(args: {
  identity: GbpAssetIdentity;
  status: VerificationLifecycleStatus;
  method?: string;
  notes?: string;
  now?: () => string;
}): GbpAssetPayload {
  const { identity, status } = args;
  const verifiedAt = VERIFIED_AT_STATES.has(status)
    ? (args.now?.() ?? new Date().toISOString())
    : null;
  return {
    operational_email: nullable(identity.operationalEmail),
    gbp_url: nullable(identity.gbpUrl),
    place_id: nullable(identity.placeId),
    verification_status: status,
    verification_method: nullable(args.method),
    verification_notes: nullable(args.notes),
    verified_at: verifiedAt
  };
}

/* ------------------------------------------------------------------------- *
 * Persist / load seams (framework-free, no DOM). El cliente real de
 * `@supabase/supabase-js` satisface estas vistas estructurales (los call sites
 * castean). Patrón `persistGbpPresence`/`loadGbpPresence` (gbp-mode.ts:129-178).
 * ------------------------------------------------------------------------- */

export interface GbpAssetWriteClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: unknown | null }>;
    };
  };
}

export interface GbpAssetReadClient {
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

/** Estado cargado del activo (defaults seguros; R-06: `pending` por default). */
export interface LoadedGbpAsset {
  gbpProfileId: string | null;
  operationalEmail: string;
  gbpUrl: string;
  placeId: string;
  verificationStatus: VerificationLifecycleStatus;
  verificationMethod: string;
  verificationNotes: string;
  verifiedAt: string | null;
}

/** Coacciona un `verification_status` crudo a un estado válido; default `pending` (R-06). */
function coerceStatus(value: unknown): VerificationLifecycleStatus {
  if (
    value === 'created' ||
    value === 'verified' ||
    value === 'not_found' ||
    value === 'pending'
  ) {
    return value;
  }
  return 'pending';
}

function strOr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/**
 * Carga la fila `gbp_profiles` más reciente del cliente con `.maybeSingle()` (0 filas →
 * defaults seguros, sin 406). R-06: `verification_status` ausente/legacy → `pending`.
 */
export async function loadGbpAsset(
  supabase: GbpAssetReadClient,
  clientId: string
): Promise<LoadedGbpAsset> {
  const { data } = await supabase
    .from('gbp_profiles')
    .select(
      'id, operational_email, gbp_url, place_id, verification_status, verification_method, verification_notes, verified_at'
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = (data ?? null) as Record<string, unknown> | null;
  return {
    gbpProfileId: row && typeof row.id === 'string' ? (row.id as string) : null,
    operationalEmail: strOr(row?.operational_email),
    gbpUrl: strOr(row?.gbp_url),
    placeId: strOr(row?.place_id),
    verificationStatus: coerceStatus(row?.verification_status),
    verificationMethod: strOr(row?.verification_method),
    verificationNotes: strOr(row?.verification_notes),
    verifiedAt:
      row && typeof row.verified_at === 'string'
        ? (row.verified_at as string)
        : null
  };
}

/**
 * Persiste identidad + lifecycle a una fila `gbp_profiles` existente (update por id),
 * leyendo `error` y lanzando en fallo (patrón F-080 R-04; el caller superficia el
 * error con `toast.error`). Sin `gbpProfileId` no hay home a escribir → no-op (`false`).
 */
export async function persistGbpAsset(deps: {
  supabase: GbpAssetWriteClient;
  gbpProfileId: string | null;
  payload: GbpAssetPayload;
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
