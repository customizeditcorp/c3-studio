/**
 * F-118 — Guard determinista de fabricación en COPY PUBLICABLE (backstop content-side):
 * seam PURA, framework-free. Estructuralmente es el espejo de `ofv/non-fabrication.ts`
 * (F-105) — mismo esqueleto: grounding present-only → detectores por clase → decisión →
 * directiva de retry → warning legible. **Pero la CALIBRACIÓN es la opuesta, a propósito.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ LA POSTURA SE INVIERTE FRENTE A F-105 (leer antes de "corregir" cualquiera de
 * los dos módulos hacia el otro)
 * ─────────────────────────────────────────────────────────────────────────────────────
 * F-105 declara, textual, que su coste es asimétrico *en un sentido*: un falso-positivo
 * (marcar honesto como fabricado) → coste ALTO; un falso-negativo (dejar pasar una
 * fabricación) → coste BAJO. Eso es CORRECTO **para su artefacto**: la OFV es interna y el
 * operador la aprueba antes de que salga.
 *
 * Acá los tres términos se invierten, porque el artefacto es otro:
 *
 *   | | F-105 (OFV)                       | F-118 (contenido)                        |
 *   |-|-----------------------------------|------------------------------------------|
 *   | destino  | artefacto interno, revisado | copy PUBLICABLE (post de Google, landing, email) |
 *   | falso-negativo | BAJO (lo ve al aprobar) | ALTO: se publica un descuento o un evento inventados ⇒ el negocio lo honra (coste real) o es publicidad engañosa |
 *   | falso-positivo | ALTO (erosiona el marcador que F-104 instituyó) | BAJO y acotado: 1 llamada extra + un warning |
 *   | marcador de faltante | puerta honesta: SIEMPRE pasa | DEFECTO: NUNCA pasa |
 *   | grounding | generoso (supresor léxico + digit-set global) | ESTRECHO (sólo la rebanada promocional) |
 *
 * **El criterio que decide, y que explica ambas posturas en vez de contradecir una:**
 *
 *   > Un guard debe ser CONSERVADOR donde el humano ya tiene la información,
 *   > y AGRESIVO donde no la tiene.
 *
 * En la OFV el operador PUEDE juzgar si la prueba social es real: conoce su negocio y
 * aprueba el artefacto. En un post de GBP el operador NO PUEDE distinguir un `15% discount`
 * fabricado de uno real leyéndolo: es plausible, está bien escrito y no lleva marca de
 * origen. Ahí el guard aporta información que el humano no tiene, y por eso puede —y debe—
 * pagar falsos positivos. F-105 no está mal; evalúa al revés bajo el mismo criterio.
 *
 * Consecuencias concretas de la inversión (las tres que definen este módulo):
 *   1. **Empate → FLAG** (R-01). Si no se puede establecer grounding present-only para una
 *      señal, se marca. F-105 hace lo contrario ("ante la duda, asumir grounded").
 *   2. **Grounding ESTRECHO** (R-05). Sólo las líneas `Urgencia: ` / `Decision Frame: ` que
 *      F-111 inyecta. Un digit-set global (F-105) dejaría que el `15` de un teléfono, de un
 *      año o de "15 años de experiencia" GROUNDEE un `15% discount`: ése es exactamente el
 *      agujero de falso-negativo que esta inversión cierra.
 *   3. **El marcador de faltante NUNCA está grounded** (R-18). Mismo token, veredicto
 *      opuesto: el canon define el output de este canal como *channel-ready*, y un
 *      `Date: [PENDING]` no es channel-ready por definición.
 *
 * DOS TIERS, y el eje NO es "gravedad" sino la naturaleza del daño (R-02):
 *   · `commitment`         (`discount`, `scarcity`, `deadline`)      → COMPROMETE al negocio.
 *   · `publication_defect` (`missing_marker`, `event_datetime`)      → AVERGÜENZA (artefacto
 *     roto o factualmente falso), sin obligación comercial.
 * Sólo el residuo `commitment` deja constancia persistida (`content._fabrication_guard`,
 * R-24); el `publication_defect` muere con la request, como en F-105.
 *
 * FAIL-LOUD, NO FAIL-CLOSED (R-03): el guard nunca bloquea. Hoy no existe publicación
 * automática en el repo — el copy llega a Google porque un humano lo copia. Con ese gate
 * humano por delante, avisar fuerte protege igual que bloquear y no destruye trabajo
 * legítimo cuando el guard se equivoca.
 *   ⚠️ CONDICIÓN DE REVISIÓN DECLARADA: si algún día se construye un publicador automático
 *   (BrightLocal / GBP API), el gate humano desaparece y ESTA POSTURA DEBE REVISARSE a
 *   fail-closed. Se deja escrito para que la decisión no se herede en silencio a un mundo
 *   donde su premisa ya no vale — que es el mismo modo de fallo que F-118 corrige en F-105.
 *
 * LÍMITE DE CLAIM (R-09): este core NO audita la veracidad de la OFV. Una promoción presente
 * en la rebanada promocional PASA aunque esa OFV sea ella misma fabricada. El contenido queda
 * FIEL, no VERDADERO. Auditar la OFV es trabajo de F-105, en el artefacto de F-105.
 *
 * FUERA DE SCOPE, con razón (R-12): prueba social numérica content-side (ya normada aguas
 * arriba por F-105 + F-114), NER de nombres propios (alto FP), precios de servicio (F-111
 * verificó que salen del `Decision Frame:` REAL), prosa blanda (es trabajo de la banlist
 * ANTI-AI, no de un guard determinista) y el path `generate-gbp` (tiene F-098 y su prompt ya
 * prohíbe promociones por política de Google).
 *
 * Módulo PURO (R-38): sin I/O, sin red, sin Next/Supabase/OpenAI, `node --test`-able y
 * compatible con `target: es5` (patrón `exec`-loop, sin `matchAll` ni iteración de RegExp).
 * La orquestación (retry-once dirigido, warning, constancia) vive en la ruta, no acá.
 */

