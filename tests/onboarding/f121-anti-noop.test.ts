/**
 * F-121 — T-12 — **Anti-no-op: fixtures REALES + set de mutación**
 * (R-30, R-31, R-32).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * R-30 — TODOS los fixtures salen de VALORES OBSERVADOS, citados con su `id` de fila
 * ─────────────────────────────────────────────────────────────────────────────────
 * `VALORES_OBSERVADOS` es la **constante única** de la que salen los fixtures de este
 * archivo. Cada entrada trae el `id` de la fila de la que fue copiada verbatim, leída por
 * `SELECT` **read-only** sobre `uxczbwtfcsjsrmrikwoh` el 2026-07-27. Cero paráfrasis:
 * una paráfrasis es un fixture inventado con aspecto de real.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * R-31/R-32 — EL SET DE MUTACIÓN, declarado acá y EJECUTADO en el tramo de T-12
 * ─────────────────────────────────────────────────────────────────────────────────
 * Un guard que no se rompe cuando el arreglo se revierte es un no-op con los tests en
 * verde (lección `feedback_guards_measure_index_not_world`). Las 5 mutaciones y el test
 * que cada una debe poner en ROJO:
 *
 *   | # | Mutación                                                    | Test que debe caer |
 *   |---|-------------------------------------------------------------|--------------------|
 *   | m1| `toIndustryLabel` devuelve el valor CRUDO                    | `f121-industry-label` R-15/R-16 |
 *   | m2| la regla (a) del prompt → *"escribe bien"*                   | `f121-brief-assembly-rules` R-19 |
 *   | m3| `detectEmbeddedPlaceholder` nunca dispara (`return false`)   | `f121-embedded-placeholder` R-23 |
 *   | m4| `detectTestResidue` siempre devuelve vacío                   | `f121-test-residue` R-27 |
 *   | m5| la señal derivada → `!!diagnosticData`                       | `f121-ficha-signal` R-06 |
 *
 * Este archivo aporta, además, el **contraejemplo en memoria** de cada mutación: aplica
 * la mutación al TEXTO leído de disco (sin tocar ningún archivo) y comprueba que el
 * criterio del guard correspondiente la detecta. Así el set de mutación queda
 * **verificable en cada corrida**, no sólo ejecutado una vez a mano.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  toIndustryLabel,
  isIndustryCodeToken
} from '../../src/lib/clients/industry-label.ts';
import {
  detectRawCodeTokens,
  detectEmbeddedPlaceholder,
  detectTestResidue,
  checkBriefAssembly,
  assemblyImprovesStrictly
} from '../../src/lib/onboarding/assembly-guard.ts';
import { assessBriefInputs } from '../../src/lib/onboarding/brief-inputs.ts';
import { buildDigitalPresenceSentence } from '../../src/lib/onboarding/diagnostic-labels.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

/* ══════════════════════════════════════════════════════════════════════ */
/*  ⭐⭐ R-30 — LA CONSTANTE ÚNICA de valores observados, con sus `id`     */
/* ══════════════════════════════════════════════════════════════════════ */

const VALORES_OBSERVADOS = {
  /** R & M QTB LLC — brief `b56d1fa3`, clave `differentiators`. */
  'b56d1fa3.differentiators': 'TEST T-04',
  /** R & M QTB LLC — cliente `4a59cbff`, columna `clients.industry`. */
  '4a59cbff.industry': 'portable_toilet_rental_service',
  /** Clara V Decor — brief `e1ad789c`, clave `goal_12m`. */
  'e1ad789c.goal_12m':
    'Top 3 en Google Maps para other en [PENDIENTE] + 15-20 leads/mes',
  /** Clara V Decor — brief `e1ad789c`, clave `search_behavior`. */
  'e1ad789c.search_behavior':
    'Busca en Google: other near me, other rental [PENDIENTE]',
  /** Clara V Decor — cliente `122f3593`, columna `clients.industry`. */
  '122f3593.industry': 'other',
  /** SCS Cleaning Service — brief `be43470f`, clave `digital_presence`. */
  'be43470f.digital_presence': 'GBP: no_gbp, Salud digital: nothing',
  /** SCS Cleaning Service — brief `be43470f`, clave `main_problem`. */
  'be43470f.main_problem':
    'No pueden encontrar SCS en Google para cleaning en la zona',
  /** SCS Cleaning Service — cliente `e24ddff3`, columna `clients.industry`. */
  'e24ddff3.industry': 'cleaning',
  /** R & M QTB LLC — diagnóstico `bc0a1027` (el elegido de las 2 filas contradictorias). */
  'bc0a1027.google_presence': 'no_gbp',
  'bc0a1027.digital_health': 'nothing',
  'bc0a1027.team_size': '2_5'
} as const;

