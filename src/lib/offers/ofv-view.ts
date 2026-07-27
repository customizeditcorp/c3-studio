/**
 * F-120 — (a) Read model puro de la OFV: **descriptor único** + **proyección pura**
 * de `content` a pares mostrables (R-13, R-18, R-20, R-21, R-22).
 *
 * Seam framework-free (`node --test`-able, sin I/O, sin red, sin React, sin Supabase),
 * hermano de `select-canonical.ts` (F-109), `select-canonical-row.ts` (F-113) y
 * `generation-source.ts` (F-119). **No decide nada**: no elige fila, no clasifica
 * procedencia, no escribe. Sólo dice *qué campos tiene la OFV, en qué orden, con qué
 * etiqueta* y *cómo se leen los valores de un `content` que puede venir en cualquier
 * forma*.
 *
 * ## Por qué la fuente es `content` y NO las columnas planas ni `normalizeOffer` (DT-07)
 *
 * - **`content` ⭐** — es la **fuente única** que F-107 estableció y **exactamente lo que
 *   el operador edita** en la superficie de onboarding (`parseContentToFields` /
 *   `fieldsToContent` leen y escriben ahí). Lo que la ficha muestre desde `content` es
 *   lo mismo que el operador verá al abrir el editor.
 * - **Columnas planas de `offers`** (`big_promise`, `guarantee`, …) — son **derivadas**:
 *   `buildOfvWritePayload` (F-107) las calcula **desde `content`**. Leer la derivada
 *   para mostrar el original invierte la dirección de la verdad.
 * - **`normalizeOffer`** (`src/lib/gbp-slice/context.ts`) — cubre **7** campos orientados
 *   al GBP y convierte `deliverables`/`social_proof` a arrays. Mostraría **una vista del
 *   GBP**, no la OFV del método (11 campos, 8 secciones).
 *
 * ## Este descriptor es la ÚNICA lista de campos de la vista (R-20)
 *
 * El orden, las etiquetas, la agrupación por sección y la cobertura salen de
 * `OFV_VIEW_FIELDS` y de nada más. **No puede existir una segunda lista literal de
 * campos de la OFV para visualización**: es lo que impide la deriva entre la superficie
 * de edición y la de lectura — el riesgo real de "duplicar superficie" (DT-01). Su
 * conjunto de claves está atado por test a `interface OFVFields` **leída de la fuente**
 * (R-21): si el contrato de la OFV gana o pierde un campo, la vista queda **roja**, no
 * incompleta en silencio.
 *
 * ## Honestidad (R-13)
 *
 * La proyección **no oculta, no rellena y no sustituye**: un campo vacío se proyecta
 * vacío y el marcador `[PENDIENTE]` se proyecta **literal**. El marcador es un artefacto
 * legítimo del método (F-104/F-106/F-112); ocultarlo convertiría la vista en una mentira
 * por omisión. Distinguir *"el campo está vacío en la fila"* de *"la vista no lo muestra"*
 * es responsabilidad del consumidor, y por eso cada campo se proyecta **siempre**, con su
 * `isEmpty` explícito.
 *
 * ## Nota sobre las 8 secciones
 *
 * El contrato del método tiene **8 secciones** (1 Big Promise … 8 Social Proof). La
 * superficie de edición agrupa **6 y 7** en un solo `BlockCard` (`'6-7. Garantía y
 * urgencia'`) por conveniencia de layout; el descriptor conserva las 8 del contrato y sus
 * etiquetas de campo son las **literales de la superficie de edición**, para que lo que
 * el operador lee en la ficha y lo que edita en el núcleo se llamen igual.
 */

/** Las 11 claves del contrato de la OFV (`interface OFVFields` de la superficie de edición). */
export type OfvFieldKey =
  | 'big_promise'
  | 'vehicle_name'
  | 'vehicle_steps'
  | 'quick_win'
  | 'option_a'
  | 'option_b'
  | 'option_c'
  | 'deliverables'
  | 'guarantee'
  | 'urgency_scarcity'
  | 'social_proof';

/** Una entrada del descriptor: a qué sección pertenece, qué clave es y cómo se rotula. */
export interface OfvViewFieldDescriptor {
  /** Título de la sección del método a la que pertenece (1..8). */
  readonly section: string;
  /** Clave dentro de `offers.content`. */
  readonly key: OfvFieldKey;
  /** Etiqueta legible — la literal de la superficie de edición. */
  readonly label: string;
  /**
   * ¿Integra el **resumen decisivo** (DT-01)? Los 4 campos que permiten decir en tres
   * segundos *"esta OFV está viva y dice algo"*: la ecuación de valor (`big_promise`),
   * el método branded (`vehicle_name`), lo que el cliente recibe en 7-14 días
   * (`quick_win`) y el risk reversal (`guarantee`).
   */
  readonly summary: boolean;
}

/**
 * **EL DESCRIPTOR** — lista ordenada e inmutable de las 8 secciones / 11 campos.
 * Fuente única de orden, etiqueta, agrupación y cobertura de la vista (R-20).
 */
