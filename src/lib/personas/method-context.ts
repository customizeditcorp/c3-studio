/**
 * F-112 (Fase 5 F-C / CL-094) — Cadena canónica `persona → OFV` campo-a-campo.
 *
 * **Operación espejo de F-111** (`src/lib/offers/method-context.ts`): allí se repartió
 * la OFV hacia los steps de contenido; acá se extraen los 10 campos canónicos de la
 * BUYER PERSONA hacia el step `ofv`. Mismo esqueleto: helper PURO que sólo **anexa**,
 * mapeo como DATO (no condicionales inline), **default-deny** por step, filtro
 * `[PENDIENTE]` desde la fuente única (`method-context/pending.ts`, R-07) y
 * degradación honesta (campo ausente ⇒ no hay línea, nunca un placeholder).
 *
 * **El problema que resuelve.** Hoy la persona entra al prompt de la OFV como BLOB
 * (`persona.raw_text || JSON.stringify(persona.content)`): sin etiquetar, sin filtrar
 * y sin prioridad por campo. El canon exige otra cosa — `wiki/onboarding/buyer.md`
 * declara que el buyer produce **campos nombrados** y `value-offer.md` que la OFV
 * produce *objection framing* a partir de ellos. ARC5 da el porqué operativo: el
 * **Golpe Preventivo** exige "anticipar la objeción más común ANTES de que aparezca",
 * lo que es imposible sin la objeción **específica** de ESA persona.
 *
 * **Lo que NO hace (R-13, DT-2):** no reemplaza el blob. El mapeo canónico cubre 10 de
 * los ~37 campos de `PersonaFields`; reemplazarlo descartaría en silencio los otros
 * ~27 (estilo de vida, `past_attempts`/`why_failed` = material ARC5,
 * `hidden_costs`/`emotional_impact` = material de landing) y dejaría la generación
 * **sin persona alguna** cuando el extractor degrada a vacío. El blob queda intacto y
 * este bloque se **anexa** después.
 *
 * **CL-092:** este módulo NO alimenta el GBP. `PERSONA_METHOD_STEPS = ['ofv']` y el
 * default para cualquier step no listado es omitir.
 *
 * Módulo puro: sin I/O, sin red, sin Supabase, sin mutar la fila de entrada.
 */
import { cleanScalar } from '../method-context/pending.ts';

/** Los 10 campos del mapeo canónico persona→OFV (CL-094). INPUT cerrado: no es una
 * decisión de esta feature, se deriva del canon (`offer-structure.md`,
 * `four-components.md`, ARC3/ARC4/ARC5/ARC6). */
export type PersonaMethodField =
  | 'main_pain'
  | 'secondary_pains'
  | 'dream_result'
  | 'awareness_level'
  | 'objection_price'
  | 'objection_trust'
  | 'objection_time'
  | 'if_nothing'
  | 'if_competitor'
  | 'if_c3';

/** Forma mínima de una fila de `buyer_personas` que el route ya trae con su
 * `select('content, raw_text')` — no hace falta ampliarlo (R-18). */
export interface RawPersonaRow {
  content?: Record<string, unknown> | null;
  raw_text?: string | null;
}

/** Campos canónicos normalizados. `null` = ausente (nunca `''` ni `'[PENDIENTE]'`). */
export type NormalizedPersonaFields = Record<PersonaMethodField, string | null>;

/**
 * El mapeo campo → etiqueta como **DATO** y en **ORDEN de emisión** (R-10): agregar o
 * quitar un campo no requiere tocar la lógica de emisión. El orden sigue el recorrido
 * canónico de la OFV (§1 → componentes de valor → tono → objeciones → §4 escenarios).
 *
 * **Acentos (DT-6):** F-110/F-111 escribieron `Vehiculo`/`Garantia` sin acento por
 * consistencia con líneas preexistentes del bloque OFV. Este bloque es NUEVO, no tiene
 * vecinos sin acento, el prompt de la OFV está íntegramente acentuado y la etiqueta
 * debe coincidir **carácter a carácter** con la que el prompt referencia (R-14) ⇒ acá
 * se usan acentos correctos. Decisión declarada, no accidental.
 */
export const PERSONA_METHOD_LABELS = [
  ['main_pain', 'Dolor principal'], // §1 Big Promise
  ['secondary_pains', 'Dolores secundarios'], // §1 Big Promise
  ['dream_result', 'Resultado soñado'], // four-components §1
  ['awareness_level', 'Nivel de conciencia'], // tono ARC3 → ARC4
  ['objection_price', 'Objeción precio'], // §4 pagos + Golpe Preventivo (ARC5)
  ['objection_trust', 'Objeción confianza'], // §6 Garantía + four-components §2
  ['objection_time', 'Objeción tiempo'], // four-components §4 + §3 Quick Win
  ['if_nothing', 'Si no hace nada (status quo)'], // §4 Opción C ← coincidencia TEXTUAL
  ['if_competitor', 'Si elige la competencia'], // §4 contraste A/B
  ['if_c3', 'Si elige C3'] // §4 contraste A/B
] as const satisfies readonly (readonly [PersonaMethodField, string])[];

