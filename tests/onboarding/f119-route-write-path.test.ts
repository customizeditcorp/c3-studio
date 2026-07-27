/**
 * F-119 — T-06 — Source-guards del write-path de `generate-content/route.ts`
 * (R-07, R-08, R-09, R-16, R-40).
 *
 * Inspección de fuente (`readFileSync` + asserts **whitespace-tolerantes**: `\s*` entre
 * tokens, nunca match de línea literal — el hook husky/prettier reformatea `.ts/.tsx` al
 * commit; lección F-107). El cambio conductual de (a) vive ENTERO en este archivo: es el
 * único call-site que producía empates (G-2).
 *
 * **Nota de modalidad (`docs/verification.md §6`):** un source-guard prueba claims **sobre la
 * fuente**. Que la fila nueva nazca en `v2` **en producción** es una claim CONDUCTUAL sobre el
 * sistema desplegado — es `[LIVE §6.1]` (R-31, T-18), gateada y NO ejecutada en este tramo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const ROUTE_REL = 'src/app/api/generate-content/route.ts';
const ROUTE = readFileSync(resolve(REPO, ROUTE_REL), 'utf8');

/** La fuente SIN comentarios: los guards de "esta fuente no dice X" miran el CÓDIGO. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ROUTE_CODE = stripComments(ROUTE);

/** Argumento de una llamada `<needle>(` recortado con conteo de paréntesis balanceado. */
function callArgs(src: string, needle: string, from = 0): string[] {
  const out: string[] = [];
  let i = src.indexOf(needle, from);
  while (i >= 0) {
    let depth = 0;
    let j = i + needle.length - 1; // apunta al `(`
    for (; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(i + needle.length, j));
    i = src.indexOf(needle, j);
  }
  return out;
}

/** El literal de objeto asignado a `const insertData` (payload compartido de las 2 ramas). */
function insertDataLiteral(src: string): string {
  const start = src.indexOf('const insertData');
  assert.ok(start > 0, 'no se encontró `const insertData`');
  const open = src.indexOf('{', start);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(open, i + 1);
}

/**
 * El path COMPARTIDO del `tableMap` (`briefs`/`buyer_personas`/`offers`): de
 * `const table = tableMap[step];` hasta el `savedRecord = data;` que lo cierra. Es el alcance
 * exacto de (a): `generated_outputs` NO es una de las 3 tablas del núcleo y queda fuera.
 */
function tableMapSection(src: string): string {
  const a = src.indexOf('const table = tableMap[step];');
  assert.ok(a > 0, 'no se encontró el path compartido del `tableMap`');
  const b = src.indexOf('savedRecord = data;', a);
  assert.ok(b > a);
  return src.slice(a, b);
}

/** El tramo de escritura: de `const mode = resolveWriteMode(` hasta `if (error) {`. */
function writeSection(src: string): string {
  const a = src.indexOf('const mode = resolveWriteMode(');
  assert.ok(a > 0, 'no se encontró `const mode = resolveWriteMode(`');
  const b = src.indexOf('if (error) {', a);
  assert.ok(b > a, 'no se encontró el `if (error) {` que cierra el tramo');
  return src.slice(a, b);
}

/** Sentencias `.from('<tabla>')` (literal) recortadas hasta el `;` que las termina. */
function literalFromStatements(src: string, table: string): string[] {
  const out: string[] = [];
  const needle = `.from('${table}')`;
  let i = src.indexOf(needle);
  while (i >= 0) {
    const end = src.indexOf(';', i);
    assert.ok(end > i);
    out.push(src.slice(i, end + 1));
    i = src.indexOf(needle, end);
  }
  return out;
}

/* ================================================================== */
/*  ⭐ R-07 — el payload del UPDATE NO lleva `version`                  */
/* ================================================================== */

/**
 * El defecto latente que F-119 **debe** cerrar (G-3 / DT-04). El comentario original decía
 * *"regenerar = UPDATE del draft vivo (conserva `id`/`version`)"* y **el código lo desmentía**:
 * enviaba `insertData`, que llevaba `version: 1` adentro. Hoy es invisible porque todo vale 1;
 * **con F-119 puesto, un draft nacido en `v5` y regenerado volvería a `v1`** ⇒ la feature
 * crearía el empate que viene a cortar, y en el camino más frecuente (regenerar).
 */