import { detectMissingMarkers } from '../method-context/pending.ts';

/** Clase de señal de fabricación detectada en copy publicable (R-10). */
export type ContentFabricationKind =
  | 'discount'
  | 'scarcity'
  | 'deadline'
  | 'event_datetime'
  | 'missing_marker';

/**
 * Tier de la señal (R-02). `commitment` = crea una obligación comercial si se publica;
 * `publication_defect` = artefacto roto o factualmente falso, sin obligación.
 */
export type FabricationTier = 'commitment' | 'publication_defect';

/** Una señal concreta hallada en el output. */
export interface ContentFabricationSignal {
  kind: ContentFabricationKind;
  tier: FabricationTier;
  /** El token LITERAL detectado (la directiva del retry lo enumera tal cual, R-22). */
  value: string;
  /** Secuencia de dígitos del token, para el digit-match contra la rebanada ('' si no hay). */
  digits: string;
  /**
   * `true` si el token es uno de los GENÉRICOS que F-114 prohíbe explícitamente
   * ("por tiempo limitado", "limited time", "oferta especial"…): no tiene número contra el
   * cual hacer digit-match, así que su única prueba posible es que exista una fuente
   * promocional real (R-08).
   */
  generic: boolean;
}

/**
 * Grounding present-only ESTRECHO (R-04/R-05). NO es todo el `contextChain`: es sólo la
 * REBANADA PROMOCIONAL — el texto de las líneas cuyo prefijo literal es `Urgencia: ` y
 * `Decision Frame: `, que `buildOfvMethodLines` (F-111/CL-094) inyecta al bloque
 * `## OFERTA DE VALOR (APROBADA)` para los 5 steps del reparto.
 *
 * El canon lo respalda: la urgencia ética vive en §4 (Decision Frame) y §7 (Urgencia/
 * Escasez) de la Oferta SmartLab. La rebanada no es un recorte arbitrario del guard: es la
 * ubicación canónica del material promocional.
 */
