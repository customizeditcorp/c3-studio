/**
 * F-123 (R-07..R-11 · DT-04) — **Declaración ÚNICA de las plantillas del Brief.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE — el defecto no es la plantilla, es la PROCEDENCIA FALSA
 * ─────────────────────────────────────────────────────────────────────────────────
 * Los botones «Sugerir …» del Brief se presentaban con **ícono de chispas** y escribían en
 * campos marcados **`dot='ai'`**: la UI afirmaba que ese texto lo había **inferido el
 * modelo para ESE cliente**. Lo producía un `const` del archivo — sin `fetch`, sin llamada
 * al modelo, sin recibir los datos del cliente.
 *
 * ⭐ **Daño medido en producción (`SELECT` read-only, 2026-07-28): 8 de 18 briefs
 * contaminados (44 %), 6 de ellos `approved`** — incluido `be43470f`, el brief de SCS que
 * el arco usaba como patrón de oro. Rango 2026-04-14 → 2026-07-27: **anterior a F-095 y
 * posterior a F-122**, porque esto **nunca pasó por el generador** y ninguna feature que
 * mirara la generación podía verlo.
 *
 * Corolario que conviene no perder: **un gate humano no compensa una procedencia falsa.**
 * 6 de 8 se aprobaron porque el ícono decía «lo generó la IA» ⇒ revisar ese texto no era
 * el trabajo del humano.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * LA FORMA: VARIANTES CON PARTES, NO `(ctx) => string`
 * ─────────────────────────────────────────────────────────────────────────────────
 * Una función opaca **construye** pero no se puede **invertir**: el detector no tendría de
 * dónde sacar el esqueleto. Las **partes literales SON el esqueleto** —lo que ninguna
 * ranura puede cambiar—, y por eso las 3 plantillas parametrizadas siguen siendo
 * detectables aunque el operador haya cambiado de ciudad después de clickear.
 *
 * Las **variantes** modelan sin trucos el caso real de `search_behavior`, que hoy **no
 * interpola sino que BIFURCA**: con industria escribe una frase, sin industria escribe
 * otra. Y **una plantilla fija es el caso degenerado**: una variante, una parte literal,
 * cero ranuras ⇒ **un solo mecanismo para las 7** (DT-04).
 *
 * ⚠️ **R-10 — F-123 corrige la PROCEDENCIA, no rediseña las plantillas.** Cada texto que
 * este catálogo construye es **byte-idéntico** al que producía `3be506d`. El test lo
 * verifica extrayendo los strings **del ancla**, no re-tipeándolos.
 *
 * ⛔ **R-03 — este módulo NO conoce `clients.industry`.** Recibe `industry_label` **ya
 * resuelto** por `toIndustryLabel` (F-121/F-122), así que el source-guard de F-122 R-18 no
 * gana un sujeto nuevo que vigilar y sigue verde por construcción.
 *
 * ⛔ **R-09 — módulo PURO:** sin React, sin Supabase, sin red, sin estado. `node --test`-able.
 */

/** Las ranuras que una plantilla puede llevar. Nada más es variable. */
export type Slot = 'business_name' | 'industry_label' | 'city';

/** Una parte de una plantilla: texto invariante, o una ranura con su fallback. */
export type Part = string | { slot: Slot; fallback?: string };

/** El contexto con el que se construye una plantilla. La industria entra YA RESUELTA. */
export interface TemplateCtx {
  business_name?: string | null;
  /** Etiqueta legible de industria, ya resuelta por `toIndustryLabel`. NUNCA el código. */
  industry_label?: string | null;
  city?: string | null;
}

/**
 * Una variante de una plantilla. Se elige **la primera cuyo `when` es verdadero**, así que
 * el orden importa y la última debe ser incondicional.
 */
export interface Variant {
  when: (ctx: TemplateCtx) => boolean;
  parts: Part[];
}

