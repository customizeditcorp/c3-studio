/**
 * F-121 — T-07 — `assembly-guard.ts` (2/3): `detectEmbeddedPlaceholder` (R-23, R-24).
 *
 * **Postura CONSERVADORA (DT-03): ante la duda, NO marcar.** Se aplica el criterio que
 * F-118 formuló, no su conclusión: un guard es conservador donde el humano ya tiene la
 * información. El Brief es interno y se aprueba a mano ⇒ el falso positivo cuesta más
 * que el falso negativo, y ataca directamente el marcador que F-104/F-106 instituyeron.
 *
 * **El blindaje central de la feature está acá (R-24):** un valor marcado por este
 * detector **sigue siendo aprobable** por `assessApproval`. F-121 opera en tiempo de
 * GENERACIÓN, nunca en tiempo de aprobación (R-02).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  detectEmbeddedPlaceholder,
  detectEmbeddedPlaceholderInContent
} from '../../src/lib/onboarding/assembly-guard.ts';
import {
  assessApproval,
  isPlaceholderOnly
} from '../../src/lib/onboarding/approval-guard.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BASE = 'cb3302d';

/* ================================================================== */
/*  ⭐ FIXTURES REALES — Clara V Decor, brief `e1ad789c` (R-30)        */
/* ================================================================== */

/** Los TRES valores que fallaron, verbatim. */
const CLARA_V = {
  main_problem:
    'No aparece en el top 3 de Google Maps y depende de referidos; su presencia digital está en [PENDIENTE]',
  goal_12m: 'Top 3 en Google Maps para other en [PENDIENTE] + 15-20 leads/mes',
  search_behavior:
    'Busca en Google: other near me, other rental [PENDIENTE] y compara reseñas antes de llamar'
} as const;

/**
 * ⭐ Los que **NO** deben marcarse: la degradación honesta de F-104/F-106 en sus
 * formas reales. Marcar cualquiera de éstos sería erosionar la doctrina.
 */
const DEGRADACION_HONESTA = [
  '[PENDIENTE]',
  '[ PENDIENTE ]',
  'Licencias: [PENDIENTE]',
  'CSLB #[PENDIENTE]',
  '[PENDING]',
  '  [PENDIENTE]  ',
  'Casos de éxito: [PENDIENTE]',
  'Presupuesto — [PENDIENTE]',
  'Sitio web - [PENDIENTE]'
] as const;

/* ================================================================== */
/*  ⭐⭐ R-23 — los 3 valores reales de Clara V SÍ se marcan            */
/* ================================================================== */

