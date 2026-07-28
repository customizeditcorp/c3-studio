/**
 * F-121 — T-13 — **Ancla fija y criterio de los DOS estados** (R-33).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * LA LECCIÓN QUE ESTE TEST CODIFICA
 * ─────────────────────────────────────────────────────────────────────────────────
 * Un guard puede estar verde **sin medir lo que dice** (CL-107 H-5, CL-109 MUT-6,
 * `feedback_guards_measure_index_not_world`). Las tres formas vistas en el arco:
 *
 *   1. **anclado a `HEAD`** — verde antes de commitear y verde después, porque el ancla
 *      se mueve con el commit: afirma algo que ya es falso;
 *   2. **ciego a los `untracked`** — se declara verde sin haber leído los archivos NUEVOS
 *      de la feature, y empieza a mirarlos recién al commitear;
 *   3. **verde en UN solo estado** — el veredicto depende del índice, no del mundo.
 *
 * El criterio COMPLETO es **verde en los DOS estados**: working tree sin commitear **y**
 * commiteado. Este test hace exigible la parte estática (ancla fija, path-scope,
 * untracked); el ejercicio de los dos estados se corre y se reporta en T-13/T-15.
 *
 * Se AUTO-INCLUYE: barre **todos** los tests `f121-…` leídos de disco (recursivo bajo
 * `tests/`), así que un guard nuevo de F-121 que use `HEAD` queda rojo sin que nadie
 * tenga que acordarse de agregarlo a una lista.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** ⭐ El ancla fija de TODOS los source-guards de F-121: `main` antes de la feature. */
const BASE = 'cb3302d';

const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });

/** Todos los archivos de test de F-121, descubiertos de disco (nunca hardcodeados). */
function testsDeF121(): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(resolve(REPO, dir), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(`${dir}/${e.name}`, r);
      else if (/^f121-.*\.test\.ts$/.test(e.name)) out.push(`tests/${r}`);
    }
  };
  walk('tests', '');
  return out.sort();
}

const ARCHIVOS = testsDeF121();
const fuente = (rel: string): string =>
  readFileSync(resolve(REPO, rel), 'utf8');
/**
 * El CÓDIGO sin comentarios. Los guards de «esta fuente no se ancla a X» miran el
 * código: un comentario que EXPLICA por qué no se usa `HEAD` no es un uso de `HEAD`.
 */
