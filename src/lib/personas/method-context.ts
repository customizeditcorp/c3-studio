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
 * `hidden_costs` = material de landing) y dejaría la generación
 * **sin persona alguna** cuando el extractor degrada a vacío. El blob queda intacto y
 * este bloque se **anexa** después.
 *
 * **F-116 (CL-102/CL-104), carry-forward a la Fase C.** El campo `emotional_impact`
 * —que este comentario citaba como material de landing— salió del tipo del núcleo
 * junto a `values`, `expansion`, `provider_frustrations` y `fears`: eran claves que
 * NINGUNA fila de `buyer_personas` producía. Su sustancia sigue generándose dentro
 * de la clave declarada de su propio bloque (el impacto emocional viaja en
 * `hidden_costs`). Si la Fase C ordena el downstream y la landing necesita el campo
 * separado, se reintroduce COMO CAMPO DEL DOWNSTREAM QUE LO CONSUME (CL-094), nunca
 * como campo del núcleo. `dream_result` es el caso inverso y por eso NO se tocó:
 * estaba en este mapeo sin que nada lo produjera, y F-116 lo declara en el contrato
 * del prompt del buyer — el eslabón pasa de inerte a vivo.
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

/** La lista de campos canónicos, en orden de emisión (derivada de las etiquetas). */
const CANONICAL_FIELD_LIST: readonly PersonaMethodField[] =
  PERSONA_METHOD_LABELS.map(([field]) => field);

/** El set canónico como `Set` para el parser de líneas (una sola construcción). */
const CANONICAL_FIELDS: ReadonlySet<string> = new Set(CANONICAL_FIELD_LIST);

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

/* ==================================================================== */
/*  NÚCLEO DE NORMALIZACIÓN — extraído por F-117 (T-05), preservador     */
/*                                                                       */
/*  Estas 5 funciones son EXACTAMENTE la lógica que F-112 tenía inline;   */
/*  el único cambio es que la LISTA DE CAMPOS pasó de estar cerrada sobre */
/*  `PERSONA_METHOD_LABELS`/`CANONICAL_FIELDS` a ser un PARÁMETRO, para   */
/*  que el segundo seam de F-117 (reparto núcleo→canal) la reutilice sin  */
/*  duplicar el criterio de las 3 fuentes ni el filtro `[PENDIENTE]`.     */
/*                                                                       */
/*  **Prueba del refactor:** los ~40 tests de                             */
/*  `tests/personas/f112-method-context.test.ts` pasan SIN ser tocados.   */
/*  Precedente: F-112 extrajo `pending.ts` de F-111 con la misma regla    */
/*  (`pending.ts:12-16`), y F-117 la repite un nivel más adentro.         */
/* ==================================================================== */

/** Todos los campos de `fields` en `null`, en el orden de la lista. */
function emptyFor<F extends string>(
  fields: readonly F[]
): Record<F, string | null> {
  const out = {} as Record<F, string | null>;
  for (const field of fields) out[field] = null;
  return out;
}

