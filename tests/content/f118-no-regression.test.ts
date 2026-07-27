/**
 * F-118 T-13 — NO-REGRESIÓN. Fija que F-118 complementa sin corregir: cada feature previa
 * queda con su postura intacta, y las tres constricciones duras del spec (H-1/H-2/H-3) más
 * la cuarta hallada por el implementer (H-4) quedan atadas. H-4 vive en el guard
 * preexistente `f102-constraints` R-07, cuya cota exacta subió de 3 a 4 (ver allí).
 *
 * Cubre R-15, R-16, R-33 (tramo offline), R-34, R-35, R-36.
 *
 * La tesis que este archivo defiende: **F-105 no está mal.** Su postura conservadora es
 * correcta PARA SU ARTEFACTO (la OFV es interna y el operador la aprueba). F-118 no la
 * corrige — evalúa al revés bajo el mismo criterio, porque su artefacto es copy publicable.
 * Si alguien "unifica" los dos guards, estos tests se ponen rojos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  PENDING_MARKER,
  isPendingMarker,
  cleanScalar
} from '../../src/lib/method-context/pending.ts';
import {
  resolveContentGrounding,
  checkContentNonFabrication
} from '../../src/lib/content/non-fabrication.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ROUTE = read('src/app/api/generate-content/route.ts');
const OFV_CORE = read('src/lib/ofv/non-fabrication.ts');
const OFFERS_METHOD_CONTEXT = read('src/lib/offers/method-context.ts');
const PERSONAS_METHOD_CONTEXT = read('src/lib/personas/method-context.ts');

/* ================================================================================ */
/*  R-34 — F-105 INTACTO (su postura es correcta para su artefacto)                  */
/* ================================================================================ */

