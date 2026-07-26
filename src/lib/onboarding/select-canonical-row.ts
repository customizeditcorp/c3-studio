/**
 * F-113 — Desempate canónico de `briefs` y `buyer_personas` (helper puro, DT-01(a)).
 *
 * Operación **espejo** de `src/lib/offers/select-canonical.ts` (F-109): mismo patrón
 * de seam framework-free (`node --test`-able, sin I/O, sin red, sin Supabase), **otra
 * noción de "fila real"**.
 *
 * ## El defecto que cierra
 *
 * Los read-paths del generador resuelven la fila a consumir con
 * `.eq('status','approved').order('version', desc).limit(1)`. Ante **empate de
 * `version`** no hay `ORDER BY` total ⇒ Postgres devuelve una fila **arbitraria**.
 * Grounding de producción (2026-07-25, read-only):
 *
 *   - `buyer_personas` / SCS Cleaning: **3 `approved`, todas `version = 1`** — gana
 *     `e8e8c500` (**2 claves**, su `raw_text` es el volcado del prompt-contexto) y
 *     shadowea a `76b1f28e` (**26 claves**, objeciones reales) y `3c62c1e6` (**23**).
 *   - `briefs` / SCS Cleaning: **4 `approved`, todas `version = 1`** — gana
 *     `99748e46`, el **más viejo** y con **6 claves**, sobre tres de **25**.
 *
 * ## Por qué la riqueza y no "`raw_text` no vacío"
 *
 * `e8e8c500` **tiene** un `raw_text` largo: un booleano de "no vacío" (el criterio
 * que sí discrimina en `offers`, donde el shadow tiene `big_promise` vacío) **NO**
 * discrimina acá. Lo que discrimina es la **riqueza de `content`**: 2 vs 26 y 6 vs 25.
 * Por eso "espejo de F-109" significa *mismo patrón, distinta noción de fila real* y
 * **no** *misma función*: `pickCanonicalOffer` queda intacta (R-09 / DT-02).
 *
 * ## Criterio (DT-01(a)), en orden
 *
 *   1. `version` desc     — preserva la semántica actual (mayor versión gana).
 *   2. **riqueza** desc   — a igualdad de versión, gana la fila más COMPLETA.
 *   3. `updated_at` desc  — a igualdad de riqueza (el caso normal entre filas buenas),
 *                           gana la más reciente. Acá (2)+(3) colapsan al criterio
 *                           simple: este selector **contiene** a `version → updated_at`.
 *   4. `id` asc           — determinismo total, último recurso.
 *
 * **El código elige bien; NO borra nada.** Las filas duplicadas permanecen: el dedup
 * es acción del **operador** (R-23, espejo literal de R-16 de F-109). Sin DDL, sin
 * `delete`, sin `UPDATE`.
 *
 * **Alcance honesto (R-34):** esto cura el **síntoma en lectura**. La causa raíz vive
 * en escritura — `buildBriefWritePayload` fija `version: opts.version ?? 1` ⇒ los
 * empates se seguirán creando (DT-06, fuera de scope y declarado).
 */
import { isPendingMarker } from '../method-context/pending.ts';

/** Forma mínima que requiere el selector (laxa; el DB row la cumple por `select`). */
export interface CanonicalContentRow {
  id: string;
  version: number;
  content: unknown;
  updated_at?: string;
}

/**
 * ¿El escalar aporta contenido útil? String no vacío tras `trim()` o número finito;
 * el marcador `[PENDIENTE]` **no** cuenta (R-04).
 *
 * `[PENDIENTE]` se reconoce con `isPendingMarker` de `src/lib/method-context/pending.ts`
 * — la **fuente única** del marcador establecida por R-07 de F-112 (R-08 acá): este
 * módulo **no** redefine el literal. Este predicado es conductualmente equivalente a
 * `cleanScalar(v) !== null` del mismo módulo (hay un test que ancla la equivalencia
 * para que no derive en silencio).
 *
 * **Compatibilidad doctrinal (espejo literal de R-30 de F-111 y R-06 de F-112):** no
 * contradice F-104/F-106/F-109. No altera la fila, no la reescribe, no la borra, no
 * bloquea su aprobación y no oculta el marcador al operador — `[PENDIENTE]` sigue
 * siendo un marcador legítimo del artefacto. Solo evita que una fila **enteramente
 * placeholder** (caso real: JD Valley `400dbe18`, todos los canónicos en `[PENDIENTE]`,
 * pre-F-106) sea preferida sobre una fila con contenido real.
 *
 * **Residual declarado:** un `[PENDIENTE]` *embebido* en una frase más larga cuenta
 * como contenido útil; filtrarlo exigiría reescribir contenido aprobado. Límite
 * conocido, no silenciado.
 */
function isUsefulScalar(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (t.length === 0) return false;
  return !isPendingMarker(t);
}

/**
 * Nº de claves de `content` con valor **útil**, **EXCLUYENDO la clave `raw_text`**
 * (R-03). `raw_text` se excluye porque es exactamente lo que NO discrimina: la fila
 * basura `e8e8c500` lo tiene largo.
 *
 * Cuenta como útil: string no vacío tras `trim()`, número finito, o array con **al
 * menos un ítem escalar útil**.
 * NO cuenta: clave ausente, `null`, string vacío o solo-espacios, objeto, booleano,
 * array vacío o de puros ítems no útiles, y el marcador `[PENDIENTE]` (R-04).
 *
 * SI `content` no es un objeto plano (`null`, string, array, o cualquier otro tipo)
 * ENTONCES la riqueza es **0**.
 *
 * Puro: no muta la fila.
 */
export function contentRichness(row: { content?: unknown }): number {
  const content = row?.content;
  if (
    content === null ||
    typeof content !== 'object' ||
    Array.isArray(content)
  ) {
    return 0;
  }
  let count = 0;
  for (const [key, value] of Object.entries(
    content as Record<string, unknown>
  )) {
    if (key === 'raw_text') continue; // R-03: el `raw_text` NO discrimina
    if (Array.isArray(value)) {
      if (value.some((item) => isUsefulScalar(item))) count += 1;
      continue;
    }
    if (isUsefulScalar(value)) count += 1;
  }
  return count;
}

/**
 * Elige la fila canónica de un conjunto de candidatos de `briefs` o `buyer_personas`
 * (típicamente ya filtrado a `status='approved'`). Determinista y **puro**: ordena
 * sobre una **copia**, NO muta la entrada, NO borra nada. `[]`/`null`/`undefined` →
 * `null` (mismo contrato que `pickCanonicalOffer`, R-06).
 *
 * Con **una sola** fila devuelve **esa** fila sin condicionales adicionales (R-07) —
 * el caso de todos los clientes sin empate ⇒ su comportamiento queda **idéntico por
 * construcción** (R-18).
 *
 * El resultado es **independiente del orden de llegada** de los candidatos (R-05): el
 * criterio es un orden **total** (el último desempate es `id`, único).
 *
 * Orden DT-01(a): version desc → riqueza desc → updated_at desc → id asc.
 */
export function pickCanonicalContentRow<T extends CanonicalContentRow>(
  rows: T[] | null | undefined
): T | null {
  if (!rows || rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => {
    // 1. version desc — preserva la semántica actual
    if (a.version !== b.version) return b.version - a.version;
    // 2. riqueza desc — la fila más COMPLETA gana (la hueca es el bug)
    const ar = contentRichness(a);
    const br = contentRichness(b);
    if (ar !== br) return br - ar;
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
