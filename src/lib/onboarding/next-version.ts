/**
 * F-119 — Seam de versión: de dónde sale la `version` de un `INSERT` nuevo (R-01..R-06).
 *
 * Seam framework-free (`node --test`-able, sin I/O, sin red, sin Supabase), hermano de
 * `select-canonical-row.ts` (F-113) y `offers/select-canonical.ts` (F-109). Cierra **la
 * mitad en ESCRITURA** del defecto de CL-099 que F-113 declaró abierto en su §12.bis:
 *
 *   > *(F-113 R-34)* «`buildBriefWritePayload` sigue fijando `version: opts.version ?? 1`
 *   > […] cada `insert` nuevo nace en el mismo empate de `version = 1`.»
 *
 * El único call-site que hoy PRODUCE empates es `generate-content/route.ts` (el path
 * compartido del `tableMap`): aprobar → regenerar inserta una fila nueva en `v1`, empatada
 * con la aprobada. Los 6 `INSERT` de la superficie de onboarding sólo disparan con la tabla
 * VACÍA para ese cliente ⇒ su `1` ya era el `max+1` correcto; usan igual este seam para que
 * el invariante sea **estructural y no inferencial** (DT-03).
 *
 * ## (i) Por qué el máximo es por `(client_id, tabla)` sobre TODOS los `status` (DT-02, R-05)
 *
 * La aprobación es un **flip in-place del MISMO `id`** que **conserva la `version`**
 * (`page.tsx` brief/persona/OFV). Draft y approved son, por lo tanto, **un único espacio de
 * numeración**. Particionar el máximo por `(client_id, status)` reintroduciría el empate por
 * la puerta de atrás: un draft nacido en `v2` dentro del namespace "draft" se aprueba y entra
 * al conjunto `approved`, donde ya podía existir un `v2`. El máximo global de la tabla (sin
 * `client_id`) tampoco sirve: acopla tenants entre sí.
 *
 * ## (ii) El límite: la carrera queda ABIERTA — se declara, no se resuelve (DT-06, R-41)
 *
 * Dos escrituras **concurrentes** sobre el mismo `(client_id, tabla)` pueden leer el mismo
 * conjunto y calcular el mismo `max+1`. El modo de fallo es **exactamente el estado previo a
 * F-119** para ese par de filas — dos filas con la misma `version` — que
 * `pickCanonicalContentRow` (F-113) / `pickCanonicalOffer` (F-109) resuelven de forma
 * **determinista**. No hay error, no hay escritura perdida, no hay constraint que violar
 * (sin DDL): es **degradación graciosa hacia el status quo**, no una regresión. Cerrarla de
 * verdad exige un índice único o un `max()+1` server-side dentro del propio `INSERT` ⇒ **DDL**,
 * prohibido en esta fase (CL-103 límite 2).
 *
 * ## (iii) El tie-break de F-113/F-109 **NO se retira** (R-14)
 *
 * Cortar la fuente **no** vuelve prescindible la red — la **convierte en lo que debe ser**:
 * red de seguridad para las filas **históricas**, que no se regeneran (16 briefs, 8 personas,
 * 18 offers, **todas en `v1`** al 2026-07-27), y para la carrera de (ii). F-119 corta la
 * PRODUCCIÓN de empates nuevos; no repara el pasado (R-43) y no borra ni renumera nada.
 *
 * ## (iv) Nunca lanza, nunca bloquea (R-42)
 *
 * El invariante se enforcea en el **contrato del seam + tests**, no abortando escrituras:
 * perder el borrador del operador cuesta más que un empate que F-113/F-109 ya resuelven.
 * Ninguna entrada — incluida basura total — produce excepción.
 */

/** Forma mínima que requiere el seam (laxa a propósito: el DB row la cumple por `select`). */
export interface VersionedRow {
  version?: unknown;
}

/**
 * ¿La `version` de una fila es utilizable para el máximo? Entero/decimal **numérico finito
 * y > 0**. Se descarta `null`, `undefined`, la clave ausente, strings (incluido `'2'`),
 * `NaN`, `Infinity`, negativos y `0` (R-04): son dialectos de datos, no versiones.
 *
 * Deliberadamente **NO** se coacciona `'2'` a `2`: coaccionar convertiría un dialecto en un
 * hecho duro y el piso `1` de R-04 dejaría de ser un piso conocido.
 */
function usableVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Devuelve la `version` que debe llevar un `INSERT` nuevo: `max(version) + 1` sobre las filas
 * existentes del `(client_id, tabla)`, **sin particionar por `status`** (R-05).
 *
 * Contrato:
 *   - `[]` / `null` / `undefined` ⇒ **`1`** (R-02) — preserva byte-idénticamente el
 *     comportamiento actual del único caso en que hoy inserta la UI: cliente sin filas.
 *   - **Invariante de no-empate (R-03):** el resultado es **estrictamente mayor** que toda
 *     `version` usable presente en la entrada.
 *   - Las `version` no usables se ignoran para el máximo y el resultado nunca baja de `1` (R-04).
 *   - **Puro:** no muta la entrada, no hace I/O, mismo input ⇒ mismo output (R-06).
 *   - **Nunca lanza** (R-42).
 */
export function nextVersion(rows: VersionedRow[] | null | undefined): number {
  if (!rows || rows.length === 0) return 1;
  let max = 0;
  for (const row of rows) {
    const v = row?.version;
    if (usableVersion(v) && v > max) max = v;
  }
  // `max` sigue en 0 si no había ninguna `version` usable ⇒ piso 1 (R-04 + R-02).
  return Math.floor(max) + 1;
}
