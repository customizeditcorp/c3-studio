/**
 * F-121 — T-11 — **Los invariantes que el spec NO puede romper**
 * (R-01, R-02, R-03, R-04, R-05).
 *
 * Bloque 0 del spec: rama-independiente, universal. Si algo de acá se pone rojo, F-121
 * está debilitando doctrina cerrada (F-104/F-106/F-109/F-105/F-116) y el arreglo está
 * mal, no el test.
 *
 * ⭐ **Ancla FIJA `cb3302d`, nunca `HEAD`** (R-33): verde en el working tree SIN
 * commitear **Y** commiteado. La exploración de diff usa `--name-only` con **path-scope**
 * e **incluye untracked** (lección CL-109: un `archivosTocados()` que no veía untracked se
 * declaraba verde sin leer los archivos nuevos de la feature).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** ⭐ Ancla FIJA. `HEAD` volvería verde al commitear, afirmando algo ya falso (CL-107). */
const BASE = 'cb3302d';

const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
const desde = (rel: string): string => git('show', `${BASE}:${rel}`);
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * ⭐ **El perímetro REAL de F-121**, con las dos correcciones que el arco dejó escritas:
 *   · `--name-only` **con path-scope** (`src/`, `tests/`, `prompts/`, `scripts/`,
 *     `supabase/`): el ruido de entorno no puede ni ensuciar ni enmascarar el veredicto;
 *   · **incluye los `untracked`** (CL-109): mientras los archivos NUEVOS de la feature no
 *     estén commiteados, `git diff` no los ve y el guard se declararía verde **sin
 *     haberlos leído**. Ése es exactamente el defecto de un veredicto que depende del
 *     estado del índice en vez del mundo que dice medir.
 *
 * Consecuencia buscada (R-33): el conjunto es **el mismo en los DOS estados**.
 */
const ALCANCE = ['src', 'tests', 'prompts', 'scripts', 'supabase'];
const archivosTocados = (): string[] =>
  [
    ...git('diff', '--name-only', '-M', BASE, '--', ...ALCANCE).split('\n'),
    ...git(
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      ...ALCANCE
    ).split('\n')
  ]
    .filter(Boolean)
    .filter((p) => !p.startsWith('supabase/.temp/'))
    .filter((p, i, a) => a.indexOf(p) === i)
    .sort();

/* ================================================================== */
/*  ⭐⭐ R-02 / R-03 — los módulos intocables, BYTE a BYTE             */
/* ================================================================== */

test('T-11 ⭐⭐ R-02 `approval-guard.ts` es BYTE-IDÉNTICO a `cb3302d`', () => {
  const rel = 'src/lib/onboarding/approval-guard.ts';
  assert.equal(
    read(rel),
    desde(rel),
    'R-02: `assessApproval` e `isPlaceholderOnly` NO se tocan, ni siquiera para exportar ' +
      'algo. El umbral es `meaningfulFieldCount > 0`, y "prosa real + [PENDIENTE] inline" ' +
      'cuenta como meaningful A PROPÓSITO (F-109/CL-091). F-121 opera en tiempo de ' +
      'GENERACIÓN, nunca en tiempo de aprobación.'
  );
});

test('T-11 ⭐⭐ R-03 `ofv/non-fabrication.ts` (F-105) es BYTE-IDÉNTICO a `cb3302d`', () => {
  const rel = 'src/lib/ofv/non-fabrication.ts';
  assert.equal(read(rel), desde(rel), 'R-03: F-105 queda intacto');
  // Y el guard content-side de F-118, también.
  const f118 = 'src/lib/content/non-fabrication.ts';
  assert.equal(
    read(f118),
    desde(f118),
    'R-03: el guard de F-118 queda intacto'
  );
});

