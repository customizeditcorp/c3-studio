/**
 * F-113 — T-10 / T-11 — Source-guards de INTEGRACIÓN y de INVARIANTES DUROS.
 *
 * Inspección de fuente (`readFileSync` + `assert.match` **whitespace-tolerante**: `\s*`
 * entre tokens, nunca match de línea literal — el hook husky/prettier reformatea
 * `.ts/.tsx` al commit; lección F-107).
 *
 * **Nota de modalidad (`docs/verification.md §6`, DT-07):** un source-guard prueba
 * claims **sobre la fuente** (filtros preservados, ausencia de `delete`/DDL, fuente
 * única del marcador, `select` superset). La claim de **byte-identidad** NO se prueba
 * acá — es CONDUCTUAL y vive en `f113-no-regression.test.ts` (`assert.equal` sobre el
 * string compuesto).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

const ROUTE = read('src/app/api/generate-content/route.ts');
const GBP_ROUTE = read('src/app/api/generate-gbp/route.ts');
const SELECTOR = read('src/lib/onboarding/select-canonical-row.ts');
const OFFERS_SELECTOR = read('src/lib/offers/select-canonical.ts');
const BRIEF_WRITE_PATH = read('src/lib/briefs/write-path.ts');
const PAGE = read('src/app/(app)/onboarding/brief/[clientId]/page.tsx');

/**
 * La fuente SIN comentarios. Los guards de "esta fuente no menciona X" deben mirar el
 * CÓDIGO, no la prosa: el header del selector documenta el defecto que cierra y por eso
 * nombra `pickCanonicalOffer`, `supabase` y `[PENDIENTE]` en su doc — eso no es una
 * dependencia ni una segunda definición.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const SELECTOR_CODE = stripComments(SELECTOR);
// ⤫ F-119 — mismo criterio que arriba: el guard de "la UI no usa los selectores" mira el
// CÓDIGO, no la prosa. El header del bloque de lecturas `approved` de `page.tsx` NOMBRA
// `pickCanonicalContentRow`/`pickCanonicalOffer` para explicar de dónde sale el criterio —
// eso es documentación, no una dependencia.
const PAGE_CODE = stripComments(PAGE);
const OFFERS_SELECTOR_CODE = stripComments(OFFERS_SELECTOR);

/**
 * Todas las sentencias `.from('<tabla>')` de un archivo, cada una recortada desde
 * `.from(` hasta el `;` que la termina (la cadena no contiene `;` interno). Aísla cada
 * consulta para que las aserciones de una no se filtren a la siguiente.
 */
function statements(src: string, table: string): string[] {
  const out: string[] = [];
  const needle = `.from('${table}')`;
  let i = src.indexOf(needle);
  while (i >= 0) {
    const end = src.indexOf(';', i);
    assert.ok(end > i, `la consulta a ${table} debe terminar en \`;\``);
    out.push(src.slice(i, end + 1));
    i = src.indexOf(needle, end);
  }
  return out;
}

/** Las consultas `approved` (los puntos que F-113 desempata) de una tabla. */
const approvedStatements = (src: string, table: string): string[] =>
  statements(src, table).filter((s) =>
    /\.eq\(\s*'status',\s*'approved'\s*\)/.test(s)
  );

/** Los fallbacks `created_at desc` de cualquier-status (F-109 DT-04, intocables). */
const fallbackStatements = (src: string, table: string): string[] =>
  statements(src, table).filter(
    (s) => !/\.eq\(\s*'status',\s*'approved'\s*\)/.test(s)
  );

/** Columnas del `.select('...')` de una sentencia. */
function selectColumns(stmt: string): string[] {
  const m = stmt.match(/\.select\(\s*'([^']*)'\s*\)/);
  assert.ok(m, 'la consulta debe llevar una proyección explícita de columnas');
  return m[1].split(',').map((c) => c.trim());
}

/* ================================================================== */
/*  T-10 — los 4 puntos de lectura (R-10..R-13, R-15, R-16)           */
/* ================================================================== */

test('T-10 hay EXACTAMENTE 2 consultas `approved` de `briefs` y 2 de `buyer_personas` (contexto + FK)', () => {
  assert.equal(approvedStatements(ROUTE, 'briefs').length, 2);
  assert.equal(approvedStatements(ROUTE, 'buyer_personas').length, 2);
});