export interface ContentGrounding {
  /** Concatenación del texto de las líneas `Urgencia: ` / `Decision Frame: `. */
  promotional: string;
  /** Runs `\d+` presentes en `promotional` (NO en todo el contextChain). */
  digits: Set<string>;
}

export interface ContentNonFabricationResult {
  /** true = no quedó ninguna señal sin grounding. */
  ok: boolean;
  /** Señales sin grounding (vacío si ok). */
  signals: ContentFabricationSignal[];
  /** Tier máximo presente entre las señales sin grounding; `null` si no hay ninguna. */
  tier: FabricationTier | null;
}

/** Prefijos LITERALES de la rebanada promocional. Deben coincidir con los que emite
 * `buildOfvMethodLines` (`src/lib/offers/method-context.ts`). Si allá se renombran, acá
 * la rebanada queda vacía y el guard pasa a marcar TODO (falla del lado seguro, no del
 * silencioso) — y un source-guard de F-118 (R-37) se pone rojo antes de que llegue a prod. */
const PROMO_LINE_PREFIXES = ['Urgencia: ', 'Decision Frame: '];

/** Stream de dígitos de un string: descarta todo no-dígito ('' si no queda nada). */
function digitsOf(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Resuelve la rebanada promocional del `contextChain` (R-04/R-05/R-06). Present-only
 * ESTRICTO: sin esas líneas ⇒ `{ promotional: '', digits: ∅ }` ⇒ toda señal `commitment`
 * queda sin grounding y se marca. Eso cubre POR CONSTRUCCIÓN a `nurturing`,
 * `social_content` y `gbp_description` (que por CL-094 nunca reciben esas líneas) y a
 * cualquier cliente sin OFV aprobada, sin una sola condición por step. No lanza ante
 * entradas no-string.
 */
export function resolveContentGrounding(
  contextChain: unknown
): ContentGrounding {
  const text = typeof contextChain === 'string' ? contextChain : '';
  const lines = text.split('\n');
  const picked: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let p = 0; p < PROMO_LINE_PREFIXES.length; p++) {
      const prefix = PROMO_LINE_PREFIXES[p];
      if (line.indexOf(prefix) === 0) {
        picked.push(line.slice(prefix.length));
      }
    }
  }
  const promotional = picked.join('\n');
  const digits = new Set<string>();
  const runs = promotional.match(/\d+/g);
  if (runs) {
    for (let i = 0; i < runs.length; i++) digits.add(runs[i]);
  }
  return { promotional, digits };
}

/** Claves de METADATA que nunca son copy: excluidas del recorrido (R-13). */
const METADATA_KEYS = [
  '_validation',
  '_method_grounding',
  '_fabrication_guard'
];

/** ¿El leaf es una URL? (`/offers/discount`, `%20`… no son copy) — R-13. */
function isUrlLeaf(s: string): boolean {
  const t = s.trim().toLowerCase();
  return (
    t.indexOf('http://') === 0 ||
    t.indexOf('https://') === 0 ||
    t.indexOf('www.') === 0
  );
}

/**
 * Recorrido de leaves del output, TOLERANTE A CUALQUIER SHAPE y que NUNCA lanza (R-13):
 * string/number/boolean → leaf; array/objeto → recursión; `null`/`undefined` → nada.
 * Excluye leaves-URL y las tres claves de metadata. Un shape inesperado o cíclico se trata
 * como "sin copy" (`[]`), no como error — igual que `stringifySocialProof` en F-105.
 *
 * Se devuelve un ARRAY de leaves (no un string concatenado) a propósito: escanear cada leaf
 * por separado evita que dos campos contiguos formen un match que no existe en ninguno.
 */
export function collectContentText(value: unknown): string[] {
  try {
    return collectLeaves(value, 0);
  } catch {
    return [];
  }
}

