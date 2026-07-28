/**
 * F-121 — T-02 — `diagnostic-labels.ts` + prefill SIN códigos (R-17, R-18).
 *
 * Incluye el **TEST DE FRONTERA OBLIGATORIO** (CL-102-safe): la lectura de
 * `diagnostics` de la pantalla de onboarding sigue seleccionando **exactamente los
 * mismos campos** que antes de F-121 ⇒ **no se amplía** lo que el diagnóstico aporta.
 * Cablear el diagnóstico al generador es la **rama (2)**, elevada al operador
 * (GATE-D1) y **NO implementada**; `docs/c3-studio-core-downstream-boundary.md` §5.2
 * mantiene `diagnostics` en **FRONTERA**.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  toGooglePresenceLabel,
  toDigitalHealthLabel,
  toTeamSizeLabel,
  buildDigitalPresenceSentence
} from '../../src/lib/onboarding/diagnostic-labels.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** ⭐ Ancla FIJA (R-33). Nunca `HEAD`: así el guard es verde SIN commitear Y commiteado. */
const BASE = 'cb3302d';
const PAGE_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const PAGE = readFileSync(resolve(REPO, PAGE_REL), 'utf8');

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const PAGE_CODE = stripComments(PAGE);

/** Sentencias `.from('<tabla>')` recortadas hasta el `;` que las termina. */
function statements(src: string, table: string): string[] {
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

/** Columnas del `.select('...')` de una sentencia (tolerante a saltos de línea). */
function selectColumns(stmt: string): string[] {
  const m = stmt.match(/\.select\(\s*'([^']*)'\s*\)/);
  assert.ok(m, 'la consulta debe llevar una proyección explícita');
  return m[1]
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

const baseSrc = (rel: string): string =>
  execFileSync('git', ['show', `${BASE}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });

/* ================================================================== */
/*  ⭐⭐ TEST DE FRONTERA (CL-102 / CL-104 §5.2) — OBLIGATORIO         */
/* ================================================================== */

test('T-02 ⭐⭐ FRONTERA la lectura de `diagnostics` selecciona EXACTAMENTE los mismos campos que en `cb3302d`', () => {
  const ahora = statements(PAGE, 'diagnostics');
  const antes = statements(baseSrc(PAGE_REL), 'diagnostics');
  assert.equal(
    ahora.length,
    1,
    'una sola lectura de `diagnostics` en la pantalla'
  );
  assert.equal(antes.length, 1);
  assert.deepEqual(
    selectColumns(ahora[0]).slice().sort(),
    selectColumns(antes[0]).slice().sort(),
    'F-121 NO puede ampliar lo que el diagnóstico aporta: eso es la rama (2), elevada ' +
      'al operador (GATE-D1) y NO implementada. `diagnostics` sigue clasificado ' +
      'FRONTERA en `docs/c3-studio-core-downstream-boundary.md` §5.2 (CL-104).'
  );
  // Y sigue siendo una lectura: ni escribe, ni borra.
  assert.doesNotMatch(
    ahora[0],
    /\.insert\(|\.update\(|\.upsert\(|\.delete\(/,
    '`diagnostics` es de SOLO LECTURA para esta pantalla'
  );
});

test('T-02 ⭐⭐ FRONTERA el diagnóstico sigue aportando SÓLO los 2 campos de prefill de siempre', () => {
  // El bloque `if (d) { … }` del prefill: los ÚNICOS campos del diagnóstico que
  // pueblan `briefFields` son `team_size` y `google_presence`+`digital_health`.
  const usados = Array.from(
    PAGE_CODE.matchAll(/\(d as DiagnosticData\)\.(\w+)/g),
    (m) => m[1]
  );
  assert.deepEqual(
    Array.from(new Set(usados)).sort(),
    ['digital_health', 'google_presence', 'team_size'],
    'aparecieron campos NUEVOS del diagnóstico en el prefill ⇒ eso cruza CL-102. ' +
      'F-121 cambia la FORMA de los mismos 2 campos, nunca su CONJUNTO.'
  );
  // Y el mismo conjunto que en el ancla: comparación en los DOS sentidos.
  const antes = Array.from(
    stripComments(baseSrc(PAGE_REL)).matchAll(
      /\(d as DiagnosticData\)\.(\w+)/g
    ),
    (m) => m[1]
  );
  assert.deepEqual(
    Array.from(new Set(usados)).sort(),
    Array.from(new Set(antes)).sort()
  );
});

test('T-02 ⭐⭐ FRONTERA `route.ts` NO lee `diagnostics` (la rama (2) NO se implementó)', () => {
  const ROUTE = readFileSync(
    resolve(REPO, 'src/app/api/generate-content/route.ts'),
    'utf8'
  );
  assert.doesNotMatch(
    stripComments(ROUTE),
    /from\(\s*'diagnostics'\s*\)|diagnosticData|recommended_tier|recommended_price/,
    'cablear `diagnostics` al contexto del step `brief` es GATE-D1: PENDIENTE. ' +
      'Y `recommended_price`/`recommended_tier` están vedados (RD-04 / CL-104 §5.3).'
  );
});

/* ================================================================== */
/*  R-18 — los códigos salen en LENGUAJE, con los valores REALES      */
/* ================================================================== */

test('T-02 ⭐ R-18 `GBP: no_gbp, Salud digital: nothing` (SCS `be43470f`, real) ya NO se puede ensamblar', () => {
  // El string exacto que se persistió verbatim en producción.
  const antes = 'GBP: no_gbp, Salud digital: nothing';
  const ahora = buildDigitalPresenceSentence('no_gbp', 'nothing');
  assert.notEqual(ahora, antes);
  for (const codigo of ['no_gbp', 'nothing', 'GBP:', 'Salud digital:']) {
    assert.ok(
      !ahora.includes(codigo),
      `la frase sigue conteniendo el token \`${codigo}\``
    );
  }
  assert.equal(
    ahora,
    'No tiene Google Business Profile; no tiene nada digital.'
  );
});