function emptyFields(): NormalizedPersonaFields {
  return emptyFor(CANONICAL_FIELD_LIST);
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
function readFlatSource<F extends string>(
  source: unknown,
  fieldList: readonly F[]
): Record<F, string | null> | null {
  if (
    typeof source !== 'object' ||
    source === null ||
    Array.isArray(source) ||
    Object.prototype.toString.call(source) !== '[object Object]'
  ) {
    return null;
  }
  const obj = source as Record<string, unknown>;
  const fields = emptyFor(fieldList);
  let any = false;
  for (const field of fieldList) {
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
function readLinesSource<F extends string>(
  source: unknown,
  fieldList: readonly F[],
  fieldSet: ReadonlySet<string>
): Record<F, string | null> | null {
  if (typeof source !== 'string' || source.length === 0) return null;
  const fields = emptyFor(fieldList);
  let any = false;
  for (const line of source.split('\n')) {
    const m = LINE_RE.exec(line);
    if (m === null) continue;
    const key = m[1];
    if (!fieldSet.has(key)) continue;
    const field = key as F;
    if (fields[field] !== null) continue; // primera ocurrencia gana
    const value = cleanScalar(m[2]);
    if (value === null) continue;
    fields[field] = value;
    any = true;
  }
  return any ? fields : null;
}

/**
 * Precedencia de las **3 fuentes** con fall-through **por fuente COMPLETA**,
 * parametrizada por lista de campos (F-117 T-05). Es la lógica literal que
 * `normalizePersonaMethodFields` tenía inline en F-112.
 */
function normalizeFor<F extends string>(
  persona: RawPersonaRow,
  fieldList: readonly F[],
  fieldSet: ReadonlySet<string>
): Record<F, string | null> {
  const content = persona.content ?? null;
  return (
    readFlatSource(content, fieldList) ??
    readLinesSource(
      content !== null && typeof content === 'object'
        ? (content as Record<string, unknown>).raw_text
        : null,
      fieldList,
      fieldSet
    ) ??
    readLinesSource(persona.raw_text, fieldList, fieldSet) ??
    emptyFor(fieldList)
  );
}

/**
 * Emisión del bloque: `''` si ningún campo aporta, o un string que EMPIEZA con
 * `'\n\n'` con una línea `Etiqueta: valor` por campo presente, en el orden de
 * `labels`. Sin encabezado huérfano, sin `N/A`, sin placeholders.
 */
function emitBlock<F extends string>(
  heading: string,
  labels: readonly (readonly [F, string])[],
  values: Record<F, string | null>
): string {
  const lines: string[] = [];
  for (const [field, label] of labels) {
    const value = values[field];
    if (value !== null && value !== undefined) lines.push(label + ': ' + value);
  }
  if (lines.length === 0) return '';
  return '\n\n' + heading + '\n' + lines.join('\n');
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
  return normalizeFor(persona, CANONICAL_FIELD_LIST, CANONICAL_FIELDS);
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
  return emitBlock(PERSONA_METHOD_HEADING, PERSONA_METHOD_LABELS, fields);
}

/* ==================================================================== */
/*  F-117 (FASE C / CL-102 mandato 2) — SEGUNDO SEAM: reparto            */
/*  núcleo → CANAL, por step, como DATO y con default-deny.              */
/* ==================================================================== */

/**
 * **Por qué un segundo seam y no una mutación del primero (DT-1).**
 *
 * El de arriba (F-112) es el mapeo **canónico persona→OFV**: una interfaz *dentro*
 * del núcleo `brief → buyer → OFV`, con `PERSONA_METHOD_STEPS = ['ofv']` y su
 * encabezado anclado textualmente al prompt de la OFV. El de acá es el **reparto
 * núcleo→canal**: qué campos de la persona le corresponden a cada generador de
 * contenido según el *"Método relacionado"* de su `wiki/onboarding/<output>.md`,
 * exactamente como `OFV_METHOD_FIELDS_BY_STEP` de F-111 reparte la OFV.
 *
 * Fusionarlos borraría, dentro del código, la frontera que **CL-102** acaba de
 * trazar; y mutar `PERSONA_METHOD_STEPS` a un `Record` está verificado inviable
 * (rompe `deepEqual([...PERSONA_METHOD_STEPS], ['ofv'])` y 4 `deepEqual` del shape
 * de 10 claves de F-112 — la red de regresión desaparecería justo cuando se la
 * necesita). Los dos bloques **nunca coexisten**: `ofv` no está en el reparto de
 * abajo y ningún step del reparto está en `PERSONA_METHOD_STEPS`.
 */

/** Los 8 campos que el downstream consume. **No son campos nuevos del núcleo**
 * (CL-105, R-20): ya existen y ya se producen tras F-116. F-117 sólo los REPARTE. */
export type PersonaDownstreamField =
  | 'main_pain'
  | 'secondary_pains'
  | 'hidden_costs'
  | 'why_failed'
  | 'objection_price'
  | 'objection_trust'
  | 'objection_time'
  | 'if_nothing';

/** Los 8 campos normalizados. `null` = ausente (nunca `''` ni `'[PENDIENTE]'`). */
export type NormalizedPersonaDownstreamFields = Record<
  PersonaDownstreamField,
  string | null
>;

/**
 * Campo → etiqueta como **DATO** y en **ORDEN FIJO DE EMISIÓN** (R-14): el orden del
 * bloque lo fija esta lista, **no** el orden del array por step ni el orden de
 * inserción de las claves del `jsonb`.
 *
 * **Acentos:** criterio DT-6 de F-112 (bloque nuevo, sin vecinos sin acento ⇒ acentos
 * correctos). Las 6 etiquetas que también existen en `PERSONA_METHOD_LABELS` se
 * escriben **igual** que allí, para que el mismo campo no tenga dos nombres en el
 * mismo prompt-contexto.
 */
export const PERSONA_DOWNSTREAM_LABELS = [
  ['main_pain', 'Dolor principal'], // landing "Dolor dominante" · ARC7 "el mismo dolor"
  ['secondary_pains', 'Dolores secundarios'], // ARC7 — amplía el gancho de referido
  ['hidden_costs', 'Costos ocultos'], // landing PROBLEMA→SOLUCIÓN ← coincidencia TEXTUAL
  ['why_failed', 'Por qué fallaron los intentos previos'], // ARC5 — material de objeción
  ['objection_price', 'Objeción precio'], // ARC5 Golpe Preventivo
  ['objection_trust', 'Objeción confianza'], // ARC5 Golpe Preventivo
  ['objection_time', 'Objeción tiempo'], // ARC5 Golpe Preventivo
  ['if_nothing', 'Si no hace nada (status quo)'] // ARC5 — el costo de no decidir
] as const satisfies readonly (readonly [PersonaDownstreamField, string])[];

/** Encabezado propio (DT-2). **No** se reutiliza `PERSONA_METHOD_HEADING`: ese es un
 * ancla textual compartida con el prompt de la OFV (F-112 R-14) y reciclarlo para 5
 * steps que no son la OFV rompería el significado del ancla. */
export const PERSONA_DOWNSTREAM_HEADING =
  '## BUYER PERSONA — CAMPOS PARA ESTE CANAL';

/**
 * El reparto núcleo→canal como **DATO** (R-10), en el patrón exacto de
 * `OFV_METHOD_FIELDS_BY_STEP` (F-111): agregar o quitar un step **no** requiere tocar
 * la emisión ni `route.ts`. Cada entrada cita el canon que la justifica.
 */
export const PERSONA_DOWNSTREAM_FIELDS_BY_STEP = {
  // `wiki/onboarding/nurturing.md` § "Método relacionado" = ARC1 + **ARC5 Handle
  // Objections** (RAG 0.5364). ARC5 exige el *Golpe Preventivo*: anticipar la objeción
  // más común ANTES de que aparezca — imposible sin la objeción específica de ESA
  // persona. `why_failed` e `if_nothing` son el material de escenario del mismo ARC.
  nurturing: [
    'objection_price',
    'objection_trust',
    'objection_time',
    'why_failed',
    'if_nothing'
  ],
  // ⚠️ `wiki/onboarding/social-content.md` § "Método relacionado" = ARC1 + **ARC7
  // Referrals & Re-sales** (RAG 0.5574), NO ARC5. El script canónico de ARC7 pivota
  // sobre el DOLOR: *"¿A quién conoces que **sufra el mismo dolor que tenías**?"*
  // (`intake/c3_method_corpus_v2.md` § ARC7, RAG 0.5234) ⇒ este step recibe el set de
  // dolor, **no** el de objeciones. Corrige la afirmación de CL-094 (y el comentario de
  // `src/lib/offers/method-context.ts`) de que `social_content` pedía ARC5.
  social_content: ['main_pain', 'secondary_pains'],
  // `wiki/method/smartlab/landing-structure.md` § "PROBLEMA → SOLUCIÓN" (RAG 0.5722):
  // *"Dolor **dominante** explícito"* + *"**Costos ocultos** (emocionales 😰,
  // monetarios 💰, de tiempo ⏰)"*. `secondary_pains` queda FUERA: el canon pide el
  // dolor dominante, en SINGULAR, y bajo default-deny la ausencia de ancla basta para
  // no emitir. `hidden_costs` absorbió el impacto emocional en F-116 ⇒ la sustancia
  // llega sin reintroducir `emotional_impact` al núcleo (CL-105).
  website_home: ['main_pain', 'hidden_costs'],
  website_service: ['main_pain', 'hidden_costs'],
  website_location: ['main_pain', 'hidden_costs']
  // AUSENTES A PROPÓSITO:
  //   ofv               → es el NÚCLEO, no un canal: su mapeo campo-a-campo es el de
  //                       F-112 (`PERSONA_METHOD_STEPS`). Que `ofv` NO esté acá es lo
  //                       que hace su byte-identidad ESTRUCTURAL, no de disciplina.
  //   gbp_description   → CL-092: el GBP se queda con brief + OFV. F-117 lo sacó
  //                       ADEMÁS de `needsPersona` ⇒ cero persona por ambos caminos.
  //   gbp_posts         → ARC1 + ARC6 (Closing): su material de decisión ya llega por
  //                       el `Decision Frame:`/`Urgencia:` de F-111, no por la persona.
  //   campaign_copy     → AIDA/PAS/4Cs/BAB: ídem, su reparto es el de F-111.
  //   buyer_persona/brief → GENERAN el núcleo, no lo consumen.
} as const satisfies Record<string, readonly PersonaDownstreamField[]>;

const DOWNSTREAM_FIELD_LIST: readonly PersonaDownstreamField[] =
  PERSONA_DOWNSTREAM_LABELS.map(([field]) => field);

const DOWNSTREAM_FIELDS: ReadonlySet<string> = new Set(DOWNSTREAM_FIELD_LIST);

/**
 * Normaliza los 8 campos del reparto con **la misma precedencia de 3 fuentes** y el
 * mismo fall-through **por fuente COMPLETA** que F-112 (núcleo compartido, T-05), y el
 * mismo filtro `[PENDIENTE]` de la fuente única `method-context/pending.ts` (R-15).
 *
 * Se normaliza sobre los **8 campos**, no sobre los del step: así la fuente que "gana"
 * es la misma para todos los steps de una misma fila, y el bloque emitido siempre
 * proviene de UNA fuente identificable (razón de DT-5 de F-112: mezclar fuentes produce
 * una persona *Frankenstein* que no corresponde a ninguna versión aprobada).
 *
 * Función PURA: sin I/O, sin red, sin Supabase, sin mutar la fila de entrada.
 */
export function normalizePersonaDownstreamFields(
  persona: RawPersonaRow
): NormalizedPersonaDownstreamFields {
  return normalizeFor(persona, DOWNSTREAM_FIELD_LIST, DOWNSTREAM_FIELDS);
}

/**
 * Construye el bloque de canal que se **anexa** al `contextChain` (R-14..R-18).
 *
 * Devuelve `''` o un string que EMPIEZA con `'\n\n'`, con una línea `Etiqueta: valor`
 * por campo **asignado al step** y presente en la fila, en el orden de
 * `PERSONA_DOWNSTREAM_LABELS`.
 *
 * **Default-deny (R-18):** step fuera de `PERSONA_DOWNSTREAM_FIELDS_BY_STEP` — incluidos
 * `ofv`, `buyer_persona`, `brief`, `gbp_description`, `gbp_posts`, `campaign_copy` y
 * cualquier step nuevo o desconocido — ⇒ `''`.
 * **Degradación honesta (R-16):** campo ausente, vacío o `[PENDIENTE]` ⇒ no hay línea;
 * sin etiqueta huérfana, sin `N/A`, sin placeholder, sin valor inferido.
 * **Vacío ⇒ `''` (R-17):** sin encabezado huérfano.
 */
export function buildPersonaDownstreamBlock(input: {
  step: string;
  persona: RawPersonaRow;
}): string {
  const assigned: readonly PersonaDownstreamField[] =
    (
      PERSONA_DOWNSTREAM_FIELDS_BY_STEP as Record<
        string,
        readonly PersonaDownstreamField[]
      >
    )[input.step] ?? [];
  if (assigned.length === 0) return '';
  const fields = normalizePersonaDownstreamFields(input.persona);
  const labels = PERSONA_DOWNSTREAM_LABELS.filter(([field]) =>
    assigned.includes(field)
  );
  return emitBlock(PERSONA_DOWNSTREAM_HEADING, labels, fields);
}