/** Una plantilla: el campo del Brief que escribe y sus variantes (≥1). */
export interface FieldTpl {
  field: string;
  variants: Variant[];
  /**
   * ⚠️ **Excepción DECLARADA (enmienda del operador, 2026-07-28).** `false` sólo para
   * plantillas **sin esqueleto distintivo suficiente**, que por eso quedan **fuera de la
   * detección**. Ver `demo_age`: su literal es `'35-55'`, un rango de edad que cualquier
   * humano tipea ⇒ detectarlo produciría **falsos positivos**, y R-25 los prohíbe porque
   * **un falso rojo desactiva el guard**. La plantilla sigue en el catálogo (R-08: cero
   * literales inline); lo que se declara es que **no sirve como señal de procedencia**.
   */
  detectable?: boolean;
}

/** Un botón: su id, su etiqueta y los campos que escribe. */
export interface TemplateBtn {
  id: string;
  /** ⭐ R-13 — la etiqueta declara EJEMPLO/PLANTILLA. Nunca promete contexto inexistente. */
  label: string;
  fields: FieldTpl[];
}

const hasIndustry = (c: TemplateCtx): boolean =>
  typeof c.industry_label === 'string' && c.industry_label.trim().length > 0;
const always = (): boolean => true;

/**
 * ⭐⭐ **EL CATÁLOGO — 7 botones · 12 campos.** Declarado UNA sola vez en todo el repo.
 *
 * ⭐ **R-13 — las dos etiquetas que MENTÍAN dejaron de mentir.** Antes decían *«Sugerir
 * dolores **basado en industria**»* y *«Sugerir demografía **para la industria**»*, y son
 * justamente **de las FIJAS**: prometían un contexto que nunca recibieron. (Las 3 que sí
 * reciben la industria no lo anunciaban.)
 */
