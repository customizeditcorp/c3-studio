/**
 * F-099 — Loop de revisión (Scope A): seam PURA, framework-free.
 *
 * Reconecta el tramo de VUELTA del loop de revisión: el cliente escribe
 * `previews.feedback` (via preview-feedback / "Pedir cambios") pero NINGÚN lector
 * lo surfacea al staff (recon §2.C.2). Esta seam decide el FEEDBACK PENDIENTE a
 * mostrar en `/gbp` y arma la DIRECTIVA de ajuste para la regeneración.
 *
 * Aditivo y SIN DDL: el supersede es por RECENCIA — `generate-gbp` ya INSERTa un
 * preview nuevo (`approved=false`, `feedback` null) en cada regeneración; si el
 * surface mira el preview MÁS RECIENTE, tras regenerar ese preview nuevo no tiene
 * feedback pendiente → el banner se oculta solo, sin flag de "consumo" (R-05).
 *
 * Framework-free y `node --test`-able (patrón `resolveBriefFacts`/`normalizeOffer`/
 * `compliance.ts`). La orquestación (lectura del preview, banner, call a la ruta)
 * vive en `/gbp` y `generate-gbp/route.ts`, no aquí.
 */

/** Preview shape mínimo que la regla de surface necesita (subset de `previews`). */
export interface PreviewFeedbackRow {
  approved?: boolean | null;
  feedback?: string | null;
}

/**
 * Decide el FEEDBACK PENDIENTE a surfacear (R-01/R-03/R-04/R-05): dado el preview GBP
 * MÁS RECIENTE del cliente, devuelve su `feedback` (trim) SOLO si es un pedido-de-cambios
 * (`approved === false`) con texto no-vacío; en cualquier otro caso → null.
 *   - preview null/ausente            → null  (sin preview)                     (R-03)
 *   - approved === true               → null  (aprobado-con-feedback; R-04, fuera de scope)
 *   - feedback vacío/null/no-string   → null  (preview nuevo tras regen → supersede) (R-05)
 * Puro → node --test-able.
 */
export function pickPendingFeedback(
  preview: PreviewFeedbackRow | null | undefined
): string | null {
  if (!preview) return null;
  if (preview.approved === true) return null; // R-04: aprobación no se surfacea
  const fb =
    typeof preview.feedback === 'string' ? preview.feedback.trim() : '';
  return fb.length > 0 ? fb : null; // R-03/R-05: sin feedback → sin banner
}

/**
 * Directiva imperativa del ajuste por feedback (R-07/R-13). El call-site (la ruta) la
 * inserta en el user message ANTES del cierre de idioma (F-081 sigue al final, R-08).
 * `feedback` vacío/no-string → string vacío (no debería llamarse en ese caso).
 */
export function buildFeedbackDirective(feedback: string): string {
  const fb = typeof feedback === 'string' ? feedback.trim() : '';
  if (fb.length === 0) return '';
  return [
    'REVISIÓN DEL CLIENTE: el cliente revisó la versión anterior y pidió los siguientes cambios:',
    fb,
    'Ajusta la descripción para atender ese pedido, sin inventar datos que no estén ya provistos.'
  ].join('\n');
}