test('T-06 ⭐ R-07 el literal de `insertData` NO tiene la clave `version` (es el payload del UPDATE)', () => {
  const literal = insertDataLiteral(ROUTE_CODE);
  assert.doesNotMatch(
    literal,
    /(^|[{,\s])version\s*:/,
    'REGRESIÓN DE R-07: `insertData` volvió a llevar `version` y es EXACTAMENTE el objeto ' +
      "que la rama `mode === 'update'` envía a `.update()` ⇒ pisaría la versión de la " +
      'fila viva y recrearía el empate que F-119 corta.'
  );
  // Y conserva el resto del payload (no se vació de contenido para pasar el assert).
  assert.match(literal, /\bclient_id\b/);
  assert.match(literal, /prompt_version_id\s*:\s*prompt\.id/);
  assert.match(literal, /content\s*:\s*parsedContent/);
  assert.match(literal, /status\s*:\s*'draft'/);
});

test('T-06 ⭐ R-07 la rama `update` envía `insertData` tal cual, sin envolverlo con `version`', () => {
  const tramo = writeSection(ROUTE_CODE);
  assert.match(tramo, /mode\.mode\s*===\s*'update'/);
  const updates = callArgs(tramo, '.update(');
  assert.equal(
    updates.length,
    1,
    'debe haber exactamente 1 `.update(` en el tramo'
  );
  assert.match(
    updates[0],
    /^\s*insertData\s*$/,
    'el payload del UPDATE debe ser el identificador `insertData` pelado: envolverlo en un ' +
      'objeto literal permitiría colar `version` de vuelta'
  );
  assert.doesNotMatch(updates[0], /version/);
  assert.match(
    tramo,
    /\.update\(\s*insertData\s*\)\s*\.eq\(\s*'id',\s*mode\.id\s*\)/
  );
});

/**
 * ⭐ El corazón de R-07. `insertData` es el payload COMPARTIDO por las dos ramas, así que la
 * única forma de que el `UPDATE` no lleve `version` es que la clave **se añada exclusivamente
 * dentro de la rama `insert`**. Este guard fija exactamente eso: hay **una sola** asignación
 * de `insertData.version` en todo el archivo, y cae **dentro** del `if (mode.mode ===
 * 'insert')`. Moverla afuera —que es la regresión real— pone rojo acá.
 */
test("T-06 ⭐ R-07 la ÚNICA asignación de `insertData.version` vive DENTRO de `if (mode.mode === 'insert')`", () => {
  const asignaciones = ROUTE_CODE.match(/insertData\s*\.\s*version\s*=/g) ?? [];
  assert.equal(
    asignaciones.length,
    1,
    'debe existir exactamente 1 asignación de `insertData.version` (la de la rama insert)'
  );
  const tramo = writeSection(ROUTE_CODE);
  const ini = tramo.search(/if\s*\(\s*mode\.mode\s*===\s*'insert'\s*\)\s*\{/);
  assert.ok(ini >= 0, "no se encontró la rama `if (mode.mode === 'insert')`");
  // Fin de la rama: el `}` que balancea su `{`.
  let depth = 0;
  let fin = tramo.indexOf('{', ini);
  for (let i = fin; i < tramo.length; i++) {
    if (tramo[i] === '{') depth++;
    else if (tramo[i] === '}') {
      depth--;
      if (depth === 0) {
        fin = i;
        break;
      }
    }
  }
  const rama = tramo.slice(ini, fin + 1);
  assert.match(
    rama,
    /insertData\s*\.\s*version\s*=\s*nextVersion\s*\(/,
    'la asignación de `version` debe estar DENTRO de la rama insert: fuera de ella, el ' +
      '`.update(insertData)` volvería a pisar la versión de la fila viva (G-3 / DT-04)'
  );
  // Y ninguna otra vía cuela la clave en el payload compartido.
  assert.doesNotMatch(ROUTE_CODE, /insertData\s*\[\s*'version'\s*\]\s*=/);
  assert.doesNotMatch(
    ROUTE_CODE,
    /Object\.assign\(\s*insertData\s*,\s*\{[^}]*version\s*:/
  );
});

test('T-06 R-07 el comentario del tramo ya NO afirma una garantía que el código no daba (DT-04)', () => {
  // El comentario viejo decía literalmente `(conserva \`id\`/\`version\`)` mientras el código
  // pisaba la versión con 1. Un comentario que sobrevive describiendo un mundo que el código
  // no cumple es la misma familia que la lección de F-118 H-5.
  assert.doesNotMatch(
    ROUTE,
    /conserva\s*`id`\/`version`\)/,
    'el comentario mentiroso de DT-04 sigue en su forma original'
  );
  assert.match(ROUTE, /F-119\s*R-07/);
});

/* ================================================================== */
/*  ⭐ R-08 — la `version` del INSERT sale del seam                     */
/* ================================================================== */

test('T-06 ⭐ R-08 desapareció el literal `version: 1` del write-path del `tableMap`', () => {
  assert.doesNotMatch(
    tableMapSection(ROUTE_CODE),
    /version\s*:\s*1\b/,
    'el literal `version: 1` volvió al path compartido del `tableMap`: era la ÚNICA ' +
      'fuente real de empates en las 3 tablas del núcleo (G-2)'
  );
});

/**
 * **Límite de alcance declarado, no silenciado.** `generated_outputs` conserva su
 * `version: 1` **a propósito**: no es una de las 3 tablas del núcleo (`briefs`,
 * `buyer_personas`, `offers` — el `tableMap`), ningún R de F-119 la cubre, no tiene
 * lector de versión (F-089 R-07 eliminó el único read que existía) y no participa del
 * consumo canónico del generador. Este assert existe para que el límite quede **escrito y
 * verificable**, en vez de leerse como un olvido.
 */
test('T-06 R-08 (límite declarado) `generated_outputs` NO entra en el alcance de F-119', () => {
  const outputs = ROUTE_CODE.slice(
    ROUTE_CODE.indexOf(".from('generated_outputs')")
  );
  assert.match(outputs, /version\s*:\s*1\b/);
  assert.doesNotMatch(outputs, /nextVersion\s*\(/);
});

test('T-06 ⭐ R-08 la `version` del INSERT se deriva del seam `nextVersion`', () => {
  assert.match(
    ROUTE,
    /import\s*\{[\s\S]*?nextVersion[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/next-version'/
  );
  assert.match(ROUTE_CODE, /nextVersion\s*\(/);
  const tramo = writeSection(ROUTE_CODE);
  assert.match(
    tramo,
    /insertData\s*\.\s*version\s*=\s*nextVersion\s*\(/,
    'la versión del insert debe salir del seam, no de un literal ni de un cálculo ad-hoc'
  );
  const inserts = callArgs(tramo, '.insert(');
  assert.equal(inserts.length, 1);
  assert.match(
    inserts[0],
    /^\s*insertData\s*$/,
    'el INSERT sigue enviando `insertData` — con la `version` ya añadida en su rama'
  );
});

test('T-06 R-08 el seam se alimenta de las `version` existentes del `client_id` (todos los status)', () => {
  const tramo = writeSection(ROUTE_CODE);
  assert.match(
    tramo,
    /\.from\(\s*table\s*\)\s*\.select\(\s*'version'\s*\)\s*\.eq\(\s*'client_id',\s*client_id\s*\)/
  );
  // R-05: la consulta del seam NO filtra por `status` — particionar reintroduce el empate,
  // porque aprobar es un flip in-place que conserva la versión.
  const seam = tramo.slice(
    tramo.indexOf('const { data: versionRows }'),
    tramo.indexOf('insertData.version = nextVersion')
  );
  assert.doesNotMatch(
    seam,
    /\.eq\(\s*'status'/,
    'R-05: el máximo se toma sobre TODOS los `status`; particionar por status ' +
      'reintroduce el empate por la puerta de atrás'
  );
});

/* ================================================================== */
/*  R-09 — ninguna sentencia nueva `.from('<literal>')`                */
/* ================================================================== */

/**
 * `f113-source-guards` T-10 cuenta las sentencias `.from('<tabla>')` y exige **exactamente 1
 * fallback** por tabla. Cualquier consulta nueva emitida por literal rompería ese conteo ⇒
 * la del seam se emite por `.from(table)`, la VARIABLE del `tableMap`. El ancla de la
 * comparación es un **commit FIJO** (`2c072b6`, `main` antes de F-119), no `HEAD`: lección
 * F-118 H-5 — un guard que sólo puede estar verde después del commit está mal anclado.
 */
test("T-06 ⭐ R-09 CERO sentencias `.from('<literal>')` nuevas respecto de `2c072b6`", () => {
  const base = execFileSync('git', ['show', `2c072b6:${ROUTE_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  for (const table of ['briefs', 'buyer_personas', 'offers']) {
    assert.equal(
      literalFromStatements(ROUTE, table).length,
      literalFromStatements(base, table).length,
      `cambió el número de sentencias \`.from('${table}')\`: la consulta del seam debe ` +
        'emitirse por `.from(table)` o el conteo de `f113-source-guards` T-10 se rompe'
    );
  }
});

test('T-06 R-09 el conteo de `f113` T-10 no se movió: 2 `approved` + 1 fallback por tabla', () => {
  const esApproved = (s: string): boolean =>
    /\.eq\(\s*'status',\s*'approved'\s*\)/.test(s);
  for (const table of ['briefs', 'buyer_personas']) {
    const stmts = literalFromStatements(ROUTE, table);
    assert.equal(stmts.filter(esApproved).length, 2);
    assert.equal(stmts.filter((s) => !esApproved(s)).length, 1);
  }
});

/* ================================================================== */
/*  R-16 — `resolveWriteMode` y su `latest` con la MISMA semántica     */
/* ================================================================== */

test('T-06 ⭐ R-16 `resolveWriteMode` sigue cableado y su `latest` conserva la consulta exacta', () => {
  assert.match(ROUTE_CODE, /resolveWriteMode\s*\(/);
  assert.match(
    ROUTE_CODE,
    /\.from\(\s*table\s*\)\s*\.select\(\s*'id, status'\s*\)\s*\.eq\(\s*'client_id',\s*client_id\s*\)\s*\.order\(\s*'created_at',\s*\{\s*ascending:\s*false\s*\}\s*\)\s*\.limit\(\s*1\s*\)\s*\.maybeSingle\(\)/,
    'la entrada de `resolveWriteMode` debe seguir siendo la fila más reciente por ' +
      '`created_at` del `client_id`, CUALQUIER status (F-097 R-06/R-07/R-08)'
  );
  assert.match(
    ROUTE_CODE,
    /const\s+mode\s*=\s*resolveWriteMode\s*\(\s*latest\s+as/
  );
});

test('T-06 R-16 la decisión update-vs-insert sigue siendo la de `resolveWriteMode`, no una nueva', () => {
  const tramo = writeSection(ROUTE_CODE);
  // La `version` NO participa de la decisión: sólo del payload del insert.
  const decision = tramo.slice(0, tramo.indexOf('const { data, error }'));
  assert.match(decision, /if\s*\(\s*mode\.mode\s*===\s*'insert'\s*\)/);
  assert.doesNotMatch(
    tramo,
    /resolveWriteMode\s*\([^)]*version/,
    '`resolveWriteMode` no debe recibir la versión: su semántica queda intacta'
  );
});

/* ================================================================== */
/*  R-13/R-43 — el tramo no repara, no renumera y no borra             */
/* ================================================================== */

test('T-06 R-13/R-43 el write-path no introduce DDL, `delete` ni renumeración de filas', () => {
  const tramo = writeSection(ROUTE);
  assert.doesNotMatch(tramo, /\.delete\(\s*\)/);
  assert.doesNotMatch(
    ROUTE,
    /alter\s+table|create\s+table|create\s+index|drop\s+table|delete\s+from/i
  );
  // Ninguna escritura masiva: el `.update(` del tramo va con `.eq('id', mode.id)`.
  assert.match(
    tramo,
    /\.update\(\s*insertData\s*\)\s*\.eq\(\s*'id',\s*mode\.id\s*\)/
  );
});
