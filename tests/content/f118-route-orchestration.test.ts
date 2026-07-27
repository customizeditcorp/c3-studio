/**
 * F-118 T-09 — Source-guards (whitespace-tolerantes) sobre la ORQUESTACIÓN de la ruta
 * `src/app/api/generate-content/route.ts` + el surfacing mínimo en la única UI que consume
 * un step de contenido. Cubre R-03, R-21..R-28 y R-37.
 *
 * Por qué source-guards y no un test de integración: la ruta es un handler de Next con
 * Supabase + OpenAI; el precedente del repo (F-095/F-102/F-105) es inspeccionar la fuente
 * para fijar los invariantes ESTRUCTURALES, y probar la lógica en el seam puro (T-05).
 * Los asserts son tolerantes al reformateo del hook husky/prettier.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

/** Código sin comentarios: los asserts de conteo/ausencia miran el CÓDIGO, no la prosa
 * (una mención en un comentario no es un call-site ni una condición). */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ROUTE = read('src/app/api/generate-content/route.ts');
const GBP_PAGE = read('src/app/(app)/gbp/[clientId]/page.tsx');
const OFFERS_METHOD_CONTEXT = read('src/lib/offers/method-context.ts');
const ROUTE_CODE = stripComments(ROUTE);

/**
 * El TRAMO NUEVO de F-118: desde su marcador de bloque hasta el `if (save) {`.
 * Ubicación obligada por H-3/R-27 — ver el test dedicado más abajo.
 */
const F118_BLOCK = ROUTE.slice(
  ROUTE.indexOf('// --- F-118: guard'),
  ROUTE.indexOf('if (save) {')
);

/** El tramo de F-105, recortado EXACTAMENTE como lo recorta su propio test. */
const F105_BLOCK = ROUTE.slice(
  ROUTE.indexOf('// --- F-105: guard'),
  ROUTE.indexOf('let savedRecord')
);

const F118_CODE = stripComments(F118_BLOCK);

/* ================================================================================ */
/*  R-27 / H-3 — la ubicación del bloque                                            */
/* ================================================================================ */

test('T-09 ⭐ R-27 (H-3) el bloque de F-118 va DESPUÉS de `outputSteps` y ANTES de `if (save)`', () => {
  const idxOutputSteps = ROUTE.indexOf('const outputSteps = [');
  const idxF118 = ROUTE.indexOf('// --- F-118: guard');
  const idxSave = ROUTE.indexOf('if (save) {');
  assert.ok(idxOutputSteps > -1 && idxF118 > -1 && idxSave > -1);
  assert.ok(
    idxOutputSteps < idxF118,
    'el guard necesita `outputSteps` ya declarado'
  );
  assert.ok(
    idxF118 < idxSave,
    'el guard corre ANTES del bloque de guardado (R-21)'
  );
  assert.ok(F118_BLOCK.length > 0, 'tramo F-118 localizado');
});

test('T-09 ⭐ R-27 (H-3) el bloque de F-118 NO invade el tramo de F-105', () => {
  // Si estuviera entre `// --- F-105: guard` y `let savedRecord`, el source-guard de F-105
  // vería DOS re-calls en un tramo que asserta exactamente uno.
  assert.equal(
    F105_BLOCK.indexOf('F-118'),
    -1,
    'el bloque de F-118 se coló dentro del tramo de F-105'
  );
  assert.equal(
    F105_BLOCK.indexOf('checkContentNonFabrication'),
    -1,
    'símbolo de F-118 dentro del tramo de F-105'
  );
});

test('T-09 ⭐ R-26 el tramo de F-105 SIGUE teniendo exactamente 1 re-call (prueba de que H-3 se respetó)', () => {
  // Réplica deliberada del assert de `f105-non-fabrication.test.ts` T-08: si F-118 hubiera
  // roto esa constricción, este test también se pone rojo — y con el mensaje correcto.
  const recalls = (F105_BLOCK.match(/openai\.chat\.completions\.create/g) || [])
    .length;
  assert.equal(
    recalls,
    1,
    'F-118 alteró el número de re-calls del tramo de F-105'
  );
});