function collectLeaves(value: unknown, depth: number): string[] {
  if (depth > 12) return []; // cota anti-ciclo (y anti-shape patológico)
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return isUrlLeaf(value) ? [] : [value];
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    let out: string[] = [];
    for (let i = 0; i < value.length; i++) {
      out = out.concat(collectLeaves(value[i], depth + 1));
    }
    return out;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    let out: string[] = [];
    for (let i = 0; i < keys.length; i++) {
      if (METADATA_KEYS.indexOf(keys[i]) !== -1) continue;
      out = out.concat(collectLeaves(obj[keys[i]], depth + 1));
    }
    return out;
  }
  return [];
}

interface PatternSpec {
  kind: ContentFabricationKind;
  tier: FabricationTier;
  re: RegExp;
  /** genérico de la banlist F-114 (sin número ⇒ sólo puede probarse por presencia de fuente). */
  generic?: boolean;
  /** la clase sólo corre en estos steps; ausente ⇒ corre en los 8. */
  steps?: string[];
}

/**
 * R-11 — `discount` exige SEMÁNTICA de descuento. Deliberadamente NO se dispara ante un
 * porcentaje desnudo (`\d+\s*%`): `"150% increase in visibility"` es una afirmación de
 * prueba social —fuera de scope por R-12.1—, no una promoción. Detectarla acá produciría un
 * falso positivo sistemático sobre output real ya observado.
 */
