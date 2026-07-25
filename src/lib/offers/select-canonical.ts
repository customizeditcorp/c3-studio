/**
 * F-109 — (d) Tie-break determinista del consumo de offers (helper puro, DT-03).
 *
 * Seam framework-free (`node --test`-able, sin I/O) que, dado un conjunto de offers
 * `approved` en tie de `version` (hallazgo F-107: JD Valley tiene 2 approved v1, una
 * REAL `a6c66d5c` y una VACÍA-shadow `b106ad61`), elige una única fila canónica de
 * forma DETERMINISTA. La OFV real gana sobre la vacía-shadow SIN borrar ninguna fila
 * (R-10/R-11/R-16 — el delete es acción del operador, no del agente).
 *
 * Criterio (DT-03), en orden:
 *   1. `version` desc      — mantiene la semántica actual (mayor versión gana).
 *   2. contenido no-vacío  — una fila con `big_promise` real vence a la vacía-shadow
 *                            (la vacía es el bug). Reusa la noción de F-066
 *                            `isOfferNonEmpty` (big_promise plana O `content.big_promise`).
 *   3. `updated_at` desc   — desempate determinista secundario.
 *   4. `id` asc            — determinismo total, último recurso.
 *
 * SIN DDL, sin prompts. Patrón seam-puro del repo (write-path.ts F-107,
 * precondition.ts F-066).
 */

/** Forma mínima que requiere el selector (laxa; el DB row la cumple por `select`). */
export interface CanonicalOfferRow {
  id: string;
  version: number;
  content: unknown;
  big_promise?: unknown;
  updated_at?: string;
}

/**
 * True cuando la fila lleva contenido estratégico real: un `big_promise` no vacío en
 * la columna plana O dentro de `content` jsonb. Alineado con
 * `isOfferNonEmpty` (F-066 `precondition.ts`) para coherencia de "OFV real vs shadow".
 */
function hasRealOfferContent(row: {
  big_promise?: unknown;
  content?: unknown;
}): boolean {
  const flat = typeof row.big_promise === 'string' ? row.big_promise : '';
  const content = row.content;
  const nested =
    content &&
    typeof content === 'object' &&
    typeof (content as Record<string, unknown>).big_promise === 'string'
      ? ((content as Record<string, unknown>).big_promise as string)
      : '';
  return flat.trim().length > 0 || nested.trim().length > 0;
}

/**
 * Elige la fila canónica de un conjunto de offers (típicamente ya filtrado a
 * `status='approved'`). Determinista y puro. NO borra ni muta nada. `[]` → `null`.
 *
 * Orden DT-03: version desc → contenido-no-vacío → updated_at desc → id asc.
 */
export function pickCanonicalOffer<T extends CanonicalOfferRow>(
  rows: T[]
): T | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    // 1. version desc
    if (a.version !== b.version) return b.version - a.version;
    // 2. contenido no-vacío gana (la vacía-shadow es el bug)
    const aReal = hasRealOfferContent(a);
    const bReal = hasRealOfferContent(b);
    if (aReal !== bReal) return aReal ? -1 : 1;
    // 3. updated_at desc (string ISO → orden lexicográfico = cronológico)
    const au = a.updated_at ?? '';
    const bu = b.updated_at ?? '';
    if (au !== bu) return au < bu ? 1 : -1;
    // 4. id asc (determinismo total)
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
  return sorted[0];
}