test('T-10 ⭐ R-10..R-13 los 4 puntos traen los candidatos SIN `limit(1)`/`maybeSingle()`', () => {
  for (const table of ['briefs', 'buyer_personas']) {
    for (const stmt of approvedStatements(ROUTE, table)) {
      assert.doesNotMatch(
        stmt,
        /\.limit\(\s*1\s*\)/,
        `la consulta approved de ${table} conserva \`limit(1)\`: el desempate quedaría INERTE`
      );
      assert.doesNotMatch(stmt, /\.maybeSingle\(\)/);
    }
  }
});

test('T-10 ⭐ R-16 los 4 puntos preservan INTACTOS `client_id` y `status=approved`', () => {
  for (const table of ['briefs', 'buyer_personas']) {
    for (const stmt of approvedStatements(ROUTE, table)) {
      assert.match(stmt, /\.eq\(\s*'client_id',\s*client_id\s*\)/);
      assert.match(stmt, /\.eq\(\s*'status',\s*'approved'\s*\)/);
      // El `order('version')` sigue: el selector lo REFUERZA, no lo sustituye.
      assert.match(
        stmt,
        /\.order\(\s*'version',\s*\{\s*ascending:\s*false\s*\}\s*\)/
      );
    }
  }
});

test('T-10 ⭐ R-15 los `select` son SUPERSET: ninguna columna previa se perdió, y `content` llegó a los puntos de FK', () => {
  // Contexto (antes `content, raw_text`) — debe conservarlas y sumar las del criterio.
  const contexto = [
    approvedStatements(ROUTE, 'briefs')[0],
    approvedStatements(ROUTE, 'buyer_personas')[0]
  ];
  for (const stmt of contexto) {
    const cols = selectColumns(stmt);
    for (const c of ['content', 'raw_text', 'id', 'version', 'updated_at']) {
      assert.ok(cols.includes(c), `el select de contexto perdió \`${c}\``);
    }
  }
  // FK-linking (antes solo `id`) — `content` es lo que HABILITA el criterio de riqueza.
  const fk = [
    approvedStatements(ROUTE, 'briefs')[1],
    approvedStatements(ROUTE, 'buyer_personas')[1]
  ];
  for (const stmt of fk) {
    const cols = selectColumns(stmt);
    for (const c of ['id', 'version', 'updated_at', 'content']) {
      assert.ok(cols.includes(c), `el select de FK-linking no trae \`${c}\``);
    }
  }
});