/* ================================================================================ */
/*  R-21 — gate por los 8 steps de contenido, con save:true y save:false            */
/* ================================================================================ */

test('T-09 ⭐ R-21 el guard está gateado por los 8 steps de contenido (`outputSteps.includes(step)`)', () => {
  assert.match(
    F118_BLOCK,
    /if\s*\(\s*outputSteps\.includes\(\s*step\s*\)\s*\)/,
    'el gate por los 8 steps de contenido desapareció'
  );
  // …y el grounding sale del contextChain (present-only), como en F-105.
  assert.match(
    F118_BLOCK,
    /resolveContentGrounding\(\s*contextChain\s*\)/,
    'el grounding no se resuelve desde el contextChain'
  );
});

test('T-09 R-21 el guard corre con `save:true` Y `save:false` (está FUERA de `if (save)`)', () => {
  // El bloque termina donde empieza el guardado: nada de F-118 depende de `save`
  // salvo la constancia persistida (R-24), que por naturaleza vive en el insert.
  assert.doesNotMatch(
    F118_CODE,
    /if\s*\(\s*save\s*\)/,
    'el guard quedó condicionado a save'
  );
});

/* ================================================================================ */
/*  R-22 / R-26 — retry-once dirigido, F-081-safe, mismos params                     */
/* ================================================================================ */

test('T-09 ⭐ R-22 la directiva va ANTES del cierre de idioma (F-081 sigue siendo el último bloque)', () => {
  assert.match(
    F118_BLOCK,
    /userMessageBase\s*\+\s*'\\n\\n'\s*\+\s*directive\s*\+\s*languageDirective/,
    'la directiva no está entre la base y el cierre de idioma'
  );
  assert.match(
    F118_BLOCK,
    /buildContentFabricationRetryDirective\(\s*cf\.signals\s*\)/,
    'la directiva no se construye con las señales detectadas'
  );
});

test('T-09 R-22 el re-call reusa los MISMOS params (`...callParams`)', () => {
  assert.match(F118_BLOCK, /\.\.\.callParams/, 'el retry no reusa callParams');
});

