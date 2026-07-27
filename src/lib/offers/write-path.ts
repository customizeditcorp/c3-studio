/**
 * F-107 — Write-path de la OFV (helpers puros, DT-01/DT-04).
 *
 * Seam framework-free (`node --test`-able) que normaliza el write-path partido
 * entre los dos escritores de `offers` (cliente `page.tsx` `handleApproveOFV` +
 * ruta `generate-content/route.ts` rama `ofv`). Garantiza por construcción el
 * single-source: `content` jsonb + columnas planas/jsonb nunca vuelven a divergir
 * al editar la OFV (R-01), cerrando el bug de `handleApproveOFV` (escribía solo
 * `content`).
 *
 * Dos piezas puras (design §1):
 *   - `buildOfvWritePayload(content)`  — proyecta un `content` YA alineado al
 *     schema → `{ columns (solo-truthy), content }`. Byte-equivalente al bucle
 *     inline previo del route (`route.ts:485-497`) → no-regresión R-09.
 *     **F-116 R-19/R-20:** además resuelve por columna con precedencia declarada
 *     como dato (`OFV_COLUMN_FALLBACKS`), fallback-only y solo sobre `columns`.
 *   - `ofvFieldsToContent(fields)`     — adapta la forma de formulario (`OFVFields`)
 *     al `content` alineado al schema (renames/fold/split, DT-01) para que la UI
 *     alimente el mismo proyector (R-04).
 *
 * SIN DDL: todas las columnas de `offers` ya existen. Patrón seam-puro del repo
 * (write-path.ts F-097, gbp-asset.ts F-087, content-status.ts F-089).
 */

export interface OfvWritePayload {
  /** Columnas a escribir — solo claves con valor truthy (R-03). */
  columns: Partial<{
    big_promise: string;
    vehicle_name: string;
    vehicle_description: string;
    quick_win: string;
    guarantee: string;
    urgency: string;
    decision_frame: unknown; // jsonb
    deliverables: unknown; // jsonb (array)
    social_proof: unknown; // jsonb (array)
  }>;
  content: Record<string, unknown>;
}

/**
 * Forma del formulario de OFV (`OFVFields` en `page.tsx`). Se declara laxa
 * (claves opcionales) para que el adaptador acepte el objeto del form sin
 * acoplar el módulo puro al componente cliente.
 */
export interface OFVFieldsLike {
  big_promise?: string;
  vehicle_name?: string;
  vehicle_steps?: string;
  quick_win?: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  deliverables?: string;
  guarantee?: string;
  urgency_scarcity?: string;
  social_proof?: string;
}

/**
 * Las 9 columnas del schema de `offers`, en el MISMO orden y con la MISMA
 * condición solo-truthy del bucle inline del route (`route.ts:485-497`). El
 * orden se preserva deliberadamente para garantizar byte-equivalencia (R-09).
 */
const OFV_COLUMN_KEYS = [
  'big_promise',
  'vehicle_name',
  'vehicle_description',
  'quick_win',
  'decision_frame',
  'guarantee',
  'urgency',
  'social_proof',
  'deliverables'
] as const;

/**
 * F-116 R-19 — Las 2 columnas jsonb-array. Su clave canónica es la MISMA que la
 * columna; lo que cambia es la FORMA: array ⇒ tal cual (byte-equivalente al bucle
 * inline), string ⇒ split por líneas (es el dialecto de formulario que R-11
 * declara en `prompts/ofv/system_prompt.md`).
 */
const OFV_ARRAY_COLUMNS: ReadonlySet<string> = new Set([
  'deliverables',
  'social_proof'
]);

/** Un paso de resolución: lee del `content` crudo y devuelve el valor de la
 * columna, o `undefined` si ese alias no aplica. NUNCA muta la entrada. */
type OfvColumnFallback = (content: Record<string, unknown>) => unknown;

