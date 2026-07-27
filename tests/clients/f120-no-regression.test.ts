/**
 * F-120 — T-16 — **El perímetro completo de no-regresión**
 * (R-39, R-41, R-42, R-43, R-47, R-49, R-50, R-51).
 *
 * F-120 es **consumidora, no autora**: la maquinaria de decisión ya existe y está probada
 * (`pickCanonicalOffer` F-109, `pickCanonicalContentRow` F-113, `resolveGenerationSource`
 * F-119). Lo que faltaba era **una superficie que la use para mostrar algo**. Este archivo
 * fija el reverso de esa afirmación: **nada de lo que F-120 consume puede haber cambiado**, y
 * nada de lo que F-120 declaró fuera de scope puede haberse colado.
 *
 * Ancla FIJA `76e7637`, **nunca `HEAD`** (CL-107 / F-118 H-5 / F-119 R-37): verde en el
 * working tree **sin commit** y sensible a cualquier edición posterior.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

const BASE = '76e7637';
const desde = (rel: string): string =>
  execFileSync('git', ['show', `${BASE}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });

const FICHA_REL = 'src/app/(app)/clients/[id]/page.tsx';
const CORE_PAGE_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const ROUTE_REL = 'src/app/api/generate-content/route.ts';

const FICHA = read(FICHA_REL);
const CORE_PAGE = read(CORE_PAGE_REL);

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * Los archivos que F-120 toca respecto de la baseline.
 *
 * ⚠️ **Incluye los `untracked`.** `git diff --name-only` sólo ve lo que está en el índice o
 * en el árbol: mientras los archivos NUEVOS de la feature (`ofv-view.ts`, `ofv-panel.tsx`,
 * los tests) están *untracked*, un guard que se apoye sólo en el diff **no los escanea** y
 * se declara verde sin haberlos mirado — y empieza a mirarlos recién al commitear. Es la
 * misma clase de defecto que el pathspec de más abajo: **un veredicto que depende del estado
 * del índice en vez del mundo que dice medir**.
 *
 * **Alcance exacto de la equivalencia entre estados — MEDIDO, no prometido.** Uniendo ambas
 * fuentes, el conjunto resulta **idéntico byte a byte** en los dos estados: **15 entradas sin
 * commitear y 15 commiteado**, mismos paths, mismo orden. Se verificó en las **cuatro**
 * combinaciones de {estado} × {`diff.renames` por defecto, `diff.renames=false`}.
 *
 * Lo que sí varía —y por eso el `-M` explícito de abajo— **no es el estado sino la
 * CONFIGURACIÓN de git del que corre el test**: sin detección de renames el conjunto pasa a
 * **16** en ambos estados, porque aparece además la **ruta PRE-movimiento** de
 * `brandboard-tab.tsx` (`src/app/(app)/onboarding/brief/[clientId]/…`). Esa entrada extra es
 * **inerte** para todo assert de este archivo (no existe en disco ⇒ el bucle sale por su
 * `try/catch continue`, y la lista de autorizados ya la contempla), así que el veredicto no
 * cambiaba; pero **el conjunto medido sí cambiaba con el entorno**, que es otra forma del
 * mismo defecto. El `-M` lo fija: **15 en los dos estados y bajo las dos configuraciones**.
 */
const archivosTocados = (): string[] =>
  [
    // `-M` EXPLÍCITO: el conjunto no puede depender del `diff.renames` del entorno.
    ...git('diff', '--name-only', '-M', BASE).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n')
  ]
    .filter(Boolean)
    // Ruido de entorno local que no forma parte de la feature.
    .filter(
      (p) => !p.startsWith('supabase/.temp/') && !p.startsWith('.claude/')
    )
    .filter((p, i, a) => a.indexOf(p) === i)
    .sort();

/* ================================================================== */
/*  R-39 — el resto de la ficha, intacto                               */
/* ================================================================== */