test('T-09 ⭐ R-26 exactamente UN re-call en el tramo de F-118, gateado, sin loop', () => {
  const recalls = (
    F118_CODE.match(/openai\.chat\.completions\.create\(/g) || []
  ).length;
  assert.equal(recalls, 1, 'un solo re-call en el bloque F-118 (sin loop)');
  assert.match(
    F118_BLOCK,
    /if\s*\(\s*!cf\.ok\s*\)/,
    'retry gateado por !cf.ok'
  );
  assert.doesNotMatch(F118_BLOCK, /\bwhile\s*\(/, 'sin while loop');
  assert.doesNotMatch(F118_BLOCK, /\bfor\s*\(/, 'sin for loop');
  assert.doesNotMatch(F118_BLOCK, /setTimeout|backoff/i, 'sin backoff');
});

/* ================================================================================ */
/*  R-23 — adopción SÓLO SI MEJORA                                                   */
/* ================================================================================ */

test('T-09 ⭐ R-23 la adopción del retry pasa por `improvesStrictly` (no por "si parsea")', () => {
  assert.match(
    F118_BLOCK,
    /if\s*\(\s*improvesStrictly\(\s*cf\s*,\s*retryCf\s*\)\s*\)/,
    'la adopción sólo-si-mejora desapareció'
  );
  // El re-check del retry usa el MISMO grounding y el MISMO step que el check original.
  assert.match(
    F118_BLOCK,
    /checkContentNonFabrication\(\s*retryResult\.content\s*,\s*contentGrounding\s*,\s*step\s*\)/
  );
  // Y sólo dentro de esa rama se pisan `parsedContent`/`rawText`.
  const adopt = F118_BLOCK.slice(
    F118_BLOCK.indexOf('improvesStrictly(cf, retryCf)')
  );
  assert.match(adopt, /parsedContent\s*=\s*retryResult\.content/);
  assert.match(adopt, /rawText\s*=\s*retryResult\.rawText/);
});

/* ================================================================================ */
/*  R-03 / R-25 — no bloquea, warning spread-guarded                                 */
/* ================================================================================ */

test('T-09 ⭐ R-03 el guard NUNCA bloquea: no hay early-return ni status de error en su tramo', () => {
  assert.doesNotMatch(
    F118_BLOCK,
    /NextResponse\.json/,
    'el guard devuelve una respuesta propia (bloquearía)'
  );
  assert.doesNotMatch(
    F118_BLOCK,
    /success:\s*false/,
    'el guard marca la request como fallida'
  );
  assert.doesNotMatch(F118_BLOCK, /\bthrow\b/, 'el guard lanza');
  // …y la respuesta sigue afirmando success: true.
  assert.match(ROUTE, /return NextResponse\.json\(\{\s*success:\s*true/);
});

test('T-09 ⭐ R-25 `fabrication_warning` es un campo OPCIONAL spread-guarded en la respuesta', () => {
  assert.match(
    ROUTE,
    /\.\.\.\(\s*fabricationWarning\s*\?\s*\{\s*fabrication_warning:\s*fabricationWarning\s*\}\s*:\s*\{\s*\}\s*\)/,
    'el warning no está spread-guarded (rompería el camino feliz)'
  );
  // El tipo de la frontera HTTP lo declara opcional (aditivo, ningún consumidor rompe).
  const TYPES = read('src/types/generate-content.ts');
  assert.match(TYPES, /fabrication_warning\?\s*:/);
});

test('T-09 R-25 el warning cubre AMBOS tiers (no sólo `commitment`)', () => {
  // El warning se arma con `cf.signals` sin filtrar por tier: un `[PENDING]` residual
  // también avisa, aunque no se persista.
  assert.match(F118_BLOCK, /signals:\s*cf\.signals/);
  assert.doesNotMatch(
    F118_BLOCK,
    /tier\s*===\s*'commitment'/,
    'el warning quedó restringido a un solo tier'
  );
});

/* ================================================================================ */
/*  R-24 — constancia persistida SÓLO en el branch `generated_outputs`               */
/* ================================================================================ */

test('T-09 ⭐ R-24 `_fabrication_guard` aparece SÓLO en el branch de `generated_outputs`', () => {
  const hits = (ROUTE.match(/_fabrication_guard/g) || []).length;
  assert.equal(
    hits,
    1,
    'la clave de constancia aparece más de una vez en la ruta'
  );
  const idxKey = ROUTE.indexOf('_fabrication_guard');
  const idxOutputsBranch = ROUTE.indexOf(
    'const outputFields = extractGeneratedOutputFields'
  );
  const idxInsert = ROUTE.indexOf(".from('generated_outputs')");
  assert.ok(idxOutputsBranch > -1 && idxInsert > -1);
  assert.ok(
    idxOutputsBranch < idxKey && idxKey < idxInsert,
    'la constancia no está dentro del branch de generated_outputs, antes del insert'
  );
  // NO se cuela en el branch del tableMap (brief/buyer_persona/ofv).
  const tableMapBranch = ROUTE.slice(
    ROUTE.indexOf('if (tableMap[step]) {'),
    idxOutputsBranch
  );
  assert.equal(tableMapBranch.indexOf('_fabrication_guard'), -1);
});

test('T-09 ⭐ R-24 la constancia es ADITIVA, sólo para `commitment`, y va DESPUÉS de validation/grounding', () => {
  assert.match(
    ROUTE,
    /fabricationResidue\s*&&\s*fabricationResidue\.tier\s*===\s*'commitment'/,
    'la constancia no está restringida al tier commitment'
  );
  // Aditiva sobre el jsonb ya compuesto: spread de `groundedContent`, sin reemplazarlo.
  assert.match(ROUTE, /\.\.\.groundedContent,/);
  const idxValidation = ROUTE.indexOf(
    'const validatedContent = attachValidation'
  );
  const idxGrounded = ROUTE.indexOf(
    'const groundedContent = attachMethodGrounding'
  );
  const idxGuarded = ROUTE.indexOf('const guardedContent =');
  assert.ok(idxValidation < idxGrounded && idxGrounded < idxGuarded);
  assert.match(
    ROUTE,
    /content:\s*guardedContent/,
    'el insert no usa el content con constancia'
  );
});

test('T-09 R-24 la constancia NO toca `status` ni introduce DDL/migración', () => {
  const guardSlice = ROUTE.slice(
    ROUTE.indexOf('const guardedContent ='),
    ROUTE.indexOf(".from('generated_outputs')")
  );
  assert.doesNotMatch(guardSlice, /status:/, 'la constancia cambia el status');
  assert.doesNotMatch(
    ROUTE,
    /alter table|create table|create index|drop table/i
  );
});

/* ================================================================================ */
/*  R-28 — surfacing mínimo en la única UI que consume un step de contenido           */
/* ================================================================================ */

test('T-09 ⭐ R-28 `handleGeneratePost` surfacea el warning con `toast.warning` (patrón F-098)', () => {
  const handler = GBP_PAGE.slice(
    GBP_PAGE.indexOf('const handleGeneratePost'),
    GBP_PAGE.indexOf('const handleGenerateGbp')
  );
  assert.ok(handler.length > 0, 'handler localizado');
  assert.match(
    handler,
    /if\s*\(\s*result\.fabrication_warning\s*\)/,
    'el handler no lee el warning de la respuesta'
  );
  assert.match(
    handler,
    /toast\.warning\(\s*formatContentFabricationWarning\(/,
    'el warning no se surfacea con toast.warning + el formateador puro'
  );
  // Mismo patrón que F-098 usa en el MISMO archivo (no se inventó una superficie nueva).
  assert.match(GBP_PAGE, /toast\.warning\(\s*formatComplianceWarning\(/);
  assert.match(
    GBP_PAGE,
    /import\s*\{[\s\S]{0,160}?formatContentFabricationWarning[\s\S]{0,160}?\}\s*from\s*'@\/lib\/content\/non-fabrication'/
  );
});

/* ================================================================================ */
/*  ⭐ R-37 — los literales de los que DEPENDE el grounding siguen existiendo         */
/* ================================================================================ */

test('T-09 ⭐⭐ R-37 los literales fuente del grounding siguen vivos en el código', () => {
  // Si alguien renombra una de estas etiquetas, la rebanada promocional queda VACÍA y el
  // guard se queda SIN NADA CONTRA QUÉ COMPARAR. La inversión de R-01 hace que eso falle
  // del lado seguro (marcaría todo, no aprobaría todo), pero el ruido sería inmediato:
  // este test se pone rojo ANTES de que llegue a producción. Es el peor modo de fallo
  // posible el que se está cerrando acá.
  assert.match(
    ROUTE,
    /'\\n\\n## OFERTA DE VALOR \(APROBADA\)/,
    'route.ts: cambió la etiqueta del bloque OFV'
  );
  assert.match(
    OFFERS_METHOD_CONTEXT,
    /'\\nUrgencia: '/,
    'offers/method-context.ts: cambió el prefijo literal `Urgencia: ` (F-111)'
  );
  assert.match(
    OFFERS_METHOD_CONTEXT,
    /'\\nDecision Frame: '/,
    'offers/method-context.ts: cambió el prefijo literal `Decision Frame: ` (F-111)'
  );
  // …y el seam de F-118 extrae POR ESOS MISMOS prefijos (no re-implementa el reparto).
  const CORE = stripComments(read('src/lib/content/non-fabrication.ts'));
  assert.match(CORE, /'Urgencia: '/);
  assert.match(CORE, /'Decision Frame: '/);
  assert.doesNotMatch(
    CORE,
    /OFV_METHOD_FIELDS_BY_STEP|buildOfvMethodLines/,
    'el seam re-implementa el reparto de F-111 en vez de leer sus líneas'
  );
});