/**
 * F-116 R-19 — **Tabla de precedencia por columna, declarada como DATO** (mismo
 * patrón que `OFV_COLUMN_KEYS` arriba y que `PERSONA_METHOD_LABELS` de F-112): no
 * hay condicionales de alias dispersos por el cuerpo del helper.
 *
 * Se lee así: para cada columna, primero gana SIEMPRE su clave canónica (R-20,
 * fallback-only); solo si esa clave falta o viene vacía se prueban estos alias en
 * orden. Los alias NO son especulativos: son exactamente los 3 dialectos censados
 * en `offers.content` el 2026-07-26 (`vehicle_unique` objeto `{name, steps[]}` en
 * 7 filas, `vehicle_steps` string en 4, `urgency_scarcity` en 12) más el fold del
 * Decision Frame que el dialecto de formulario emite como `option_a/b/c`.
 *
 * Efecto acotado a `columns`: `content` se devuelve intacto (procedencia — se
 * persiste lo que el modelo dijo, no lo que el write-path dedujo).
 */
const OFV_COLUMN_FALLBACKS: Readonly<
  Record<string, readonly OfvColumnFallback[]>
> = {
  // `vehicle_name` ← vehicle_name → vehicle_unique.name
  vehicle_name: [(c) => nonEmptyString(readProp(c.vehicle_unique, 'name'))],
  // `vehicle_description` ← vehicle_description → vehicle_steps → vehicle_unique.steps
  vehicle_description: [
    (c) => nonEmptyString(c.vehicle_steps),
    (c) => joinLines(readProp(c.vehicle_unique, 'steps'))
  ],
  // `urgency` ← urgency → urgency_scarcity
  urgency: [(c) => nonEmptyString(c.urgency_scarcity)],
  // `decision_frame` ← decision_frame (objeto) → fold de option_a/b/c
  decision_frame: [(c) => foldDecisionFrame(c)]
};

/**
 * Proyecta el `content` de una OFV → payload de escritura. Determinista, puro,
 * sin I/O.
 *
 * R-03 (solo-truthy): para la clave canónica reproduce exactamente
 * `if (content[k]) columns[k] = content[k]` del bucle inline del route. R-09: la
 * enumeración, el orden y la condición son idénticos → salida byte-equivalente
 * cuando el `content` ya viene alineado al schema. NO arma `content` con
 * validación/grounding: eso lo sigue haciendo el route fuera del helper (R-10).
 *
 * F-116 R-19/R-20: cuando la clave canónica falta o no trae la forma correcta, se
 * consulta `OFV_COLUMN_FALLBACKS` en orden. Es **fallback-only** (la canónica
 * gana siempre) y **solo sobre `columns`** ⇒ los 4 casos de byte-equivalencia de
 * F-107 siguen verdes sin tocarlos.
 */
export function buildOfvWritePayload(
  content: Record<string, unknown>
): OfvWritePayload {
  const columns: Record<string, unknown> = {};
  for (const k of OFV_COLUMN_KEYS) {
    const canonical = resolveCanonicalColumn(k, content);
    if (canonical !== undefined) {
      columns[k] = canonical;
      continue;
    }
    for (const fallback of OFV_COLUMN_FALLBACKS[k] ?? []) {
      const value = fallback(content);
      if (value !== undefined) {
        columns[k] = value;
        break;
      }
    }
  }
  return { columns: columns as OfvWritePayload['columns'], content };
}

/**
 * La clave canónica de la columna, o `undefined` si no aporta valor usable.
 * Para las columnas planas es literalmente la condición del bucle inline
 * (`if (content[k])`). Para las 2 jsonb-array acepta el array tal cual (idéntico
 * al bucle) y además convierte el string del dialecto de formulario.
 */
