/**
 * F-105 — Guard determinista de no-fabricación de prueba social en la OFV (Scope A):
 * seam PURA, framework-free. Es el ESPEJO INVERSO de F-098 (`gbp-slice/compliance.ts`):
 *   - F-098 verifica la PRESENCIA en el output de hechos concretos presentes en el ctx.
 *   - F-105 detecta la AUSENCIA-DE-GROUNDING de hechos numéricos FABRICADOS en
 *     `social_proof` (números que NO aparecen en el brief/persona/contexto).
 *
 * Naturaleza BACKSTOP y CONSERVADORA (bajo falso-positivo). F-104 (prompt OFV v2, vivo en
 * prod) ya neutralizó la fabricación obvia (`social_proof=[PENDIENTE]`). Este guard cubre el
 * RESIDUO estocástico. El coste es asimétrico: un falso-positivo (marcar honesto como
 * fabricado) dispara retries innecesarios y erosiona el sistema → coste ALTO; un falso-
 * negativo (dejar pasar una fabricación) → coste BAJO (el prompt ya lo hace raro). Por eso:
 *   - marcador honesto (`[PENDIENTE]`, vacío, whitespace, null/ausente, prosa sin números)
 *     → SIEMPRE ok (R-01, la puerta rectora).
 *   - señales MÍNIMAS e INEQUÍVOCAS (numéricas de bajo FP: %, conteos de clientes, métricas
 *     antes/después estrechas). Nada de prosa blanda, adjetivos ni nombres (NER = alto FP,
 *     fuera de scope) (R-02).
 *   - grounding GENEROSO: ante la duda, asumir grounded = no flag (R-04, DT-02).
 *
 * Deriva el grounding EXCLUSIVAMENTE del contexto provisto (present-only, R-10): sin
 * contexto de prueba social el core NO inventa grounding. Framework-free, sin I/O, sin
 * dependencias de Next/Supabase/OpenAI → `node --test`-able (patrón `compliance.ts`).
 * La orquestación del retry-once + warning transitorio vive en la ruta
 * (`generate-content/route.ts`, branch `ofv`), no aquí.
 *
 * DT-07: los helpers `fold`/`digits` se DUPLICAN localmente aquí (no se importan de
 * `compliance.ts`) para NO tocar F-098 (vivo, riesgo-cero de regresión).
 */

/** Clase de señal de fabricación (hecho duro NUMÉRICO) detectada en `social_proof`. */
export type FabricationSignalKind =
  | 'percentage'
  | 'client_count'
  | 'before_after';

/** Una señal de fabricación concreta hallada en el texto de `social_proof`. */
export interface FabricationSignal {
  kind: FabricationSignalKind;
  /** El token literal detectado, p.ej. '150%', '50 clientes', 'de 100 a 150'. */
  value: string;
  /** Secuencia de dígitos del token (para el digit-match de grounding), p.ej. '150'. */
  digits: string;
}

/**
 * Grounding present-only derivado EXCLUSIVAMENTE del brief/persona/contexto (R-10).
 *   - hasLexicalSocialProof: el contexto menciona reseñas/testimonios/casos reales
 *     (supresor coarse de FP: si el brief declara prueba social, no marcamos, DT-02).
 *   - digitSet: dígitos (runs `\d+`) presentes en el contexto, para el digit-match.
 */
export interface SocialProofGrounding {
  hasLexicalSocialProof: boolean;
  digitSet: Set<string>;
}

export interface NonFabricationResult {
  /** true = honesto o grounded (no hay fabricación). */
  ok: boolean;
  /** Señales sin grounding (vacío si ok). */
  fabricated: FabricationSignal[];
}

/**
 * Normalización case-insensitive Y acento-insensitive (mirror F-098 `fold`, DT-07):
 * NFD-decompone, elimina las marcas diacríticas combinantes (U+0300..U+036F) y baja a
 * minúsculas. `Reseña` ↔ `resena`, `[PENDIENTE]` ↔ `[pendiente]`.
 */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Stream de dígitos de un string (mirror F-098 `digits`, DT-07): descarta todo no-dígito. */
