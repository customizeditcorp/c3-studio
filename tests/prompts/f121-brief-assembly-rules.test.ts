/**
 * F-121 — T-10 — Reglas del prompt del Brief (edición **ADITIVA**, H-4)
 * (R-19, R-21, R-22, R-25).
 *
 * El prompt es el **backstop lado-modelo** del seam de código, en la secuencia probada
 * prompt→guard de F-104→F-105 y F-114→F-118. Ninguna de las dos mitades alcanza sola:
 * el **código** de la app fabricaba `GBP: no_gbp, Salud digital: nothing` (un prompt no
 * puede des-fabricar un string que la app le entrega ya hecho), y el **código** no cubre
 * el residuo estocástico (el modelo puede seguir usando `other` si aparece en
 * `structured_fields` de filas viejas).
 *
 * ⚠️ **H-4 — la edición es ADITIVA.** 6 asserts en 4 tests preexistentes fijan
 * literalmente la línea `OUTPUT:` y la estructura del contrato de F-116. Las reglas se
 * **añaden**; no se reescribe ninguna línea existente. Y **sin bump de
 * `meta.json.version`** (precedente F-112 DT-9 / F-114 DT-5).
 *
 * ⚠️ **`sync-prompts` NO se corre en esta tarea:** es acción de FRONTERA (escribe
 * `prompt_versions`) y vive gateada en el tramo LIVE, con autorización explícita del
 * operador (F-074, R-34). Este test es OFFLINE puro.
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
const PROMPT_REL = 'prompts/brief/system_prompt.md';
const META_REL = 'prompts/brief/meta.json';
const BRIEF = readFileSync(resolve(REPO, PROMPT_REL), 'utf8');

const desde = (rel: string): string =>
  execFileSync('git', ['show', `${BASE}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
const BASE_BRIEF = desde(PROMPT_REL);

/** La sección `REGLAS:` — desde su encabezado hasta la línea `OUTPUT:`. */
function reglas(src: string): string {
  const i = src.indexOf('REGLAS:');
  const j = src.indexOf('OUTPUT:', i);
  assert.ok(
    i >= 0 && j > i,
    'el prompt del brief perdió su sección REGLAS/OUTPUT'
  );
  return src.slice(i, j);
}
const REGLAS = reglas(BRIEF);

/* ================================================================== */
/*  ⭐⭐ H-4 — la edición es ADITIVA: nada se reescribió                */
/* ================================================================== */

test('T-10 ⭐⭐ H-4 el prompt sólo GANA líneas: cero líneas eliminadas respecto de `cb3302d`', () => {
  const antes = BASE_BRIEF.split('\n');
  const ahora = BRIEF.split('\n');
  const perdidas = antes.filter((l) => ahora.indexOf(l) < 0);
  assert.deepEqual(
    perdidas,
    [],
    'H-4: la edición del prompt es ADITIVA. Reescribir una línea existente rompe los 6 ' +
      'asserts de F-116 que fijan la estructura del contrato. Líneas perdidas: ' +
      perdidas.join(' | ')
  );
  assert.ok(
    ahora.length > antes.length,
    'la edición no agregó nada: sería un no-op'
  );
});

test('T-10 ⭐⭐ H-4 la línea `OUTPUT:` y el CONTRATO de 28 claves + `raw_text` quedan INTACTOS', () => {
  assert.match(
    BRIEF,
    /^OUTPUT: JSON con los 5 bloques \+ raw_text en markdown\.$/m,
    'la línea `OUTPUT:` preexistente se reescribió (F-116 T-11(a) R-27)'
  );
  // El contrato entero, byte a byte: del encabezado del contrato al final del archivo.
  const contrato = (src: string): string =>
    src.slice(src.indexOf('CONTRATO DE SALIDA — CLAVES EXACTAS DEL JSON:'));
  assert.equal(
    contrato(BRIEF),
    contrato(BASE_BRIEF),
    'R-04: las 28 claves + `raw_text` quedan intactas — mismos nombres, mismo orden, ' +
      'sin añadir, quitar ni renombrar ninguna. El defecto está en los VALORES.'
  );
  // Y las reglas nuevas viven ANTES del contrato (en `REGLAS:`), no dentro de él.
  assert.ok(
    BRIEF.indexOf('REGLAS:') <
      BRIEF.indexOf('CONTRATO DE SALIDA — CLAVES EXACTAS DEL JSON:')
  );
});

