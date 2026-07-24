/**
 * F-097 — Write-path del brief (helpers puros, DT-05).
 *
 * Seam framework-free (`node --test`-able) que normaliza el write-path partido
 * entre los dos escritores de `briefs` (cliente `page.tsx` + ruta
 * `generate-content/route.ts`). Garantiza por construcción:
 *   - el invariante columna `raw_text === content.raw_text` (R-10/R-11);
 *   - la decisión UPDATE-in-place vs INSERT del path compartido del tableMap
 *     (`brief`/`buyer_persona`/`ofv`) → a lo sumo 1 draft por (client_id, step)
 *     (R-06/R-07/R-08).
 *
 * SIN DDL: `briefs` ya tiene `content, raw_text, prompt_version_id (nullable),
 * status, version`. Patrón seam-puro del repo (gbp-asset.ts F-087,
 * content-status.ts F-089, deliverable-public.ts F-093).
 */

export interface BriefWritePayload {
  content: Record<string, unknown>;
  raw_text: string | null;
  status: string;
  version: number;
}

/**
 * Construye el payload de escritura del brief a partir del `content` ya armado
 * (p. ej. `fieldsToContent(briefFields)`). Determinista.
 *
 * R-10/R-11: `raw_text` = `content.raw_text` si es string, si no `null`. Un solo
 * lugar que garantiza el invariante → los call-sites no pueden olvidarlo.
 */
export function buildBriefWritePayload(
  content: Record<string, unknown>,
  opts: { status: 'draft' | 'approved'; version?: number }
): BriefWritePayload {
  const raw_text =
    typeof content.raw_text === 'string' ? content.raw_text : null;
  return {
    content,
    raw_text,
    status: opts.status,
    version: opts.version ?? 1
  };
}

/**
 * Decide UPDATE-in-place vs INSERT para el path compartido del tableMap
 * (R-06/R-07/R-08). `latest` = fila más reciente del `client_id` en la tabla
 * destino (o `null`).
 *
 * Regla: existe un draft vivo → se reusa (update, conserva `id`/`version`);
 * si no (fila aprobada, o no hay fila) → insert. Idempotencia (R-08): un draft
 * existente siempre se reutiliza → nunca se acumulan filas huérfanas.
 */
export function resolveWriteMode(
  latest: { id: string; status: string } | null
): { mode: 'update'; id: string } | { mode: 'insert' } {
  if (latest && latest.status === 'draft') {
    return { mode: 'update', id: latest.id };
  }
  return { mode: 'insert' };
}