function digits(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Términos lexicales (folded, sin acentos) que indican prueba social REAL declarada en el
 * contexto. Su presencia SUPRIME el flag (grounding generoso, sesgo a NO marcar, DT-02).
 */
const SOCIAL_PROOF_LEXICON = [
  'resena', // reseña(s) → folded
  'testimonio',
  'testimonial',
  'review',
  'caso de exito',
  'case study',
  'estrella', // reseñas de N estrellas
  'calificacion',
  'valoracion',
  'opinion'
];

/**
 * Resuelve el grounding present-only del contexto (brief `raw_text` + persona, ya ensamblado
 * en `contextChain` por la ruta), R-10/DT-02. Sin contexto → `{ hasLexicalSocialProof:false,
 * digitSet:∅ }` (nunca inventa grounding). No lanza ante entradas no-string.
 */
export function resolveSocialProofGrounding(
  contextText: unknown
): SocialProofGrounding {
  const text = typeof contextText === 'string' ? contextText : '';
  const folded = fold(text);
  const hasLexicalSocialProof = SOCIAL_PROOF_LEXICON.some((term) =>
    folded.includes(term)
  );
  const digitSet = new Set<string>();
  const runs = text.match(/\d+/g);
  if (runs) {
    for (const run of runs) digitSet.add(run);
  }
  return { hasLexicalSocialProof, digitSet };
}

/**
 * Stringify ROBUSTO de `social_proof` ante CUALQUIER shape (R-09): `string` tal cual;
 * array (de strings u objetos v1 `[{cliente,resultado}]`) y objetos vía recorrido de leaves
 * (para que un `150%` anidado se detecte); `number`/`boolean` → `String`; `null`/`undefined`
 * → `''`. Nunca lanza: un shape inesperado o cíclico se trata como honesto (`''`), no error.
 */
export function stringifySocialProof(value: unknown): string {
  try {
    return collectLeaves(value).join(' ');
  } catch {
    // Shape inesperado / referencia cíclica → honesto (no error), R-09.
    return '';
  }
}

/** Recorrido recursivo de leaves; concatena strings/números, ignora null/undefined. */
function collectLeaves(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v) => collectLeaves(v));
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      collectLeaves(v)
    );
  }
  return [];
}

/**
 * ¿Es un marcador HONESTO? (R-01, la puerta rectora). `[PENDIENTE]` (literal, folded,
 * case/acento-insensitive), vacío o whitespace. Se exige el corchete de apertura para no
 * confundir prosa legítima que contenga la palabra "pendiente" (p.ej. "pago pendiente").
 */
export function isHonestSocialProof(text: string): boolean {
  const folded = fold(typeof text === 'string' ? text : '');
  if (folded.trim().length === 0) return true;
  if (folded.includes('[pendiente')) return true;
  return false;
}

/**
 * Detecta señales numéricas de fabricación de BAJO falso-positivo (R-02, DT-01):
 *   - `percentage`   — `\d+([.,]\d+)?\s*%`         (FP muy bajo)
 *   - `client_count` — `\d+\s*(clientes|clients|customers)` (FP muy bajo)
 *   - `before_after` — patrones ESTRECHOS: `de \d+ a \d+`, `\d+ → \d+`, `\d+ (antes|después
 *     |before|after)` (FP medio → solo patrón estrecho).
 * Prosa blanda, adjetivos y nombres propios (sin número) → NO producen señal.
 */
export function detectFabricationSignals(text: string): FabricationSignal[] {
  const t = typeof text === 'string' ? text : '';
  const signals: FabricationSignal[] = [];
  const scan = (kind: FabricationSignalKind, re: RegExp): void => {
    // exec-loop (no `matchAll`/for-of) para ser compatible con target es5 del tsconfig.
    const g = new RegExp(
      re.source,
      re.flags.includes('g') ? re.flags : re.flags + 'g'
    );
    let m: RegExpExecArray | null;
    while ((m = g.exec(t)) !== null) {
      signals.push({ kind, value: m[0].trim(), digits: digits(m[0]) });
      if (m.index === g.lastIndex) g.lastIndex++; // guarda anti-loop de match vacío
    }
  };

  scan('percentage', /\d+(?:[.,]\d+)?\s*%/g);
  scan('client_count', /\d+(?:[.,]\d+)?\s*(?:clientes?|clients?|customers?)/gi);
  // before_after — patrones estrechos e inequívocos (DT-01).
  scan('before_after', /\bde\s+\d+(?:[.,]\d+)?\s+a\s+\d+(?:[.,]\d+)?/gi);
  scan('before_after', /\d+(?:[.,]\d+)?\s*(?:→|->)\s*\d+(?:[.,]\d+)?/g);
  scan(
    'before_after',
    /\d+(?:[.,]\d+)?\s*(?:antes|despues|después|before|after)\b/gi
  );
  return signals;
}