test('T-12 ⭐⭐ R-30 los fixtures son VALORES OBSERVADOS, cada uno citado con su `id` de fila', () => {
  // El archivo declara la procedencia de cada fixture: sin `id`, un fixture es una
  // paráfrasis con aspecto de dato.
  const claves = Object.keys(VALORES_OBSERVADOS);
  assert.ok(claves.length >= 11);
  for (const k of claves) {
    assert.match(
      k,
      /^[0-9a-f]{8}\.[a-z0-9_]+$/,
      `el fixture \`${k}\` no está citado con su \`id\` de fila (R-30)`
    );
  }
  // Y ningún valor es vacío: un fixture vacío satisface cualquier assert.
  for (const v of Object.values(VALORES_OBSERVADOS)) {
    assert.ok(typeof v === 'string' && v.length > 0);
  }
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  m1 — `toIndustryLabel` devuelve el CRUDO                              */
/* ══════════════════════════════════════════════════════════════════════ */

test('T-12 ⭐⭐ m1 revertir `toIndustryLabel` al valor CRUDO rompe el criterio de R-15/R-16', () => {
  /** La mutación, en memoria: la implementación PRE-F-121 (devolver el crudo). */
  const mutado = (raw: string | null | undefined): string | null =>
    typeof raw === 'string' && raw.length > 0 ? raw : null;

  // El criterio que `f121-industry-label` asserta, aplicado a la versión mutada.
  const criterioR15 = (f: typeof toIndustryLabel): boolean =>
    f(VALORES_OBSERVADOS['122f3593.industry']) === null;
  const criterioR16 = (f: typeof toIndustryLabel): boolean => {
    const out = f(VALORES_OBSERVADOS['4a59cbff.industry']);
    return out !== null && !out.includes('_');
  };

  assert.equal(
    criterioR15(toIndustryLabel),
    true,
    'la implementación real cumple R-15'
  );
  assert.equal(
    criterioR16(toIndustryLabel),
    true,
    'la implementación real cumple R-16'
  );
  assert.equal(
    criterioR15(mutado),
    false,
    'm1 NO pone en rojo el criterio de R-15: el guard sería un no-op'
  );
  assert.equal(
    criterioR16(mutado),
    false,
    'm1 NO pone en rojo el criterio de R-16: el guard sería un no-op'
  );
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  m2 — la regla (a) del prompt → "escribe bien"                         */
/* ══════════════════════════════════════════════════════════════════════ */

test('T-12 ⭐⭐ m2 sustituir la regla de códigos por una fórmula genérica rompe el criterio de R-19', () => {
  const PROMPT = read('prompts/brief/system_prompt.md');
  const reglas = (src: string): string =>
    src.slice(src.indexOf('REGLAS:'), src.indexOf('OUTPUT:'));

  /**
   * El criterio ANTI-NO-OP de `f121-brief-assembly-rules` R-19: la regla tiene que
   * NOMBRAR los identificadores reales que fallaron. Es el precedente literal de
   * F-116 R-32 ("contrato sustituido por *usa snake_case*" → rojo).
   */
  const criterioR19 = (src: string): boolean => {
    const r = reglas(src);
    return [
      'other',
      'no_gbp',
      'nothing',
      'cleaning',
      'portable_toilet_rental_service'
    ].every((t) => r.includes(t));
  };

  assert.equal(criterioR19(PROMPT), true, 'el prompt real cumple R-19');

  // La mutación: la línea de la regla (a), reemplazada por una formulación sin contenido
  // verificable. Se aplica al TEXTO leído; no se toca ningún archivo.
  const lineas = PROMPT.split('\n');
  const iRegla = lineas.findIndex((l) =>
    /IDENTIFICADORES\s+y\s+CÓDIGOS/i.test(l)
  );
  assert.ok(iRegla > 0, 'no se encontró la regla (a) para mutar');
  const mutado = lineas
    .slice(0, iRegla)
    .concat('- Escribe bien y usa lenguaje natural')
    .concat(lineas.slice(iRegla + 1))
    .join('\n');
  assert.notEqual(mutado, PROMPT, 'la mutación no se aplicó');
  assert.equal(
    criterioR19(mutado),
    false,
    'm2 NO pone en rojo el criterio de R-19: la regla podría sustituirse por «escribe ' +
      'bien» y los tests seguirían verdes (R-32)'
  );
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  m3 — guard de placeholder que nunca dispara                           */
/* ══════════════════════════════════════════════════════════════════════ */

test('T-12 ⭐⭐ m3 un `detectEmbeddedPlaceholder` que nunca dispara rompe el criterio de R-23', () => {
  const mutado = (): boolean => false;

  const criterioR23 = (f: (v: unknown) => boolean): boolean =>
    f(VALORES_OBSERVADOS['e1ad789c.goal_12m']) &&
    f(VALORES_OBSERVADOS['e1ad789c.search_behavior']);

  assert.equal(criterioR23(detectEmbeddedPlaceholder), true);
  assert.equal(
    criterioR23(mutado),
    false,
    'm3 NO pone en rojo el criterio de R-23: el guard nunca dispararía y los tests ' +
      'seguirían verdes (R-32)'
  );

  // ⭐ Y el espejo: un guard AGRESIVO (que marca todo) tampoco pasa — porque el mismo
  // test exige que la degradación honesta NO se marque (R-01). El criterio muerde en
  // los DOS sentidos, que es lo que impide "arreglarlo" con un `return true`.
  const agresivo = (): boolean => true;
  const criterioR01 = (f: (v: unknown) => boolean): boolean =>
    !f('[PENDIENTE]') &&
    !f('Licencias: [PENDIENTE]') &&
    !f('CSLB #[PENDIENTE]');
  assert.equal(criterioR01(detectEmbeddedPlaceholder), true);
  assert.equal(criterioR01(agresivo), false);
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  m4 — `detectTestResidue` siempre vacío                                */
/* ══════════════════════════════════════════════════════════════════════ */

test('T-12 ⭐⭐ m4 un `detectTestResidue` que siempre devuelve vacío rompe el criterio de R-27', () => {
  const mutado = (): boolean => false;
  const criterioR27 = (f: (v: unknown) => boolean): boolean =>
    f(VALORES_OBSERVADOS['b56d1fa3.differentiators']);

  assert.equal(criterioR27(detectTestResidue), true);
  assert.equal(
    criterioR27(mutado),
    false,
    'm4 NO pone en rojo el criterio de R-27: el detector sería un no-op'
  );
  // Espejo: uno que marca todo tampoco pasa (el test exige que la prosa legítima NO se
  // marque — «Test de presión certificado…»).
  const agresivo = (): boolean => true;
  assert.equal(detectTestResidue('Test de presión certificado'), false);
  assert.equal(agresivo(), true);
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  m5 — la señal derivada → `!!diagnosticData`                           */
/* ══════════════════════════════════════════════════════════════════════ */

test('T-12 ⭐⭐⭐ m5 sustituir la señal derivada por `!!diagnosticData` reintroduce la MENTIRA', () => {
  // El caso R & M exacto: hay fila de diagnóstico, y el generador no recibe los insumos.
  const filaExiste = [
    {
      id: 'bc0a1027-983e-41dc-9c89-3865b3209f7c',
      created_at: '2026-03-27 01:01:54.536471+00',
      team_size: null,
      google_presence: null,
      digital_health: null
    }
  ];
  const cliente = {
    business_name: 'R & M QTB LLC',
    industry: VALORES_OBSERVADOS['4a59cbff.industry']
  };

  /** La señal MUTADA: existencia de fila, tal como vivía en `cb3302d`. */
  const senalMutada = filaExiste.length > 0; // ≡ `!!diagnosticData`
  /** La señal REAL de F-121: derivada de los insumos. */
  const evaluacion = assessBriefInputs({
    client: cliente,
    diagnostics: filaExiste
  });

  assert.equal(senalMutada, true, 'la fila existe');
  assert.equal(
    evaluacion.allInputsPresent,
    false,
    'y sin embargo el generador NO va a recibir los insumos'
  );
  assert.equal(evaluacion.hasUsableDiagnosticInput, false);
  assert.notEqual(
    evaluacion.allInputsPresent,
    senalMutada,
    'm5 NO cambia el veredicto: la señal derivada sería indistinguible de ' +
      '`!!diagnosticData` y el guard sería un no-op'
  );

  // Y el source-guard lo cazaría además en la fuente. Se mira el CÓDIGO sin
  // comentarios: el comentario que EXPLICA el defecto tiene derecho a nombrarlo.
  const FICHA_CODE = read('src/app/(app)/clients/[id]/page.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(!/hasDiagnostic:\s*!!diagnosticData/.test(FICHA_CODE));
});

/* ══════════════════════════════════════════════════════════════════════ */
/*  ⭐ R-31 — el resto de los guards, probados por mutación en memoria     */
/* ══════════════════════════════════════════════════════════════════════ */

test('T-12 ⭐ R-31 `detectRawCodeTokens` vacío rompe el criterio; y los 4 defectos reales lo ejercen', () => {
  const mutado = (): string[] => [];
  const casos = [
    VALORES_OBSERVADOS['e1ad789c.goal_12m'],
    VALORES_OBSERVADOS['e1ad789c.search_behavior'],
    VALORES_OBSERVADOS['be43470f.digital_presence'],
    VALORES_OBSERVADOS['be43470f.main_problem'],
    VALORES_OBSERVADOS['4a59cbff.industry']
  ];
  for (const c of casos) {
    assert.ok(detectRawCodeTokens(c).length > 0, `el real no detecta: «${c}»`);
    assert.equal(mutado().length, 0);
  }
  // Anti-no-op del propio fixture: los 5 casos NO son el mismo token.
  const todos = casos.flatMap((c) => detectRawCodeTokens(c));
  assert.ok(new Set(todos).size >= 4, 'los fixtures ejercen tokens distintos');
});

test('T-12 ⭐ R-31 `buildDigitalPresenceSentence` degradado al formato viejo rompe el criterio de R-18', () => {
  const mutado = (gp: string, dh: string): string =>
    `GBP: ${gp || 'N/A'}, Salud digital: ${dh || 'N/A'}`;
  const gp = VALORES_OBSERVADOS['bc0a1027.google_presence'];
  const dh = VALORES_OBSERVADOS['bc0a1027.digital_health'];
  // El criterio: la frase no puede contener ningún código.
  const limpio = (s: string): boolean => detectRawCodeTokens(s).length === 0;
  assert.equal(limpio(buildDigitalPresenceSentence(gp, dh)), true);
  assert.equal(
    limpio(mutado(gp, dh)),
    false,
    'la mutación reproduce EXACTAMENTE el string persistido en `be43470f`'
  );
  assert.equal(mutado(gp, dh), VALORES_OBSERVADOS['be43470f.digital_presence']);
});

test('T-12 ⭐ R-31 `assemblyImprovesStrictly` degradado a "si parsea" rompe la no-regresión del retry', () => {
  const antes = checkBriefAssembly({
    goal_12m: VALORES_OBSERVADOS['e1ad789c.goal_12m'],
    main_problem: VALORES_OBSERVADOS['be43470f.main_problem']
  });
  const igual = checkBriefAssembly({
    goal_12m: VALORES_OBSERVADOS['e1ad789c.goal_12m'],
    main_problem: VALORES_OBSERVADOS['be43470f.main_problem']
  });
  const mejor = checkBriefAssembly({
    goal_12m: 'Top 3 en Google Maps en su zona de servicio',
    main_problem: 'No pueden encontrar SCS en Google para limpieza en la zona'
  });
  assert.equal(antes.ok, false);
  assert.equal(mejor.ok, true);
  // La mutación "adoptar si parsea" adoptaría un retry IGUAL de malo.
  const mutado = (): boolean => true;
  assert.equal(
    assemblyImprovesStrictly(antes, igual),
    false,
    'igual NO es mejora'
  );
  assert.equal(assemblyImprovesStrictly(antes, mejor), true);
  assert.equal(mutado(), true, 'la mutación adoptaría el retry igual de malo');
});

test('T-12 ⭐ R-31 `isIndustryCodeToken` siempre-false rompe el criterio del vocabulario', () => {
  const mutado = (): boolean => false;
  for (const k of [
    '122f3593.industry',
    'e24ddff3.industry',
    '4a59cbff.industry'
  ] as const) {
    assert.equal(isIndustryCodeToken(VALORES_OBSERVADOS[k]), true, k);
    assert.equal(mutado(), false);
  }
});