test('T-13 ⭐ R-34 `src/lib/ofv/non-fabrication.ts` conserva su postura CONSERVADORA sin tocar', () => {
  // La puerta rectora honesta: en la OFV, el marcador SIEMPRE pasa.
  assert.match(OFV_CORE, /export function isHonestSocialProof\(/);
  assert.match(
    OFV_CORE,
    /if \(folded\.includes\('\[pendiente'\)\) return true;/
  );
  // El grounding GENEROSO: supresor léxico + digit-set global.
  assert.match(OFV_CORE, /hasLexicalSocialProof/);
  assert.match(OFV_CORE, /const SOCIAL_PROOF_LEXICON = \[/);
  assert.match(OFV_CORE, /digitSet: Set<string>/);
  // Y su declaración de asimetría de costos sigue textual (F-118 la cita, no la borra).
  assert.match(OFV_CORE, /El coste es asimétrico/);
  // F-118 no importa NADA de F-105 ni al revés: dos módulos, dos calibraciones.
  const CONTENT_CORE = read('src/lib/content/non-fabrication.ts');
  assert.doesNotMatch(CONTENT_CORE, /from '\.\.\/ofv\/non-fabrication/);
  assert.doesNotMatch(OFV_CORE, /from '\.\.\/content\/non-fabrication/);
});

test('T-13 ⭐ R-34 el branch `ofv` de la ruta sigue intacto', () => {
  const F105_BLOCK = ROUTE.slice(
    ROUTE.indexOf('// --- F-105: guard'),
    ROUTE.indexOf('let savedRecord')
  );
  assert.match(F105_BLOCK, /if \(step === 'ofv'\)/);
  assert.match(F105_BLOCK, /resolveSocialProofGrounding\(contextChain\)/);
  assert.match(
    F105_BLOCK,
    /checkOfvNonFabrication\(parsedContent\['social_proof'\]/
  );
  assert.match(F105_BLOCK, /\.\.\.callParams/);
  // Warning de F-105 sigue siendo estrictamente TRANSITORIO (no se le contagió R-24).
  const saveBlock = ROUTE.slice(
    ROUTE.indexOf('if (save) {'),
    ROUTE.indexOf('return NextResponse.json(')
  );
  assert.doesNotMatch(saveBlock, /nonFabWarning|social_proof_warning/);
});

/* ================================================================================ */
/*  R-35 — F-111 / F-112 / F-117 y el resto del cableado, intactos                    */
/* ================================================================================ */

test('T-13 ⭐ R-35 F-111: el reparto (la FUENTE del grounding de F-118) no se toca', () => {
  assert.match(OFFERS_METHOD_CONTEXT, /OFV_METHOD_FIELDS_BY_STEP/);
  assert.match(OFFERS_METHOD_CONTEXT, /export function buildOfvMethodLines\(/);
  assert.match(
    OFFERS_METHOD_CONTEXT,
    /export function normalizeDecisionFrame\(/
  );
  // Los 5 steps del reparto de CL-094, exactamente.
  const declStart = OFFERS_METHOD_CONTEXT.indexOf(
    'export const OFV_METHOD_FIELDS_BY_STEP'
  );
  assert.ok(declStart > -1, 'desapareció la declaración del reparto');
  const block = OFFERS_METHOD_CONTEXT.slice(
    declStart,
    OFFERS_METHOD_CONTEXT.indexOf('} as const', declStart)
  );
  for (const step of [
    'gbp_posts',
    'campaign_copy',
    'website_home',
    'website_service',
    'website_location'
  ]) {
    assert.ok(block.indexOf(step) !== -1, `el reparto perdió el step ${step}`);
  }
  for (const outside of ['nurturing', 'social_content', 'gbp_description']) {
    assert.equal(
      block.indexOf("'" + outside + "'"),
      -1,
      `el reparto ganó un step que CL-094 dejó fuera: ${outside}`
    );
  }
});

test('T-13 ⭐ R-35 F-112/F-117: los seams de persona siguen exportados e intactos', () => {
  assert.match(
    PERSONAS_METHOD_CONTEXT,
    /export function buildPersonaMethodBlock\(/
  );
  assert.match(
    PERSONAS_METHOD_CONTEXT,
    /export function buildPersonaDownstreamBlock\(/
  );
});

test('T-13 R-35 el validador anti-AI, el method-grounding y el retry F-102 siguen cableados', () => {
  for (const symbol of [
    'attachValidation',
    'attachMethodGrounding',
    'ANTI_AI_RULES',
    'extractGeneratedOutputFields',
    'resolveContentTemperature',
    'parseGeneratedContent',
    'pickCanonicalOffer',
    'pickCanonicalContentRow',
    'buildOfvWritePayload',
    'resolveWriteMode',
    'shouldPersistGeneratedOutput'
  ]) {
    assert.ok(ROUTE.indexOf(symbol) !== -1, `la ruta perdió ${symbol}`);
  }
  // El bloque de F-118 no referencia ninguno de ellos (diff aislado, como exigió F-105 R-12).
  const F118_BLOCK = ROUTE.slice(
    ROUTE.indexOf('// --- F-118: guard'),
    ROUTE.indexOf('if (save) {')
  );
  for (const symbol of [
    'validate(',
    'attachValidation',
    'attachMethodGrounding',
    'ANTI_AI_RULES',
    'extractOffersFields'
  ]) {
    assert.equal(
      F118_BLOCK.indexOf(symbol),
      -1,
      `el bloque F-118 referencia ${symbol} (R-35, diff aislado)`
    );
  }
});

/* ================================================================================ */
/*  R-15 / R-16 / H-1 — `pending.ts` extendido POR ADICIÓN                            */
/* ================================================================================ */

test('T-13 ⭐ R-15 `isPendingMarker` / `cleanScalar` conservan semántica IDÉNTICA', () => {
  // Contrato exacto que F-111/F-112/F-113/F-116 dependen de que no cambie.
  assert.equal(PENDING_MARKER, '[pendiente]');
  assert.equal(isPendingMarker('[PENDIENTE]'), true);
  assert.equal(isPendingMarker('  [pendiente]  '), true);
  assert.equal(
    isPendingMarker('[PENDING]'),
    false,
    'se ENSANCHÓ el predicado de entrada'
  );
  assert.equal(
    isPendingMarker('TBD'),
    false,
    'se ENSANCHÓ el predicado de entrada'
  );
  assert.equal(
    isPendingMarker('Objeciones: [PENDIENTE] y falta de tiempo'),
    false
  );
  assert.equal(isPendingMarker(42), false);
  assert.equal(isPendingMarker(null), false);

  assert.equal(cleanScalar('  hola  '), 'hola');
  assert.equal(cleanScalar(''), null);
  assert.equal(cleanScalar('   '), null);
  assert.equal(cleanScalar('[PENDIENTE]'), null);
  assert.equal(
    cleanScalar('[PENDING]'),
    '[PENDING]',
    'cleanScalar se ensanchó'
  );
  assert.equal(cleanScalar('TBD'), 'TBD', 'cleanScalar se ensanchó');
  assert.equal(cleanScalar(7), '7');
  assert.equal(cleanScalar(Number.NaN), null);
  assert.equal(cleanScalar(true), null);
  assert.equal(cleanScalar({}), null);
  assert.equal(cleanScalar(null), null);
});

test('T-13 ⭐ R-15 la extensión es POR ADICIÓN: `detectMissingMarkers` no consume el predicado de entrada', () => {
  const PENDING_SRC = stripComments(read('src/lib/method-context/pending.ts'));
  const fnStart = PENDING_SRC.indexOf('export function detectMissingMarkers');
  assert.ok(fnStart > -1, 'no se añadió el detector');
  const fn = PENDING_SRC.slice(fnStart);
  assert.equal(
    fn.indexOf('isPendingMarker('),
    -1,
    'el detector de SALIDA se apoya en el predicado de ENTRADA (ensanchamiento encubierto)'
  );
  // Y sigue siendo por PATRÓN, no por lista cerrada de variantes.
  assert.match(
    fn,
    /\\\[\[\^\\\]\\n\]\{1,40\}\\\]/,
    'el detector dejó de ser por patrón'
  );
});

test('T-13 ⭐⭐ R-16 (H-1) el literal del marcador sigue definido UNA SOLA VEZ en todo `src/lib`', () => {
  // Réplica de los guards de F-112 T-10 y F-113 T-11 (que cuentan sobre TODO el árbol,
  // comentarios incluidos en el caso de F-112). Se replica acá para que, si F-118 lo
  // rompiera, el mensaje señale a F-118 y no a una feature ajena.
  const files = readdirSync(resolve(REPO, 'src/lib'), {
    recursive: true,
    encoding: 'utf8'
  }).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const hits: string[] = [];
  for (const f of files) {
    // Misma forma que el guard de F-113 T-11: se mira el CÓDIGO sin comentarios (una
    // mención en prosa no es una definición) y la comparación es case-insensitive.
    const code = stripComments(
      readFileSync(resolve(REPO, 'src/lib', f), 'utf8')
    );
    const n = (code.match(/'\[pendiente\]'/gi) ?? []).length;
    for (let i = 0; i < n; i++) hits.push(f);
  }
  assert.deepEqual(
    hits,
    ['method-context/pending.ts'],
    'F-118 introdujo una segunda ocurrencia del literal: ' + hits.join(', ')
  );
  // El core de F-118 no lo redefine: detecta por patrón, no por lista.
  assert.doesNotMatch(
    read('src/lib/content/non-fabrication.ts'),
    /'\[pendiente\]'/i
  );
});

/* ================================================================================ */
/*  R-33 (tramo offline) — el logro de F-114 no se degrada                            */
/* ================================================================================ */

test('T-13 ⭐ R-33 las anclas de F-114 siguen vivas en los 8 prompts', () => {
  const CONTENT_STEPS = [
    'gbp_description',
    'gbp_posts',
    'campaign_copy',
    'website_home',
    'website_service',
    'website_location',
    'nurturing',
    'social_content'
  ];
  for (const step of CONTENT_STEPS) {
    const text = read(`prompts/${step}/system_prompt.md`);
    assert.match(text, /PRINCIPIO\s+DE\s+HONESTIDAD/, step);
    assert.match(text, /JAMÁS\s+fabricar\s+hechos\s+duros/, step);
    assert.match(text, /descuentos/, step);
    assert.match(text, /cupos/, step);
    assert.match(text, /fechas\s+límite/, step);
  }
  // Los 7 con anclaje conservan la fidelidad a `Urgencia:` (gbp_description no lo recibe,
  // F-114 R-19/R-24, y F-118 no se lo añade).
  for (const step of CONTENT_STEPS) {
    const text = read(`prompts/${step}/system_prompt.md`);
    if (step === 'gbp_description') {
      assert.doesNotMatch(text, /ANCLAJE\s+DEL\s+ELEMENTO\s+PROMOCIONAL/, step);
      continue;
    }
    assert.match(text, /ANCLAJE\s+DEL\s+ELEMENTO\s+PROMOCIONAL/, step);
    assert.match(text, /"Urgencia:"/, step);
  }
});

test('T-13 ⭐ R-33 el guard NO sobre-corrige: la urgencia REAL de la OFV sigue pasando limpia', () => {
  // El complemento offline de la probe (b) de la §6.1: si F-118 marcara el output que F-114
  // consiguió, la feature se refutaría a sí misma. Aquí se prueba con el token exacto en
  // los DOS idiomas del canal.
  const g = resolveContentGrounding(
    '## OFERTA DE VALOR (APROBADA)\nUrgencia: Solo 5 espacios disponibles este mes'
  );
  for (const copy of [
    'Only 5 spots available this month to ensure personalized service!',
    'Solo 5 espacios disponibles este mes para garantizar un servicio personalizado'
  ]) {
    const r = checkContentNonFabrication({ content: copy }, g, 'gbp_posts');
    assert.equal(r.ok, true, 'SOBRE-CORRECCIÓN sobre: ' + copy);
  }
});

/* ================================================================================ */
/*  R-36 — sin DDL, sin delete, sin migración nueva, sin bump                         */
/* ================================================================================ */

test('T-13 ⭐ R-36 ninguna fuente tocada por F-118 introduce DDL ni borrado', () => {
  const touched: [string, string][] = [
    ['route.ts', ROUTE],
    ['content/non-fabrication.ts', read('src/lib/content/non-fabrication.ts')],
    ['method-context/pending.ts', read('src/lib/method-context/pending.ts')],
    ['types/generate-content.ts', read('src/types/generate-content.ts')]
  ];
  for (const [name, src] of touched) {
    assert.doesNotMatch(
      src,
      /alter table|create table|create index|drop table|delete from/i,
      name
    );
    assert.doesNotMatch(src, /\.delete\(/, name);
  }
});

test('T-13 ⭐ R-36 F-118 no añade ninguna migración', () => {
  const dir = resolve(REPO, 'supabase/migrations');
  if (!existsSync(dir)) return;
  const nuevas = readdirSync(dir).filter((f) => /f-?118|fabrication/i.test(f));
  assert.deepEqual(
    nuevas,
    [],
    'F-118 introdujo una migración: ' + nuevas.join(', ')
  );
});

test('T-13 ⭐ R-36 los 11 `meta.json` conservan su versión (los 8 de contenido en 1)', () => {
  const esperado: Record<string, number> = {
    gbp_description: 1,
    gbp_posts: 1,
    campaign_copy: 1,
    website_home: 1,
    website_service: 1,
    website_location: 1,
    nurturing: 1,
    social_content: 1,
    brief: 1,
    // Corrección registrada por F-116: estos DOS están en 2 y F-118 no los toca.
    buyer_persona: 2,
    ofv: 2
  };
  for (const step of Object.keys(esperado)) {
    const meta = JSON.parse(read(`prompts/${step}/meta.json`));
    assert.equal(
      meta.version,
      esperado[step],
      `${step}: cambió meta.json.version`
    );
  }
});

test('T-13 ⭐ R-36 F-118 NO toca los prompts del núcleo (`brief`/`buyer_persona`/`ofv`)', () => {
  // El gate que F-114 R-31 instituyó y F-116 usó: si el `check` de F-101 mostrara un diff
  // en estos tres, el árbol está sucio. Acá se ata en offline la premisa de ese gate.
  for (const step of ['brief', 'buyer_persona', 'ofv']) {
    const text = read(`prompts/${step}/system_prompt.md`);
    assert.doesNotMatch(
      text,
      /EN\s+NING[UÚ]N\s+IDIOMA/i,
      `${step}: F-118 tocó un prompt del núcleo`
    );
    assert.doesNotMatch(
      text,
      /Condición\s+de\s+EVENT/,
      `${step}: F-118 tocó un prompt del núcleo`
    );
  }
  // …y el prompt de la OFV conserva su marcador como salida LEGÍTIMA (postura F-104/F-105,
  // que F-118 explícitamente NO corrige).
  assert.match(read('prompts/ofv/system_prompt.md'), /\[PENDIENTE/);
});