function resolveCanonicalColumn(
  key: string,
  content: Record<string, unknown>
): unknown {
  const value = content[key];
  if (OFV_ARRAY_COLUMNS.has(key)) {
    if (Array.isArray(value)) return value; // byte-equivalente al bucle inline
    if (typeof value === 'string') {
      const lines = splitLines(value);
      return lines.length > 0 ? lines : undefined;
    }
    return value ? value : undefined;
  }
  return value ? value : undefined;
}

/** Lee una propiedad de un objeto plano; `undefined` si no es objeto. Sin mutar. */
function readProp(source: unknown, prop: string): unknown {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return undefined;
  }
  return (source as Record<string, unknown>)[prop];
}

/** String no vacía, o `undefined`. */
function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

/** Array de strings → texto de una línea por ítem (columna `text`), o `undefined`. */
function joinLines(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const lines = value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/**
 * Fold `option_a`/`option_b`/`option_c` → objeto `decision_frame` (jsonb). Misma
 * forma y mismo criterio solo-truthy que `ofvFieldsToContent` (F-107): el
 * dialecto de formulario que R-11 declara y el que la UI ya escribe convergen en
 * la MISMA proyección.
 */
function foldDecisionFrame(
  content: Record<string, unknown>
): Record<string, string> | undefined {
  const frame: Record<string, string> = {};
  for (const key of ['option_a', 'option_b', 'option_c'] as const) {
    const value = nonEmptyString(content[key]);
    if (value) frame[key] = value;
  }
  return Object.keys(frame).length > 0 ? frame : undefined;
}

/** Split de un textarea en array de líneas no vacías (compat `normalizeOffer.toStringArray`). */
function splitLines(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Adapta la forma de formulario (`OFVFields`) → `content` alineado al schema de
 * `buildOfvWritePayload` (R-04, mapeo DT-01). Puro.
 *
 * Mapeo (design §3):
 *   - directos: `big_promise`, `vehicle_name`, `quick_win`, `guarantee`
 *   - renames:  `vehicle_steps`→`vehicle_description`, `urgency_scarcity`→`urgency`
 *   - fold:     `option_a`+`option_b`+`option_c` → `decision_frame` (objeto, solo
 *               claves no vacías)
 *   - split:    `deliverables`/`social_proof` string → `string[]` (por salto de línea)
 *   - preserva `raw_text` (resumen legible, igual que `fieldsToContent` hoy)
 *
 * Solo agrega claves con valor truthy (no ensucia el content con vacíos).
 */
export function ofvFieldsToContent(
  fields: OFVFieldsLike
): Record<string, unknown> {
  const content: Record<string, unknown> = {};

  // Directos + renames (planas text).
  if (fields.big_promise) content.big_promise = fields.big_promise;
  if (fields.vehicle_name) content.vehicle_name = fields.vehicle_name;
  if (fields.vehicle_steps) content.vehicle_description = fields.vehicle_steps;
  if (fields.quick_win) content.quick_win = fields.quick_win;
  if (fields.guarantee) content.guarantee = fields.guarantee;
  if (fields.urgency_scarcity) content.urgency = fields.urgency_scarcity;

  // Fold option_a/b/c → decision_frame (objeto, solo claves no vacías).
  const decisionFrame: Record<string, string> = {};
  if (fields.option_a) decisionFrame.option_a = fields.option_a;
  if (fields.option_b) decisionFrame.option_b = fields.option_b;
  if (fields.option_c) decisionFrame.option_c = fields.option_c;
  if (Object.keys(decisionFrame).length > 0) {
    content.decision_frame = decisionFrame;
  }

  // Split string → array (jsonb).
  const deliverables = splitLines(fields.deliverables);
  if (deliverables.length > 0) content.deliverables = deliverables;
  const socialProof = splitLines(fields.social_proof);
  if (socialProof.length > 0) content.social_proof = socialProof;

  // Preserva raw_text: resumen legible desde los campos truthy del form,
  // idéntico a `fieldsToContent` (page.tsx) hoy.
  content.raw_text = Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');

  return content;
}