const PATTERNS: PatternSpec[] = [
  // ── discount (commitment) ───────────────────────────────────────────────────────
  {
    kind: 'discount',
    tier: 'commitment',
    re: /\d+(?:[.,]\d+)?\s*%\s*(?:off\b|discount\b|de\s+descuento\b|descuento\b)/gi
  },
  {
    kind: 'discount',
    tier: 'commitment',
    re: /\bdescuentos?\s+(?:del?\s+)?\d+(?:[.,]\d+)?\s*%/gi
  },
  {
    kind: 'discount',
    tier: 'commitment',
    re: /\bsave\s+\d+(?:[.,]\d+)?\s*%/gi
  },
  {
    kind: 'discount',
    tier: 'commitment',
    re: /\bahorr\w*\s+(?:un\s+)?\d+(?:[.,]\d+)?\s*%/gi
  },
  {
    kind: 'discount',
    tier: 'commitment',
    re: /\$\s*\d+(?:[.,]\d+)?\s*(?:off\b|de\s+descuento\b)/gi
  },
  { kind: 'discount', tier: 'commitment', re: /\b2\s*x\s*1\b/gi },
  // ── scarcity NUMÉRICA (commitment) ──────────────────────────────────────────────
  {
    kind: 'scarcity',
    tier: 'commitment',
    re: /\bonly\s+\d+\s+(?:spots?|slots?|places?|seats?|spaces?|openings?)\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    re: /\b\d+\s+(?:spots?|slots?|seats?|openings?)\s+(?:left|remaining|available)\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    re: /\bs[oó]lo\s+\d+\s+(?:cupos?|espacios?|lugares?|plazas?)\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    re: /\b[uú]ltim[oa]s?\s+\d+\s+(?:plazas?|cupos?|lugares?|espacios?)\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    re: /\b(?:quedan|restan)\s+\d+\s+(?:cupos?|espacios?|lugares?|plazas?)\b/gi
  },
  // ── scarcity GENÉRICA — la banlist literal de F-114 (commitment, sin número) ─────
  {
    kind: 'scarcity',
    tier: 'commitment',
    generic: true,
    re: /\bpor\s+tiempo\s+limitado\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    generic: true,
    re: /\bcupos?\s+limitados?\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    generic: true,
    re: /\bplazas?\s+limitadas?\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    generic: true,
    re: /\boferta\s+especial\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    generic: true,
    re: /\blimited[-\s]time\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    generic: true,
    re: /\blimited\s+(?:spots?|slots?|seats?|availability)\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    generic: true,
    re: /\bspecial\s+offer\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    generic: true,
    re: /\bwhile\s+supplies\s+last\b/gi
  },
  {
    kind: 'scarcity',
    tier: 'commitment',
    generic: true,
    re: /\bhasta\s+agotar\s+(?:existencias|stock|cupos)\b/gi
  },
  // ── deadline (commitment) ───────────────────────────────────────────────────────
  {
    kind: 'deadline',
    tier: 'commitment',
    re: /\bby\s+the\s+end\s+of\s+(?:this\s+)?(?:month|week|year)\b/gi
  },
  {
    kind: 'deadline',
    tier: 'commitment',
    re: /\b(?:offer|sale|promo|promotion|discount)\s+(?:expires?|ends?)\b[^.\n!]{0,30}/gi
  },
  {
    kind: 'deadline',
    tier: 'commitment',
    re: /\bexpires?\s+(?:on\s+)?[^.\n!]{1,25}/gi
  },
  {
    kind: 'deadline',
    tier: 'commitment',
    re: /\bv[aá]lid[oa]\s+hasta\b[^.\n!]{0,30}/gi
  },
  {
    kind: 'deadline',
    tier: 'commitment',
    re: /\bhasta\s+(?:el\s+)?\d{1,2}\s+de\s+\w+/gi
  },
  {
    kind: 'deadline',
    tier: 'commitment',
    re: /\bhasta\s+fin(?:es)?\s+de\s+(?:mes|semana|a[nñ]o)\b/gi
  },
  {
    kind: 'deadline',
    tier: 'commitment',
    re: /\bfecha\s+l[ií]mite\b[^.\n!]{0,30}/gi
  },
  {
    kind: 'deadline',
    tier: 'commitment',
    re: /\bantes\s+del\s+\d{1,2}\b[^.\n!]{0,20}/gi
  },
  {
    kind: 'deadline',
    tier: 'commitment',
    re: /\b(?:caduca|vence)\b[^.\n!]{0,25}/gi
  },
  // ── event_datetime (publication_defect) — SÓLO donde existe el tipo EVENT ────────
  // Gating por STEP (design DT-2): la clase sólo tiene sentido en `gbp_posts`. El resto de
  // las clases corre en los 8.
  {
    kind: 'event_datetime',
    tier: 'publication_defect',
    steps: ['gbp_posts'],
    re: /\b\d{1,2}:\d{2}\s*(?:am|pm)?/gi
  },
  {
    kind: 'event_datetime',
    tier: 'publication_defect',
    steps: ['gbp_posts'],
    re: /\b\d{1,2}\s*(?:am|pm)\b/gi
  },
  {
    kind: 'event_datetime',
    tier: 'publication_defect',
    steps: ['gbp_posts'],
    re: /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/gi
  },
  {
    kind: 'event_datetime',
    tier: 'publication_defect',
    steps: ['gbp_posts'],
    re: /\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/gi
  },
  {
    kind: 'event_datetime',
    tier: 'publication_defect',
    steps: ['gbp_posts'],
    re: /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g
  }
];

/**
 * Detecta las señales de UN leaf de copy (R-10/R-11). `missing_marker` se importa de
 * `method-context/pending.ts` — un solo hogar para la doctrina del marcador (F-112/F-116
 * deciden qué se FILTRA al ENTRAR al prompt; F-118 qué se DETECTA al SALIR en copy).
 */