test('T-11 ⭐⭐ R-03 el bloque de F-105 en la ruta NO se reubicó ni se alteró (H-2)', () => {
  const rel = 'src/app/api/generate-content/route.ts';
  const tramo = (src: string): string =>
    src.slice(
      src.indexOf('// --- F-105: guard'),
      src.indexOf('let savedRecord')
    );
  assert.equal(
    tramo(read(rel)),
    tramo(desde(rel)),
    'H-2/R-03: `f105-non-fabrication.test.ts:321` asserta 1 re-call y 0 writes entre sus ' +
      'dos anclajes; reubicar el bloque lo rompe'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-04 — el contrato de 28 claves + `raw_text`, INTACTO         */
/* ================================================================== */

test('T-11 ⭐⭐ R-04 el contrato del brief no cambió: mismas claves, mismos nombres, MISMO ORDEN', () => {
  const rel = 'prompts/brief/system_prompt.md';
  /** Las claves DECLARADAS, extraídas del prompt (nunca hardcodeadas) — criterio de F-116. */
  const declaredKeys = (src: string): string[] => {
    const at = src.indexOf('CONTRATO DE SALIDA — CLAVES EXACTAS DEL JSON:');
    assert.ok(at >= 0, 'el prompt perdió su sección de contrato');
    const seccion = src.slice(at);
    const lista = seccion.slice(
      0,
      seccion.indexOf('EJEMPLO DE LA FORMA EXACTA')
    );
    return Array.from(lista.matchAll(/^-\s+`([a-z0-9_]+)`\s+—/gm), (m) => m[1]);
  };
  const ahora = declaredKeys(read(rel));
  const antes = declaredKeys(desde(rel));
  assert.equal(ahora.length, 29, '28 claves + `raw_text`');
  // `deepEqual` sobre arrays ⇒ compara también el ORDEN (R-04 lo exige explícitamente).
  assert.deepEqual(
    ahora,
    antes,
    'R-04: sin añadir, quitar ni renombrar ninguna, y sin reordenar. Verificado live: ' +
      'las 3 filas frescas ya cumplían el contrato ⇒ el contrato NO es el defecto; el ' +
      'defecto está en los VALORES.'
  );
  assert.ok(ahora.includes('raw_text'));
});

test('T-11 ⭐ R-04 `interface BriefFields` no ganó ni perdió campos', () => {
  const rel = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
  const iface = (src: string): string => {
    const m = /interface BriefFields \{([\s\S]*?)\n\}/.exec(src);
    assert.ok(m, '`page.tsx` ya no declara `interface BriefFields`');
    return m[1];
  };
  assert.equal(
    iface(read(rel)),
    iface(desde(rel)),
    'el otro lado del contrato de F-116 (R-31) también queda intacto'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-04 — `needsBrief`/`needsPersona`/`needsOffer` sin cambios    */
/* ================================================================== */

test('T-11 ⭐⭐ las tres listas de contexto son BYTE-IDÉNTICAS a `cb3302d`', () => {
  const rel = 'src/app/api/generate-content/route.ts';
  const lista = (src: string, nombre: string): string => {
    const i = src.indexOf(`const ${nombre} = [`);
    assert.ok(i > 0, `\`route.ts\` ya no declara \`${nombre}\``);
    return src.slice(i, src.indexOf('].includes(step)', i));
  };
  for (const nombre of ['needsBrief', 'needsPersona', 'needsOffer']) {
    assert.equal(
      lista(read(rel), nombre),
      lista(desde(rel), nombre),
      `${nombre} cambió: eso altera QUÉ contexto recibe cada step y desactualiza la ` +
        'declaración de insumos de `brief-inputs.ts` (R-12)'
    );
  }
  // Y `brief` sigue fuera de las tres ⇒ su `contextChain` es la cadena vacía.
  for (const nombre of ['needsBrief', 'needsPersona', 'needsOffer']) {
    assert.ok(!lista(read(rel), nombre).includes("'brief'"));
  }
});

/* ================================================================== */
/*  ⭐⭐ R-05 — sin DDL, sin `delete`, sin `UPDATE` de filas de negocio */
/* ================================================================== */

test('T-11 ⭐⭐ R-05 el diff de F-121 no introduce DDL, `delete` ni migraciones', () => {
  const tocados = archivosTocados();
  // Anti-no-op: si el perímetro saliera vacío, todo lo de abajo pasaría solo.
  assert.ok(
    tocados.length > 0,
    'el perímetro de F-121 salió vacío: guard no-op'
  );
  assert.deepEqual(
    tocados.filter((p) => p.startsWith('supabase/migrations/')),
    [],
    'R-05: SIN DDL, sin migraciones'
  );
  assert.deepEqual(
    tocados.filter((p) => p.startsWith('supabase/functions/')),
    [],
    'la copia edge no se toca'
  );
  // Y el set de migraciones en disco es el mismo que en el ancla.
  const ahora = readdirSync(resolve(REPO, 'supabase/migrations')).sort();
  const enBase = git('ls-tree', '--name-only', BASE, 'supabase/migrations/')
    .split('\n')
    .filter(Boolean)
    .map((p) => p.split('/').pop() as string)
    .sort();
  assert.deepEqual(ahora, enBase);
});

test('T-11 ⭐⭐ R-05 ningún archivo tocado introduce `delete`, DDL ni `UPDATE` de filas de negocio', () => {
  for (const rel of archivosTocados()) {
    if (!/\.(ts|tsx|md|mjs)$/.test(rel)) continue;
    // Los guards NOMBRAN lo prohibido para prohibirlo; se los mide por su propio diff.
    if (rel.startsWith('tests/')) continue;
    let src: string;
    try {
      src = read(rel);
    } catch {
      continue; // archivo eliminado
    }
    assert.ok(!/\.delete\(/.test(src), `${rel} introdujo un \`delete\``);
    assert.ok(
      !/\b(DROP|ALTER)\s+TABLE\b|\bCREATE\s+TABLE\b|\bDELETE\s+FROM\b/i.test(
        src
      ),
      `${rel} introdujo DDL`
    );
    assert.ok(
      !/prompts:apply|prompts:check|sync-prompts/.test(src),
      `${rel} invoca \`sync-prompts\` — acción de FRONTERA, gateada (F-074, R-34)`
    );
  }
});

test('T-11 ⭐⭐ R-05 F-121 no añade NINGÚN `.update(`/`.insert(` nuevo a las superficies que toca', () => {
  const contar = (src: string, re: RegExp): number =>
    (src.match(re) ?? []).length;
  const escrituras = /\.insert\(|\.update\(|\.upsert\(|\.delete\(/g;
  for (const rel of archivosTocados()) {
    if (!/\.(ts|tsx)$/.test(rel) || rel.startsWith('tests/')) continue;
    let antes: string;
    try {
      antes = desde(rel);
    } catch {
      // Archivo NUEVO de F-121: no puede traer ninguna escritura.
      const nuevo = read(rel);
      assert.equal(
        contar(nuevo, escrituras),
        0,
        `${rel} es un archivo NUEVO de F-121 y contiene una escritura a la base`
      );
      continue;
    }
    assert.ok(
      contar(read(rel), escrituras) <= contar(antes, escrituras),
      `${rel} GANÓ una escritura a la base respecto de \`${BASE}\` (R-05)`
    );
  }
});

/* ════════════════════════════════════════════════════════════════════ */
/*  ⭐⭐⭐ R-01 — NINGUNA regla nueva usa «contiene algún [PENDIENTE]»   */
/* ════════════════════════════════════════════════════════════════════ */

test('T-11 ⭐⭐⭐ R-01 ninguna regla nueva tiene como criterio «contiene algún marcador»', () => {
  // La forma prohibida: un `includes`/`indexOf`/`test` sobre el marcador usado como
  // VEREDICTO booleano de un campo. Es lo que rompería F-104/F-106: un marcador que
  // ocupa la RANURA COMPLETA de un campo es degradación honesta LEGÍTIMA.
  const prohibidas = [
    /\.includes\(\s*['"`]\[\s*PEND/i,
    /\.indexOf\(\s*['"`]\[\s*PEND/i,
    /===\s*['"`]\[\s*PEND/i
  ];
  for (const rel of archivosTocados()) {
    if (!/\.(ts|tsx)$/.test(rel) || rel.startsWith('tests/')) continue;
    let src: string;
    try {
      src = stripComments(read(rel));
    } catch {
      continue;
    }
    for (const re of prohibidas) {
      assert.ok(
        !re.test(src),
        `${rel}: una regla con criterio "contiene algún [PENDIENTE]" está PROHIBIDA ` +
          '(R-01). El marcador en la ranura completa es degradación honesta legítima ' +
          '(F-104/F-106), y F-121 no puede introducir nada que lo trate como defecto.'
      );
    }
  }
});

test('T-11 ⭐⭐⭐ R-01/R-24 CONDUCTUAL: lo que hoy es aprobable, sigue siendo aprobable', () => {
  // No basta con que la fuente no diga la frase prohibida: el comportamiento tiene que
  // seguir siendo el mismo. Se ejercen los casos que F-104/F-106/F-109 protegen.
  //
  // Import dinámico: el módulo se lee del disco actual, igual que en producción.
  return import('../../src/lib/onboarding/approval-guard.ts').then(
    ({ assessApproval, isPlaceholderOnly }) => {
      const aprobables = [
        { licenses: '[PENDIENTE]', business_name: 'SCS Cleaning Service' },
        {
          main_problem:
            'No aparece en el top 3 de Google Maps y depende de referidos; su presencia digital está en [PENDIENTE]'
        },
        { differentiators: 'TEST T-04' },
        {
          goal_12m:
            'Top 3 en Google Maps para other en [PENDIENTE] + 15-20 leads/mes'
        },
        { guarantees: 'Garantía escrita de mano de obra' }
      ];
      for (const campos of aprobables) {
        assert.equal(
          assessApproval(campos).ok,
          true,
          `F-121 volvió INAPROBABLE algo que hoy es aprobable: ${JSON.stringify(campos)}`
        );
      }
      // Y el umbral no se movió en el otro sentido tampoco.
      assert.equal(assessApproval({}).ok, false);
      assert.equal(assessApproval({ a: '' }).reason, 'empty');
      assert.equal(
        assessApproval({ a: '[PENDIENTE]' }).reason,
        'all_placeholder'
      );
      assert.equal(isPlaceholderOnly('[PENDIENTE]'), true);
      assert.equal(isPlaceholderOnly('prosa real y [PENDIENTE]'), false);
    }
  );
});

/* ================================================================== */
/*  ⭐ R-33 — el criterio de los DOS estados, verificable desde acá    */
/* ================================================================== */

test('T-11 ⭐ R-33 el perímetro es INDEPENDIENTE del estado del índice (mismo conjunto commiteado o no)', () => {
  // La unión `diff` ∪ `ls-files --others` es, por construcción, invariante al hecho de
  // que los archivos nuevos estén o no en el índice: lo que sale de `--others` al
  // commitear entra por `diff`. Se comprueba que la unión no dependa del `-M` ni del
  // `diff.renames` del entorno, que es la otra forma del mismo defecto (CL-109).
  const conM = archivosTocados();
  const sinM = [
    ...git(
      '-c',
      'diff.renames=false',
      'diff',
      '--name-only',
      BASE,
      '--',
      ...ALCANCE
    ).split('\n'),
    ...git(
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      ...ALCANCE
    ).split('\n')
  ]
    .filter(Boolean)
    .filter((p) => !p.startsWith('supabase/.temp/'))
    .filter((p, i, a) => a.indexOf(p) === i)
    .sort();
  assert.deepEqual(
    conM,
    sinM,
    'el conjunto medido cambia con la CONFIGURACIÓN de git del que corre el test: un ' +
      'veredicto que depende del entorno en vez del mundo que dice medir'
  );
  // Y ningún archivo del perímetro está fuera del path-scope declarado.
  for (const p of conM) {
    assert.ok(
      ALCANCE.some((a) => p.startsWith(a + '/')),
      `${p} quedó fuera del path-scope declarado`
    );
  }
});