test('T-02 ⭐ R-18 `GBP: ranking_no_calls, Salud: nothing` (Clara V `e1ad789c`, real) sale en lenguaje', () => {
  const ahora = buildDigitalPresenceSentence('ranking_no_calls', 'nothing');
  for (const codigo of ['ranking_no_calls', 'nothing']) {
    assert.ok(!ahora.includes(codigo));
  }
  assert.match(ahora, /no genera llamadas/);
});

test('T-02 R-18 las 3 tablas cubren su vocabulario cerrado completo', () => {
  const gp: Record<string, RegExp> = {
    no_gbp: /No tiene Google Business Profile/,
    has_gbp_not_ranking: /no aparece en búsquedas/,
    ranking_no_calls: /no genera llamadas/,
    generating_leads: /genera leads/
  };
  for (const [k, re] of Object.entries(gp)) {
    const out = toGooglePresenceLabel(k);
    assert.ok(out !== null && re.test(out), `google_presence \`${k}\``);
    assert.ok(!out!.includes(k), `\`${k}\` viajó crudo`);
  }
  const dh = ['nothing', 'have_access', 'lost_access', 'inconsistent'];
  for (const k of dh) {
    const out = toDigitalHealthLabel(k);
    assert.ok(out !== null && !out.includes(k), `digital_health \`${k}\``);
  }
  const ts: Record<string, string> = {
    solo: 'Solo el dueño (solopreneur)',
    '2_5': '2-5 personas',
    '6_plus': '6 o más personas'
  };
  for (const [k, v] of Object.entries(ts)) {
    assert.equal(toTeamSizeLabel(k), v, `team_size \`${k}\``);
  }
});

test('T-02 R-18 degradación honesta: desconocido/ausente ⇒ ausencia, NUNCA el código ni `N/A`', () => {
  for (const f of [
    toGooglePresenceLabel,
    toDigitalHealthLabel,
    toTeamSizeLabel
  ]) {
    assert.equal(f(null), null);
    assert.equal(f(undefined), null);
    assert.equal(f(''), null);
    assert.equal(f('un_codigo_que_no_existe'), null);
  }
  assert.equal(buildDigitalPresenceSentence(null, null), '');
  assert.equal(buildDigitalPresenceSentence('', ''), '');
  assert.equal(buildDigitalPresenceSentence('zzz', 'yyy'), '');
  // El viejo `N/A` desapareció: era un valor de relleno dentro de una frase.
  assert.ok(!buildDigitalPresenceSentence('no_gbp', null).includes('N/A'));
  assert.equal(
    buildDigitalPresenceSentence('no_gbp', null),
    'No tiene Google Business Profile.'
  );
  assert.equal(
    buildDigitalPresenceSentence(null, 'lost_access'),
    'Perdió el acceso a sus cuentas.'
  );
});

/* ================================================================== */
/*  R-17 — el prefill de industria copia la ETIQUETA, no el código     */
/* ================================================================== */

test('T-02 ⭐ R-17 los DOS call-sites del prefill de industria pasan por `toIndustryLabel`', () => {
  assert.match(
    PAGE,
    /import\s*\{[\s\S]*?toIndustryLabel[\s\S]*?\}\s*from\s*'@\/lib\/clients\/industry-label'/
  );
  assert.equal(
    (
      PAGE_CODE.match(/toIndustryLabel\(\s*c\.industry\s+as\s+string\s*\)/g) ??
      []
    ).length,
    2,
    'las 2 ramas del prefill (con brief previo y sin brief) deben normalizar'
  );
  // Y ya no queda ninguna copia CRUDA de `c.industry` hacia los campos manuales.
  assert.doesNotMatch(
    PAGE_CODE,
    /industry\s*[:=]\s*\(?c\.industry\s+as\s+string\)?\s*\|\|/,
    'quedó una copia cruda de `c.industry`: de ahí salió la clave `industry` de las ' +
      '3 filas de producción (`other`, `portable_toilet_rental_service`)'
  );
});

test('T-02 ⭐ R-18 el ensamblado de códigos dentro de una frase DESAPARECIÓ de la pantalla', () => {
  // Los dos templates literales que producían el defecto, uno por rama.
  assert.doesNotMatch(
    PAGE_CODE,
    /GBP:\s*\$\{/,
    'volvió el ensamblado `GBP: ${codigo}` — el punto exacto donde la app FABRICABA ' +
      'prosa con códigos (design.md §1, evidencia 4)'
  );
  assert.doesNotMatch(PAGE_CODE, /Salud(\s+digital)?:\s*\$\{/);
  assert.equal(
    (PAGE_CODE.match(/buildDigitalPresenceSentence\(/g) ?? []).length,
    2,
    'las 2 ramas del prefill usan el seam'
  );
  assert.equal((PAGE_CODE.match(/toTeamSizeLabel\(/g) ?? []).length, 2);
});

/* ================================================================== */
/*  Pureza                                                             */
/* ================================================================== */

test('T-02 `diagnostic-labels.ts` es un seam PURO: sin I/O, sin React, sin Supabase', () => {
  const CODE = stripComments(
    readFileSync(
      resolve(REPO, 'src/lib/onboarding/diagnostic-labels.ts'),
      'utf8'
    )
  );
  for (const prohibido of ['supabase', 'react', 'fetch(', 'import ']) {
    assert.ok(!CODE.includes(prohibido), `contiene «${prohibido}»`);
  }
});
