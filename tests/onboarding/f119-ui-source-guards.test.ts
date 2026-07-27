/**
 * F-119 — T-10 — Source-guards de la superficie de onboarding `page.tsx`
 * (R-10, R-11, R-12, R-18, R-19, R-25, R-26, R-27, R-28, R-29, R-30, R-40).
 *
 * Inspección de fuente (`readFileSync` + asserts **whitespace-tolerantes**: `\s*` entre
 * tokens, nunca match de línea literal — el hook husky/prettier reformatea `.tsx` al commit;
 * lección F-107).
 *
 * **La constricción central de la feature vive acá (R-25/R-26):** la lectura sin filtro de
 * `status` **es intencional** — existe para que el operador siga editando su borrador
 * (F-113 R-35). Alinearla a ciegas le borraría el draft vivo de la pantalla (caso real: el
 * draft `9a5357b6` de JD Valley, editado el 2026-07-25). La señal **agrega información sin
 * quitar capacidad**; no toca de dónde salen los campos.
 *
 * **Nota de modalidad (`docs/verification.md` §6):** que el aviso APAREZCA en la superficie
 * desplegada es una claim conductual `[LIVE §6.1]` (R-33/R-34, T-19/T-20), gateada y NO
 * ejecutada en este tramo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const PAGE_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const PAGE = readFileSync(resolve(REPO, PAGE_REL), 'utf8');

/** La fuente SIN comentarios: los guards de "esta fuente no dice X" miran el CÓDIGO. */
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

/** Columnas del `.select('...')` de una sentencia. */
function selectColumns(stmt: string): string[] {
  const m = stmt.match(/\.select\(\s*'([^']*)'\s*\)/);
  assert.ok(m, 'la consulta debe llevar una proyección explícita');
  return m[1].split(',').map((c) => c.trim());
}

/** Cuerpo de un bloque `<marcador> … {` … `}` balanceado por llaves. */
function bloque(src: string, marcador: string): string {
  const i = src.indexOf(marcador);
  assert.ok(i > 0, `no se encontró ${marcador}`);
  let d = 0;
  let j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') {
      d--;
      if (d === 0) break;
    }
  }
  return src.slice(i, j + 1);
}

/**
 * Cuerpo de una `function <nombre>(…) { … }`: se saltea la lista de parámetros (que en este
 * componente es un destructuring con llaves) y balancea desde la llave del CUERPO.
 */
function cuerpoFuncion(src: string, nombre: string): string {
  const i = src.indexOf(`function ${nombre}`);
  assert.ok(i > 0, `no se encontró function ${nombre}`);
  let p = 0;
  let j = src.indexOf('(', i);
  for (; j < src.length; j++) {
    if (src[j] === '(') p++;
    else if (src[j] === ')') {
      p--;
      if (p === 0) break;
    }
  }
  let d = 0;
  let k = src.indexOf('{', j);
  for (; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') {
      d--;
      if (d === 0) break;
    }
  }
  return src.slice(src.indexOf('{', j), k + 1);
}

const contar = (src: string, re: RegExp): number =>
  (src.match(re) ?? []).length;

/* ================================================================== */
/*  ⭐ R-26 — las 3 consultas de CARGA no se tocaron                    */
/* ================================================================== */

