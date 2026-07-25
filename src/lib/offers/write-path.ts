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
 * Proyecta un `content` YA alineado al schema → payload de escritura de OFV.
 * Determinista, puro, sin I/O.
 *
 * R-03 (solo-truthy): reproduce exactamente `if (content[k]) columns[k] = content[k]`
 * del bucle inline del route. R-09: la enumeración, el orden y la condición son
 * idénticos → salida byte-equivalente. NO arma `content` con validación/grounding:
 * eso lo sigue haciendo el route fuera del helper (R-10).
 */
export function buildOfvWritePayload(
  content: Record<string, unknown>
): OfvWritePayload {
  const columns: Record<string, unknown> = {};
  for (const k of OFV_COLUMN_KEYS) {
    if (content[k]) columns[k] = content[k];
  }
  return { columns: columns as OfvWritePayload['columns'], content };
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