export const TEMPLATE_BUTTONS: readonly TemplateBtn[] = [
  {
    id: 'main_problem',
    label: 'Insertar ejemplo de problema',
    fields: [
      {
        field: 'main_problem',
        variants: [
          {
            when: hasIndustry,
            parts: [
              'Sin presencia digital — los clientes no pueden encontrar ',
              { slot: 'business_name', fallback: 'el negocio' },
              ' en Google para ',
              { slot: 'industry_label' },
              ' en ',
              { slot: 'city', fallback: 'la zona' }
            ]
          },
          {
            when: always,
            parts: [
              'Sin presencia digital — los clientes no pueden encontrar ',
              { slot: 'business_name', fallback: 'el negocio' },
              ' en Google en ',
              { slot: 'city', fallback: 'la zona' }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'pains',
    label: 'Insertar ejemplos de dolores',
    fields: [
      {
        field: 'pain_1',
        variants: [
          {
            when: always,
            parts: [
              'Depende 100% del boca a boca — sin pipeline digital de leads'
            ]
          }
        ]
      },
      {
        field: 'pain_2',
        variants: [
          {
            when: always,
            parts: [
              'Competidores con GBP verificado le roban clientes que buscan en Google'
            ]
          }
        ]
      },
      {
        field: 'pain_3',
        variants: [
          {
            when: always,
            parts: [
              'No puede cotizar rápido porque no tiene formulario ni landing'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'demographics',
    label: 'Insertar ejemplo de demografía',
    fields: [
      {
        field: 'demo_age',
        // ⚠️ Excepción declarada — ver `FieldTpl.detectable`. `'35-55'` no identifica nada.
        detectable: false,
        variants: [{ when: always, parts: ['35-55'] }]
      },
      {
        field: 'demo_occupation',
        variants: [
          {
            when: always,
            parts: ['General contractor, event planner, property manager']
          }
        ]
      },
      {
        field: 'demo_income',
        variants: [
          {
            when: always,
            parts: ['$60K-$200K (B2B) / $40K-$80K (residential)']
          }
        ]
      },
      {
        field: 'demo_language',
        variants: [
          { when: always, parts: ['English + Spanish (bilingual market)'] }
        ]
      }
    ]
  },
  {
    id: 'psychographics',
    label: 'Insertar ejemplo de psicografía',
    fields: [
      {
        field: 'psychographics',
        variants: [
          {
            when: always,
            parts: [
              'Valora: confiabilidad, puntualidad, limpieza. Miedo: unidades sucias que afecten reputación. Aspiración: proveedor invisible — cero quejas de usuarios.'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'search_behavior',
    label: 'Insertar ejemplo de comportamiento',
    fields: [
      {
        field: 'search_behavior',
        variants: [
          {
            when: hasIndustry,
            parts: [
              'Busca en Google: ',
              { slot: 'industry_label' },
              ' near me, ',
              { slot: 'industry_label' },
              ' rental ',
              { slot: 'city', fallback: 'su zona' },
              '. Decide por: disponibilidad rápida + precio + reviews.'
            ]
          },
          {
            when: always,
            parts: ['Decide por: disponibilidad rápida + precio + reviews.']
          }
        ]
      }
    ]
  },
  {
    id: 'goal_90',
    label: 'Insertar ejemplo de meta',
    fields: [
      {
        field: 'goal_90',
        variants: [
          {
            when: always,
            parts: [
              'GBP verificado y optimizado + website live + 5 reseñas de Google'
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'goal_12m',
    label: 'Insertar ejemplo de meta',
    fields: [
      {
        field: 'goal_12m',
        variants: [
          {
            when: hasIndustry,
            parts: [
              'Top 3 en Google Maps para ',
              { slot: 'industry_label' },
              ' en ',
              { slot: 'city', fallback: 'su zona' },
              ' + 15-20 leads/mes'
            ]
          },
          {
            when: always,
            parts: [
              'Top 3 en Google Maps en ',
              { slot: 'city', fallback: 'su zona' },
              ' + 15-20 leads/mes'
            ]
          }
        ]
      }
    ]
  }
];

/** Todos los campos alcanzables por algún botón (12). Derivado, nunca enumerado. */
export const TEMPLATE_FIELDS: readonly string[] = TEMPLATE_BUTTONS.flatMap(
  (b) => b.fields.map((f) => f.field)
);

/** Los campos que además son DETECTABLES (11: todos menos `demo_age`). */
export const DETECTABLE_FIELDS: readonly string[] = TEMPLATE_BUTTONS.flatMap(
  (b) => b.fields.filter((f) => f.detectable !== false).map((f) => f.field)
);

/** El valor de una ranura, con su fallback. Misma semántica que el `||` del original. */
function slotValue(
  part: { slot: Slot; fallback?: string },
  ctx: TemplateCtx
): string {
  const raw = ctx[part.slot];
  const v = typeof raw === 'string' ? raw : '';
  return v.length > 0 ? v : (part.fallback ?? '');
}

/** Las partes LITERALES de una variante, en orden. Es su esqueleto. */
export function literalParts(v: Variant): string[] {
  return v.parts.filter((p): p is string => typeof p === 'string');
}

/**
 * ⭐ **R-11 (enmendado por el operador, 2026-07-28) — ¿esta variante es IDENTIFICABLE?**
 *
 * El umbral se mide sobre la **SUMA ORDENADA de las partes literales**, no sobre la parte
 * suelta más larga. **Por qué se corrigió:** medido por la parte más larga, `goal_12m`
 * daba **falso positivo** —su parte mayor es `'Top 3 en Google Maps'` (20)— cuando su
 * esqueleto completo suma 42-48 y es inconfundible. R-11 pide identificar **la variante**,
 * y eso lo hace el conjunto en orden, no un fragmento aislado.
 */
export const MIN_SKELETON = 24;
export const isIdentifiable = (v: Variant): boolean =>
  literalParts(v).join('').length >= MIN_SKELETON;

/** La variante aplicable: **la primera cuyo `when` es verdadero**. */
export function variantFor(tpl: FieldTpl, ctx: TemplateCtx): Variant {
  for (const v of tpl.variants) if (v.when(ctx)) return v;
  return tpl.variants[tpl.variants.length - 1];
}

/**
 * ⭐ **R-10 — construye el texto de una plantilla.** Byte-idéntico al de `3be506d`.
 * No capitaliza, no recorta, no agrega prefijos: **el valor que se escribe en el campo no
 * cambia en un solo byte** (R-17 — la marca de «ejemplo» vive en la UI, jamás en el valor).
 */
export function buildTemplate(tpl: FieldTpl, ctx: TemplateCtx): string {
  return variantFor(tpl, ctx)
    .parts.map((p) => (typeof p === 'string' ? p : slotValue(p, ctx)))
    .join('');
}

/** Busca la plantilla de un campo. */
export function templateFor(field: string): FieldTpl | null {
  for (const b of TEMPLATE_BUTTONS)
    for (const f of b.fields) if (f.field === field) return f;
  return null;
}

/** Qué tan seguro es que un valor salió de una plantilla. */
export type Confidence = 'exact' | 'skeleton';

export interface TemplateHit {
  field: string;
  confidence: Confidence;
}

/** ¿Aparecen TODAS estas partes, en ORDEN, dentro del valor? */
function containsInOrder(value: string, parts: string[]): boolean {
  let i = 0;
  for (const p of parts) {
    if (p.length === 0) continue;
    const j = value.indexOf(p, i);
    if (j < 0) return false;
    i = j + p.length;
  }
  return true;
}

/**
 * ⭐⭐ **R-25 — el detector.** Devuelve, por campo alcanzable, si su valor actual salió de
 * una plantilla.
 *
 *   · `exact`    — byte-idéntico a `buildTemplate(...)` con el contexto ACTUAL. Cubre las
 *                  4 fijas siempre, y las 3 parametrizadas si el contexto no cambió.
 *   · `skeleton` — **todas** las partes literales de alguna variante aparecen **en orden**.
 *                  Es lo que sigue viendo una plantilla parametrizada cuando el operador
 *                  cambió de ciudad después de clickear.
 *
 * ⛔ **Nada más. Sin normalización agresiva, sin distancia de edición, sin heurística de
 * longitud.** La certeza es **asimétrica y se declara** (R-21): un texto de plantilla muy
 * editado puede dejar de reconocerse. **No se compensa con matching difuso** — un falso
 * rojo enseña al operador a ignorar el aviso, y ahí el guard muere.
 */
export function detectTemplateFields(
  values: object | null | undefined,
  ctx: TemplateCtx
): TemplateHit[] {
  const out: TemplateHit[] = [];
  // `object` y no `Record<string, unknown>` a propósito: `BriefFields` es una **interface**,
  // y en TypeScript una interface no tiene índice implícito ⇒ pasarla a un `Record` es un
  // error de tipo. Es la misma firma que ya usa `detectTestResidueFields` para el mismo
  // insumo, por la misma razón. El acceso se hace sobre una vista indexada local.
  if (!values || typeof values !== 'object') return out;
  const vals = values as Record<string, unknown>;
  for (const btn of TEMPLATE_BUTTONS) {
    for (const tpl of btn.fields) {
      if (tpl.detectable === false) continue;
      const raw = vals[tpl.field];
      const value = typeof raw === 'string' ? raw : '';
      if (value.trim().length === 0) continue;
      if (value === buildTemplate(tpl, ctx)) {
        out.push({ field: tpl.field, confidence: 'exact' });
        continue;
      }
      const bySkeleton = tpl.variants.some(
        (v) => isIdentifiable(v) && containsInOrder(value, literalParts(v))
      );
      if (bySkeleton) out.push({ field: tpl.field, confidence: 'skeleton' });
    }
  }
  return out;
}