export function detectContentFabrication(
  text: unknown,
  step: string
): ContentFabricationSignal[] {
  const t = typeof text === 'string' ? text : '';
  const signals: ContentFabricationSignal[] = [];
  if (t.length === 0) return signals;
  // Dedup por (clase, span): dos patrones de la MISMA clase que cubren exactamente el
  // mismo tramo son un solo hallazgo. Las OCURRENCIAS REPETIDAS del mismo token en
  // posiciones distintas NO se colapsan: el `Date: [PENDING] / Time: [PENDING] /
  // Location: [PENDING]` del ledger son TRES defectos del artefacto, no uno.
  const seenSpan: Record<string, boolean> = {};
  for (let i = 0; i < PATTERNS.length; i++) {
    const spec = PATTERNS[i];
    if (spec.steps && spec.steps.indexOf(step) === -1) continue;
    // exec-loop (no `matchAll`/for-of sobre RegExp) por compatibilidad con target es5.
    const g = new RegExp(spec.re.source, spec.re.flags);
    g.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = g.exec(t)) !== null) {
      const value = m[0].trim();
      const spanKey = spec.kind + '@' + m.index + ':' + m[0].length;
      if (value.length > 0 && !seenSpan[spanKey]) {
        seenSpan[spanKey] = true;
        signals.push({
          kind: spec.kind,
          tier: spec.tier,
          value,
          digits: digitsOf(value),
          generic: spec.generic === true
        });
      }
      if (m.index === g.lastIndex) g.lastIndex++; // guarda anti-loop de match vacío
    }
  }
  // `missing_marker`: patrón independiente del idioma, con carve-out de enlace markdown.
  const markers = detectMissingMarkers(t);
  for (let i = 0; i < markers.length; i++) {
    signals.push({
      kind: 'missing_marker',
      tier: 'publication_defect',
      value: markers[i],
      digits: digitsOf(markers[i]),
      generic: false
    });
  }
  return signals;
}

/**
 * ¿La señal está grounded? ORDEN SESGADO A FLAG — el inverso de F-105 (R-01):
 *   1. `missing_marker` → NUNCA grounded, cualquiera sea el contexto (R-18).
 *   2. señal con dígitos → grounded SÓLO si su run de dígitos está en la rebanada (R-07).
 *   3. genérico de la banlist F-114 (sin dígitos) → pasa SÓLO si la rebanada es no vacía
 *      (R-08: el core no empareja prosa contra prosa — alto FP—, sólo exige que exista una
 *      fuente promocional real).
 *   4. cualquier otro caso ⇒ DUDA ⇒ se marca (R-01). Acá es donde la puerta rectora de
 *      F-105 hacía lo contrario.
 */
function isGrounded(
  signal: ContentFabricationSignal,
  grounding: ContentGrounding
): boolean {
  if (signal.kind === 'missing_marker') return false; // R-18
  if (signal.digits !== '') return grounding.digits.has(signal.digits); // R-07
  if (signal.generic) return grounding.promotional.length > 0; // R-08
  return false; // R-01 — el empate va al flag
}

const TIER_RANK: Record<FabricationTier, number> = {
  publication_defect: 1,
  commitment: 2
};

function maxTier(signals: ContentFabricationSignal[]): FabricationTier | null {
  let best: FabricationTier | null = null;
  for (let i = 0; i < signals.length; i++) {
    const t = signals[i].tier;
    if (best === null || TIER_RANK[t] > TIER_RANK[best]) best = t;
  }
  return best;
}

/**
 * Núcleo puro de decisión (R-01/R-02/R-03/R-13). Recorre el output completo (cualquier
 * shape), detecta por clase con el gating por step, y filtra lo que TIENE grounding
 * present-only. Nunca lanza; nunca bloquea (la ruta siempre devuelve `success: true`).
 */
export function checkContentNonFabrication(
  content: unknown,
  grounding: ContentGrounding,
  step: string
): ContentNonFabricationResult {
  const leaves = collectContentText(content);
  const flagged: ContentFabricationSignal[] = [];
  for (let i = 0; i < leaves.length; i++) {
    const signals = detectContentFabrication(leaves[i], step);
    for (let j = 0; j < signals.length; j++) {
      const s = signals[j];
      if (isGrounded(s, grounding)) continue;
      flagged.push(s);
    }
  }
  return { ok: flagged.length === 0, signals: flagged, tier: maxTier(flagged) };
}

