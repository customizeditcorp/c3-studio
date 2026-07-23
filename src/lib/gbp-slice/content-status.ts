/**
 * F-089 — Seam de APROBACIÓN de contenido GBP (R-02, R-03, R-04, R-06, R-08, R-09).
 *
 * La descripción GBP tiene un único home vivo y canónico: `gbp_profiles.description`
 * (F-084/F-087). Esta feature co-localiza la APROBACIÓN en la misma fila vía la columna
 * aditiva `gbp_profiles.content_status` (vocabulario `RecordStatus`), **ortogonal** al
 * `verification_status` de F-087 (contenido firmado ≠ activo verificado en Google).
 *
 * Módulo PURO + framework-free para que el handler de la página, la route, el edge (por
 * paridad) y los unit tests ejerciten el MISMO code-path (lección §6.1: testear el path
 * real, no una re-implementación — patrón `gbp-asset.ts` de F-087 / `client-status.ts`
 * de F-088).
 */
import type { RecordStatus } from '@/types/c3-domain';

/** Estado de aprobación por-defecto de una fila `gbp_profiles` fresca/editada (R-02, R-06). */
export const GBP_CONTENT_STATUS_DRAFT: RecordStatus = 'draft';

/** Estado que fija la acción de aprobar contenido GBP (R-04). Único camino a `approved`. */
export const GBP_CONTENT_STATUS_APPROVED: RecordStatus = 'approved';

/** Acción de `activity_log` que registra la aprobación de contenido GBP (R-04). */
export const GBP_CONTENT_APPROVED_ACTION = 'gbp_content_approved';

/** El `output_type` cuyo home es `gbp_profiles` (no `generated_outputs`) — R-03. */
export const GBP_DESCRIPTION_OUTPUT_TYPE = 'gbp_description';

/**
 * R-06 — Sella `content_status='draft'` en un row de escritura de `gbp_profiles`
 * (regeneración vía `generate-gbp` o guardado/edición del editor). La edición de
 * contenido invalida una aprobación previa: la aprobación siempre refleja el contenido
 * actual. La ÚNICA transición a `approved` es `approveGbpContent` (R-04).
 */
export function withDraftContentStatus<T extends Record<string, unknown>>(
  row: T
): T & { content_status: RecordStatus } {
  return { ...row, content_status: GBP_CONTENT_STATUS_DRAFT };
}

/**
 * R-08/R-09 — Resuelve la descripción GBP a mostrar en el preview PÚBLICO: sólo si
 * `content_status === 'approved'` y hay descripción no-vacía; en cualquier otro caso
 * `null` (estado pendiente/omitido, sin filtrar contenido no aprobado a la vista
 * pública). Reemplaza el read doblemente muerto de `generated_outputs` (R-07).
 */
export function resolveApprovedGbpDescription(
  profile:
    | { content_status?: string | null; description?: string | null }
    | null
    | undefined
): string | null {
  if (!profile) return null;
  if (profile.content_status !== GBP_CONTENT_STATUS_APPROVED) return null;
  const desc = profile.description;
  return typeof desc === 'string' && desc.trim().length > 0 ? desc : null;
}

/**
 * R-03 — El home de `gbp_description` es `gbp_profiles` (lo escribe `generate-gbp`).
 * Los write-paths de `generate-content` (route + edge) NO deben duplicar esa fila en
 * `generated_outputs`. Devuelve `false` para `gbp_description` (skip del insert).
 */
export function shouldPersistGeneratedOutput(outputType: string): boolean {
  return outputType !== GBP_DESCRIPTION_OUTPUT_TYPE;
}

/* ------------------------------------------------------------------------- *
 * Write seam de aprobación (framework-free, no DOM). El cliente real de
 * `@supabase/supabase-js` satisface esta vista estructural (el call site castea).
 * Patrón `persistGbpAsset` (gbp-asset.ts) / `persistClientStatus` (client-status.ts).
 * ------------------------------------------------------------------------- */

export interface GbpContentApprovalClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: unknown | null }>;
    };
    insert(
      values: Record<string, unknown>
    ): PromiseLike<{ error: unknown | null }>;
  };
}

/**
 * R-04 — Aprueba el contenido GBP: fija `gbp_profiles.content_status='approved'` (update
 * por id, lee error y THROWea en fallo — patrón F-080, sin éxito falso) + escribe una
 * fila `activity_log` (acción `gbp_content_approved`). Espeja `handleApproveBrief`. El
 * insert de `activity_log` es best-effort (no aborta la aprobación ya persistida).
 * Devuelve `false` (no-op) sin `gbpProfileId` — sin home donde escribir.
 */
export async function approveGbpContent(deps: {
  supabase: GbpContentApprovalClient;
  gbpProfileId: string | null;
  clientId: string;
  tenantId: string;
  userId: string;
  now?: () => string;
}): Promise<boolean> {
  const { supabase, gbpProfileId, clientId, tenantId, userId } = deps;
  if (!gbpProfileId) return false;
  const now = deps.now?.() ?? new Date().toISOString();

  const { error: updErr } = await supabase
    .from('gbp_profiles')
    .update({ content_status: GBP_CONTENT_STATUS_APPROVED, updated_at: now })
    .eq('id', gbpProfileId);
  if (updErr) throw updErr;

  // Best-effort: la aprobación ya persistió; un fallo de log no debe revertir el toast
  // de éxito (paridad con `logActivity`, que no lee error).
  await supabase.from('activity_log').insert({
    tenant_id: tenantId,
    client_id: clientId,
    user_id: userId,
    action: GBP_CONTENT_APPROVED_ACTION,
    entity_type: 'gbp_profile',
    entity_id: gbpProfileId,
    metadata: null
  });

  return true;
}
