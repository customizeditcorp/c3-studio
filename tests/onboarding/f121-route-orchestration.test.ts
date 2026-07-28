/**
 * F-121 — T-09 — Orquestación en `route.ts`: reintento dirigido + warning transitorio
 * (R-20, R-23) — y las restricciones H-1/H-2/R-03 que la constriñen.
 *
 * Source-guards por inspección de fuente (patrón `f105`/`f118`): `readFileSync` +
 * asserts whitespace-tolerantes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BASE = 'cb3302d';
const ROUTE_REL = 'src/app/api/generate-content/route.ts';
const ROUTE = readFileSync(resolve(REPO, ROUTE_REL), 'utf8');

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** El tramo NUEVO de F-121: de su marcador al marcador de F-118. */
const F121_BLOCK = ROUTE.slice(
  ROUTE.indexOf('// --- F-121: guard'),
  ROUTE.indexOf('// --- F-118: guard')
);
const F121_CODE = stripComments(F121_BLOCK);

/** Los tramos ajenos, recortados EXACTAMENTE como los recortan sus propios tests. */
const F105_BLOCK = ROUTE.slice(
  ROUTE.indexOf('// --- F-105: guard'),
  ROUTE.indexOf('let savedRecord')
);
const F118_BLOCK = ROUTE.slice(
  ROUTE.indexOf('// --- F-118: guard'),
  ROUTE.indexOf('if (save) {')
);

const contar = (src: string, re: RegExp): number =>
  (src.match(re) ?? []).length;

/* ================================================================== */
/*  ⭐⭐ H-2 / R-03 — la UBICACIÓN, que es una restricción DURA         */
/* ================================================================== */

test('T-09 ⭐⭐ H-2 el bloque va DESPUÉS de `outputSteps` y ANTES de `if (save)`', () => {
  const iOutputSteps = ROUTE.indexOf('const outputSteps = [');
  const iF121 = ROUTE.indexOf('// --- F-121: guard');
  const iSave = ROUTE.indexOf('if (save) {');
  assert.ok(iOutputSteps > -1 && iF121 > -1 && iSave > -1);
  assert.ok(iOutputSteps < iF121, 'el bloque quedó antes de `outputSteps`');
  assert.ok(
    iF121 < iSave,
    'el guard corre ANTES del guardado (save:true Y save:false)'
  );
  assert.ok(F121_BLOCK.length > 0, 'tramo F-121 localizado');
});