/**
 * ¿El retry MEJORA ESTRICTAMENTE al original? (R-23). Mejora sobre F-105 R-06 —que sólo
 * adopta si el retry queda limpio—: con dos tiers, cambiar un `discount` fabricado por un
 * `[PENDING]` residual **es** una mejora material y debe adoptarse. Un retry igual o peor,
 * nunca.
 */
export function improvesStrictly(
  original: ContentNonFabricationResult,
  retry: ContentNonFabricationResult
): boolean {
  if (retry.ok) return true;
  if (original.tier === null || retry.tier === null) return false;
  return TIER_RANK[retry.tier] < TIER_RANK[original.tier];
}

/**
 * Dedup de PRESENTACIÓN por (clase, token): el detector cuenta ocurrencias —tres
 * `[PENDING]` son tres defectos del artefacto—, pero enumerarlos tres veces en la directiva
 * y en el warning sólo añade ruido. La detección no se toca; sólo el texto que lee el
 * modelo y el humano.
 */
function uniqueByValue(
  signals: ContentFabricationSignal[]
): ContentFabricationSignal[] {
  const seen: Record<string, boolean> = {};
  const out: ContentFabricationSignal[] = [];
  for (let i = 0; i < signals.length; i++) {
    const key = signals[i].kind + '|' + signals[i].value.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(signals[i]);
  }
  return out;
}

/** ES legible por clase, para la directiva y el warning. */
const KIND_LABELS: Record<ContentFabricationKind, string> = {
  discount: 'descuento',
  scarcity: 'escasez/cupo',
  deadline: 'plazo o fecha límite de oferta',
  event_datetime: 'fecha u hora de evento',
  missing_marker: 'marcador de faltante'
};

/**
 * Directiva dirigida para el retry-once (R-22): enumera los TOKENS LITERALES detectados y
 * ordena omitirlos. La ruta la inserta en el user message ANTES del cierre de idioma (F-081
 * sigue siendo el último bloque). Sin señales → '' (no debería llamarse así).
 */
export function buildContentFabricationRetryDirective(
  signals: ContentFabricationSignal[]
): string {
  if (signals.length === 0) return '';
  const listed = uniqueByValue(signals);
  return [
    'CORRECCIÓN OBLIGATORIA: el copy anterior incluyó elementos que NO están respaldados por el contexto provisto (las líneas "Urgencia:" / "Decision Frame:" del bloque "## OFERTA DE VALOR (APROBADA)"):',
    ...listed.map(
      (s) => '- ' + KIND_LABELS[s.kind] + ' sin respaldo: "' + s.value + '"'
    ),
    'Regenera el output COMPLETO omitiendo exactamente esos elementos. NO los sustituyas por un genérico ("por tiempo limitado", "cupos limitados", "oferta especial") y NO escribas ningún marcador de faltante (entre corchetes o no, en ningún idioma) en su lugar: esto es copy publicable, la degradación correcta es OMITIR y seguir generando el resto. Si el contexto no provee fecha, hora y lugar reales, no emitas un post de tipo EVENT. Usá solo hechos ya provistos; no inventes ningún otro dato.'
  ].join('\n');
}

/**
 * Mensaje ES legible del warning (R-25), análogo `formatNonFabricationWarning` de F-105 y
 * `formatComplianceWarning` de F-098. Puro → testeable. Sin señales → ''.
 */
export function formatContentFabricationWarning(
  signals: ContentFabricationSignal[]
): string {
  if (!signals || signals.length === 0) return '';
  const parts = uniqueByValue(signals).map(
    (s) => KIND_LABELS[s.kind] + ' ("' + s.value + '")'
  );
  const tier = maxTier(signals);
  const tail =
    tier === 'commitment'
      ? ' Un descuento, cupo o plazo publicado COMPROMETE al negocio: verificá que salgan de la OFV aprobada o quitalos antes de publicar.'
      : ' Revisá y corregí el copy antes de publicarlo.';
  return (
    'El contenido generado incluyó elementos que podrían no estar respaldados por la OFV aprobada: ' +
    parts.join(', ') +
    '.' +
    tail
  );
}
