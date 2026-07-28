/**
 * F-122 — T-15 — **Ancla fija y criterio de los DOS estados** (R-39).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * LA LECCIÓN QUE ESTE TEST CODIFICA
 * ─────────────────────────────────────────────────────────────────────────────────
 * Un guard puede estar verde **sin medir lo que dice** (CL-107 H-5, CL-109 MUT-6,
 * `feedback_guards_measure_index_not_world`). Las formas vistas en el arco:
 *
 *   1. **anclado a `HEAD`** — verde antes de commitear y verde después, porque el ancla
 *      se mueve con el commit: afirma algo que ya es falso;
 *   2. **ciego a los `untracked`** — se declara verde sin haber leído los archivos NUEVOS
 *      de la feature, y empieza a mirarlos recién al commitear;
 *   3. **verde en UN solo estado** — el veredicto depende del índice, no del mundo;
 *   4. **encontrándose a sí mismo** — el guard mide el archivo que lo contiene.
 *
 * El criterio COMPLETO es **verde en los DOS estados**: working tree sin commitear **y**
 * commiteado. Este test hace exigible la parte estática (ancla fija, path-scope,
 * untracked, whitespace-tolerancia); el ejercicio de los dos estados se corre y se
 * reporta en T-15/T-16.
 *
 * Se AUTO-INCLUYE: barre **todos** los tests `f122-…` leídos de disco, así que un guard
 * nuevo de F-122 que use `HEAD` queda rojo sin que nadie tenga que agregarlo a una lista.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** ⭐ El ancla fija de TODOS los source-guards de F-122: `main` antes de la feature. */
const BASE = '9509f6f';
/**
 * ⭐⭐ **[ENMIENDA 2026-07-28 · R-55 — el ancla deja de ser UNA y pasa a ser un CONJUNTO
 * DECLARADO de dos, cada una con su ROL.]**
 *
 * · `9509f6f` (`BASE`) — estado **previo a F-122**. Es contra el que se mide todo lo que
 *   la feature cambió respecto del mundo anterior.
 * · `86fae28` (`POST_OFFLINE`) — estado **posterior al tramo offline aprobado 9/9**. Es
 *   el **único commit donde la regresión de idioma existe**, y por eso el guard de R-53
 *   **debe** anclarse ahí para encontrarse rojo. **Anclarlo a `9509f6f` lo dejaría verde
 *   por ausencia de sujeto** —ahí la línea llevaba el código crudo y el defecto todavía
 *   no había nacido—, que es exactamente el no-op que CL-109 documentó cuatro veces.
 *
 * ⚠️ **La INTENCIÓN del assert de abajo no cambia y no se debilita:** ningún guard puede
 * anclarse a `HEAD` ni a un SHA **no declarado**. Lo que se extiende es el conjunto de
 * SHAs declarados, de uno a dos, cada uno con su rol escrito acá.
 */
const POST_OFFLINE = '86fae28';
/**
 * ⭐⭐ **[BLOQUE G 2026-07-28 · R-57 — TERCERA ancla declarada, con su ROL.]**
 *
 * `5db980a` es el commit donde vive el **defecto espejo** que la §6.1 en vivo destapó: un
 * `clients.industry` fuera de tabla deja el `<select>` **vacío** y el cliente **no
 * editable**. El round-trip de R-57 **debe encontrarse rojo ahí**.
 *
 * ⛔ **Anclarlo a `9509f6f` o a `86fae28` no probaría nada:** en `9509f6f` el vocabulario
 * todavía era cerrado —no existía el rubro libre que hay que releer— y en `86fae28` el
 * tramo de captura recién nacía. Sería **verde por ausencia de sujeto**, el no-op que
 * CL-109 documentó cuatro veces.
 *
 * ⚠️ **La INTENCIÓN del assert de abajo sigue sin debilitarse:** ningún guard puede
 * anclarse a `HEAD` ni a un SHA **no declarado**. El conjunto pasa de dos a tres SHAs,
 * cada uno con su rol escrito acá, y cada uno **en uso** (se exige abajo).
 */