test('T-10 ⭐ R-26 las consultas EDITABLES conservan `created_at desc` y siguen SIN filtro de `status`', () => {
  for (const tabla of ['briefs', 'buyer_personas', 'offers']) {
    const editables = statements(PAGE, tabla).filter((s) =>
      /\.maybeSingle\(\)/.test(s)
    );
    assert.equal(
      editables.length,
      2,
      `${tabla}: carga + relectura post-generación`
    );
    for (const q of editables) {
      assert.match(
        q,
        /\.order\(\s*'created_at',\s*\{\s*ascending:\s*false\s*\}\s*\)/
      );
      assert.match(q, /\.limit\(\s*1\s*\)/);
      assert.match(q, /\.eq\(\s*'client_id',\s*clientId\s*\)/);
      assert.doesNotMatch(
        q,
        /\.eq\(\s*'status'/,
        `${tabla}: filtrar la carga por \`status\` haría DESAPARECER el borrador vivo ` +
          'del operador — es exactamente el error contra el que F-113 R-35 advirtió'
      );
      // Proyección intacta: no perdió columnas.
      const cols = selectColumns(q);
      for (const c of ['id', 'content', 'status', 'created_at']) {
        assert.ok(
          cols.includes(c),
          `${tabla}: la carga editable perdió \`${c}\``
        );
      }
    }
  }
});

test('T-10 R-26 las 3 consultas de carga son BYTE-IDÉNTICAS a `2c072b6`', () => {
  // Ancla a commit FIJO, no a `HEAD` (lección F-118 H-5): verde en el working tree SIN
  // commit y sensible a cualquier edición posterior.
  const base = execFileSync('git', ['show', `2c072b6:${PAGE_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  for (const tabla of ['briefs', 'buyer_personas', 'offers']) {
    const ahora = statements(PAGE, tabla).filter((s) =>
      /\.maybeSingle\(\)/.test(s)
    );
    const antes = statements(base, tabla).filter((s) =>
      /\.maybeSingle\(\)/.test(s)
    );
    assert.deepEqual(
      ahora,
      antes,
      `${tabla}: las consultas que POBLAN los campos deben quedar byte-idénticas`
    );
  }
});

/* ================================================================== */
/*  ⭐ R-25 — los campos se pueblan desde la fila EDITABLE              */
/* ================================================================== */

test('T-10 ⭐ R-25 `setBriefFields`/`setPersonaFields`/`setOfvFields` salen del record editable, NO de los `approved`', () => {
  for (const [setter, fuente] of [
    ['setBriefFields', 'b.content'],
    ['setPersonaFields', 'p.content'],
    ['setOfvFields', 'o.content']
  ] as const) {
    assert.match(PAGE_CODE, new RegExp(`${setter}\\s*\\(`));
    assert.ok(
      PAGE_CODE.includes(fuente),
      `${setter} debe poblarse desde \`${fuente}\` (la fila editable)`
    );
  }
  assert.doesNotMatch(
    PAGE_CODE,
    /set(Brief|Persona|Ofv)Fields\s*\(\s*[^)]*ApprovedRows/,
    'los campos editables NO pueden poblarse desde los candidatos `approved`'
  );
  // Las 3 lecturas `approved` son ADICIONALES y de SOLO LECTURA (R-25).
  for (const tabla of ['briefs', 'buyer_personas', 'offers']) {
    const senal = statements(PAGE, tabla).filter((s) =>
      /\.eq\(\s*'status',\s*'approved'\s*\)/.test(s)
    );
    assert.equal(
      senal.length,
      1,
      `${tabla}: 1 sola consulta ADICIONAL \`approved\``
    );
    assert.match(senal[0], /\.select\(/);
    assert.doesNotMatch(
      senal[0],
      /\.insert\(|\.update\(|\.upsert\(|\.delete\(/
    );
    // La proyección lleva lo que el selector necesita (+ `approved_at` para el aviso).
    const cols = selectColumns(senal[0]);
    for (const c of ['id', 'version', 'updated_at', 'content', 'approved_at']) {
      assert.ok(
        cols.includes(c),
        `${tabla}: la consulta de señal no trae \`${c}\``
      );
    }
  }
  assert.ok(
    selectColumns(
      statements(PAGE, 'offers').filter((s) =>
        /\.eq\(\s*'status',\s*'approved'\s*\)/.test(s)
      )[0]
    ).includes('big_promise'),
    '`offers` necesita `big_promise`: es el criterio de `pickCanonicalOffer`'
  );
});

test('T-10 ⭐ R-24 la señal se calcula con el seam, que reusa el selector del generador', () => {
  assert.match(
    PAGE,
    /import\s*\{[\s\S]*?resolveGenerationSource[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/generation-source'/
  );
  assert.equal(
    contar(PAGE_CODE, /resolveGenerationSource\s*\(/g),
    3,
    'una invocación por artefacto (brief, persona, OFV)'
  );
  for (const artefacto of ['brief', 'persona', 'offer']) {
    assert.match(PAGE_CODE, new RegExp(`artifact:\\s*'${artefacto}'`));
  }
});

/* ================================================================== */
/*  R-10 / R-11 / R-12 — los 6 `INSERT` derivan la `version` del seam  */
/* ================================================================== */

test('T-10 ⭐ R-10 los 6 `INSERT` derivan la `version` del MISMO seam', () => {
  assert.match(
    PAGE,
    /import\s*\{[\s\S]*?nextVersion[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/next-version'/
  );
  assert.match(
    PAGE_CODE,
    /const\s+nextVersionFor\s*=\s*async[\s\S]{0,400}?return\s+nextVersion\s*\(/,
    'el helper local debe delegar en el seam puro, no re-implementar el máximo'
  );
  assert.equal(
    contar(PAGE_CODE, /await\s+nextVersionFor\s*\(/g),
    6,
    'los 6 call-sites de INSERT (2 brief, 2 persona, 2 OFV) usan el seam'
  );
  for (const tabla of ['briefs', 'buyer_personas', 'offers']) {
    assert.equal(
      contar(
        PAGE_CODE,
        new RegExp(`nextVersionFor\\(\\s*'${tabla}'\\s*\\)`, 'g')
      ),
      2,
      `${tabla}: 2 call-sites (save-draft + approve)`
    );
  }
  // Y el máximo sale de TODOS los `status` (R-05): la consulta del helper no filtra.
  const helper = bloque(PAGE_CODE, 'const nextVersionFor');
  assert.match(helper, /\.from\(\s*table\s*\)\s*\.select\(\s*'version'\s*\)/);
  assert.match(helper, /\.eq\(\s*'client_id',\s*clientId\s*\)/);
  assert.doesNotMatch(
    helper,
    /\.eq\(\s*'status'/,
    'particionar por `status` reintroduce el empate: aprobar es un flip in-place que ' +
      'CONSERVA la versión (R-05)'
  );
});

test('T-10 ⭐ R-10 CERO literales `version: 1` residuales en `page.tsx`', () => {
  assert.doesNotMatch(
    PAGE_CODE,
    /version\s*:\s*1\b/,
    'quedó un `version: 1` literal: el invariante dejaría de ser estructural'
  );
});

test('T-10 ⭐ R-12 la `version` viaja DENTRO del objeto `opts`, sin reordenar ni envolver la llamada', () => {
  // Los prefijos que `f107`/`f108`/`f109` fijan por regex siguen intactos.
  assert.match(
    PAGE_CODE,
    /buildBriefWritePayload\(\s*fieldsToContent\(\s*briefFields/
  );
  assert.match(
    PAGE_CODE,
    /buildBriefWritePayload\(\s*fieldsToContent\(\s*personaFields/
  );
  // Las 4 llamadas llevan `status` y `version` en el MISMO objeto `opts` (2.º argumento).
  const llamadas =
    PAGE_CODE.match(
      /buildBriefWritePayload\([\s\S]*?\{[^{}]*status:[^{}]*\}\s*\)/g
    ) ?? [];
  assert.equal(llamadas.length, 4, 'las 4 llamadas de brief/persona');
  for (const l of llamadas) {
    assert.match(
      l,
      /version:\s*await\s+nextVersionFor\(/,
      'la `version` debe ir dentro del objeto `opts`, no en otro argumento'
    );
  }
});

test('T-10 ⭐ R-11 `page.tsx` no importa ni redefine nada nuevo de `briefs/write-path`', () => {
  const imports =
    PAGE_CODE.match(
      /import\s*\{[^}]*\}\s*from\s*'@\/lib\/briefs\/write-path'/g
    ) ?? [];
  assert.deepEqual(imports, [
    "import { buildBriefWritePayload } from '@/lib/briefs/write-path'"
  ]);
  assert.doesNotMatch(
    PAGE_CODE,
    /function\s+buildBriefWritePayload|const\s+buildBriefWritePayload\s*=/,
    'la UI no puede redefinir el write-path'
  );
});

/* ================================================================== */
/*  R-18 / R-19 — aprobación in-place y insert-on-first-save vivos     */
/* ================================================================== */

test('T-10 ⭐ R-18 las 3 ramas de aprobación siguen haciendo `update` in-place, con sello y SIN `version`', () => {
  for (const [handler, tabla, record] of [
    ['const handleApproveBrief', 'briefs', 'briefRecord'],
    ['const handleApprovePersona', 'buyer_personas', 'personaRecord'],
    ['const handleApproveOFV', 'offers', 'ofvRecord']
  ] as const) {
    const cuerpo = bloque(PAGE_CODE, handler);
    const updates = statements(cuerpo, tabla).filter((s) =>
      /\.update\(/.test(s)
    );
    assert.equal(updates.length, 1, `${handler}: 1 update in-place`);
    assert.match(
      updates[0],
      new RegExp(`\\.eq\\(\\s*'id',\\s*${record}\\.id\\s*\\)`)
    );
    assert.match(updates[0], /approved_by:\s*user\.id/);
    assert.match(updates[0], /approved_at:\s*approvedAt/);
    assert.doesNotMatch(
      updates[0],
      /version\s*:/,
      `${handler}: aprobar es un flip in-place que CONSERVA la versión (R-18)`
    );
  }
});

test('T-10 R-19 el insert-on-first-save de F-097/F-108 sigue vivo en los 6 handlers', () => {
  for (const [handler, tabla] of [
    ['const handleApproveBrief', 'briefs'],
    ['const handleSaveDraft ', 'briefs'],
    ['const handleSaveDraftPersona', 'buyer_personas'],
    ['const handleApprovePersona', 'buyer_personas'],
    ['const handleSaveDraftOFV', 'offers'],
    ['const handleApproveOFV', 'offers']
  ] as const) {
    const cuerpo = bloque(PAGE_CODE, handler.trimEnd());
    const inserts = statements(cuerpo, tabla).filter((s) =>
      /\.insert\(/.test(s)
    );
    assert.equal(
      inserts.length,
      1,
      `${handler}: la rama insert-on-first-save existe`
    );
    assert.match(inserts[0], /prompt_version_id:\s*null/);
    assert.match(
      inserts[0],
      /version:\s*(await\s+nextVersionFor\(|payload\.version)/
    );
  }
});

/* ================================================================== */
/*  R-27..R-30 — el aviso: no bloquea, no escribe, y `aligned` ⇒ nada  */
/* ================================================================== */

test('T-10 ⭐ R-28 con `aligned` el aviso NO renderiza nada (delta visual CERO)', () => {
  const comp = cuerpoFuncion(PAGE_CODE, 'GenerationSourceNotice');
  assert.match(
    comp,
    /if\s*\(\s*source\.state\s*===\s*'aligned'\s*\)\s*return\s+null/,
    'R-28: el caso alineado debe salir por `return null` ANTES de cualquier render — ' +
      'es lo que hace observable el control de no-regresión de (b)'
  );
  // El early-return de `aligned` precede a todo `return (` con JSX.
  const iAligned = comp.search(/source\.state\s*===\s*'aligned'/);
  const iJsx = comp.indexOf('return (');
  assert.ok(iAligned >= 0 && iJsx > iAligned);
});

test('T-10 ⭐ R-27 el aviso distingue `diverged` de `none-approved` e identifica la fila que genera', () => {
  const comp = cuerpoFuncion(PAGE_CODE, 'GenerationSourceNotice');
  assert.match(comp, /source\.state\s*===\s*'none-approved'/);
  assert.match(
    comp,
    /source\.canonicalId/,
    '`diverged` debe nombrar la fila canónica: el operador tiene que poder identificarla'
  );
  assert.match(comp, /source\.editableId/);
  assert.match(comp, /approved_at/);
  // Está montado en los 3 artefactos.
  assert.equal(contar(PAGE_CODE, /<GenerationSourceNotice/g), 3);
});

test('T-10 ⭐ R-29 el aviso NO deshabilita nada: cero `disabled` nuevos atados a la procedencia', () => {
  const comp = cuerpoFuncion(PAGE_CODE, 'GenerationSourceNotice');
  assert.doesNotMatch(comp, /disabled/);
  assert.doesNotMatch(
    PAGE_CODE,
    /disabled=\{[^}]*(briefSource|personaSource|ofvSource|diverged|none-approved)/,
    'R-29: la divergencia la creó el sistema, no el operador — castigarlo con un gate ' +
      'es peor que el defecto (anti-sobre-corrección, AGENTS.md §8.2)'
  );
  /**
   * **⤫ F-120 — RE-ANCLAJE DE UN SOLO `assert` (no debilitado; ENDURECIDO). CRUCE **NO
   * PREVISTO** POR EL SPEC — declarado, no silenciado.**
   *
   * `specs/F-120/` (R-41, `design.md` §10.3 fila 5) preveía que este archivo quedara **verde
   * sin una sola edición**, razonando sobre las **consultas** y la **procedencia** — que
   * F-120 efectivamente no toca. Lo que el spec no vio es este **contador**: F-120 ejecuta
   * el traslado del Brandboard fuera de la pantalla del núcleo (R-23, CL-106), y el
   * `TabsTrigger value='brandboard' disabled={!ofvApproved}` que se va **se lleva un
   * `disabled` consigo** ⇒ la igualdad estricta contra `2c072b6` se rompe **mecánicamente**,
   * por 11 ≠ 12. Mismo modo de fallo que H-1/H-2: el **vehículo** del guard se volvió stale,
   * no su intención.
   *
   * **La intención se preserva ENTERA y se endurece.** El mensaje original lo dice literal:
   * *"F-119 no puede **AÑADIR** ningún gate nuevo a la superficie"* — es un guard
   * **anti-adición**, contra castigar al operador con un gate por una divergencia que creó
   * el sistema (anti-sobre-corrección, AGENTS.md §8.2). Eso sigue exigido, y ahora de forma
   * más precisa que una igualdad:
   *
   *   1. el conteo **NO CRECE** (la intención literal: cero gates nuevos);
   *   2. la **única** baja autorizada es el `disabled` del tab Brandboard, y se comprueba
   *      **nominalmente** — no por aritmética: el trigger ya no está en el origen y sí está
   *      en el destino con su gate intacto (`f120-brandboard-move` T-11 /
   *      `f117-declarations` T-12 R-29 lo exigen del otro lado);
   *   3. **ninguna otra** baja: cualquier `disabled` que desaparezca de la superficie del
   *      núcleo — la cadena `briefApproved → personaApproved`, los botones de generar,
   *      guardar borrador o aprobar — deja esto **rojo**.
   *
   * **Ancla FIJA `76e7637`, nunca `HEAD`** (CL-107 / F-118 H-5): verde en el working tree
   * **sin commit**.
   */
  const base = execFileSync('git', ['show', `76e7637:${PAGE_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  const BASE_CODE = stripComments(base);
  const ahora = contar(PAGE_CODE, /disabled/g);
  const antes = contar(BASE_CODE, /disabled/g);
  assert.ok(
    ahora <= antes,
    `la superficie del núcleo GANÓ un gate (${antes} → ${ahora}): F-119 R-29 prohíbe ` +
      'añadir cualquier `disabled` nuevo'
  );
  assert.equal(
    ahora,
    antes - 1,
    '⤫ F-120: la única baja autorizada es el `disabled` del tab Brandboard trasladado ' +
      '(R-23). Cualquier otra pérdida de gate en la superficie del núcleo — la cadena ' +
      '`briefApproved` → `personaApproved`, generar, guardar borrador o aprobar — es una ' +
      'regresión (R-41)'
  );
  // Y esa baja es NOMINALMENTE la del Brandboard, no una aritmética que cuadra por azar.
  assert.match(
    BASE_CODE,
    /<TabsTrigger\s+value='brandboard'\s+disabled=\{\s*!ofvApproved\s*\}/,
    'en `76e7637` el gate del Brandboard vivía en la superficie del núcleo'
  );
  assert.equal(
    (PAGE_CODE.match(/brandboard/gi) ?? []).length,
    0,
    'tras el traslado, la superficie del núcleo no puede conservar ni una referencia'
  );
  // Los gates que SÍ son del núcleo siguen intactos, uno por uno.
  for (const gate of ['!briefApproved', '!personaApproved']) {
    assert.ok(
      PAGE_CODE.includes(`disabled={${gate}}`),
      `la cadena de gates del núcleo perdió \`${gate}\``
    );
  }
});

test('T-10 ⭐ R-30 el aviso no promueve, no copia, no aprueba y no escribe NADA', () => {
  const comp = cuerpoFuncion(PAGE_CODE, 'GenerationSourceNotice');
  assert.doesNotMatch(comp, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.doesNotMatch(comp, /supabase/);
  assert.doesNotMatch(
    comp,
    /onClick|handleApprove|setBriefFields|setOfvFields/
  );
  assert.doesNotMatch(
    comp,
    /status:\s*'approved'/,
    'R-30: aprobar es un gate humano explícito (F-109 R-05..R-07)'
  );
});

/* ================================================================== */
/*  R-13/R-43 — la superficie no repara datos                          */
/* ================================================================== */

test('T-10 R-13/R-43 `page.tsx` no introduce `delete`, DDL ni renumeración de filas', () => {
  assert.doesNotMatch(PAGE_CODE, /\.delete\(\s*\)/);
  assert.doesNotMatch(
    PAGE,
    /alter\s+table|create\s+table|create\s+index|drop\s+table|delete\s+from/i
  );
  // Ningún `update` masivo: todos los `update` de las 3 tablas van con `.eq('id', …)`.
  for (const tabla of ['briefs', 'buyer_personas', 'offers']) {
    for (const s of statements(PAGE_CODE, tabla).filter((s) =>
      /\.update\(/.test(s)
    )) {
      assert.match(s, /\.eq\(\s*'id',\s*\w+\.id\s*\)/);
    }
  }
});