/** Encabezado del bloque. **Ancla textual compartida con el prompt** (R-14): el test
 * cruzado de `tests/prompts/f112-ofv-persona-mapping.test.ts` importa esta constante
 * en vez de re-escribir el literal, para que un cambio acá rompa el test. */
export const PERSONA_METHOD_HEADING =
  '## BUYER PERSONA — CAMPOS CANÓNICOS (MAPEO AL MÉTODO)';

/**
 * Steps que reciben el bloque campo-a-campo. **Default-deny** (R-12): los 8 steps de
 * contenido que consumen persona (`gbp_description`, `gbp_posts`, `campaign_copy`,
 * `website_home`, `website_service`, `website_location`, `nurturing`,
 * `social_content`) y cualquier step nuevo o desconocido **no emiten**.
 *
 * El modo de fallo caro acá no es omitir: es inflar el contexto de 8 generadores con
 * campos que el canon asigna a otro consumidor. CL-094 sí asigna `nurturing`/
 * `social_content` a ARC5-objeciones, pero eso es un cableado **distinto**, con su
 * propio reparto, fuera del INPUT cerrado de esta feature (DT-8). Extenderlo es
 * cambiar este dato — no tocar `route.ts`.
 */
export const PERSONA_METHOD_STEPS = ['ofv'] as const;

/** El set canónico como `Set` para el parser de líneas (una sola construcción). */
const CANONICAL_FIELDS: ReadonlySet<string> = new Set(
  PERSONA_METHOD_LABELS.map(([field]) => field)
);

/**
 * Forma `- <clave_snake_case>: <valor>`, una por línea.
 *
 * **No es parsing especulativo:** ese formato es la serialización propia del producto
 * — `fieldsToContent` (`page.tsx`) y `buildOfvWritePayload` (`offers/write-path.ts`)
 * escriben literalmente `` `- ${k}: ${v}` `` unidos por `\n`. Este parser **invierte
 * una función que el repo ya contiene**, y su fidelidad es testeable como round-trip
 * contra ella (a diferencia de un parser de prosa generada por un LLM, que sería una
 * hipótesis — el error que CL-096 documenta).
 *
 * **Residual declarado (R-03):** `fieldsToContent` no escapa saltos de línea ⇒ un
 * valor multi-línea se serializa en varias líneas y este parser recupera **solo la
 * primera**. Corregirlo exigiría cambiar el write-path (fuera de scope).
 */
const LINE_RE = /^\s*-\s*([a-z][a-z0-9_]*)\s*:\s*(.+?)\s*$/;

function emptyFields(): NormalizedPersonaFields {
  return {
    main_pain: null,
    secondary_pains: null,
    dream_result: null,
    awareness_level: null,
    objection_price: null,
    objection_trust: null,
    objection_time: null,
    if_nothing: null,
    if_competitor: null,
    if_c3: null
  };
}

/** Array de escalares → `'a | b'` (mismo separador que `Entregables:`/`Prueba social:`
 * de F-110, DT-7); ítems vacíos y `[PENDIENTE]` omitidos; elementos no escalares se
 * omiten (límite declarado). Array sin ítems útiles ⇒ `null` (aporte nulo). */
function flattenArray(value: readonly unknown[]): string | null {
  const items = value
    .map((v) => cleanScalar(v))
    .filter((s): s is string => s !== null);
  return items.length > 0 ? items.join(' | ') : null;
}

/** Un valor de la fuente (1): string tal cual, número a texto, array unido; cualquier
 * otro tipo (objeto, booleano, `null`) no aporta (R-04/R-05). */
function normalizeValue(value: unknown): string | null {
  if (Array.isArray(value)) return flattenArray(value);
  return cleanScalar(value);
}

/**
 * Fuente (1) — claves planas snake_case en `content`. Es la forma que produce el
 * write-path del producto (`fieldsToContent` + `buildBriefWritePayload`, F-097/F-108):
 * toda persona curada y aprobada desde la UI aterriza acá.
 *
 * Devuelve `null` si la fuente NO aporta ningún campo canónico ⇒ el llamador cae a la
 * siguiente (fall-through **por fuente completa**, R-02).
 */
