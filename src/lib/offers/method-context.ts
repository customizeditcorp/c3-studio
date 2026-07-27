/**
 * F-111 (Fase 5 F-B / CL-094) — Reparto del método: `decision_frame` + `urgency`
 * de la OFV hacia el `contextChain` de generate-content.
 *
 * Tres piezas separables (design §1):
 *   1. `normalizeDecisionFrame` — un dato que NO existe en la capa normalizada
 *      (`decision_frame` no está en `NormalizedOffer`): helper puro que lo expone
 *      desde sus 3 formas de almacenamiento, aplanando la opción-objeto.
 *   2. `urgency` — ya lo normaliza `normalizeOffer` (con su fallback
 *      `offer.urgency ?? content.urgency_scarcity ?? content.urgency`): acá se
 *      CONSUME, no se re-implementa (R-07; la columna plana está vacía en las 16
 *      filas de producción, así que ese fallback es la única razón por la que hay
 *      urgencia que emitir).
 *   3. `OFV_METHOD_FIELDS_BY_STEP` — la regla del método como DATO, no como
 *      condicional inline (R-09/R-12), con **default-deny** (R-11).
 *
 * `buildOfvMethodLines` es un seam PURO que sólo **anexa**: devuelve `''` cuando no
 * hay nada que emitir ⇒ el bloque OFV queda byte-idéntico a post-F-110 para todo
 * step fuera del reparto y para toda OFV sin estos campos (R-17/R-18), y esa claim
 * se verifica de forma CONDUCTUAL (`assert.equal(..., '')`), no por source-guard.
 *
 * NO toca `normalizeOffer` / `NormalizedOffer` / `readGbpContext` / `GbpContext`
 * (R-06): meter `decision_frame` en el contrato del slice GBP lo expondría en
 * `buildGbpUserMessage`, que es justo el path que GATE-1 excluye.
 *
 * Simetría read/write: el *fold* `option_a|b|c → decision_frame` vive en
 * `offers/write-path.ts`; este es el *un-fold* del lado lectura.
 */
import type { RawOfferRow, NormalizedOffer } from '../gbp-slice/types.ts';
// F-112 R-07 / DT-3(c) — el marcador `[PENDIENTE]` y su predicado viven en UNA sola
// definición del repo (`method-context/pending.ts`), compartida con el extractor
// espejo del otro lado de la cadena canónica. Refactor preservador de comportamiento:
// `cleanScalar` conserva el contrato exacto que tenía la copia privada de F-111.
import { cleanScalar } from '../method-context/pending.ts';

/** Campos de OFV que el método reparte por step (F-111 / CL-094). */
export type OfvMethodField = 'decision_frame' | 'urgency';

/**
 * Decision frame normalizado. Cada opción llega YA APLANADA a texto legible (la
 * fuente puede ser string U OBJETO — ver `normalizeDecisionFrame`). `text` = forma
 * legacy en la que el `decision_frame` entero es un string suelto (R-03;
 * `src/types/c3-domain.ts` lo tipa `string | null`).
 */
export interface NormalizedDecisionFrame {
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  text: string | null;
}

/** Claves de nivel superior del objeto `decision_frame` que SÍ se leen (R-29): el
 * resto se ignora, en particular la `urgency` anidada (presente en `a6c66d5c` y
 * `b655483e`) — la urgencia canónica se emite por su propia línea vía
 * `normalizeOffer.urgency`; emitir ambas duplicaría el token y podría dar señal
 * contradictoria si los textos divergen (DT-10). */
const OPTION_KEYS = ['option_a', 'option_b', 'option_c'] as const;

/** Claves excluidas del aplanado de una opción-objeto por el mismo criterio
 * anti-duplicación de R-29 (design §2.3.1 paso 5: "se descartan las claves de
 * R-29"). No observada dentro de una opción, se filtra por coherencia. */