test('T-10 ⭐⭐ H-4 `meta.json` NO sube de versión (precedente F-112 DT-9 / F-114 DT-5)', () => {
  assert.equal(
    readFileSync(resolve(REPO, META_REL), 'utf8'),
    desde(META_REL),
    'F-121 no bumpea la versión del prompt del brief'
  );
  assert.match(readFileSync(resolve(REPO, META_REL), 'utf8'), /"version":\s*1/);
});

test('T-10 ⭐ la no-regresión de F-116 sigue en pie: MISIÓN, 5 bloques y regla de no-invención', () => {
  assert.ok(BRIEF.includes('MISIÓN: Construir un brief completo'));
  assert.ok(BRIEF.includes('ESTRUCTURA DEL BRIEF (5 BLOQUES)'));
  assert.match(
    BRIEF,
    /NO inventes datos\. Si falta información, marca como \[PENDIENTE\]/
  );
  for (const bloque of [
    'BLOQUE 1 — INFORMACIÓN DEL NEGOCIO',
    'BLOQUE 2 — SITUACIÓN ACTUAL',
    'BLOQUE 3 — CLIENTE IDEAL DEL NEGOCIO',
    'BLOQUE 4 — DIFERENCIADORES',
    'BLOQUE 5 — OBJETIVOS'
  ]) {
    assert.match(BRIEF, new RegExp(`^${bloque}$`, 'm'));
  }
});

/* ================================================================== */
/*  ⭐⭐ R-19 — los códigos NO son lenguaje (anti-no-op, R-32)          */
/* ================================================================== */