const DEFECTO_ROUNDTRIP = '5db980a';
const ANCLAS_DECLARADAS: readonly string[] = [
  BASE,
  POST_OFFLINE,
  DEFECTO_ROUNDTRIP
];

const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });

/** Todos los archivos de test de F-122, descubiertos de disco (nunca hardcodeados). */
function testsDeF122(): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(resolve(REPO, dir), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(`${dir}/${e.name}`, r);
      else if (/^f122-.*\.test\.ts$/.test(e.name)) out.push(`tests/${r}`);
    }
  };
  walk('tests', '');
  return out.sort();
}

const ARCHIVOS = testsDeF122();
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
/*  ⭐⭐ R-39 — ancla FIJA, jamás `HEAD`                                */
/* ================================================================== */

test('T-15 ⭐⭐ R-39 ningún source-guard de F-122 se ancla a `HEAD`', () => {
  // Anti-no-op: si el descubrimiento no encontrara archivos, todo pasaría solo.
  assert.ok(
    ARCHIVOS.length >= 8,
    `se descubrieron sólo ${ARCHIVOS.length} tests de F-122: el barrido está roto`
  );
  for (const rel of ARCHIVOS) {
    // ⚠️ Carve-out de UNA línea, declarado: **este** archivo escribe el patrón prohibido
    // porque ES el guard que lo prohíbe. Sin el carve-out, el guard se encuentra a sí
    // mismo y queda rojo por existir — la forma degenerada del defecto que
    // `feedback_guards_measure_index_not_world` nombra. Su propio anclaje lo verifican
    // los otros tests de este archivo.
    if (rel.endsWith('f122-anchor-discipline.test.ts')) continue;
    const src = codigo(rel);
    assert.ok(
      !/['"`]HEAD['"`]|\$\{\s*HEAD\s*\}|HEAD:/.test(src),
      `${rel} se ancla a \`HEAD\`: contra \`HEAD\` el guard vuelve a VERDE por movimiento ` +
        'del ancla al commitear, afirmando algo que ya es falso (CL-107 H-5)'
    );
  }
});

test('T-15/T-30 ⭐⭐ R-39/R-55 todo `git show`/`git grep` de F-122 usa una de las anclas DECLARADAS', () => {
  let conAncla = 0;
  for (const rel of ARCHIVOS) {
    const src = codigo(rel);
    const commits = Array.from(
      src.matchAll(/['"`]([0-9a-f]{7})(?::|['"`])/g),
      (m) => m[1]
    );
    for (const c of commits) {
      // ⚠️ [ENMIENDA 2026-07-28 · R-55] Antes: `assert.equal(c, BASE)`. Ahora: pertenencia
      // al CONJUNTO DECLARADO de dos anclas, cada una con su rol arriba. **No se acepta
      // «cualquier SHA» y no se quitó el assert** — un commit fuera del conjunto sigue
      // siendo rojo, y `HEAD` lo prohíbe el test anterior.
      assert.ok(
        ANCLAS_DECLARADAS.includes(c),
        `${rel} referencia el commit \`${c}\`, que no es una de las anclas DECLARADAS de ` +
          `F-122 (${ANCLAS_DECLARADAS.join(', ')}). Un ancla no declarada es una que ` +
          'nadie puede auditar: el guard afirmaría algo sobre un estado que no está escrito.'
      );
    }
    if (commits.some((c) => ANCLAS_DECLARADAS.includes(c))) conAncla++;
  }
  assert.ok(
    conAncla >= 3,
    `sólo ${conAncla} tests de F-122 anclan a una de las anclas declaradas: los ` +
      'source-guards deben comparar contra el ancla, no contra sí mismos'
  );
  // ⭐ Y el ancla POST-OFFLINE tiene que estar EN USO, no sólo declarada: es la única
  // contra la que la regresión de idioma existe (R-53). Si nadie la usara, el conjunto
  // de dos sería una relajación gratuita del assert anterior.
  const conPostOffline = ARCHIVOS.filter((rel) =>
    codigo(rel).includes(POST_OFFLINE)
  );
  assert.ok(
    conPostOffline.length >= 1,
    'ningún guard se ancla a `86fae28`: el conjunto de dos anclas no puede ser una ' +
      'licencia sin uso. El anti-no-op de R-53 EXIGE ese commit — contra `9509f6f` el ' +
      'guard de idioma estaría verde por ausencia de sujeto.'
  );
  // ⭐ [BLOQUE G · R-57] Y lo mismo para la TERCERA: declarar un ancla que nadie usa sería
  // ampliar el conjunto permitido a cambio de nada. El round-trip EXIGE `5db980a`.
  const conDefecto = ARCHIVOS.filter((rel) =>
    codigo(rel).includes(DEFECTO_ROUNDTRIP)
  );
  assert.ok(
    conDefecto.length >= 1,
    'ningún guard se ancla a `5db980a`: el ancla del defecto espejo quedó declarada sin ' +
      'uso, es decir, el conjunto se amplió sin que nada lo necesite. R-57 exige que el ' +
      'round-trip se mida contra el commit donde el defecto vive.'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-39 / CL-109 — path-scope e `untracked` en la exploración      */
/* ================================================================== */

test('T-15 ⭐⭐ CL-109 toda exploración de diff de F-122 usa `--name-only`, path-scope e incluye `untracked`', () => {
  const conDiff = ARCHIVOS.filter((rel) =>
    /'diff'\s*,\s*'--name-only'/.test(codigo(rel))
  );
  assert.ok(
    conDiff.length > 0,
    'ningún test de F-122 explora el diff: el perímetro no se está midiendo'
  );
  for (const rel of conDiff) {
    const src = codigo(rel);
    assert.match(
      src,
      /'diff',\s*'--name-only'/,
      `${rel}: falta \`--name-only\``
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
        '(lección CL-109)'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ El ancla EXISTE y es lo que dice ser                            */
/* ================================================================== */

test('T-15 ⭐⭐ `9509f6f` existe, es un commit real y NO contiene ningún artefacto de F-122', () => {
  assert.equal(
    git('cat-file', '-t', BASE).trim(),
    'commit',
    'el ancla no es un commit'
  );
  // El ancla es ANTERIOR a la feature: ninguno de los módulos nuevos existe ahí.
  for (const rel of [
    'src/lib/clients/industry-input.ts',
    'src/lib/clients/capture-guard.ts',
    'src/lib/clients/locations.ts',
    'src/components/clients/CitySelect.tsx',
    'supabase/seed/locations_ca.sql'
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
      `\`${rel}\` ya existía en \`${BASE}\`: el ancla NO es anterior a F-122, así que ` +
        'todo guard que compare contra ella está midiendo mal'
    );
  }
  // Y sí contiene los archivos que F-122 modifica.
  for (const rel of [
    'src/app/(app)/diagnostic/page.tsx',
    'src/app/(app)/onboarding/brief/[clientId]/page.tsx',
    'src/components/clients/ClientForm.tsx',
    'src/lib/clients/industry-label.ts',
    'src/lib/gbp-slice/knowledge-panel.ts',
    'src/lib/gbp-slice/prompt.ts'
  ]) {
    assert.ok(
      git('show', `${BASE}:${rel}`).length > 0,
      `${rel} falta en el ancla`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ R-39 — el perímetro es el MISMO en los dos estados             */
/* ================================================================== */

const ALCANCE = ['src', 'tests', 'prompts', 'scripts', 'supabase'];
const perimetro = (extra: string[] = []): string[] =>
  [
    ...git(...extra, 'diff', '--name-only', '-M', BASE, '--', ...ALCANCE).split(
      '\n'
    ),
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

test('T-15 ⭐⭐ R-39 el perímetro es INDEPENDIENTE del estado del índice y de la config de git', () => {
  // La unión `diff` ∪ `ls-files --others` es, por construcción, invariante a que los
  // archivos nuevos estén o no en el índice: lo que sale de `--others` al commitear entra
  // por `diff`. Se comprueba además que no dependa del `-M` ni del `diff.renames` del
  // entorno, que es la otra forma del mismo defecto (CL-109).
  assert.deepEqual(
    perimetro(),
    perimetro(['-c', 'diff.renames=false']),
    'el conjunto medido cambia con la CONFIGURACIÓN de git del que corre el test: un ' +
      'veredicto que depende del entorno en vez del mundo que dice medir'
  );
  const p = perimetro();
  assert.ok(p.length > 0, 'el perímetro salió vacío: guard no-op');
  for (const f of p) {
    assert.ok(
      ALCANCE.some((a) => f.startsWith(a + '/')),
      `${f} quedó fuera del path-scope declarado`
    );
  }
  // Y los archivos NUEVOS de F-122 están DENTRO del perímetro, estén o no commiteados.
  // ⚠️ [ENMIENDA 2026-07-28 · ruptura mecánica declarada] `supabase/seed/locations_ca.sql`
  // sale de esta lista porque **el artefacto se ELIMINÓ** con R-24 (T-25/DT-07(b)): no
  // existía en el ancla y ya no existe hoy ⇒ no puede estar en el perímetro, y exigirlo
  // sería exigir la presencia de un archivo que la enmienda retiró a propósito. **Lo que
  // el assert protege —que los archivos NUEVOS de F-122 se lean, estén o no en el
  // índice— se conserva y se AMPLÍA a dos módulos en vez de uno.**
  for (const nuevo of [
    'src/lib/clients/capture-guard.ts',
    'src/lib/clients/locations.ts',
    'src/components/clients/CitySelect.tsx'
  ]) {
    assert.ok(
      p.includes(nuevo),
      `${nuevo} no está en el perímetro: el guard se declararía verde sin haberlo leído`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ R-39 — WHITESPACE-TOLERANCIA                                    */
/* ================================================================== */

test('T-15 ⭐⭐ R-39 toda comparación de CONTENIDO de F-122 es whitespace-tolerante o byte-a-byte declarada', () => {
  // El hook de husky/prettier reformatea al commitear. Un guard que compare un TRAMO de
  // código carácter a carácter pasa antes de commitear y falla después — verde en un solo
  // estado. Las únicas comparaciones byte-a-byte legítimas son contra archivos que F-122
  // declara INTOCABLES (no los toca ⇒ prettier tampoco).
  const intocables = [
    'approval-guard.ts',
    'non-fabrication.ts',
    'pending.ts',
    'compliance.ts',
    'system_prompt.md'
  ];
  for (const rel of ARCHIVOS) {
    // Mismo carve-out declarado que arriba: este archivo NOMBRA los patrones para
    // exigirlos, y medirse a sí mismo sería el guard encontrándose a sí mismo.
    if (rel.endsWith('f122-anchor-discipline.test.ts')) continue;
    const src = codigo(rel);
    for (const m of Array.from(
      src.matchAll(/assert\.equal\(\s*read\(([^)]*)\),\s*desde\(/g)
    )) {
      const arg = m[1];
      assert.ok(
        intocables.some((i) => arg.includes(i)) ||
          arg === 'rel' ||
          arg === 'page',
        `${rel}: comparación byte-a-byte sobre \`${arg}\`, que F-122 SÍ toca ⇒ prettier ` +
          'la rompe al commitear (verde en un solo estado, R-39)'
      );
    }
    // Y donde se compara un TRAMO, se normaliza el whitespace.
    if (/const norm =/.test(src)) {
      assert.match(
        src,
        /replace\(\/\\s\+\/g, ' '\)/,
        `${rel}: declara un normalizador que no normaliza whitespace`
      );
    }
  }
});

/* ================================================================== */
/*  ⭐ Los guards de F-122 no se encuentran a sí mismos                 */
/* ================================================================== */

test('T-15 ⭐ los source-guards de F-122 excluyen `tests/` de lo que miden sobre `src/`', () => {
  for (const rel of ARCHIVOS) {
    const src = codigo(rel);
    if (!/walk\('src/.test(src) && !/fuentes\(\)/.test(src)) continue;
    assert.ok(
      !/walk\('tests'\)/.test(src) ||
        rel.endsWith('f122-anchor-discipline.test.ts'),
      `${rel} barre \`src/\` y \`tests/\` con el mismo criterio: los tests NOMBRAN lo ` +
        'prohibido para prohibirlo, y el guard se encontraría a sí mismo'
    );
  }
});
