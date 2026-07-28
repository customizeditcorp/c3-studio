/**
 * F-122 — T-14 — **Los invariantes que este spec NO puede romper**
 * (R-01, R-02, R-03, R-04, R-05, R-06, R-07, R-30, R-35).
 *
 * Bloque 0 del spec: universal. Si algo de acá se pone rojo, F-122 está debilitando
 * doctrina cerrada (F-098/F-104/F-105/F-106/F-109/F-116/F-121) y **el arreglo está mal,
 * no el test**.
 *
 * ⭐ **Ancla FIJA `9509f6f`, nunca `HEAD`** (R-39): verde en el working tree SIN
 * commitear **Y** commiteado. La exploración de diff usa `--name-only` con **path-scope**
 * e **incluye untracked** (lección CL-109).
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
const BASE = '9509f6f';

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
/** Comparación WHITESPACE-TOLERANTE: husky/prettier reformatea al commitear (R-39). */
const norm = (src: string): string => src.replace(/\s+/g, ' ').trim();

/**
 * ⭐ El perímetro REAL de F-122, con las dos correcciones que el arco dejó escritas:
 *   · `--name-only` **con path-scope**: el ruido de entorno no ensucia el veredicto;
 *   · **incluye los `untracked`** (CL-109): mientras los archivos NUEVOS no estén
 *     commiteados, `git diff` no los ve y el guard se declararía verde **sin haberlos
 *     leído**.
 * Consecuencia buscada (R-39): el conjunto es **el mismo en los DOS estados**.
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
/*  ⭐⭐⭐ R-02 / R-30 — los módulos INTOCABLES, byte a byte             */
/* ================================================================== */

test('T-14 ⭐⭐⭐ R-02 `approval-guard.ts` es BYTE-IDÉNTICO a `9509f6f`', () => {
  const rel = 'src/lib/onboarding/approval-guard.ts';
  assert.equal(
    read(rel),
    desde(rel),
    'R-02: `assessApproval` e `isPlaceholderOnly` NO se tocan. F-122 opera en el ' +
      'WRITE-PATH a `clients`, nunca en tiempo de aprobación: bloquear el valor no puede ' +
      'crear un estado nuevo de "generado pero no guardable".'
  );
});

test('T-14 ⭐⭐⭐ R-30 `ofv/non-fabrication.ts` (F-105) y el guard de F-118 quedan INTACTOS', () => {
  for (const rel of [
    'src/lib/ofv/non-fabrication.ts',
    'src/lib/content/non-fabrication.ts'
  ]) {
    assert.equal(
      read(rel),
      desde(rel),
      `${rel} cambió: F-105/F-118 quedan intactos`
    );
  }
});

test('T-14 ⭐⭐⭐ `method-context/pending.ts` es BYTE-IDÉNTICO: el marcador se REUSA, no se toca', () => {
  const rel = 'src/lib/method-context/pending.ts';
  assert.equal(
    read(rel),
    desde(rel),
    'R-29/H-3: la fuente única del marcador se consume; ensancharla cambiaría en silencio ' +
      'el contexto que reciben F-111/F-112/F-113/F-116/F-118'
  );
});