const codigo = (rel: string): string =>
  fuente(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ================================================================== */
/*  ⭐⭐ R-33 — ancla FIJA, jamás `HEAD`                                */
/* ================================================================== */

test('T-13 ⭐⭐ R-33 ningún source-guard de F-121 se ancla a `HEAD`', () => {
  // Anti-no-op: si el descubrimiento no encontrara archivos, todo pasaría solo.
  assert.ok(
    ARCHIVOS.length >= 10,
    `se descubrieron sólo ${ARCHIVOS.length} tests de F-121: el barrido está roto`
  );
  for (const rel of ARCHIVOS) {
    // ⚠️ Carve-out de UNA línea, declarado: **este** archivo escribe el patrón prohibido
    // porque ES el guard que lo prohíbe — igual que `f120-no-regression` excluye
    // `tests/` de su barrido de literales. Sin el carve-out, el guard se encuentra a sí
    // mismo y queda rojo por existir, que es la forma degenerada del defecto que
    // `feedback_guards_measure_index_not_world` nombra ("verde/rojo encontrándose a sí
    // mismo"). Su propio anclaje lo verifican los otros cuatro tests de este archivo.
    if (rel.endsWith('f121-anchor-discipline.test.ts')) continue;
    const src = codigo(rel);
    assert.ok(
      !/['"`]HEAD['"`]|\$\{\s*HEAD\s*\}|HEAD:/.test(src),
      `${rel} se ancla a \`HEAD\`: contra \`HEAD\` el guard vuelve a VERDE por movimiento ` +
        'del ancla al commitear, afirmando algo que ya es falso (CL-107 H-5)'
    );
    assert.ok(
      !/git['"\s,\]]+diff['"\s,\]]*\)/.test(src.replace(/\s+/g, ' ')) ||
        src.includes(BASE),
      `${rel} explora un diff sin ancla explícita`
    );
  }
});

test('T-13 ⭐⭐ R-33 todo `git show`/`git diff` de F-121 usa EXACTAMENTE el ancla `cb3302d`', () => {
  let conAncla = 0;
  for (const rel of ARCHIVOS) {
    const src = codigo(rel);
    // Cada referencia a un commit en estos tests tiene que ser una de las declaradas:
    // el ancla de F-121, o el tip de una feature previa citado en un re-anclaje.
    const commits = Array.from(
      src.matchAll(/['"`]([0-9a-f]{7})(?::|['"`])/g),
      (m) => m[1]
    );
    for (const c of commits) {
      assert.ok(
        [BASE, '76e7637', '2c072b6'].includes(c),
        `${rel} referencia el commit \`${c}\`, que no es el ancla declarada de F-121`
      );
    }
    if (src.includes(BASE)) conAncla++;
  }
  assert.ok(
    conAncla >= 6,
    `sólo ${conAncla} tests de F-121 anclan a \`${BASE}\`: los source-guards deben ` +
      'comparar contra el ancla, no contra sí mismos'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-33 / CL-109 — path-scope e `untracked` en la exploración     */
/* ================================================================== */

test('T-13 ⭐⭐ CL-109 toda exploración de diff de F-121 usa `--name-only`, path-scope e incluye `untracked`', () => {
  const conDiff = ARCHIVOS.filter((rel) =>
    /'diff'\s*,\s*'--name-only'/.test(codigo(rel))
  );
  assert.ok(
    conDiff.length > 0,
    'ningún test de F-121 explora el diff: el perímetro no se está midiendo'
  );
  for (const rel of conDiff) {
    const src = codigo(rel);
    assert.match(
      src,
      /'diff',\s*'--name-only'/,
      `${rel}: la exploración debe usar \`--name-only\``
    );
    assert.match(
      src,
      /'--'/,
      `${rel}: la exploración debe llevar PATH-SCOPE (\`--\`), para que el ruido de ` +
        'entorno no ensucie ni enmascare el veredicto'
    );
    assert.match(
      src,
      /ls-files',\s*'--others',\s*'--exclude-standard'/,
      `${rel}: la exploración debe INCLUIR LOS UNTRACKED. Un \`archivosTocados()\` que ` +
        'no los ve se declara verde sin haber leído los archivos NUEVOS de la feature ' +
        'y empieza a mirarlos recién al commitear (lección CL-109)'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ El ancla EXISTE y es lo que dice ser                           */
/* ================================================================== */

test('T-13 ⭐⭐ `cb3302d` existe, es un commit real y NO contiene ningún artefacto de F-121', () => {
  const tipo = git('cat-file', '-t', BASE).trim();
  assert.equal(tipo, 'commit', 'el ancla no es un commit');
  // El ancla es ANTERIOR a la feature: ninguno de los módulos nuevos existe ahí.
  for (const rel of [
    'src/lib/clients/industry-label.ts',
    'src/lib/onboarding/diagnostic-labels.ts',
    'src/lib/onboarding/brief-inputs.ts',
    'src/lib/onboarding/assembly-guard.ts'
  ]) {
    let existe = true;
    try {
      git('show', `${BASE}:${rel}`);
    } catch {
      existe = false;
    }
    assert.equal(
      existe,
      false,
      `\`${rel}\` ya existía en \`${BASE}\`: el ancla NO es anterior a F-121, así que ` +
        'todo guard que compare contra ella está midiendo mal'
    );
  }
  // Y sí contiene los archivos que F-121 modifica (si no, los `git show` fallarían).
  for (const rel of [
    'src/app/api/generate-content/route.ts',
    'src/app/(app)/clients/[id]/page.tsx',
    'prompts/brief/system_prompt.md',
    'src/lib/onboarding/approval-guard.ts'
  ]) {
    assert.ok(
      git('show', `${BASE}:${rel}`).length > 0,
      `${rel} falta en el ancla`
    );
  }
});

/* ================================================================== */
/*  ⭐ Los re-anclajes declarados: sus rangos son CERRADOS             */
/* ================================================================== */

test('T-13 ⭐ los 4 re-anclajes de guards ajenos cierran su rango en un commit FIJO, no en el working tree', () => {
  // F-121 re-ancló 4 asserts de features previas (rupturas mecánicas declaradas). El
  // criterio de este test: ninguno puede haber quedado con el extremo abierto, porque
  // entonces volvería a romperse con la próxima feature y la deuda se acumula.
  const reanclados: [string, RegExp][] = [
    // helper `archivosTocados` + byte-identidad del generador
    ['tests/clients/f120-no-regression.test.ts', /F120_TIP\s*=\s*'cb3302d'/],
    // líneas eliminadas de la pantalla del núcleo
    ['tests/personas/f117-no-regression.test.ts', /F120_TIP\s*=\s*'cb3302d'/],
    // «F-119 no toca prompts»
    ['tests/onboarding/f119-no-regression.test.ts', /F119_TIP\s*=\s*'76e7637'/],
    // cota EXACTA de create(): 4 → 5 (no es un rango, es un número declarado)
    ['tests/generate-content/f102-constraints.test.ts', /matches\.length,\s*5/]
  ];
  for (const [rel, re] of reanclados) {
    assert.match(
      fuente(rel),
      re,
      `${rel}: el re-anclaje declarado de F-121 no está, o quedó con el extremo abierto`
    );
  }
  // Y cada re-anclaje viene DECLARADO en su lugar, no silenciado.
  for (const [rel] of reanclados) {
    assert.match(
      fuente(rel),
      /⤫\s*\*\*F-121/,
      `${rel}: el re-anclaje debe llevar su declaración ` +
        '(qué se rompió mecánicamente, y por qué la intención se preserva)'
    );
  }
});