/** Una señal está grounded si el contexto declara prueba social O contiene su nº (DT-02). */
function isGrounded(
  signal: FabricationSignal,
  grounding: SocialProofGrounding
): boolean {
  if (grounding.hasLexicalSocialProof) return true; // supresor coarse (sesgo a no-flag)
  if (signal.digits !== '' && grounding.digitSet.has(signal.digits))
    return true;
  return false;
}

/**
 * Núcleo puro (R-01/R-03/R-04/R-09). Orden sesgado a NO-flag:
 *   1. stringify robusto del shape (R-09).
 *   2. marcador honesto → ok (R-01, puerta rectora).
 *   3. sin señales numéricas → ok (prosa sin hechos duros, R-02).
 *   4. señales SIN grounding present-only → `fabricated` (R-03); grounded pasa (R-04).
 * `ok = fabricated.length === 0`.
 */
export function checkOfvNonFabrication(
  socialProof: unknown,
  grounding: SocialProofGrounding
): NonFabricationResult {
  const text = stringifySocialProof(socialProof);
  if (isHonestSocialProof(text)) return { ok: true, fabricated: [] };
  const signals = detectFabricationSignals(text);
  if (signals.length === 0) return { ok: true, fabricated: [] };
  const fabricated = signals.filter((s) => !isGrounded(s, grounding));
  return { ok: fabricated.length === 0, fabricated };
}

/** ES legible por clase de señal, para la directiva/warning. */
const SIGNAL_LABELS: Record<FabricationSignalKind, string> = {
  percentage: 'porcentaje',
  client_count: 'conteo de clientes',
  before_after: 'métrica antes/después'
};

/**
 * Instrucción dirigida para el retry (R-05), análogo `buildComplianceRetryDirective`:
 * encabezado de corrección + una línea por señal fabricada + orden de usar `[PENDIENTE]` si
 * no hay datos reales. La ruta la inserta en el user message ANTES del cierre de idioma
 * (F-081 sigue siendo el último bloque). `fabricated` vacío → '' (no debería llamarse así).
 */
export function buildNonFabricationRetryDirective(
  fabricated: FabricationSignal[]
): string {
  if (fabricated.length === 0) return '';
  return [
    'CORRECCIÓN OBLIGATORIA: la prueba social (social_proof) anterior incluyó datos NUMÉRICOS que NO están respaldados por el brief, la persona ni el contexto provisto:',
    ...fabricated.map(
      (f) => '- ' + SIGNAL_LABELS[f.kind] + ' sin respaldo: ' + f.value
    ),
    'NO inventes prueba social. Si no hay reseñas, testimonios, conteos de clientes o métricas reales y verificables en los datos provistos, escribí EXACTAMENTE "[PENDIENTE: proveer reseñas/testimonios reales]" en social_proof. Usá solo hechos ya provistos; no inventes ningún otro dato.'
  ].join('\n');
}

/**
 * Mensaje ES legible del warning transitorio (R-08), análogo `formatComplianceWarning`.
 * Puro → testeable. `fabricated` vacío → ''.
 */
export function formatNonFabricationWarning(
  fabricated: FabricationSignal[]
): string {
  if (fabricated.length === 0) return '';
  const parts = fabricated.map(
    (f) => SIGNAL_LABELS[f.kind] + ' (' + f.value + ')'
  );
  return (
    'La prueba social generada incluyó datos que podrían no estar respaldados por los datos provistos: ' +
    parts.join(', ') +
    '. Verificá que sean reales o reemplazalos por "[PENDIENTE]" antes de aprobar el contenido.'
  );
}
