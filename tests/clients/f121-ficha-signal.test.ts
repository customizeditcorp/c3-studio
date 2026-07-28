/**
 * F-121 — T-04 — La señal de la ficha deja de mentir (R-06, R-08, R-09).
 *
 * Source-guards sobre `src/app/(app)/clients/[id]/page.tsx`, con **ancla FIJA
 * `cb3302d`** (nunca `HEAD`, R-33): verdes en el working tree SIN commitear **y**
 * commiteados. Asserts whitespace-tolerantes (el hook husky/prettier reformatea
 * `.tsx` al commit; lección F-107).
 *
 * El test de NO-REGRESIÓN central (R-09) es el de F-119 R-29 / F-120 R-41: **la señal
 * es INFORMACIÓN, no control** ⇒ el conjunto de elementos gateados/`disabled` de la
 * ficha **no cambia**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** ⭐ Ancla FIJA (R-33). Contra `HEAD` esto volvería a verde al commitear (CL-107). */
const BASE = 'cb3302d';
const FICHA_REL = 'src/app/(app)/clients/[id]/page.tsx';
const FICHA = readFileSync(resolve(REPO, FICHA_REL), 'utf8');

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const FICHA_CODE = stripComments(FICHA);

const desde = (rel: string): string =>
  execFileSync('git', ['show', `${BASE}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
const BASE_FICHA = desde(FICHA_REL);
const BASE_CODE = stripComments(BASE_FICHA);

const contar = (src: string, re: RegExp): number =>
  (src.match(re) ?? []).length;

/**
 * Sentencias `.from('<tabla>')` recortadas hasta el fin de la consulta. Las consultas
 * viven dentro de un `Promise.all([...])`, así que **no** terminan en `;`: el corte es
 * el primer `.from(` siguiente o el cierre del array — recortar hasta el `;` se comería
 * el resto del `Promise.all` y volvería inútil cualquier assert de forma.
 */
function statements(src: string, table: string): string[] {
  const out: string[] = [];
  const needle = `.from('${table}')`;
  let i = src.indexOf(needle);
  while (i >= 0) {
    const siguiente = src.indexOf('.from(', i + needle.length);
    const cierre = src.indexOf(']);', i);
    const puntoYComa = src.indexOf(';', i);
    const fines = [siguiente, cierre, puntoYComa].filter((n) => n > i);
    assert.ok(fines.length > 0);
    out.push(src.slice(i, Math.min.apply(null, fines)));
    i = src.indexOf(needle, i + needle.length);
  }
  return out;
}

/* ================================================================== */
/*  ⭐⭐ R-09 — NO-REGRESIÓN: la señal es INFORMACIÓN, no control       */
/* ================================================================== */

test('T-04 ⭐⭐ R-09 el conjunto de elementos gateados/`disabled` de la ficha NO cambia', () => {
  // (1) El conteo no crece ni decrece: F-121 no añade ni quita un solo gate.
  assert.equal(
    contar(FICHA_CODE, /disabled/g),
    contar(BASE_CODE, /disabled/g),
    'F-121 alteró el número de gates de la ficha. La señal AGREGA INFORMACIÓN SIN ' +
      'QUITAR CAPACIDAD (R-09, mismo principio de F-119 R-20/R-24 y F-120 R-04/R-25): ' +
      'la desconexión la creó el sistema, no el operador — castigarlo con un gate es ' +
      'peor que el defecto (anti-sobre-corrección, AGENTS.md §8.2)'
  );
  // (2) Y NOMINALMENTE los mismos, no una aritmética que cuadra por azar: la lista de
  // expresiones `disabled={…}` sale de la fuente, no está hardcodeada acá.
  const gates = (src: string): string[] =>
    (src.match(/disabled=\{[^}]*\}/g) ?? []).sort();
  assert.deepEqual(
    gates(FICHA_CODE),
    gates(BASE_CODE),
    'cambió ALGÚN gate de la ficha, aunque el total cuadre'
  );
});

test('T-04 ⭐ R-09 ningún gate nuevo atado a la señal de insumos', () => {
  assert.doesNotMatch(
    FICHA_CODE,
    /disabled=\{[^}]*(briefInputs|briefInputsAvailable|hasDiagnostic|hasUsableDiagnosticInput)/,
    'R-09: la señal no puede habilitar, deshabilitar ni gatear nada que hoy no gatee'
  );
  // El gate del núcleo que vive en la ficha desde F-120 (el tab Brandboard) sigue intacto.
  assert.ok(
    FICHA_CODE.includes('disabled={!ofvApproved}'),
    'la ficha perdió el gate `!ofvApproved` del tab Brandboard (F-120 R-23/R-24)'
  );
});

test('T-04 R-09 la ficha sigue sin escribir: la señal no repara datos', () => {
  for (const s of statements(FICHA_CODE, 'diagnostics')) {
    assert.match(s, /\.select\(/);
    assert.doesNotMatch(s, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  }
  assert.doesNotMatch(
    FICHA,
    /alter\s+table|create\s+table|drop\s+table|delete\s+from/i
  );
});

/* ================================================================== */
/*  ⭐ R-06 — la señal se DERIVA del seam, no de la existencia de fila */
/* ================================================================== */

test('T-04 ⭐⭐ R-06 `hasDiagnostic: !!diagnosticData` DESAPARECIÓ: era existencia de fila disfrazada de progreso', () => {
  // El defecto literal, tal como vivía en `cb3302d`.
  assert.match(
    BASE_CODE,
    /hasDiagnostic:\s*!!diagnosticData/,
    'en `cb3302d` la señal era `!!diagnosticData` — si esto falla, el ancla está mal'
  );
  assert.doesNotMatch(
    FICHA_CODE,
    /hasDiagnostic:\s*!!diagnosticData/,
    'volvió `!!diagnosticData`: eso es EXISTENCIA DE FILA, y la etiqueta prometía que ' +
      'el generador tenía con qué. R & M QTB LLC tenía fila, la ficha decía ✓, y su ' +
      'Brief salió con 23/29 claves en [PENDIENTE]'
  );
});

test('T-04 ⭐⭐ R-06 la señal del Brief se calcula con `assessBriefInputs`, no con un criterio local', () => {
  assert.match(
    FICHA,
    /import\s*\{[\s\S]*?assessBriefInputs[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/brief-inputs'/
  );
  assert.equal(
    contar(FICHA_CODE, /assessBriefInputs\s*\(/g),
    1,
    'una sola invocación: un criterio, no dos'
  );
  // El veredicto viene DEL SEAM (coherencia por construcción, doctrina F-119/F-120):
  // la ficha no puede re-derivar el umbral por su cuenta.
  assert.match(
    FICHA_CODE,
    /briefInputsAvailable:\s*briefInputs\.allInputsPresent/,
    'la ficha volvió a tener criterio propio sobre qué cuenta como "insumo disponible"'
  );
});

test('T-04 ⭐ R-10 la ficha trae TODOS los candidatos de `diagnostics` (sin `limit(1)`) para poder elegir', () => {
  const ahora = statements(FICHA_CODE, 'diagnostics');
  assert.equal(ahora.length, 1, 'una sola lectura de `diagnostics`');
  assert.doesNotMatch(
    ahora[0],
    /\.limit\(\s*1\s*\)|\.maybeSingle\(\)/,
    'R & M tiene DOS filas contradictorias (`bc0a1027` vs `33872f29`): un `limit(1)` ' +
      'sin orden total deja el veredicto a merced del plan de la query'
  );
  assert.match(ahora[0], /\.eq\(\s*'client_id',\s*id\s*\)/);
});

/* ================================================================== */
/*  ⭐⭐ FRONTERA — la proyección NO amplía lo que el diagnóstico aporta */
/* ================================================================== */

test('T-04 ⭐⭐ FRONTERA la ficha lee SÓLO los 2 campos de prefill de siempre (+ id/created_at)', () => {
  const stmt = statements(FICHA_CODE, 'diagnostics')[0];
  const m = stmt.match(/\.select\(\s*'([^']*)'\s*\)/);
  assert.ok(m);
  const cols = m[1]
    .split(',')
    .map((c) => c.trim())
    .sort();
  assert.deepEqual(
    cols,
    ['created_at', 'digital_health', 'google_presence', 'id', 'team_size'],
    'la proyección creció más allá de los 2 campos de prefill. Leer ' +
      '`revenue_range`/`license_status`/`expectation`/`recommended_*` es la RAMA (2), ' +
      'elevada al operador (GATE-D1) y NO implementada: `diagnostics` sigue ' +
      'clasificado FRONTERA en `docs/c3-studio-core-downstream-boundary.md` §5.2'
  );
  // Y en particular, nada de precio ni de tier (RD-04 / CL-104 §5.3, parkeado).
  for (const vedado of [
    'recommended_price',
    'recommended_tier',
    'recommended_plan_name'
  ]) {
    assert.ok(!FICHA.includes(vedado), `la ficha referencia «${vedado}»`);
  }
});

/* ================================================================== */
/*  ⭐ R-08 — REGISTRADO vs INSUMOS: dos señales, legibles y distintas */
/* ================================================================== */

test('T-04 ⭐⭐ R-08 la ficha distingue «diagnóstico registrado» de «insumos del Brief disponibles»', () => {
  // La etiqueta que prometía lo que el pipeline no entrega, ya no existe.
  assert.ok(
    BASE_FICHA.includes('Diagnóstico completado'),
    'en `cb3302d` la etiqueta decía «Diagnóstico completado» — si esto falla, el ancla está mal'
  );
  // Se mira el CÓDIGO: el comentario que EXPLICA por qué la etiqueta se fue tiene
  // derecho a nombrarla — la que no puede volver es la etiqueta renderizada.
  assert.ok(
    !FICHA_CODE.includes('Diagnóstico completado'),
    '«completado» afirma una cosa (el diagnóstico está hecho ⇒ el Brief tiene con qué) ' +
      'y medía otra (existe una fila)'
  );
  assert.match(FICHA, /Diagnóstico registrado/);
  assert.match(FICHA, /Insumos del Brief disponibles/);
  // Y son DOS ítems distintos, atados a DOS banderas distintas.
  assert.match(FICHA_CODE, /done:\s*progress\.hasDiagnostic/);
  assert.match(FICHA_CODE, /done:\s*progress\.briefInputsAvailable/);
  assert.notEqual(
    'progress.hasDiagnostic',
    'progress.briefInputsAvailable',
    'las dos señales no pueden colapsar en la misma bandera'
  );
});

test('T-04 ⭐ R-08 el ítem de insumos dice el NÚMERO, no sólo un ✓/⬜', () => {
  // Un booleano suelto volvería a ser una promesa: 2/8 y 7/8 se verían igual.
  assert.match(
    FICHA_CODE,
    /briefInputs\.present\.length[\s\S]{0,120}briefInputs\.missing\.length/,
    'el ítem debe exponer presentes/total derivados del seam'
  );
});

test('T-04 ⭐ R-08 el DETALLE de la señal NO entra en `progress` (falsearía el contador del pie)', () => {
  // `Object.values(progress).filter(Boolean).length` cuenta booleanos: un número o un
  // string dentro de `progress` lo inflaría en silencio.
  assert.match(
    FICHA_CODE,
    /const\s+\[briefInputs,\s*setBriefInputs\]\s*=\s*useState/
  );
  const tipo = FICHA_CODE.slice(
    FICHA_CODE.indexOf('type ProgressState'),
    FICHA_CODE.indexOf('type ProgressState') + 600
  );
  const campos = Array.from(
    tipo.matchAll(/^\s*(\w+):\s*(\w+);/gm),
    (m) => m[2]
  );
  assert.ok(campos.length > 0);
  assert.deepEqual(
    Array.from(new Set(campos)),
    ['boolean'],
    '`ProgressState` sólo puede tener booleanos: el contador del pie los suma'
  );
  // El contador sigue siendo el mismo mecanismo (no se lo reescribió).
  assert.match(
    FICHA_CODE,
    /Object\.values\(progress\)\.filter\(Boolean\)\.length/
  );
});