test('T-09 ⭐⭐ R-03/H-2 el bloque de F-121 NO invade el tramo de F-105 (que asserta 1 re-call y 0 writes)', () => {
  // `f105-non-fabrication.test.ts:321` recorta entre `// --- F-105: guard` y
  // `let savedRecord` y asserta EXACTAMENTE 1 `create(` y CERO `.insert(`/`.update(`.
  assert.ok(
    !F105_BLOCK.includes('F-121'),
    'F-121 se metió en el tramo de F-105'
  );
  assert.equal(
    contar(stripComments(F105_BLOCK), /openai\.chat\.completions\.create\(/g),
    1,
    'el tramo de F-105 debe conservar EXACTAMENTE 1 re-call'
  );
  assert.equal(
    contar(stripComments(F105_BLOCK), /\.insert\(|\.update\(/g),
    0,
    'el tramo de F-105 debe conservar CERO writes'
  );
});

test('T-09 ⭐⭐ R-03 el bloque de F-121 NO invade el tramo de F-118 (que también asserta 1 re-call)', () => {
  // `f118-route-orchestration.test.ts:34` recorta de `// --- F-118: guard` a
  // `if (save) {`. Por eso F-121 se inserta ANTES de ese marcador: los tres tramos
  // quedan disjuntos y ningún guard preexistente se toca.
  assert.ok(!F118_BLOCK.includes('F-121: guard'));
  assert.equal(
    contar(stripComments(F118_BLOCK), /openai\.chat\.completions\.create\(/g),
    1,
    'el tramo de F-118 debe conservar EXACTAMENTE 1 re-call'
  );
  assert.ok(
    ROUTE.indexOf('// --- F-121: guard') < ROUTE.indexOf('// --- F-118: guard')
  );
});

test('T-09 ⭐ H-1 la rebanada de `f110-context-alignment` sigue intacta', () => {
  // `f110` recorta desde `## OFERTA DE VALOR (APROBADA)` hasta la PRIMERA aparición del
  // identificador del user message. Si F-121 lo nombrara antes, esa rebanada se vaciaría.
  const iOfv = ROUTE.indexOf('## OFERTA DE VALOR (APROBADA)');
  const iPrimera = ROUTE.indexOf('userMessageBase');
  assert.ok(
    iOfv > 0 && iPrimera > iOfv,
    'H-1: la rebanada de f110 quedaría vacía'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-20/DT-08 — acotado a `brief`, un solo re-call, sin loop      */
/* ================================================================== */

test('T-09 ⭐⭐ DT-08 el guard está GATEADO al step `brief` y a ningún otro', () => {
  assert.match(
    F121_CODE,
    /if\s*\(\s*step\s*===\s*'brief'\s*\)/,
    'extender el guard fuera de `brief` sin evidencia sería sobre-ingeniería (DT-08) ' +
      'y multiplicaría llamadas'
  );
  // Mutuamente excluyente con F-105 (`ofv`) y F-118 (los 8 steps de contenido) ⇒ la
  // cota POR REQUEST sigue siendo 3.
  assert.doesNotMatch(F121_CODE, /outputSteps\.includes/);
  assert.doesNotMatch(F121_CODE, /step\s*===\s*'ofv'/);
});

test('T-09 ⭐⭐ R-20 exactamente UN re-call, gateado por el defecto, sin loop ni backoff', () => {
  assert.equal(
    contar(F121_CODE, /openai\.chat\.completions\.create\(/g),
    1,
    'un solo re-call en el bloque F-121 (sin loop)'
  );
  assert.match(
    F121_CODE,
    /if\s*\(\s*!ag\.ok\s*\)/,
    'el retry se gatea por el defecto'
  );
  assert.doesNotMatch(F121_CODE, /\bwhile\s*\(/, 'sin while loop');
  assert.doesNotMatch(F121_CODE, /\bfor\s*\(/, 'sin for loop');
  assert.doesNotMatch(F121_CODE, /setTimeout|backoff/i, 'sin backoff');
});

test('T-09 ⭐ R-20 el re-call reusa los MISMOS params y la directiva va ANTES del cierre de idioma (F-081)', () => {
  assert.match(F121_CODE, /\.\.\.callParams/, 'el retry no reusa `callParams`');
  assert.match(
    F121_CODE,
    /userMessageBase\s*\+\s*'\\n\\n'\s*\+\s*directive\s*\+\s*languageDirective/,
    'F-081 debe seguir siendo el ÚLTIMO bloque del user message'
  );
  assert.match(F121_CODE, /buildAssemblyRetryDirective\(\s*ag\s*\)/);
});

/* ================================================================== */
/*  ⭐⭐ DT-07 — adopción SÓLO SI MEJORA; si no, se conserva el original */
/* ================================================================== */

test('T-09 ⭐⭐ DT-07 la adopción pasa por `assemblyImprovesStrictly`, no por "si parsea"', () => {
  assert.match(
    F121_CODE,
    /if\s*\(\s*assemblyImprovesStrictly\(\s*ag\s*,\s*retryAg\s*\)\s*\)/,
    'adoptar un retry que parsea pero sigue con el defecto sería una regresión'
  );
  // Y SÓLO dentro de esa rama se pisan `parsedContent`/`rawText`.
  const adopcion = F121_CODE.slice(
    F121_CODE.indexOf('assemblyImprovesStrictly(ag, retryAg)')
  );
  assert.match(adopcion, /parsedContent\s*=\s*retryResult\.content/);
  assert.match(adopcion, /rawText\s*=\s*retryResult\.rawText/);
  // Fuera de esa rama, ninguna otra asignación a `parsedContent` dentro del bloque.
  assert.equal(contar(F121_CODE, /parsedContent\s*=/g), 1);
});

/* ════════════════════════════════════════════════════════════════════ */
/*  ⭐⭐ R-20 — warning TRANSITORIO: nunca persistido, nunca bloqueante  */
/* ════════════════════════════════════════════════════════════════════ */

test('T-09 ⭐⭐ R-20 el warning NO bloquea: `success` sigue siendo `true` y el contenido se devuelve', () => {
  const CODE = stripComments(ROUTE);
  assert.match(CODE, /success:\s*true/);
  // El bloque no puede cortar la request.
  assert.doesNotMatch(
    F121_CODE,
    /return\s+NextResponse\.json|throw\s+new/,
    'R-20: el guard NUNCA bloquea — ni con un 4xx, ni lanzando'
  );
  assert.doesNotMatch(
    F121_CODE,
    /success:\s*false/,
    'detectar un defecto de ensamblado no puede fallar la generación'
  );
});

test('T-09 ⭐⭐ R-20 el warning NUNCA se persiste: cero writes en el bloque y fuera de `insertData`', () => {
  assert.doesNotMatch(
    F121_CODE,
    /\.insert\(|\.update\(|\.upsert\(|\.delete\(|from\(/,
    'el bloque no puede tocar la base'
  );
  const CODE = stripComments(ROUTE);
  // El warning viaja SÓLO en la respuesta HTTP, con spread-guard.
  assert.match(
    CODE,
    /\.\.\.\(assemblyWarning\s*\?\s*\{\s*assembly_warning:\s*assemblyWarning\s*\}\s*:\s*\{\}\)/,
    'el warning debe ser un campo opcional de la respuesta (no rompe consumidores)'
  );
  // Y no entra en el payload persistido ni en `content._*`.
  const iInsert = CODE.indexOf('const insertData');
  const iFin = CODE.indexOf('return NextResponse.json', iInsert);
  assert.ok(iInsert > 0 && iFin > iInsert);
  assert.ok(
    !CODE.slice(iInsert, iFin).includes('assemblyWarning'),
    'R-20: el warning es TRANSITORIO — no puede entrar en `insertData` ni en `content._*`'
  );
});

test('T-09 ⭐ R-20 camino feliz: sin defecto NO hay warning, NO hay re-call y NO hay delta', () => {
  // El warning sólo se arma si el guard sigue detectando DESPUÉS del retry.
  assert.match(
    F121_CODE,
    /if\s*\(\s*!ag\.ok\s*\)\s*\{[\s\S]*?assemblyWarning\s*=/
  );
  // `assemblyWarning` nace `undefined` y no se toca en el camino feliz.
  assert.match(ROUTE, /let\s+assemblyWarning:/);
  assert.equal(contar(F121_CODE, /assemblyWarning\s*=/g), 1);
});

/* ════════════════════════════════════════════════════════════════════ */
/*  ⭐ R-03 — F-105 y F-118 intactos, byte a byte contra `cb3302d`      */
/* ════════════════════════════════════════════════════════════════════ */

test('T-09 ⭐⭐ R-03 los módulos de F-105 y F-118 son BYTE-IDÉNTICOS a `cb3302d`', () => {
  for (const rel of [
    'src/lib/ofv/non-fabrication.ts',
    'src/lib/content/non-fabrication.ts'
  ]) {
    const base = execFileSync('git', ['show', `${BASE}:${rel}`], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });
    assert.equal(
      readFileSync(resolve(REPO, rel), 'utf8'),
      base,
      `${rel}: R-03 — F-121 no altera el comportamiento de F-105 ni el guard de F-118`
    );
  }
});

test('T-09 ⭐ R-03 los bloques de F-105 y F-118 en la ruta son BYTE-IDÉNTICOS a `cb3302d`', () => {
  const base = execFileSync('git', ['show', `${BASE}:${ROUTE_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  assert.equal(
    F105_BLOCK,
    base.slice(
      base.indexOf('// --- F-105: guard'),
      base.indexOf('let savedRecord')
    ),
    'el tramo de F-105 en la ruta cambió: R-03 prohíbe reubicarlo o alterarlo'
  );
  assert.equal(
    F118_BLOCK,
    base.slice(
      base.indexOf('// --- F-118: guard'),
      base.indexOf('if (save) {')
    ),
    'el tramo de F-118 en la ruta cambió'
  );
});