test('T-14 ⭐⭐⭐ F-098 `gbp-slice/compliance.ts` es BYTE-IDÉNTICO — se cita, no se toca', () => {
  const rel = 'src/lib/gbp-slice/compliance.ts';
  assert.equal(
    read(rel),
    desde(rel),
    'E-7: `compliance.ts` es el guard anti-fabricación que el marcador en `clients.city` ' +
      'CORROMPÍA (pasaba a exigir que una descripción PÚBLICA contuviera `[PENDIENTE]`). ' +
      'F-122 arregla el DATO; el instrumento no se toca — es la consecuencia, no el objetivo.'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-03 — el contrato de `toIndustryLabel` (F-121)               */
/* ================================================================== */

test('T-14 ⭐⭐⭐ R-03 `toIndustryLabel` conserva su contrato exacto', async () => {
  const { toIndustryLabel, INDUSTRIES } = await import(
    '../../src/lib/clients/industry-label.ts'
  );
  assert.equal(toIndustryLabel('cleaning'), 'Limpieza');
  assert.equal(
    toIndustryLabel('other'),
    null,
    '`other` = AUSENCIA (F-121 R-15)'
  );
  assert.equal(toIndustryLabel(''), null);
  assert.equal(toIndustryLabel(null), null);
  assert.equal(
    toIndustryLabel('portable_toilet_rental_service'),
    'portable toilet rental service'
  );
  // Y la tabla no ganó ni perdió entradas.
  assert.equal(INDUSTRIES.length, 10, '9 rubros + `other`');
  const antes = desde('src/lib/clients/industry-label.ts');
  assert.equal(
    norm(read('src/lib/clients/industry-label.ts')),
    norm(antes),
    'R-03: F-122 **extiende el CONSUMO** de la declaración única, no su contrato. Si la ' +
      'tabla o el criterio cambiaran, F-121 dejaría de valer.'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-01 — ninguna regla nueva usa «contiene algún marcador»       */
/* ================================================================== */

test('T-14 ⭐⭐⭐ R-01 ninguna regla nueva tiene como criterio «contiene algún marcador»', () => {
  const prohibidas = [
    /\.includes\(\s*['"`]\[\s*PEND/i,
    /\.indexOf\(\s*['"`]\[\s*PEND/i,
    /===\s*['"`]\[\s*PEND/i,
    /detectMissingMarkers\([^)]*\)\.length\s*>\s*0/
  ];
  const tocados = archivosTocados();
  assert.ok(
    tocados.length > 0,
    'el perímetro de F-122 salió vacío: guard no-op'
  );
  for (const rel of tocados) {
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
          '(R-01). El marcador en la ranura completa de un artefacto generado es ' +
          'degradación honesta legítima (F-104/F-106); F-122 sólo prohíbe el CRUCE a ' +
          '`clients`.'
      );
    }
  }
});

test('T-14 ⭐⭐⭐ R-01/R-30 CONDUCTUAL: lo que hoy es aprobable, sigue siendo aprobable', async () => {
  const { assessApproval, isPlaceholderOnly } = await import(
    '../../src/lib/onboarding/approval-guard.ts'
  );
  const M = '[' + 'PENDIENTE' + ']';
  const aprobables = [
    { licenses: M, business_name: 'SCS Cleaning Service' },
    {
      main_problem:
        'No aparece en el top 3 de Google Maps y depende de referidos; su presencia digital está en ' +
        M
    },
    { city: M, state: 'CA', business_name: 'Clara V Decor' },
    {
      goal_12m: 'Top 3 en Google Maps para other en ' + M + ' + 15-20 leads/mes'
    },
    { guarantees: 'Garantía escrita de mano de obra' }
  ];
  for (const campos of aprobables) {
    assert.equal(
      assessApproval(campos).ok,
      true,
      `F-122 volvió INAPROBABLE algo que hoy es aprobable: ${JSON.stringify(campos)}`
    );
  }
  assert.equal(assessApproval({}).ok, false);
  assert.equal(assessApproval({ a: '' }).reason, 'empty');
  assert.equal(assessApproval({ a: M }).reason, 'all_placeholder');
  assert.equal(isPlaceholderOnly(M), true);
  assert.equal(isPlaceholderOnly('prosa real y ' + M), false);
});

/* ================================================================== */
/*  ⭐⭐⭐ R-06 — GATE-D1 SIGUE CERRADO: `diagnostics` no gana nada      */
/* ================================================================== */

test('T-14 ⭐⭐⭐ R-06 `diagnostics` no gana NINGUNA lectura, escritura ni campo de proyección', () => {
  const cuenta = (src: string, re: RegExp): number =>
    (src.match(re) ?? []).length;
  const refs = /from\(\s*['"`]diagnostics['"`]\s*\)/g;
  for (const rel of archivosTocados()) {
    if (!/\.(ts|tsx)$/.test(rel) || rel.startsWith('tests/')) continue;
    let ahora: string;
    try {
      ahora = stripComments(read(rel));
    } catch {
      continue;
    }
    let antes = '';
    try {
      antes = stripComments(desde(rel));
    } catch {
      // Archivo NUEVO de F-122: no puede tocar `diagnostics` en absoluto.
      assert.equal(
        cuenta(ahora, refs),
        0,
        `${rel} es un archivo NUEVO de F-122 y consulta \`diagnostics\` — GATE-D1 sigue ` +
          'ABIERTO y FUERA DE SCOPE (CL-102/CL-104 §5.2). Si algo parece pedirlo, se ELEVA.'
      );
      continue;
    }
    assert.equal(
      cuenta(ahora, refs),
      cuenta(antes, refs),
      `${rel}: cambió el número de accesos a \`diagnostics\` respecto de \`${BASE}\` (R-06)`
    );
  }
  // Y la PROYECCIÓN del único select de `diagnostics` es byte-idéntica.
  const rel = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
  const proyeccion = (src: string): string => {
    const i = src.indexOf("from('diagnostics')");
    assert.ok(i > 0, 'la pantalla ya no consulta `diagnostics`');
    return norm(src.slice(i, src.indexOf('.maybeSingle()', i)));
  };
  assert.equal(
    proyeccion(read(rel)),
    proyeccion(desde(rel)),
    'R-06: la proyección de `diagnostics` no cambia ni una columna. GATE-D1 es decisión ' +
      'del OPERADOR, no de este spec.'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-05 — sin DDL, sin `delete`, sin mutar filas de negocio      */
/* ================================================================== */

test('T-14 ⭐⭐⭐ R-05 el diff de F-122 no introduce DDL, migraciones ni `delete`', () => {
  const tocados = archivosTocados();
  assert.deepEqual(
    tocados.filter((p) => p.startsWith('supabase/migrations/')),
    [],
    'R-05: SIN DDL, sin migraciones. Incluye NO crear la unique constraint que ' +
      '`locations_reference` no tiene (E-4): la carga se resuelve con `WHERE NOT EXISTS`.'
  );
  assert.deepEqual(
    tocados.filter((p) => p.startsWith('supabase/functions/')),
    [],
    'la copia edge no se toca'
  );
  // El set de migraciones en disco es el mismo que en el ancla.
  const ahora = readdirSync(resolve(REPO, 'supabase/migrations')).sort();
  const enBase = git('ls-tree', '--name-only', BASE, 'supabase/migrations/')
    .split('\n')
    .filter(Boolean)
    .map((p) => p.split('/').pop() as string)
    .sort();
  assert.deepEqual(ahora, enBase);

  for (const rel of tocados) {
    if (!/\.(ts|tsx|mjs)$/.test(rel) || rel.startsWith('tests/')) continue;
    let src: string;
    try {
      src = stripComments(read(rel));
    } catch {
      continue;
    }
    assert.ok(!/\.delete\(/.test(src), `${rel} introdujo un \`delete\``);
    assert.ok(
      !/\b(DROP|ALTER)\s+TABLE\b|\bCREATE\s+(TABLE|UNIQUE|INDEX)\b|\bDELETE\s+FROM\b/i.test(
        src
      ),
      `${rel} introdujo DDL`
    );
  }
});

test('T-14 ⭐⭐⭐ R-05 `prompts/**` y `sync-prompts` no se tocan (sin `prompts:apply`)', () => {
  const tocados = archivosTocados();
  assert.deepEqual(
    tocados.filter((p) => p.startsWith('prompts/')),
    [],
    'este frente NO toca `prompts/**` ⇒ no hay `prompts:check` ni `prompts:apply`, y ' +
      'cero escrituras a `prompt_versions`'
  );
  assert.deepEqual(
    tocados.filter((p) => p.includes('sync-prompts')),
    []
  );
  for (const rel of tocados) {
    if (!/\.(ts|tsx|mjs)$/.test(rel) || rel.startsWith('tests/')) continue;
    let src: string;
    try {
      src = stripComments(read(rel));
    } catch {
      continue;
    }
    assert.ok(
      !/prompts:apply|prompts:check|sync-prompts/.test(src),
      `${rel} invoca \`sync-prompts\` — acción de FRONTERA, gateada (F-074)`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ R-35 — las 2 filas con marcador NO se tocan                   */
/* ================================================================== */

test('T-14 ⭐⭐⭐ R-35 nada en el diff muta las filas de negocio, ni las 2 con marcador', () => {
  const ids = [
    'e24ddff3',
    '122f3593',
    'be43470f',
    'e1ad789c',
    '4a59cbff',
    'b016f86b'
  ];
  for (const rel of archivosTocados()) {
    if (rel.startsWith('tests/')) continue; // los tests las CITAN como fixtures (R-36)
    let src: string;
    try {
      src = read(rel);
    } catch {
      continue;
    }
    for (const id of ids) {
      if (!src.includes(id)) continue;
      // Aparece: sólo puede ser en un comentario o en la cabecera del `.sql`. Nunca en un
      // `UPDATE`/`INSERT`/`delete` que la toque.
      const codigo = /\.(ts|tsx)$/.test(rel)
        ? stripComments(src)
        : src
            .split('\n')
            .filter((l) => !/^\s*--/.test(l))
            .join('\n');
      assert.ok(
        !codigo.includes(id),
        `${rel} menciona la fila \`${id}\` en CÓDIGO. Las filas de negocio son deuda del ` +
          'OPERADOR: F-122 las hace visibles (R-23), no las corrige (R-05/R-35).'
      );
    }
  }
  // Y la única escritura a producción del frente es el `INSERT` de la tabla de REFERENCIA.
  const seed = 'supabase/seed/locations_ca.sql';
  const sql = read(seed)
    .split('\n')
    .filter((l) => !/^\s*--/.test(l))
    .join('\n');
  assert.ok(!/\bclients\b|\bbriefs\b|\boffers\b|\bbuyer_personas\b/i.test(sql));
  assert.match(sql, /^\s*INSERT INTO locations_reference/);
});

/* ================================================================== */
/*  ⭐⭐ R-07 — `other` no se rehabilita en ninguna parte                */
/* ================================================================== */

test('T-14 ⭐⭐ R-07 ningún archivo tocado persiste `other` como valor de `clients.industry`', () => {
  for (const rel of archivosTocados()) {
    if (!/\.(ts|tsx)$/.test(rel) || rel.startsWith('tests/')) continue;
    let src: string;
    try {
      src = stripComments(read(rel));
    } catch {
      continue;
    }
    assert.ok(
      !/industry:\s*['"`]other['"`]/.test(src),
      `${rel}: \`other\` = ausencia de industria declarada (F-121 R-15). El Slice A ` +
        'captura el rubro REAL; no rehabilita el token (R-07).'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ R-04 — el contrato de 28 claves + `raw_text` sigue intacto      */
/* ================================================================== */

test('T-14 ⭐⭐ el contrato del brief (F-116) y `interface BriefFields` no cambian', () => {
  const rel = 'prompts/brief/system_prompt.md';
  assert.equal(read(rel), desde(rel), '`prompts/**` no se toca');
  const page = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
  const iface = (src: string): string => {
    const m = /interface BriefFields \{([\s\S]*?)\n\}/.exec(src);
    assert.ok(m, '`page.tsx` ya no declara `interface BriefFields`');
    return norm(m[1]);
  };
  assert.equal(
    iface(read(page)),
    iface(desde(page)),
    'el otro lado del contrato de F-116 queda intacto: F-122 no agrega ni quita campos ' +
      'del Brief'
  );
});