test('T-07 ⭐⭐ R-23 los TRES valores reales de Clara V (`e1ad789c`) se marcan', () => {
  for (const [clave, valor] of Object.entries(CLARA_V)) {
    assert.equal(
      detectEmbeddedPlaceholder(valor),
      true,
      `\`${clave}\` no se marcó: el marcador está DENTRO de una oración ya redactada, ` +
        'que es exactamente lo que el prompt nunca prohibió (R-21)'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ R-01/R-24 — la degradación honesta NO se toca                  */
/* ================================================================== */

test('T-07 ⭐⭐ R-01 la RANURA COMPLETA nunca se marca: es degradación honesta LEGÍTIMA', () => {
  for (const v of DEGRADACION_HONESTA) {
    assert.equal(
      detectEmbeddedPlaceholder(v),
      false,
      `falso positivo sobre «${v}». Un marcador que ocupa la ranura completa de un ` +
        'campo es doctrina F-104/F-106, y F-121 tiene PROHIBIDO tocarla (R-01)'
    );
  }
});

test('T-07 ⭐⭐ R-01 el criterio NO es «contiene algún marcador» — y se demuestra con un contraejemplo', () => {
  // Si el criterio fuera "contiene algún [PENDIENTE]", los 9 casos de arriba se
  // marcarían. Se marcan 0 de 9, y los 3 de Clara V se marcan 3 de 3.
  const marcadosHonestos = DEGRADACION_HONESTA.filter((v) =>
    detectEmbeddedPlaceholder(v)
  );
  assert.deepEqual(marcadosHonestos, []);
  const marcadosClara = Object.values(CLARA_V).filter((v) =>
    detectEmbeddedPlaceholder(v)
  );
  assert.equal(marcadosClara.length, 3);
  // Y el módulo no puede contener una regla de la forma prohibida.
  const GUARD = readFileSync(
    resolve(REPO, 'src/lib/onboarding/assembly-guard.ts'),
    'utf8'
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.doesNotMatch(
    GUARD,
    /includes\(\s*['"]\[PEND/i,
    'una comprobación de "contiene el marcador" es exactamente el criterio que R-01 prohíbe'
  );
});

test('T-07 ⭐⭐ R-24 un valor MARCADO sigue siendo APROBABLE por `assessApproval`', () => {
  // El blindaje explícito de R-02: F-121 no puede crear un estado nuevo de "generado
  // pero inaprobable".
  for (const [clave, valor] of Object.entries(CLARA_V)) {
    assert.equal(detectEmbeddedPlaceholder(valor), true, clave);
    assert.equal(
      isPlaceholderOnly(valor),
      false,
      `${clave}: prosa real + marcador inline NO es placeholder-only (F-109 R-04/R-14)`
    );
    assert.equal(
      assessApproval({ [clave]: valor }).ok,
      true,
      `${clave}: marcarlo NO puede volverlo inaprobable (R-24)`
    );
  }
  // Y el contenido completo de Clara V, con los 3 defectos, sigue aprobable.
  const evaluacion = assessApproval(CLARA_V);
  assert.equal(evaluacion.ok, true);
  assert.equal(evaluacion.meaningfulFieldCount, 3);
});

test('T-07 ⭐⭐ R-02 `approval-guard.ts` es BYTE-IDÉNTICO a `cb3302d` (no se tocó ni para exportar)', () => {
  const rel = 'src/lib/onboarding/approval-guard.ts';
  const base = execFileSync('git', ['show', `${BASE}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  assert.equal(
    readFileSync(resolve(REPO, rel), 'utf8'),
    base,
    'R-02: `assessApproval`/`isPlaceholderOnly` no se tocan. El detector define su ' +
      'propio patrón en vez de exportar algo desde acá — exportar TAMBIÉN es tocar.'
  );
});

/* ================================================================== */
/*  ⭐ DT-03 — el umbral, en sus tres condiciones                      */
/* ================================================================== */

test('T-07 ⭐ DT-03 condición (2): sin prosa suficiente alrededor, NO se marca', () => {
  // Menos de 6 palabras ⇒ es una ranura o un fragmento, no una oración redactada.
  assert.equal(detectEmbeddedPlaceholder('Web [PENDIENTE] activa'), false);
  assert.equal(detectEmbeddedPlaceholder('[PENDIENTE] leads'), false);
  assert.equal(
    detectEmbeddedPlaceholder('Meta 90 días [PENDIENTE] aún'),
    false
  );
  // Justo por encima del umbral (6 palabras de prosa) ya es una oración redactada, y
  // el marcador no está en la posición de ranura ⇒ se marca. El umbral MUERDE en los
  // dos lados; no es un `false` constante disfrazado de regla.
  assert.equal(
    detectEmbeddedPlaceholder('Meta a 90 días: [PENDIENTE] por ahora'),
    true
  );
  // Con prosa real alrededor, sí.
  assert.equal(
    detectEmbeddedPlaceholder(
      'El negocio quiere duplicar los trabajos cerrados por canal digital en [PENDIENTE] meses'
    ),
    true
  );
});

test('T-07 ⭐ DT-03 condición (3): marcador al cierre tras separador de etiqueta ⇒ NO se marca', () => {
  // Aunque haya prosa larga por delante, la forma `<etiqueta>: <marcador>` al final es
  // la ranura etiquetada canónica.
  assert.equal(
    detectEmbeddedPlaceholder(
      'Licencias y certificaciones vigentes del contratista general: [PENDIENTE]'
    ),
    false
  );
  assert.equal(
    detectEmbeddedPlaceholder(
      'Número de licencia del Contractors State License Board CSLB #[PENDIENTE]'
    ),
    false
  );
  assert.equal(
    detectEmbeddedPlaceholder(
      'Inversión mensual actual en marketing digital del negocio — [PENDIENTE]'
    ),
    false
  );
  // Pero si sigue prosa DESPUÉS del marcador, ya no es una ranura: es una oración.
  assert.equal(
    detectEmbeddedPlaceholder(
      'Licencias y certificaciones vigentes: [PENDIENTE] pero el dueño dice tenerlas'
    ),
    true
  );
});

test('T-07 DT-03 condición (1): sin marcador, nunca se marca', () => {
  for (const v of [
    'Servicio de limpieza residencial en el condado de Los Angeles',
    'Garantía escrita de mano de obra por 12 meses en todos los trabajos',
    '',
    '   '
  ]) {
    assert.equal(detectEmbeddedPlaceholder(v), false);
  }
  for (const v of [null, undefined, 42, {}, []]) {
    assert.equal(detectEmbeddedPlaceholder(v), false);
  }
});

/* ================================================================== */
/*  Barrido por contenido: `raw_text` queda fuera (R-22 lo cubre)      */
/* ================================================================== */

test('T-07 R-23 el barrido reporta las claves afectadas y EXCLUYE `raw_text`', () => {
  const content = {
    ...CLARA_V,
    licenses: 'Licencias: [PENDIENTE]',
    guarantees: 'Garantía escrita de mano de obra',
    // `raw_text` es el brief entero: tiene muchas líneas etiquetadas legítimas, y su
    // criterio lo fija el prompt (R-22), no este detector de campo.
    raw_text:
      '# BRIEF\n\n## BLOQUE 1\nEl negocio opera desde hace varios años en la zona [PENDIENTE] y sigue creciendo'
  };
  const claves = detectEmbeddedPlaceholderInContent(content).sort();
  assert.deepEqual(claves, ['goal_12m', 'main_problem', 'search_behavior']);
  assert.ok(!claves.includes('raw_text'));
  assert.ok(!claves.includes('licenses'));
  assert.deepEqual(detectEmbeddedPlaceholderInContent(null), []);
});