function readFlatSource(source: unknown): NormalizedPersonaFields | null {
  if (
    typeof source !== 'object' ||
    source === null ||
    Array.isArray(source) ||
    Object.prototype.toString.call(source) !== '[object Object]'
  ) {
    return null;
  }
  const obj = source as Record<string, unknown>;
  const fields = emptyFields();
  let any = false;
  for (const [field] of PERSONA_METHOD_LABELS) {
    const value = normalizeValue(obj[field]);
    if (value !== null) {
      fields[field] = value;
      any = true;
    }
  }
  return any ? fields : null;
}

/**
 * Fuentes (2) y (3) — texto en forma de líneas `- clave: valor`.
 *
 * Sólo se retienen las claves del set canónico (una línea `- name_age: 40 hemeterio`
 * se ignora), el valor es todo el texto tras el primer `:` de la línea y **la primera
 * ocurrencia de cada clave gana** (determinismo, R-03). El valor pasa por el mismo
 * saneo/`[PENDIENTE]` que la fuente (1).
 *
 * Devuelve `null` si ninguna línea aporta un campo canónico útil ⇒ fall-through.
 */
function readLinesSource(source: unknown): NormalizedPersonaFields | null {
  if (typeof source !== 'string' || source.length === 0) return null;
  const fields = emptyFields();
  let any = false;
  for (const line of source.split('\n')) {
    const m = LINE_RE.exec(line);
    if (m === null) continue;
    const key = m[1];
    if (!CANONICAL_FIELDS.has(key)) continue;
    const field = key as PersonaMethodField;
    if (fields[field] !== null) continue; // primera ocurrencia gana
    const value = cleanScalar(m[2]);
    if (value === null) continue;
    fields[field] = value;
    any = true;
  }
  return any ? fields : null;
}

/**
 * Normaliza los 10 campos canónicos de una fila de `buyer_personas` (R-01..R-08).
 *
 * Precedencia con **fall-through por fuente COMPLETA** — una fuente sólo "gana" si
 * aporta ≥1 campo canónico con contenido útil, y entonces gana ENTERA:
 *
 *   1. `content.<clave_snake_case>`   (claves planas — forma del write-path F-097/F-108)
 *   2. `content.raw_text`             (líneas `- clave: valor`)
 *   3. columna `raw_text`             (líneas `- clave: valor`)
 *
 * **Por qué fuente-completa y no merge por campo (R-02 / DT-5).** En las filas viejas
 * el invariante F-097 `columna raw_text === content.raw_text` está VIOLADO — Customize
 * It `f0588eab` (1069 vs 464 chars) y JD Valley `400dbe18` (2234 vs 0): son dos textos
 * DISTINTOS, posiblemente de vintages distintos. Mezclarlos campo a campo produciría
 * una persona *Frankenstein* que no corresponde a ninguna versión aprobada. El
 * fall-through completo garantiza que el bloque emitido proviene de UNA fuente
 * identificable.
 *
 * Función PURA: sin I/O, sin red, sin Supabase, sin mutar la fila de entrada, y con
 * salida idéntica para entrada idéntica — incluida la independencia respecto del orden
 * de inserción de las claves del jsonb (R-08).
 */
export function normalizePersonaMethodFields(
  persona: RawPersonaRow
): NormalizedPersonaFields {
  const content = persona.content ?? null;
  return (
    readFlatSource(content) ??
    readLinesSource(
      content !== null && typeof content === 'object'
        ? (content as Record<string, unknown>).raw_text
        : null
    ) ??
    readLinesSource(persona.raw_text) ??
    emptyFields()
  );
}

/**
 * Construye el bloque campo-a-campo que se **anexa** al `contextChain` (R-11..R-15).
 *
 * Devuelve `''` o un string que EMPIEZA con `'\n\n'` (bloque de sección propio, como
 * los demás del `contextChain`), con una línea `Etiqueta: valor` por campo presente en
 * el orden de `PERSONA_METHOD_LABELS`.
 *
 * **Default-deny** (R-12): step fuera de `PERSONA_METHOD_STEPS` ⇒ `''`.
 * **Degradación honesta** (R-05/R-15): sólo entran los campos presentes — sin
 * etiquetas huérfanas, sin `N/A`, sin líneas en blanco, sin valores inferidos.
 * **Vacío ⇒ `''`** (no encabezado huérfano): así la byte-identidad de R-16/R-17 es
 * ESTRUCTURAL, no de disciplina.
 */
export function buildPersonaMethodBlock(input: {
  step: string;
  persona: RawPersonaRow;
}): string {
  if (!(PERSONA_METHOD_STEPS as readonly string[]).includes(input.step)) {
    return '';
  }
  const fields = normalizePersonaMethodFields(input.persona);
  const lines: string[] = [];
  for (const [field, label] of PERSONA_METHOD_LABELS) {
    const value = fields[field];
    if (value !== null) lines.push(label + ': ' + value);
  }
  if (lines.length === 0) return '';
  return '\n\n' + PERSONA_METHOD_HEADING + '\n' + lines.join('\n');
}