export const OFV_VIEW_FIELDS: readonly OfvViewFieldDescriptor[] = [
  {
    section: '1. Big Promise',
    key: 'big_promise',
    label: '[Resultado] + [Plazo] + [Vehículo] + [Objeción anulada]',
    summary: true
  },
  {
    section: '2. Vehículo Único (Método Branded™)',
    key: 'vehicle_name',
    label: 'Nombre del método (con ™)',
    summary: true
  },
  {
    section: '2. Vehículo Único (Método Branded™)',
    key: 'vehicle_steps',
    label: '3-5 pasos del método',
    summary: false
  },
  {
    section: '3. Quick Win',
    key: 'quick_win',
    label: 'Entregable inicial medible',
    summary: true
  },
  {
    section: '4. Decision Frame',
    key: 'option_a',
    label: 'Opción A (entrada)',
    summary: false
  },
  {
    section: '4. Decision Frame',
    key: 'option_b',
    label: 'Opción B (recomendado)',
    summary: false
  },
  {
    section: '4. Decision Frame',
    key: 'option_c',
    label: 'Opción C (status quo)',
    summary: false
  },
  {
    section: '5. Entregables específicos',
    key: 'deliverables',
    label: 'Lista de qué recibe el cliente',
    summary: false
  },
  {
    section: '6. Garantía',
    key: 'guarantee',
    label: 'Garantía / Risk Reversal',
    summary: true
  },
  {
    section: '7. Urgencia / Escasez',
    key: 'urgency_scarcity',
    label: 'Urgencia / Escasez (ÉTICA)',
    summary: false
  },
  {
    section: '8. Social Proof',
    key: 'social_proof',
    label: 'Prueba social real y verificable',
    summary: false
  }
] as const;

/** Las 8 secciones del contrato, en orden de aparición, sin repetir. Derivadas del descriptor. */
export const OFV_VIEW_SECTIONS: readonly string[] = OFV_VIEW_FIELDS.reduce<
  string[]
>((acc, f) => {
  if (!acc.includes(f.section)) acc.push(f.section);
  return acc;
}, []);

/** Las claves del resumen decisivo (DT-01), derivadas del descriptor. */
export const OFV_SUMMARY_KEYS: readonly OfvFieldKey[] = OFV_VIEW_FIELDS.filter(
  (f) => f.summary
).map((f) => f.key);

/** Un campo ya proyectado: el descriptor + el valor **tal como está** en la fila. */
export interface OfvProjectedField extends OfvViewFieldDescriptor {
  /**
   * El valor legible del campo, **verbatim**: string vacío si la clave no existe o no
   * aporta texto; el marcador `[PENDIENTE]` **literal** si eso es lo que hay (R-13).
   */
  readonly value: string;
  /** `true` si el valor está vacío **en la fila** — no si la vista decidió no mostrarlo. */
  readonly isEmpty: boolean;
}

/**
 * `content` puede llegar como objeto, como **string JSON**, como `null`/`undefined`, o con
 * claves ausentes. Devuelve siempre un objeto plano (`{}` cuando no hay nada legible) y
 * **nunca lanza** — mismo contrato de tolerancia que `parseContentToFields` (R-22).
 */
function toPlainObject(content: unknown): Record<string, unknown> {
  if (content === null || content === undefined) return {};
  if (typeof content === 'string') {
    try {
      const parsed: unknown = JSON.parse(content);
      return parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof content === 'object' && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  return {};
}

/**
 * Renderiza un valor arbitrario a texto **sin ocultar nada y sin fabricar nada**:
 * string verbatim · número/booleano por `String` · array de escalares unido por saltos
 * de línea (dialecto de `normalizeOffer`, F-110) · objeto por `JSON.stringify`. Ausente
 * o `null` ⇒ `''`. Nunca lanza.
 */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number')
    return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => renderValue(item))
      .filter((s) => s.length > 0)
      .join('\n');
  }
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/**
 * **La proyección pura.** `content` → las 11 entradas del descriptor, en orden, con su
 * valor tal como está en la fila.
 *
 * Contrato:
 *   - **Nunca lanza** para ninguna entrada (objeto, string JSON, string no-JSON, `null`,
 *     `undefined`, claves ausentes, valores no-string) — R-22.
 *   - **No muta** la entrada.
 *   - **No oculta, no rellena, no sustituye**: los 11 campos se devuelven **siempre**;
 *     un valor vacío queda vacío (`isEmpty: true`) y `[PENDIENTE]` queda literal — R-13.
 *   - El resultado depende **sólo** del descriptor: agregar o quitar un campo de la vista
 *     es editar `OFV_VIEW_FIELDS`, nada más (R-20).
 */
export function projectOfvContent(content: unknown): OfvProjectedField[] {
  const obj = toPlainObject(content);
  return OFV_VIEW_FIELDS.map((f) => {
    const value = renderValue(obj[f.key]);
    return { ...f, value, isEmpty: value.trim().length === 0 };
  });
}

/** El subconjunto **decisivo** (DT-01) de una proyección, conservando el orden del descriptor. */
export function summaryOfvFields(
  projected: readonly OfvProjectedField[]
): OfvProjectedField[] {
  return projected.filter((f) => f.summary);
}