test('T-10 ⭐ R-14 los 4 puntos usan EL MISMO selector `pickCanonicalContentRow`', () => {
  assert.match(
    ROUTE,
    /import\s*\{[\s\S]*?pickCanonicalContentRow[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/select-canonical-row'/
  );
  const usos = ROUTE.match(/pickCanonicalContentRow\s*\(/g) ?? [];
  assert.equal(
    usos.length,
    4,
    'deben ser exactamente 4 usos (contexto + FK × 2 tablas)'
  );
  // Y ninguno se resuelve con otro criterio ad-hoc.
  for (const nombre of [
    'briefRows',
    'personaRows',
    'briefFkRows',
    'personaFkRows'
  ]) {
    assert.match(
      ROUTE,
      new RegExp(
        `pickCanonicalContentRow\\s*\\(\\s*\\(\\s*${nombre}\\s*\\?\\?`
      ),
      `el conjunto \`${nombre}\` no se resuelve con el selector`
    );
  }
});

test('T-10 R-14 la fila elegida alimenta TANTO el blob de persona COMO `buildPersonaMethodBlock` (F-112)', () => {
  // Una sola variable `persona` ⇒ imposible que el blob y el bloque canónico
  // provengan de filas distintas.
  assert.match(ROUTE, /const\s+persona\s*=\s*pickCanonicalContentRow\s*\(/);
  assert.match(
    ROUTE,
    /'\\n\\n## BUYER PERSONA \(APROBADO\)\\n'\s*\+\s*\(\s*persona\.raw_text\s*\|\|\s*JSON\.stringify\(\s*persona\.content\s*\)\s*\)/
  );
  assert.match(
    ROUTE,
    /buildPersonaMethodBlock\s*\(\s*\{[\s\S]*?persona:\s*persona\s+as\s+RawPersonaRow[\s\S]*?\}\s*\)/
  );
});

test('T-10 R-14 el FK persona_id/brief_id se asigna desde la fila del selector (procedencia real)', () => {
  assert.match(ROUTE, /let\s+lp[\s\S]{0,80}?=\s*pickCanonicalContentRow\s*\(/);
  assert.match(ROUTE, /let\s+lb[\s\S]{0,80}?=\s*pickCanonicalContentRow\s*\(/);
  assert.match(ROUTE, /insertData\.persona_id\s*=\s*lp\.id/);
  assert.match(ROUTE, /if\s*\(\s*lb\s*\)\s*insertData\.brief_id\s*=\s*lb\.id/);
});

/* ================================================================== */
/*  T-10 — R-17: los fallbacks quedan BYTE-IDÉNTICOS                  */
/* ================================================================== */

test('T-10 ⭐ R-17 los 2 fallbacks (`created_at desc`, cualquier status) siguen INTACTOS', () => {
  for (const table of ['briefs', 'buyer_personas']) {
    const fbs = fallbackStatements(ROUTE, table);
    assert.equal(
      fbs.length,
      1,
      `debe haber exactamente 1 fallback de ${table}`
    );
    const fb = fbs[0];
    assert.match(fb, /\.select\(\s*'id'\s*\)/); // proyección original, sin ampliar
    assert.match(fb, /\.eq\(\s*'client_id',\s*client_id\s*\)/);
    assert.match(
      fb,
      /\.order\(\s*'created_at',\s*\{\s*ascending:\s*false\s*\}\s*\)/
    );
    assert.match(fb, /\.limit\(\s*1\s*\)/);
    assert.match(fb, /\.maybeSingle\(\)/);
    assert.doesNotMatch(
      fb,
      /pickCanonicalContentRow/,
      'DT-03: el fallback NO usa el selector (solo dispara cuando no hay approved)'
    );
  }
});

/* ================================================================== */
/*  T-10 — R-20: superficie NO tocada                                  */
/* ================================================================== */

/**
 * **F-117 (R-24) — GUARD PREEXISTENTE CRUZADO POR DISEÑO. Reescrito preservando la
 * intención, NO borrado ni vaciado.** *(Mismo patrón e idéntica autorización que el
 * cruce de F-113 R-21 sobre los marcadores de F-112.)*
 *
 * `needsBrief` queda **intacto** (10 steps). Lo que cambia es `needsPersona`: F-117 le
 * da de baja `gbp_description` por **CL-092** — el GBP se queda con **brief + OFV**, la
 * buyer persona **no entra**. `gbp_description` produce la descripción del **mismo
 * perfil público de Google** que `/api/generate-gbp` (que ya cumplía), de modo que este
 * segundo camino violaba la decisión del operador **en silencio**.
 *
 * La intención se preserva y se refuerza: conteo exacto, `buyer_persona` fuera, y ahora
 * `gbp_description` **explícitamente ausente**.
 */
test('T-10 R-20 (⤫ F-117 R-24) `needsBrief` intacto (10) y `needsPersona` en 8 con `gbp_description` AUSENTE por CL-092', () => {
  const bloque = (nombre: string): string => {
    const i = ROUTE.search(new RegExp(`const\\s+${nombre}\\s*=`));
    assert.ok(i >= 0, `no se encontró ${nombre}`);
    return ROUTE.slice(i, ROUTE.indexOf('.includes(step)', i));
  };
  const contenido = [
    'gbp_description',
    'gbp_posts',
    'campaign_copy',
    'website_home',
    'website_service',
    'website_location',
    'nurturing',
    'social_content'
  ];
  const brief = bloque('needsBrief');
  for (const s of [...contenido, 'buyer_persona', 'ofv']) {
    assert.ok(brief.includes(`'${s}'`), `needsBrief perdió ${s}`);
  }
  assert.equal((brief.match(/'/g) ?? []).length / 2, 10);

  const persona = bloque('needsPersona');
  // `gbp_description` sale del set de persona (F-117 R-01); el resto se conserva.
  for (const s of [
    ...contenido.filter((s) => s !== 'gbp_description'),
    'ofv'
  ]) {
    assert.ok(persona.includes(`'${s}'`), `needsPersona perdió ${s}`);
  }
  assert.ok(!persona.includes("'buyer_persona'"));
  assert.ok(
    !persona.includes("'gbp_description'"),
    'CL-092 (decisión del operador): el GBP se queda con brief + OFV; la buyer ' +
      'persona NO entra. Reintroducir `gbp_description` acá vuelve a violar la ' +
      'decisión en silencio.'
  );
  assert.equal((persona.match(/'/g) ?? []).length / 2, 8);
});

test('T-10 R-20 encabezados, `raw_text || JSON.stringify(content)` y bloques F-110/F-111/F-112 intactos', () => {
  assert.match(
    ROUTE,
    /'\\n\\n## BRIEF DEL NEGOCIO \(APROBADO\)\\n'\s*\+\s*\(\s*brief\.raw_text\s*\|\|\s*JSON\.stringify\(\s*brief\.content\s*\)\s*\)/
  );
  assert.match(ROUTE, /contextChain\s*\+=\s*'\\nEntregables:/); // F-110
  assert.match(ROUTE, /contextChain\s*\+=\s*'\\nPrueba social:/); // F-110
  assert.match(ROUTE, /contextChain\s*\+=\s*buildOfvMethodLines/); // F-111
  assert.match(ROUTE, /contextChain\s*\+=\s*buildPersonaMethodBlock/); // F-112
  assert.match(ROUTE, /pickCanonicalOffer\s*\(/); // F-109
});

test('T-10 R-20 la orquestación de generación sigue intacta (F-102/F-105/F-064/F-065/F-081)', () => {
  assert.match(ROUTE, /resolveContentTemperature\(/); // F-102
  assert.match(ROUTE, /parseGeneratedContent\(/); // F-102
  assert.match(ROUTE, /checkOfvNonFabrication\(/); // F-105
  assert.match(ROUTE, /attachMethodGrounding\(/); // F-065
  assert.match(ROUTE, /attachValidation\(/); // F-064
  assert.match(ROUTE, /buildLanguageDirective/); // F-081
  assert.match(ROUTE, /resolveWriteMode/); // F-097
});

/* ================================================================== */
/*  T-10 — DT-05: el 5º read-path (`generate-gbp`)                    */
/* ================================================================== */

test('T-10 DT-05 `generate-gbp` trae los briefs approved SIN `limit(1)` y elige con el MISMO selector', () => {
  const stmts = approvedStatements(GBP_ROUTE, 'briefs');
  assert.equal(stmts.length, 1);
  const stmt = stmts[0];
  assert.match(stmt, /\.eq\(\s*'client_id',\s*client_id\s*\)/);
  assert.match(stmt, /\.eq\(\s*'status',\s*'approved'\s*\)/);
  assert.doesNotMatch(stmt, /\.limit\(\s*1\s*\)/);
  assert.doesNotMatch(stmt, /\.maybeSingle\(\)/);
  const cols = selectColumns(stmt);
  for (const c of [
    'id',
    'content',
    'status',
    'created_at',
    'version',
    'updated_at'
  ]) {
    assert.ok(cols.includes(c), `el select de generate-gbp no trae \`${c}\``);
  }
  assert.match(
    GBP_ROUTE,
    /import\s*\{[\s\S]*?pickCanonicalContentRow[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/select-canonical-row'/
  );
  assert.match(
    GBP_ROUTE,
    /const\s+brief\s*=\s*pickCanonicalContentRow\s*\(\s*\(\s*briefRows\s*\?\?/
  );
});

test('T-10 DT-05 el resto de `generate-gbp` sigue intacto (CL-092: el GBP NO consume persona)', () => {
  assert.match(GBP_ROUTE, /readGbpContext\s*\(\s*\{/);
  assert.match(GBP_ROUTE, /brief:\s*brief\s*\?\?\s*null/);
  assert.doesNotMatch(GBP_ROUTE, /buyer_personas|buildPersonaMethodBlock/);
});

/* ================================================================== */
/*  T-11 — INVARIANTES DUROS (R-08, R-09, R-23, R-24)                 */
/* ================================================================== */

test('T-11 ⭐ R-08 el literal `[pendiente]` sigue definido UNA SOLA VEZ en `src/lib`, y el selector lo IMPORTA', () => {
  // Misma forma que el guard de R-07 de F-112 (el literal ENTRECOMILLADO = la
  // definición), extendida a F-113 y endurecida en dos sentidos: se mira el CÓDIGO
  // sin comentarios (una mención en prosa no es una definición) y la comparación es
  // case-insensitive (`'[PENDIENTE]'` en código también sería una segunda definición).
  const hits: string[] = [];
  const walk = (dir: string, rel = ''): void => {
    for (const e of readdirSync(resolve(REPO, dir), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(`${dir}/${e.name}`, r);
      else if (/\.tsx?$/.test(e.name)) {
        const code = stripComments(read(`${dir}/${e.name}`));
        const n = (code.match(/'\[pendiente\]'/gi) ?? []).length;
        for (let k = 0; k < n; k++) hits.push(r);
      }
    }
  };
  walk('src/lib');
  assert.deepEqual(
    hits,
    ['method-context/pending.ts'],
    'apareció una SEGUNDA definición del marcador en src/lib: ' +
      hits.join(', ')
  );
  // El selector nuevo NO redefine el marcador: lo importa de la fuente única.
  assert.doesNotMatch(SELECTOR_CODE, /'\[pendiente\]'/i);
  assert.match(
    SELECTOR,
    /import\s*\{[\s\S]*?isPendingMarker[\s\S]*?\}\s*from\s*'\.\.\/method-context\/pending\.ts'/
  );
  assert.match(SELECTOR_CODE, /isPendingMarker\s*\(/);
});

test('T-11 ⭐ R-09 `offers/select-canonical.ts` NO fue tocado: `pickCanonicalOffer` y `hasRealOfferContent` intactos', () => {
  assert.match(
    OFFERS_SELECTOR,
    /export\s+function\s+pickCanonicalOffer<\s*T\s+extends\s+CanonicalOfferRow\s*>/
  );
  assert.match(OFFERS_SELECTOR, /function\s+hasRealOfferContent\s*\(/);
  // Su noción de fila real es `big_promise`, NO la riqueza: no se unificaron (DT-02c).
  assert.match(OFFERS_SELECTOR, /big_promise/);
  assert.doesNotMatch(
    OFFERS_SELECTOR_CODE,
    /contentRichness|pickCanonicalContentRow/
  );
  // Y el selector nuevo tampoco DEPENDE de `offers` (su doc sí lo cita como patrón).
  assert.doesNotMatch(SELECTOR_CODE, /pickCanonicalOffer|hasRealOfferContent/);
  assert.doesNotMatch(SELECTOR_CODE, /offers\//);
});

test('T-11 ⭐ R-23 ninguna fuente tocada introduce `delete`/dedup/`UPDATE` de filas', () => {
  for (const [nombre, src] of [
    ['select-canonical-row.ts', SELECTOR],
    ['generate-content/route.ts (rama de lectura)', ROUTE],
    ['generate-gbp/route.ts (rama de lectura)', GBP_ROUTE]
  ] as const) {
    assert.doesNotMatch(
      src,
      /\.delete\(\s*\)/,
      `${nombre} introdujo un \`delete\` (PROHIBIDO al agente)`
    );
  }
  // El selector es PURO: sin Supabase, sin red, sin I/O (se mira el CÓDIGO, no la
  // prosa del header, que sí nombra Supabase para explicar el defecto que cierra).
  assert.doesNotMatch(
    SELECTOR_CODE,
    /supabase|createClient|fetch\(|readFileSync|require\(/i
  );
  // Su única dependencia es la fuente única del marcador.
  const imports = SELECTOR_CODE.match(/from\s*'([^']+)'/g) ?? [];
  assert.deepEqual(imports, ["from '../method-context/pending.ts'"]);
  // Y ninguna de las consultas `approved` de F-113 escribe.
  for (const src of [ROUTE, GBP_ROUTE]) {
    for (const table of ['briefs', 'buyer_personas']) {
      for (const stmt of approvedStatements(src, table)) {
        assert.match(stmt, /\.select\(/);
        assert.doesNotMatch(
          stmt,
          /\.insert\(|\.update\(|\.upsert\(|\.delete\(/
        );
      }
    }
  }
});

test('T-11 ⭐ R-24 sin DDL ni migración de F-113', () => {
  const migDir = resolve(REPO, 'supabase/migrations');
  if (existsSync(migDir)) {
    const offenders = readdirSync(migDir).filter((f) => /f-?113/i.test(f));
    assert.deepEqual(
      offenders,
      [],
      'migración inesperada de F-113: ' + offenders
    );
  }
  for (const src of [SELECTOR, ROUTE, GBP_ROUTE]) {
    assert.doesNotMatch(
      src,
      /alter\s+table|create\s+table|create\s+index|drop\s+table|delete\s+from/i
    );
  }
});

/**
 * **⤫ F-119 — anotación de cruce, SIN debilitar ningún assert.** Los 3 asserts quedan
 * **exactamente** como estaban y siguen verdes: F-119 **no toca** `briefs/write-path.ts`
 * (R-11) — la `version` calculada viaja por `opts.version`, el parámetro que F-097 DT-04
 * ya había reservado y que este helper ya honraba.
 *
 * Lo que sí cambió es el **paréntesis del título**: *"(causa raíz declarada, DT-06)"* dejó de
 * describir el mundo. La causa raíz **ya no está viva**: F-119 cortó la fuente en
 * `generate-content/route.ts` (el único call-site que producía empates) y el `?? 1` pasó a
 * ser, correctamente, **el default del caso "cliente sin filas"** — el único escenario en
 * que la UI inserta con la tabla vacía. Se anota; no se afloja nada.
 */
test('T-11 ⭐ R-24 (⤫ F-119) el write-path NO se tocó: `buildBriefWritePayload` conserva `version: opts.version ?? 1` — que con F-119 es el DEFAULT del caso "cliente sin filas", ya no la causa raíz', () => {
  assert.match(BRIEF_WRITE_PATH, /export\s+function\s+buildBriefWritePayload/);
  assert.match(BRIEF_WRITE_PATH, /version:\s*opts\.version\s*\?\?\s*1/);
  assert.doesNotMatch(
    BRIEF_WRITE_PATH,
    /pickCanonicalContentRow|contentRichness/
  );
});

/**
 * **⤫ F-119 — GUARD PREEXISTENTE RE-ANCLADO (R-37). Reescrito preservando la intención, NO
 * borrado ni vaciado.** *(Mismo patrón e idéntica autorización que el cruce ⤫ F-117 R-24 de
 * más arriba en este mismo archivo.)*
 *
 * El enunciado original decía *"la UI NO se tocó — **DT-04 es el incremento SIGUIENTE**"*.
 * **F-119 ES ese incremento**, así que el enunciado dejó de describir el mundo.
 *
 * ⚠️ **Y hay una trampa que había que NO tomar:** F-119 encapsula los selectores dentro de
 * `src/lib/onboarding/generation-source.ts`, de modo que `page.tsx` **no menciona**
 * `pickCanonicalContentRow` ni `select-canonical-row` ⇒ el `assert.doesNotMatch(PAGE, …)`
 * original **habría seguido pasando tal cual**. Dejarlo así sería preservar la letra y
 * derrotar el espíritu — exactamente el alias que F-118 revirtió en H-4. **Se re-ancla igual.**
 *
 * Nuevo enunciado, con el alcance autorizado explícito: la UI consume selección canónica
 * **sólo** a través del seam de procedencia y **sólo para señalizar**; los campos editables se
 * siguen poblando desde la lectura `created_at desc` **SIN** filtro de `status` (F-113 R-35,
 * F-119 R-25/R-26) — que es lo que sigue asertado, y ahora de forma que **muerde**: si la UI
 * poblara los campos desde la fila canónica, esto queda rojo.
 */
test('T-11 ⭐ R-20/R-24 (⤫ F-119 R-37) la UI usa selección canónica SÓLO vía el seam de procedencia y SÓLO para señalizar: los campos editables siguen saliendo de `created_at desc` SIN filtro de `status`', () => {
  // (i) La UI no re-implementa el criterio canónico ni lo importa directo: el ÚNICO camino
  //     autorizado es el seam de procedencia (que a su vez delega en los selectores, R-24).
  assert.doesNotMatch(
    PAGE_CODE,
    /pickCanonicalContentRow|pickCanonicalOffer|contentRichness|select-canonical/,
    'la UI no puede usar los selectores directamente: sólo a través de ' +
      '`generation-source`, que garantiza el MISMO criterio que el generador (R-24)'
  );
  assert.match(
    PAGE,
    /import\s*\{[\s\S]*?resolveGenerationSource[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/generation-source'/
  );
  // (ii) ⭐ EL CORAZÓN DEL GUARD (R-25/R-26): las 3 consultas que POBLAN los campos siguen
  //      siendo `created_at desc`, `limit(1)`, `maybeSingle()` y SIN `.eq('status', …)`.
  //      El borrador vivo no desaparece de la pantalla. Si alguien las alineara a la
  //      canónica, esto queda rojo.
  for (const tabla of ['briefs', 'buyer_personas', 'offers']) {
    // Las consultas EDITABLES son las que terminan en `maybeSingle()`: la de la carga
    // inicial y la relectura post-generación. Son 2 por tabla y ninguna puede filtrar
    // por `status`.
    const editables = statements(PAGE, tabla).filter((s) =>
      /\.maybeSingle\(\)/.test(s)
    );
    assert.equal(
      editables.length,
      2,
      `deben ser exactamente 2 consultas EDITABLES de ${tabla} (carga + relectura ` +
        'post-generación); una consulta editable nueva o perdida cambia de dónde salen ' +
        'los campos'
    );
    for (const carga of editables) {
      assert.match(
        carga,
        /\.order\(\s*'created_at',\s*\{\s*ascending:\s*false\s*\}\s*\)/
      );
      assert.match(carga, /\.limit\(\s*1\s*\)/);
      assert.doesNotMatch(
        carga,
        /\.eq\(\s*'status'/,
        `una carga editable de ${tabla} ganó un filtro de \`status\`: eso BORRARÍA el ` +
          'borrador vivo del operador (F-113 R-35, F-119 R-25 · caso real: el draft ' +
          '`9a5357b6` de JD Valley)'
      );
    }
    // Y las consultas de SEÑAL (F-119 R-24) son las `approved`: una por tabla, read-only.
    const senal = statements(PAGE, tabla).filter((s) =>
      /\.eq\(\s*'status',\s*'approved'\s*\)/.test(s)
    );
    assert.equal(
      senal.length,
      1,
      `debe haber exactamente 1 consulta ADICIONAL \`approved\` de ${tabla} (la señal)`
    );
    assert.match(senal[0], /\.select\(/);
    assert.doesNotMatch(
      senal[0],
      /\.insert\(|\.update\(|\.upsert\(|\.delete\(/
    );
  }
  // (iii) Y los campos se pueblan desde el record editable, NO desde los candidatos approved.
  for (const [setter, record] of [
    ['setBriefFields', 'b.content'],
    ['setPersonaFields', 'p.content'],
    ['setOfvFields', 'o.content']
  ] as const) {
    assert.match(
      PAGE,
      new RegExp(`${setter}\\s*\\(`),
      `${setter} desapareció de la carga`
    );
    assert.ok(
      PAGE.includes(record),
      `los campos editables deben poblarse desde \`${record}\` (la fila editable)`
    );
  }
  assert.doesNotMatch(
    PAGE,
    /set(Brief|Persona|Ofv)Fields\s*\(\s*parseContentToFields\s*\(\s*\w*[Aa]pproved/,
    'los campos editables NO pueden poblarse desde los candidatos `approved`'
  );
  // (iv) Los helpers de proyección de la UI siguen ahí (no se rediseñó la superficie).
  assert.match(PAGE, /function\s+parseContentToFields\s*</);
  assert.match(PAGE, /function\s+fieldsToContent\s*</);
});

test('T-11 R-24 `prompts/**` sin cambios de F-113 (esta feature no toca prompts)', () => {
  const promptsDir = resolve(REPO, 'prompts');
  if (!existsSync(promptsDir)) return;
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(p));
      else out.push(p);
    }
    return out;
  };
  const offenders = walk(promptsDir).filter((p) =>
    /F-?113|pickCanonicalContentRow|contentRichness/i.test(
      readFileSync(p, 'utf8')
    )
  );
  assert.deepEqual(
    offenders,
    [],
    'F-113 tocó prompts: ' + offenders.join(', ')
  );
});