const OPTION_EXCLUDED_KEYS = new Set<string>(['urgency']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

/** Array de strings/números → `'a, b, c'`; ítems vacíos o `[PENDIENTE]` omitidos;
 * elementos no escalares se omiten (límite declarado, R-28.3). */
function flattenArray(value: unknown[]): string | null {
  const items = value
    .map((v) => cleanScalar(v))
    .filter((s): s is string => s !== null);
  return items.length > 0 ? items.join(', ') : null;
}

/**
 * Aplanado determinista de una opción en forma OBJETO (R-28 / DT-9 = genérico
 * tolerante, NO lista blanca: el `decision_frame` lo produce un LLM en JSON libre,
 * así que las claves varían por fila y una lista blanca descartaría claves nuevas
 * **en silencio**, sin que ningún test se ponga rojo).
 *
 *   1. Identidad, SIN etiqueta y en orden fijo: `name ?? title` · `price` ·
 *      `description ?? benefit`.
 *   2. Resto de claves en orden ALFABÉTICO como `clave: valor` (⇒ el orden de
 *      inserción del JSON es irrelevante: misma fila, misma salida).
 *   3. Arrays → `join(', ')`; escalares → texto; objetos anidados de 2º nivel se
 *      omiten (no observados; límite declarado).
 *   4. Fragmentos unidos por `' — '` — separador DISTINTO del `' | '` que separa
 *      opciones entre sí ⇒ sin colisión de separadores.
 *   5. Se descartan las claves de R-29, los `[PENDIENTE]` (R-30) y los vacíos.
 *
 * Nota sobre los alias: si `name` gana el slot de identidad y además existe
 * `title`, el `title` NO se descarta — cae al tramo alfabético como `title: …`
 * (DT-9: nada se descarta en silencio). Caso no observado en producción.
 */
function flattenOptionObject(obj: Record<string, unknown>): string | null {
  const fragments: string[] = [];
  const consumed = new Set<string>();

  const takeIdentity = (keys: string[]): void => {
    for (const key of keys) {
      if (!(key in obj)) continue;
      const scalar = cleanScalar(obj[key]);
      if (scalar === null) continue;
      fragments.push(scalar);
      consumed.add(key);
      return;
    }
  };

  takeIdentity(['name', 'title']);
  takeIdentity(['price']);
  takeIdentity(['description', 'benefit']);

  for (const key of Object.keys(obj).sort()) {
    if (consumed.has(key)) continue;
    if (OPTION_EXCLUDED_KEYS.has(key)) continue;
    const raw = obj[key];
    const value = Array.isArray(raw) ? flattenArray(raw) : cleanScalar(raw);
    if (value === null) continue;
    fragments.push(key + ': ' + value);
  }

  return fragments.length > 0 ? fragments.join(' — ') : null;
}

/** Una opción individual: string plano (tal cual) u objeto (aplanado). Cualquier
 * otro tipo no aporta (R-02/R-28). */
function normalizeOption(value: unknown): string | null {
  if (isPlainObject(value)) return flattenOptionObject(value);
  return cleanScalar(value);
}

function emptyDecisionFrame(): NormalizedDecisionFrame {
  return { option_a: null, option_b: null, option_c: null, text: null };
}

/** Lee UNA fuente. Devuelve `null` cuando no aporta contenido ⇒ el llamador cae a
 * la siguiente fuente de la cadena de precedencia (R-04, fall-through por vacío). */
function readSource(source: unknown): NormalizedDecisionFrame | null {
  // Forma legacy no estructurada: el `decision_frame` entero es un string (R-03).
  if (typeof source === 'string') {
    const text = cleanScalar(source);
    return text === null ? null : { ...emptyDecisionFrame(), text };
  }
  if (!isPlainObject(source)) return null; // null, número, booleano, array suelto
  const frame = emptyDecisionFrame();
  let any = false;
  for (const key of OPTION_KEYS) {
    const option = normalizeOption(source[key]);
    if (option !== null) {
      frame[key] = option;
      any = true;
    }
  }
  return any ? frame : null;
}

/**
 * Normaliza el `decision_frame` de una fila de `offers` (R-01..R-05, R-28..R-30).
 *
 * Precedencia con fall-through por vacío — una fuente sólo "gana" si aporta algo:
 *   1. `offer.decision_frame`          (columna plana jsonb)
 *   2. `offer.content.decision_frame`  (jsonb dentro de `content`)
 *   3. `offer.content.option_a|b|c`    (forma legacy, claves sueltas)
 *
 * Función PURA: sin I/O, sin red, sin Supabase, sin mutar la fila de entrada, y con
 * salida idéntica para entrada idéntica (R-05).
 */
export function normalizeDecisionFrame(
  offer: RawOfferRow
): NormalizedDecisionFrame {
  const content: Record<string, unknown> = offer.content ?? {};
  return (
    readSource(offer.decision_frame) ??
    readSource(content.decision_frame) ??
    readSource({
      option_a: content.option_a,
      option_b: content.option_b,
      option_c: content.option_c
    }) ??
    emptyDecisionFrame()
  );
}

/**
 * El reparto canónico (CL-094) como DATO, no como lógica (R-09/R-12): agregar o
 * quitar un step NO requiere tocar la emisión.
 */
export const OFV_METHOD_FIELDS_BY_STEP = {
  // Landing Structure — CTA FINAL "refuerzo de urgencia" + FAQ "Precio / Opciones de pago"
  website_home: ['decision_frame', 'urgency'],
  website_service: ['decision_frame', 'urgency'],
  website_location: ['decision_frame', 'urgency'],
  // ARC6 Closing — cierre por preferencia entre opciones
  gbp_posts: ['decision_frame', 'urgency'],
  // AIDA — la A de Action
  campaign_copy: ['decision_frame', 'urgency']
  // AUSENTES A PROPÓSITO (CL-094):
  //   gbp_description   → único output sin link a ARC6 + "channel-specific GBP
  //                       constraints" + asset PÚBLICO de Google (F-104 / CL-092)
  //   nurturing         → ARC1+ARC5 "Handle Objections" → objeciones de la persona
  //                       (cableado en F-117: `PERSONA_DOWNSTREAM_FIELDS_BY_STEP`)
  //   social_content    → ⚠️ CORRECCIÓN DE GROUNDING (F-117 / H-1). Este comentario
  //                       decía "ARC5/ARC7 → ídem", igual que CL-094. El canon dice
  //                       otra cosa: `wiki/onboarding/social-content.md` § "Método
  //                       relacionado" = ARC1 + **ARC7 (Referrals & Re-sales)**, SIN
  //                       ARC5. ARC7 no pide objeciones: pivota sobre el DOLOR
  //                       ("¿A quién conoces que sufra el mismo dolor que tenías?").
  //                       F-117 le reparte `main_pain`/`secondary_pains`, NO objeciones.
  //                       Lo que NO cambia es esta tabla: `social_content` sigue fuera
  //                       del reparto de la OFV por la misma razón que `nurturing`.
  //   buyer_persona/ofv → no consumen OFV (`needsOffer` no los incluye)
} as const satisfies Record<string, readonly OfvMethodField[]>;

/** Sub-etiquetas canónicas de `offer-structure.md §4`, con la misma redacción que
 * la UI (`page.tsx`: "Opción A (entrada)" / "(recomendado)" / "(status quo)"). Se
 * omite la palabra "Opción" para no introducir el único acento del bloque (el resto
 * usa `Vehiculo`/`Garantia` sin acento) — misma consideración que tomó F-110. */
const OPTION_LABELS: Record<(typeof OPTION_KEYS)[number], string> = {
  option_a: 'A (entrada)',
  option_b: 'B (recomendado)',
  option_c: 'C (status quo)'
};

/**
 * Construye las líneas de OFV que el método reparte a este step (R-10..R-16).
 *
 * Devuelve `''` o un string que EMPIEZA con `\n` y se **anexa** al final del bloque
 * OFV (después de `Entregables:` / `Prueba social:` de F-110), sin reordenar ni
 * reescribir ninguna línea preexistente (R-16).
 *
 *   \nDecision Frame: A (entrada): … | B (recomendado): … | C (status quo): …
 *   \nUrgencia: …
 *
 * `Decision Frame` va antes de `Urgencia` (orden canónico del artefacto: §4 antes
 * de §7). **Default-deny** (R-11): un step no listado — incluidos `gbp_description`,
 * `nurturing`, `social_content` y cualquier step nuevo o desconocido — devuelve `''`.
 * Degradación honesta (R-04/R-08/R-15): sin contenido no hay línea; con 1-2 opciones
 * se emiten sólo las presentes, sin placeholders ni `N/A`.
 */
export function buildOfvMethodLines(input: {
  step: string;
  offer: Pick<NormalizedOffer, 'urgency'>;
  decisionFrame: NormalizedDecisionFrame;
}): string {
  const fields: readonly OfvMethodField[] =
    (OFV_METHOD_FIELDS_BY_STEP as Record<string, readonly OfvMethodField[]>)[
      input.step
    ] ?? [];
  if (fields.length === 0) return '';

  let lines = '';

  if (fields.includes('decision_frame')) {
    const frame = input.decisionFrame;
    const options: string[] = [];
    for (const key of OPTION_KEYS) {
      const value = cleanScalar(frame[key]);
      if (value !== null) options.push(OPTION_LABELS[key] + ': ' + value);
    }
    if (options.length > 0) {
      lines += '\nDecision Frame: ' + options.join(' | ');
    } else {
      const text = cleanScalar(frame.text);
      if (text !== null) lines += '\nDecision Frame: ' + text;
    }
  }

  if (fields.includes('urgency')) {
    const urgency = cleanScalar(input.offer.urgency);
    if (urgency !== null) lines += '\nUrgencia: ' + urgency;
  }

  return lines;
}