test('T-10 ⭐⭐ R-19 la regla de códigos ENUMERA los identificadores reales, no una fórmula genérica', () => {
  assert.match(
    REGLAS,
    /IDENTIFICADORES\s+y\s+CÓDIGOS[\s\S]{0,120}NO\s+son\s+lenguaje/i,
    'falta la regla de R-19'
  );
  // ⭐ ANTI-NO-OP (R-32): la regla tiene que nombrar los tokens REALES que fallaron.
  // Sustituirla por «escribe bien» / «usa lenguaje natural» la deja sin contenido
  // verificable — es el precedente literal de F-116 R-32.
  for (const token of [
    'other',
    'no_gbp',
    'nothing',
    'cleaning',
    'portable_toilet_rental_service'
  ]) {
    assert.ok(
      REGLAS.includes(token),
      `la regla no nombra el identificador real \`${token}\`: sin los tokens que ` +
        'fallaron, la regla es una formulación genérica sin contenido verificable (R-32)'
    );
  }
  // Y prohíbe la forma exacta del defecto observado.
  assert.match(REGLAS, /NUNCA\s+los\s+uses\s+como\s+sustantivo/i);
  assert.match(REGLAS, /nunca\s+"para other/i);
  assert.match(REGLAS, /nunca\s+"GBP: no_gbp"/i);
  // Y da la salida correcta: marcar el campo completo, no escribir el código.
  assert.match(REGLAS, /marca\s+el\s+campo\s+COMPLETO\s+como\s+\[PENDIENTE\]/i);
});

/* ================================================================== */
/*  ⭐⭐ R-21 — DÓNDE va el marcador (la regla que faltaba)             */
/* ================================================================== */

test('T-10 ⭐⭐ R-21 la regla dice DÓNDE va el marcador: RANURA COMPLETA, nunca un fragmento', () => {
  // El prompt ya decía "marca [PENDIENTE]"; lo que nunca dijo es DÓNDE.
  assert.ok(
    !/RANURA COMPLETA/i.test(BASE_BRIEF),
    'en `cb3302d` el prompt no decía dónde va el marcador — si esto falla, el ancla está mal'
  );
  assert.match(REGLAS, /RANURA\s+COMPLETA\s+de\s+un\s+campo/i);
  assert.match(
    REGLAS,
    /NUNCA\s+lo\s+incrustes\s+como\s+un\s+fragmento\s+dentro\s+de\s+una\s+oración/i
  );
  // Contraejemplo CONCRETO tomado del valor real de Clara V (`e1ad789c`), no una
  // paráfrasis: un ejemplo abstracto no le dice al modelo qué forma evitar.
  assert.match(REGLAS, /mal:.*Top 3 en Google Maps para \[PENDIENTE\]/i);
  assert.match(REGLAS, /bien:/i);
});

test('T-10 ⭐⭐ R-01 la regla NO prohíbe el marcador: preserva la degradación honesta', () => {
  // R-01 es intocable: un marcador en la ranura completa es LEGÍTIMO. Si la regla nueva
  // dijera "no uses [PENDIENTE]", F-121 estaría rompiendo F-104/F-106 desde el prompt.
  assert.match(
    REGLAS,
    /marca\s+\[PENDIENTE\]\s+lo\s+genuinamente\s+ausente/,
    'la regla de degradación honesta de F-104/F-106 desapareció del prompt'
  );
  assert.ok(
    !/no\s+uses\s+\[PENDIENTE\]|prohibido\s+\[PENDIENTE\]|evita\s+\[PENDIENTE\]/i.test(
      REGLAS
    ),
    'R-01: el marcador es degradación honesta LEGÍTIMA; la regla nueva sólo dice DÓNDE ' +
      'va, nunca que no se use'
  );
});

/* ================================================================== */
/*  ⭐ R-22 — el marcador dentro de `raw_text`                         */
/* ================================================================== */

test('T-10 ⭐ R-22 dentro de `raw_text` el marcador ocupa la LÍNEA ETIQUETADA completa', () => {
  assert.match(REGLAS, /raw_text[\s\S]{0,140}LÍNEA\s+ETIQUETADA\s+COMPLETA/i);
  assert.match(
    REGLAS,
    /tampoco\s+ahí\s+puede\s+aparecer\s+dentro\s+de\s+una\s+oración/i
  );
});

/* ================================================================== */
/*  ⭐ R-25 — `raw_text` con sus 5 bloques, no un volcado plano        */
/* ================================================================== */

test('T-10 ⭐ R-25 `raw_text` debe traer los 5 BLOQUES con sus TÍTULOS, y se prohíbe el volcado plano', () => {
  assert.match(REGLAS, /raw_text[\s\S]{0,160}5\s+BLOQUES\s+y\s+sus\s+TÍTULOS/i);
  assert.match(
    REGLAS,
    /no\s+un\s+volcado\s+plano\s+de\s+`?-\s*clave:\s*valor`?/i,
    'SCS y Clara V emitieron el volcado plano PESE a que el contrato ya lo declaraba ⇒ ' +
      'la regla tiene que ser exigible, no sólo enunciada (R-25)'
  );
});

/* ================================================================== */
/*  ⭐ Perímetro: sólo el prompt del brief, y sólo su sección REGLAS   */
/* ================================================================== */

test('T-10 ⭐ los OTROS prompts no se tocan (F-114/F-116 intactos)', () => {
  const tocados = execFileSync(
    'git',
    ['diff', '--name-only', '-M', BASE, '--', 'prompts/'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
    .split('\n')
    .filter(Boolean)
    .concat(
      execFileSync(
        'git',
        ['ls-files', '--others', '--exclude-standard', '--', 'prompts/'],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
      )
        .split('\n')
        .filter(Boolean)
    )
    .filter((p, i, a) => a.indexOf(p) === i)
    .sort();
  assert.deepEqual(
    tocados,
    [PROMPT_REL],
    'F-121 sólo edita el prompt del brief. Los 8 prompts de contenido y los de ' +
      'buyer/OFV son el control de que F-114/F-116 no se tocaron (R-34).'
  );
});

test('T-10 ⭐ `sync-prompts` NO se invoca desde ningún archivo de F-121', () => {
  // El tramo LIVE (`prompts:check`/`prompts:apply`) es acción de FRONTERA: escribe
  // `prompt_versions` y requiere autorización explícita del operador (F-074, R-34).
  const nuevos = execFileSync(
    'git',
    [
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      'src/',
      'tests/',
      'scripts/'
    ],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  )
    .split('\n')
    .filter(Boolean)
    .filter((p) => /\.(ts|tsx|mjs)$/.test(p))
    .filter((p) => !p.startsWith('tests/')); // los guards NOMBRAN lo prohibido para prohibirlo
  for (const rel of nuevos) {
    const src = readFileSync(resolve(REPO, rel), 'utf8');
    assert.ok(
      !/prompts:apply|prompts:check|sync-prompts/.test(src),
      `${rel} invoca \`sync-prompts\` — acción de frontera, gateada (F-074)`
    );
  }
});