test('T-16 R-39 la ficha conserva sus `TabsTrigger` previos y su orden relativo', () => {
  const previos = [
    'overview',
    'diagnostic',
    'credentials',
    'nap',
    'brief',
    'photos',
    'gbp',
    'deliverable',
    'readiness',
    'presencia'
  ];
  let anterior = -1;
  for (const v of previos) {
    const i = FICHA.indexOf(`<TabsTrigger value='${v}'`);
    assert.ok(i > 0, `la ficha perdió el tab \`${v}\``);
    assert.ok(i > anterior, `el orden de los tabs cambió en \`${v}\``);
    anterior = i;
    assert.match(FICHA, new RegExp(`<TabsContent value='${v}'`));
  }
  // Y el único tab AÑADIDO es el Brandboard.
  const ahora = (FICHA.match(/<TabsTrigger value='/g) ?? []).length;
  const antes = (desde(FICHA_REL).match(/<TabsTrigger value='/g) ?? []).length;
  assert.equal(ahora, antes + 1, 'F-120 añade exactamente UN tab a la ficha');
});

test('T-16 R-39 la checklist, la timeline, el control de transición y los badges del GBP siguen cableados', () => {
  const CODE = stripComments(FICHA);
  for (const [que, patron] of [
    ['checklist de progreso', /setProgress\(\{/],
    ['transición de estado (F-088)', /persistClientStatus\(/],
    ['confirmación de transición (F-088)', /confirmStatusChange/],
    ['carril lineal (F-088 R-13)', /statusStepIndex\(/],
    ['origen del GBP (F-087)', /GBP_MODE_LABELS/],
    ['lifecycle del GBP (F-087)', /GBP_LIFECYCLE_LABELS/],
    ['entregable (F-092/093/100)', /buildDeliverableSummary\(/],
    ['link público del entregable (F-093)', /resolveDeliverableLinkAction\(/],
    ['snapshot del entregable (F-100)', /buildDeliverableSnapshot/],
    ['ClientAssetHub (F-094)', /<ClientAssetHub/],
    ['readiness', /<ReadinessPanelBody/]
  ] as const) {
    assert.match(CODE, patron, `la ficha perdió: ${que}`);
  }
});

/* ================================================================== */
/*  R-41 — la superficie de onboarding, intacta salvo lo autorizado    */
/* ================================================================== */

test('T-16 ⭐ R-41 las 3 consultas de CARGA del núcleo son BYTE-IDÉNTICAS a `76e7637`', () => {
  const base = desde(CORE_PAGE_REL);
  const cargas = (src: string, tabla: string): string[] => {
    const out: string[] = [];
    const needle = `.from('${tabla}')`;
    let i = src.indexOf(needle);
    while (i >= 0) {
      const fin = src.indexOf(';', i);
      const stmt = src.slice(i, fin + 1);
      if (/\.maybeSingle\(\)/.test(stmt)) out.push(stmt);
      i = src.indexOf(needle, fin);
    }
    return out;
  };
  for (const tabla of ['briefs', 'buyer_personas', 'offers']) {
    assert.deepEqual(
      cargas(CORE_PAGE, tabla),
      cargas(base, tabla),
      `${tabla}: la lectura sin filtro de \`status\` es INTENCIONAL — existe para que el ` +
        'operador siga editando su borrador. F-120 no la toca (R-41)'
    );
  }
});

test('T-16 ⭐ R-41 las 3 consultas de señal `approved` y `GenerationSourceNotice` siguen vivas', () => {
  const CODE = stripComments(CORE_PAGE);
  for (const tabla of ['briefs', 'buyer_personas', 'offers']) {
    assert.match(
      CODE,
      new RegExp(
        `from\\(\\s*'${tabla}'\\s*\\)[\\s\\S]{0,300}?\\.eq\\(\\s*'status',\\s*'approved'\\s*\\)`
      ),
      `${tabla}: desapareció la consulta de señal \`approved\` de F-119`
    );
  }
  assert.equal(
    (CODE.match(/<GenerationSourceNotice/g) ?? []).length,
    3,
    'el aviso de F-119 sigue montado en los 3 tabs del núcleo'
  );
  assert.equal(
    (CODE.match(/resolveGenerationSource\s*\(/g) ?? []).length,
    3,
    'una resolución por artefacto (brief, persona, OFV)'
  );
  // La cadena de gates del núcleo.
  assert.match(CODE, /const\s+briefApproved\s*=/);
  assert.match(CODE, /const\s+personaApproved\s*=/);
  assert.match(CODE, /disabled=\{!briefApproved\}/);
  assert.match(CODE, /disabled=\{!personaApproved\}/);
  // Los 6 `INSERT` derivados del seam de `version` (F-119).
  assert.equal(
    (CODE.match(/await\s+nextVersionFor\s*\(/g) ?? []).length,
    6,
    'los 6 `INSERT` siguen derivando la `version` del seam'
  );
});

test('T-16 ⭐ R-41 `f113-source-guards` es BYTE-IDÉNTICO a `76e7637`: pasa SIN haber sido editado', () => {
  const rel = 'tests/onboarding/f113-source-guards.test.ts';
  assert.equal(
    read(rel),
    desde(rel),
    'H-3: F-120 no modifica ninguna de las 6 consultas del núcleo ni la procedencia de los ' +
      'campos editables ⇒ este guard debe quedar verde SIN una sola edición. Es el control ' +
      'de no-regresión de (b) heredado de F-119.'
  );
});

/**
 * ⚠️ **CRUCE NO PREVISTO POR EL SPEC — declarado, no silenciado (CP-04).**
 *
 * `specs/F-120/` (R-41, `tasks.md` constricción 2, `design.md` §10.3 fila 5) preveía que
 * **también** `tests/onboarding/f119-ui-source-guards.test.ts` quedara byte-idéntico. **No
 * pudo ser**, y la razón es mecánica: su test `T-10 ⭐ R-29` compara el **conteo de
 * `disabled`** de la superficie del núcleo contra un ancla fija, y el `TabsTrigger` del
 * Brandboard que F-120 **debe** retirar (R-23) **se lleva un `disabled` consigo** ⇒ 11 ≠ 12.
 *
 * Se re-ancló **un solo `assert`** de ese archivo, preservando y **endureciendo** su
 * intención literal (*"no puede AÑADIR ningún gate nuevo"*), con ancla FIJA `76e7637` y
 * verificación **nominal** de que la única baja es la del Brandboard. Este test fija que **el
 * resto del archivo no se tocó**: si alguien aprovechara el re-anclaje para debilitar otro
 * guard de F-119, esto queda rojo.
 */
test('T-16 ⭐ R-41/R-45 `f119-ui-source-guards`: el ÚNICO cambio es el re-anclaje declarado del contador de `disabled`', () => {
  const rel = 'tests/onboarding/f119-ui-source-guards.test.ts';
  const ahora = read(rel);
  const base = desde(rel);
  // (1) El re-anclaje está DECLARADO por escrito en el propio archivo (R-45).
  assert.match(
    ahora,
    /⤫\s*F-120/,
    'el cruce debe declararse en el archivo, no ocultarse'
  );
  assert.match(ahora, /NO\s*\*{0,2}\s*PREVISTO/i);
  // (2) Ancla FIJA, nunca `HEAD`.
  assert.match(ahora, /`76e7637:\$\{PAGE_REL\}`/);
  assert.ok(
    !/show['"`,\s]*\+?\s*`HEAD:/.test(ahora) &&
      !ahora.includes('`HEAD:${PAGE_REL}`'),
    'R-45: un guard anclado a `HEAD` vuelve a verde por movimiento del ancla al commitear'
  );
  // (3) El delta está CONTENIDO: sólo el bloque del contador, ningún otro `test(` tocado.
  const nombresDeTest = (src: string): string[] =>
    (src.match(/^test\('([^']+)'/gm) ?? []).map((s) =>
      s.replace(/^test\('|'$/g, '')
    );
  assert.deepEqual(
    nombresDeTest(ahora),
    nombresDeTest(base),
    'el re-anclaje no puede añadir, quitar ni renombrar ningún test de F-119'
  );
  // (4) Los demás guards de F-119 siguen exigiendo lo mismo, literalmente.
  for (const invariante of [
    'delta visual CERO',
    'BYTE-IDÉNTICAS a `2c072b6`',
    'CERO literales `version: 1` residuales',
    'no promueve, no copia, no aprueba y no escribe NADA',
    'los campos se pueblan desde la fila EDITABLE'
  ]) {
    assert.ok(
      ahora.includes(invariante),
      `el re-anclaje debilitó: «${invariante}»`
    );
  }
  // (5) Y las líneas eliminadas del archivo son SÓLO las del assert re-anclado.
  const eliminadas = git('diff', BASE, '--', rel)
    .split('\n')
    .filter((l) => l.startsWith('-') && !l.startsWith('---'))
    .map((l) => l.slice(1).trim())
    .filter((l) => l.length > 0);
  for (const l of eliminadas) {
    assert.ok(
      /2c072b6|disabled|contar\(|assert\.equal\(|base|PAGE_CODE|\);|F-119 no puede añadir|^\/\/|^\)|const base|cwd: REPO|encoding|maxBuffer|execFileSync|show|El conteo/.test(
        l
      ),
      `línea eliminada FUERA del assert re-anclado: «${l}»`
    );
  }
});

/* ================================================================== */
/*  R-42 / R-43 — los seams y los write-paths, byte-idénticos          */
/* ================================================================== */

test('T-16 ⭐ R-42 los 4 seams que F-120 CONSUME son BYTE-IDÉNTICOS a `76e7637`', () => {
  for (const rel of [
    'src/lib/offers/select-canonical.ts',
    'src/lib/onboarding/select-canonical-row.ts',
    'src/lib/onboarding/generation-source.ts',
    'src/lib/onboarding/next-version.ts'
  ]) {
    assert.equal(
      read(rel),
      desde(rel),
      `${rel}: F-120 CONSUME el tie-break, no lo modifica (R-42/F-119 R-14)`
    );
  }
});

test('T-16 R-42 los read-paths del generador siguen intactos', () => {
  const ROUTE = read(ROUTE_REL);
  assert.equal(ROUTE, desde(ROUTE_REL), 'F-120 no toca el generador');
  assert.match(ROUTE, /pickCanonicalOffer\s*\(/);
  assert.match(ROUTE, /pickCanonicalContentRow\s*\(/);
});

test('T-16 ⭐ R-43 los write-paths son BYTE-IDÉNTICOS a `76e7637` (F-120 no escribe)', () => {
  for (const rel of [
    'src/lib/offers/write-path.ts',
    'src/lib/briefs/write-path.ts'
  ]) {
    assert.equal(read(rel), desde(rel), `${rel}: R-05 — F-120 es sólo lectura`);
  }
  assert.match(
    read('src/lib/offers/write-path.ts'),
    /export\s+function\s+buildOfvWritePayload/
  );
  const BRIEFS_WP = read('src/lib/briefs/write-path.ts');
  assert.match(BRIEFS_WP, /export\s+function\s+buildBriefWritePayload/);
  assert.match(BRIEFS_WP, /export\s+function\s+resolveWriteMode/);
  // Y el path compartido de `generate-content/route.ts` sigue usándolos.
  assert.match(read(ROUTE_REL), /resolveWriteMode\s*\(/);
});

/* ================================================================== */
/*  ⭐ R-47 — sin prompts, sin edge, sin DDL, sin delete, sin migración */
/* ================================================================== */

test('T-16 ⭐ R-47 `prompts/**` sin cambios y ningún `meta.json` con versión nueva', () => {
  const tocados = archivosTocados();
  assert.deepEqual(
    tocados.filter((p) => p.startsWith('prompts/')),
    [],
    'F-120 no toca prompts ⇒ NO hay nada que sincronizar (no hay paso `apply`)'
  );
  assert.deepEqual(
    tocados.filter((p) => p.endsWith('meta.json')),
    []
  );
});

test('T-16 ⭐ R-47 la copia edge no se toca y no hay migraciones nuevas', () => {
  const tocados = archivosTocados();
  assert.deepEqual(
    tocados.filter((p) => p.startsWith('supabase/functions/')),
    []
  );
  assert.deepEqual(
    tocados.filter((p) => p.startsWith('supabase/migrations/')),
    []
  );
  const ahora = readdirSync(resolve(REPO, 'supabase/migrations')).sort();
  const enBase = git('ls-tree', '--name-only', BASE, 'supabase/migrations/')
    .split('\n')
    .filter(Boolean)
    .map((p) => p.split('/').pop() as string)
    .sort();
  assert.deepEqual(ahora, enBase);
});

/**
 * **UN solo criterio** de "esto invoca el sincronizador de prompts", usado por las DOS
 * exploraciones de este test: el barrido **por archivo** (que ve los `untracked`) y el
 * barrido **por diff** (que ve los renombrados y los borrados). Estaban divergiendo — el
 * barrido por archivo sólo miraba `sync-prompts`, así que un `npm run prompts:apply` metido
 * en un archivo NUEVO todavía sin commitear **no lo detectaba ninguno de los dos**: el
 * primero por regex más laxa, el segundo porque el diff no ve lo untracked. Unificado, el
 * guard muerde **en los dos estados y sobre las dos clases de archivo**.
 *
 * `RegExp` sin flag `g` a propósito: `.test()` con `g` es *stateful* (`lastIndex`) y daría
 * falsos negativos alternados al reusarse en un bucle.
 */
const SYNC_PROMPTS_RE = /prompts:apply|prompts:check|sync-prompts/;

test('T-16 ⭐ R-47 cero `sync-prompts`, cero `.delete(` y cero DDL en los archivos tocados', () => {
  for (const rel of archivosTocados()) {
    if (!/\.(ts|tsx|md)$/.test(rel)) continue;
    let src: string;
    try {
      src = read(rel);
    } catch {
      continue; // archivo eliminado por el `git mv`
    }
    if (rel.startsWith('tests/')) continue; // los guards NOMBRAN lo prohibido para prohibirlo
    assert.ok(!/\.delete\(/.test(src), `${rel} introdujo un \`delete\``);
    assert.ok(
      !/\b(DROP|ALTER)\s+TABLE\b|\bCREATE\s+TABLE\b|\bDELETE\s+FROM\b/i.test(
        src
      ),
      `${rel} introdujo DDL`
    );
    assert.ok(
      !SYNC_PROMPTS_RE.test(src),
      `${rel} invoca \`sync-prompts\` — prohibido en todo el tramo (ni \`check\` ni \`apply\`)`
    );
  }
  // Y el diff del CÓDIGO DE PRODUCTO no contiene ninguna invocación del script.
  //
  // ⚠️ **El pathspec excluye `tests/` por la MISMA razón que el `continue` del bucle de
  // arriba:** un guard **nombra lo prohibido para poder prohibirlo**, así que un escaneo de
  // diff sin path-scope **se encuentra a sí mismo**. Sin esta exención, este assert es verde
  // mientras el archivo está *untracked* (el diff no lo ve) y **ROJO PARA SIEMPRE desde el
  // primer `git add`** — la **forma espejo** del defecto de H-5: no *"verde sólo DESPUÉS del
  // commit"*, sino *"verde sólo ANTES"*. Ambas son el mismo error: un guard cuyo veredicto
  // depende del estado del índice y no del mundo que dice medir.
  //
  // ⇒ **Criterio: el chequeo completo de un guard es "verde en los DOS estados"** — working
  // tree sin commitear **y** commiteado. Anclar a commit fijo cubre una mitad; acotar el
  // pathspec cubre la otra.
  //
  // La intención NO se debilita: si el **código de producto** introdujera una llamada a
  // `sync-prompts`, este assert sigue poniéndose rojo (probado por mutación, T-19).
  const diffDeProducto = git('diff', '-M', BASE, '--', '.', ':(exclude)tests');
  assert.ok(
    !SYNC_PROMPTS_RE.test(diffDeProducto),
    'el código de producto no puede invocar `sync-prompts` (ni `check` ni `apply`): F-120 ' +
      'no toca `prompts/**` ⇒ no hay nada que sincronizar, y no hay paso `apply`'
  );
  // Anti-inerte: si el pathspec dejara fuera todo (o dejara fuera justo lo que importa), el
  // assert de arriba sería trivialmente verde y el guard estaría muerto **sin avisar**.
  //
  // ⚠️ Los dos chequeos se hacen sobre **la LISTA DE ARCHIVOS** (`--name-only`), no sobre el
  // TEXTO del diff. Sobre el texto, `docs/brandboard-placement.md` —que **nombra** la ruta de
  // la ficha en su prosa— satisfaría el chequeo **por mención** aunque el pathspec hubiera
  // dejado el archivo fuera: el assert diría medir *presencia* y estaría midiendo *prosa*. Es
  // exactamente la familia de defecto que este bloque viene a cerrar, una capa más abajo.
  const archivosDelDiff = git(
    'diff',
    '--name-only',
    '-M',
    BASE,
    '--',
    '.',
    ':(exclude)tests'
  )
    .split('\n')
    .filter(Boolean);
  assert.ok(
    archivosDelDiff.length > 0,
    'el pathspec dejó fuera TODO el diff de producto: el guard quedaría inerte'
  );
  assert.ok(
    archivosDelDiff.includes(FICHA_REL),
    `el diff de producto ya no contiene \`${FICHA_REL}\` — la ficha es el archivo central de ` +
      'F-120; si no está, el pathspec está mal y el guard no está mirando lo que dice mirar'
  );
});

/* ================================================================== */
/*  R-49 / R-50 / R-51 — los límites declarados, verificados            */
/* ================================================================== */

test('T-16 ⭐ R-49 el panel/diff de procedencia sigue DIFERIDO: cero comparador de filas', () => {
  const PANEL = stripComments(read('src/app/(app)/clients/[id]/ofv-panel.tsx'));
  const VIEW = stripComments(read('src/lib/offers/ofv-view.ts'));
  for (const [rel, src] of [
    ['ofv-panel.tsx', PANEL],
    ['ofv-view.ts', VIEW],
    ['ficha', stripComments(FICHA)]
  ] as const) {
    for (const prohibido of [
      'diff',
      'Diff',
      'comparar',
      'Comparar',
      'compare'
    ]) {
      assert.ok(
        !src.includes(prohibido),
        `${rel} introduce «${prohibido}». **El panel/diff (ítem d) queda DIFERIDO** (R-49, ` +
          'DT-02): la SEÑAL ya funciona (F-119) y el panel es expansión de UX sobre algo que ' +
          'no está roto. Además, hoy no hay ningún cliente con `offers` en `diverged` — ' +
          'construir un diff para un estado sin un solo caso en producción es la definición ' +
          'de over-engineering.'
      );
    }
  }
  // Lo que SÍ entra de (d): el estado y la identidad de la fila canónica — el titular.
  assert.match(PANEL, /canonicalId/);
  assert.match(PANEL, /source\.state/);
});

test('T-16 ⭐ R-50 cero saneamiento, dedup, regeneración o corrección de contenido', () => {
  // ⚠️ En la ficha se examinan **las líneas AÑADIDAS por F-120**, no el archivo entero: el
  // botón "Regenerar link" del entregable público (F-093 R-04/R-05) es preexistente y no
  // tiene nada que ver con regenerar contenido del núcleo.
  const anadidasEnLaFicha = git('diff', BASE, '--', FICHA_REL)
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');
  const superficies = [
    ['ficha (líneas añadidas)', anadidasEnLaFicha],
    [
      'ofv-panel.tsx',
      stripComments(read('src/app/(app)/clients/[id]/ofv-panel.tsx'))
    ],
    ['ofv-view.ts', stripComments(read('src/lib/offers/ofv-view.ts'))]
  ] as const;
  for (const [rel, src] of superficies) {
    for (const prohibido of [
      'dedup',
      'sanitiz',
      'sanear',
      'regenerar',
      'regenerate',
      'renumer',
      '.delete(',
      '.update(',
      '.upsert('
    ]) {
      assert.ok(
        !src.includes(prohibido),
        `${rel} contiene «${prohibido}». La OFV \`a6c66d5c\` (con urgencia y prueba social ` +
          'FABRICADAS pre-F-104), las personas huecas, los duplicados de SCS y el shadow ' +
          '`b106ad61` **quedan como están y se muestran tal cual** (R-50): la vista es un ' +
          'espejo, no un corrector — y hacer visible la deuda de datos es parte del valor.'
      );
    }
  }
});

test('T-16 ⭐ R-51 la ficha NO añade vista de contenido de `briefs` ni `buyer_personas`', () => {
  const CODE = stripComments(FICHA);
  for (const tabla of ['briefs', 'buyer_personas']) {
    const i = CODE.indexOf(`.from('${tabla}')`);
    assert.ok(i > 0);
    const stmt = CODE.slice(i, i + 400);
    assert.match(
      stmt,
      /\.select\(\s*'status'\s*\)/,
      `${tabla}: sigue siendo un chequeo de EXISTENCIA. La regla, para que viaje con el ` +
        'requisito: el selector canónico es obligatorio cuando se muestra CONTENIDO; para ' +
        'existencia, `.eq("status","approved").limit(1)` es correcto. Y si un incremento ' +
        'futuro mostrara su contenido, DEBERÁ usar `pickCanonicalContentRow` — el fixture ' +
        'ya está medido: SCS `e24ddff3…`, 4 briefs y 3 personas `approved`, todas en v1.'
    );
  }
  // El panel proyecta OFV y nada más.
  const PANEL = stripComments(read('src/app/(app)/clients/[id]/ofv-panel.tsx'));
  assert.ok(!PANEL.includes('briefs'));
  assert.ok(!PANEL.includes('buyer_personas'));
});

/* ================================================================== */
/*  Perímetro del diff: sólo los archivos que el diseño autoriza        */
/* ================================================================== */

test('T-16 el diff de F-120 toca SÓLO los archivos que `design.md` §10.1/§10.3 autoriza', () => {
  const autorizados = new Set([
    // §10.1 — código
    'src/lib/offers/ofv-view.ts',
    'src/app/(app)/clients/[id]/ofv-panel.tsx',
    'src/app/(app)/clients/[id]/page.tsx',
    'src/components/brandboard/brandboard-tab.tsx',
    'src/app/(app)/onboarding/brief/[clientId]/brandboard-tab.tsx',
    'src/app/(app)/onboarding/brief/[clientId]/page.tsx',
    'docs/brandboard-placement.md',
    // §10.3 — guards re-anclados (2 previstos + 1 declarado)
    'tests/onboarding/f117-declarations.test.ts',
    'tests/personas/f117-no-regression.test.ts',
    'tests/onboarding/f119-ui-source-guards.test.ts'
  ]);
  const inesperados = archivosTocados().filter(
    (p) =>
      !autorizados.has(p) &&
      !p.startsWith('tests/clients/f120-') &&
      !p.startsWith('tests/personas/f120-')
  );
  assert.deepEqual(
    inesperados,
    [],
    'cualquier archivo fuera de la lista es scope-creep no declarado'
  );
});
