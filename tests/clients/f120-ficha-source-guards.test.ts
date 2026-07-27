/**
 * F-120 — T-06 — Source-guards de **la ficha** y **el panel** de la OFV
 * (R-03, R-04, R-05, R-06, R-07, R-08, R-09..R-12, R-15, R-16, R-19, R-40, R-46, R-48).
 *
 * Inspección de fuente (`readFileSync` + asserts **whitespace-tolerantes**: `\s*` entre
 * tokens, nunca match de línea literal — el hook husky/prettier reformatea `.tsx` al commit;
 * lección F-107 · R-46).
 *
 * **La constricción central de la feature vive acá (R-03):** la ficha **no puede** importar
 * `pickCanonicalOffer` / `pickCanonicalContentRow` / `contentRichness` / `select-canonical`
 * directamente — el ÚNICO camino autorizado es **el seam de procedencia**
 * (`resolveGenerationSource`, F-119). Es la misma prohibición que `f113-source-guards` T-11
 * impone sobre la superficie de onboarding, heredada acá: si la ficha resolviera con criterio
 * propio, emitiría **procedencia falsa** — y la coherencia con el aviso del núcleo quedaría
 * librada a la disciplina de quien edite el archivo mañana, en vez de ser **por construcción**.
 *
 * **Nota de modalidad (`docs/verification.md` §6):** un source-guard prueba claims **sobre la
 * fuente**. Que la ficha desplegada MUESTRE `a6c66d5c` es conductual y vive en T-21
 * `[LIVE §6.1]`, gateado y NO ejecutado en este tramo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

const FICHA_REL = 'src/app/(app)/clients/[id]/page.tsx';
const PANEL_REL = 'src/app/(app)/clients/[id]/ofv-panel.tsx';
const VIEW_REL = 'src/lib/offers/ofv-view.ts';

const FICHA = read(FICHA_REL);
const PANEL = read(PANEL_REL);

/** La fuente SIN comentarios: los guards de "esta fuente no dice X" miran el CÓDIGO. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const FICHA_CODE = stripComments(FICHA);
const PANEL_CODE = stripComments(PANEL);

/**
 * Sentencias `.from('<tabla>')` recortadas a **la cadena de llamadas encadenadas**: desde el
 * `.from(` hasta la última línea que sigue siendo parte de la cadena (`.eq(`, `.select(`,
 * `.order(`, `.limit(`, `.maybeSingle()`, …). Se corta en la primera línea que **no** empieza
 * por `.`, lo que hace el recorte inmune a los comentarios y a la coma separadora del
 * `Promise.all`. Whitespace-tolerante (R-46).
 */
function statements(src: string, table: string): string[] {
  const out: string[] = [];
  const needle = `.from('${table}')`;
  let i = src.indexOf(needle);
  while (i >= 0) {
    const lineas = src.slice(i).split('\n');
    const tomadas: string[] = [lineas[0]];
    for (let k = 1; k < lineas.length; k++) {
      if (!/^\s*\./.test(lineas[k])) break;
      tomadas.push(lineas[k]);
    }
    out.push(tomadas.join('\n').replace(/,\s*$/, ''));
    i = src.indexOf(needle, i + needle.length);
  }
  return out;
}

/** Columnas del `.select('...')` de una sentencia. */
function selectColumns(stmt: string): string[] {
  const m = stmt.match(/\.select\(\s*'([^']*)'\s*\)/);
  assert.ok(m, 'la consulta debe llevar una proyección explícita');
  return m[1].split(',').map((c) => c.trim());
}

const contar = (src: string, re: RegExp): number =>
  (src.match(re) ?? []).length;

/* ================================================================== */
/*  ⭐ R-03 — el ÚNICO camino autorizado es el seam                     */
/* ================================================================== */

test('T-06 ⭐ R-03 ni la ficha ni el panel importan los selectores directamente', () => {
  for (const [rel, code] of [
    [FICHA_REL, FICHA_CODE],
    [PANEL_REL, PANEL_CODE]
  ] as const) {
    for (const prohibido of [
      'pickCanonicalOffer',
      'pickCanonicalContentRow',
      'contentRichness',
      'select-canonical'
    ]) {
      assert.ok(
        !code.includes(prohibido),
        `${rel}: menciona \`${prohibido}\` en su CÓDIGO. El único camino autorizado a la ` +
          'resolución canónica es `resolveGenerationSource` — re-implementar el criterio, ' +
          'o llamar al selector por su cuenta, es exactamente cómo se emite procedencia falsa'
      );
    }
  }
});

test('T-06 ⭐ R-03 la ficha SÍ importa `resolveGenerationSource` desde el seam de F-119, y lo invoca una vez', () => {
  assert.match(
    FICHA,
    /import\s*\{[\s\S]*?resolveGenerationSource[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/generation-source'/
  );
  assert.equal(
    contar(FICHA_CODE, /resolveGenerationSource\s*\(/g),
    1,
    'una sola resolución: la OFV (brief y persona siguen siendo chequeos de existencia)'
  );
  assert.match(FICHA_CODE, /artifact:\s*'offer'/);
});

test('T-06 R-03 el panel NO consulta nada: recibe el resultado del seam por props', () => {
  assert.ok(!PANEL_CODE.includes('supabase'), 'el panel no puede tener I/O');
  assert.ok(!PANEL_CODE.includes('createClient'));
  assert.doesNotMatch(PANEL_CODE, /\.from\(/);
  assert.match(
    PANEL,
    /import\s+type\s*\{[\s\S]*?GenerationSourceResult[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/generation-source'/
  );
});

/* ================================================================== */
/*  ⭐ R-04 / R-15 — las DOS consultas de `offers` de la ficha          */
/* ================================================================== */

test('T-06 ⭐ R-04 la consulta de CANDIDATOS `approved` usa los filtros del generador, SIN `limit(1)` ni `maybeSingle()`', () => {
  const approved = statements(FICHA, 'offers').filter((s) =>
    /\.eq\(\s*'status',\s*'approved'\s*\)/.test(s)
  );
  assert.equal(
    approved.length,
    1,
    'exactamente UNA consulta de candidatos `approved`'
  );
  const q = approved[0];
  assert.match(q, /\.eq\(\s*'client_id',\s*id\s*\)/);
  assert.match(q, /\.eq\(\s*'status',\s*'approved'\s*\)/);
  assert.doesNotMatch(
    q,
    /\.limit\(\s*1\s*\)/,
    'R-04: `.limit(1)` ANTES del selector devuelve una fila ARBITRARIA — es exactamente ' +
      'el defecto: la ficha mostraría una fila y el generador consumiría otra'
  );
  assert.doesNotMatch(q, /\.maybeSingle\(\)/);
  // Proyección superset de lo que el selector necesita, + `approved_at` para la identidad.
  const cols = selectColumns(q);
  for (const c of [
    'id',
    'version',
    'updated_at',
    'content',
    'big_promise',
    'approved_at'
  ]) {
    assert.ok(cols.includes(c), `la consulta de candidatos no trae \`${c}\``);
  }
  assert.ok(
    cols.includes('big_promise'),
    '`big_promise` es el criterio con que `pickCanonicalOffer` distingue la OFV real de ' +
      'la shadow vacía: sin esa columna el desempate se cae'
  );
});

test('T-06 ⭐ R-15 la consulta EDITABLE conserva `created_at desc` + `limit(1)` + `maybeSingle()` y NO filtra por `status`', () => {
  const editables = statements(FICHA, 'offers').filter((s) =>
    /\.maybeSingle\(\)/.test(s)
  );
  assert.equal(
    editables.length,
    1,
    'exactamente UNA consulta de fila editable'
  );
  const q = editables[0];
  assert.match(
    q,
    /\.order\(\s*'created_at',\s*\{\s*ascending:\s*false\s*\}\s*\)/
  );
  assert.match(q, /\.limit\(\s*1\s*\)/);
  assert.match(q, /\.eq\(\s*'client_id',\s*id\s*\)/);
  assert.doesNotMatch(
    q,
    /\.eq\(\s*'status'/,
    'R-15: los filtros DEBEN ser los mismos que la superficie de onboarding — si ' +
      'difirieran, las dos superficies podrían clasificar distinto el mismo cliente (R-17)'
  );
});

test('T-06 R-15 la ficha hace exactamente DOS consultas a `offers`: candidatos + editable', () => {
  assert.equal(statements(FICHA, 'offers').length, 2);
});

/* ================================================================== */
/*  ⭐ R-05 — lectura estricta: cero escritura                          */
/* ================================================================== */

test('T-06 ⭐ R-05 cero `insert`/`update`/`upsert`/`delete` sobre `offers`, `briefs` o `buyer_personas` en la ficha', () => {
  for (const tabla of ['offers', 'briefs', 'buyer_personas']) {
    for (const q of statements(FICHA_CODE, tabla)) {
      assert.doesNotMatch(
        q,
        /\.insert\(|\.update\(|\.upsert\(|\.delete\(/,
        `${tabla}: la ficha es una superficie de LECTURA — la edición vive en ` +
          '`/onboarding/brief/[clientId]`; duplicar el write-path duplicaría el defecto'
      );
    }
  }
  // Y contra `76e7637`: el conteo de escrituras del núcleo en la ficha no creció.
  const base = execFileSync('git', ['show', `76e7637:${FICHA_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  for (const tabla of ['offers', 'briefs', 'buyer_personas']) {
    assert.equal(
      contar(FICHA_CODE, new RegExp(`from\\('${tabla}'\\)`, 'g')) >= 0,
      true
    );
    assert.equal(
      contar(
        stripComments(base),
        new RegExp(
          `\\.from\\('${tabla}'\\)[\\s\\S]{0,400}?\\.(insert|update|upsert|delete)\\(`,
          'g'
        )
      ),
      0,
      `${tabla}: la baseline tampoco escribía — el invariante es de mantenimiento, no nuevo`
    );
  }
});

test('T-06 ⭐ R-05/R-12 el panel no escribe, no aprueba, no promueve y no copia', () => {
  assert.doesNotMatch(
    PANEL_CODE,
    /\.insert\(|\.update\(|\.upsert\(|\.delete\(/
  );
  assert.doesNotMatch(
    PANEL_CODE,
    /status:\s*'approved'/,
    'R-12: aprobar es un gate humano explícito (F-109 R-05..R-07)'
  );
  for (const prohibido of [
    'handleApprove',
    'Aprobar',
    'Promover',
    'Copiar',
    'navigator.clipboard'
  ]) {
    assert.ok(
      !PANEL_CODE.includes(prohibido),
      `el panel no puede ofrecer «${prohibido}»: la divergencia la creó el sistema, no el ` +
        'operador (AGENTS.md §8.2)'
    );
  }
});

test('T-06 R-18 el panel es de LECTURA: cero controles de formulario', () => {
  for (const control of [
    '<Input',
    '<Textarea',
    '<Select',
    'onChange',
    '<form'
  ]) {
    assert.ok(
      !PANEL_CODE.includes(control),
      `el panel contiene «${control}»: no es un segundo editor, es un espejo con una salida`
    );
  }
});

test('T-06 R-12 la degradación NO bloquea nada: cero `disabled` nuevos atados a la procedencia', () => {
  assert.doesNotMatch(PANEL_CODE, /disabled=/);
  assert.doesNotMatch(
    FICHA_CODE,
    /disabled=\{[^}]*(ofvSource|diverged|none-approved)/,
    'castigar al operador con un gate por una divergencia que creó el sistema es peor que ' +
      'el defecto (anti-sobre-corrección)'
  );
});

/* ================================================================== */
/*  R-06 / R-07 — identidad declarada, fecha NUNCA fabricada           */
/* ================================================================== */

test('T-06 ⭐ R-06 el panel rotula la IDENTIDAD de la fila: `id`, `version` y `status`', () => {
  assert.match(
    PANEL_CODE,
    /canonicalId/,
    'el `id` de la fila canónica debe rotularse'
  );
  assert.match(PANEL_CODE, /canonical\??\.version|canonical!\.version/);
  assert.match(
    PANEL,
    /approved/,
    'el `status` de la fila que se muestra es `approved` y debe decirse'
  );
  assert.match(
    PANEL_CODE,
    /shortId\s*\(/,
    'el `id` se muestra abreviado (R-06) pero se muestra'
  );
});

test('T-06 ⭐ R-07 la fecha de aprobación está CONDICIONADA a `approved_at`, sin ningún fallback', () => {
  assert.match(
    PANEL_CODE,
    /approved_at/,
    'la fecha debe salir de `approved_at` y de ninguna otra columna'
  );
  // La condición existe: la fecha sólo se emite si `approvedAt` es verdadero.
  assert.match(
    PANEL_CODE,
    /approvedAt\s*\?[\s\S]{0,120}?:\s*''/,
    'R-07: SI `approved_at` es `null` ENTONCES la fecha se OMITE'
  );
  // Y NO hay fallback: ninguna otra fecha se presenta como fecha de aprobación.
  const ventana = PANEL_CODE.match(/[^\n]*[Aa]probada[^\n]*/g) ?? [];
  assert.ok(ventana.length > 0);
  for (const linea of ventana) {
    assert.ok(
      !/created_at|updated_at/.test(linea),
      'R-07: sustituir `approved_at` por `created_at`/`updated_at` sería FABRICAR un hecho ' +
        'duro — exactamente el modo de fallo que F-104/F-106 prohibieron. Hoy las 3 filas ' +
        '`approved` de producción tienen `approved_at IS NULL` (§G-4)'
    );
  }
  assert.ok(
    !/approved_at\s*\?\?\s*(canonical|row)?\.?(created_at|updated_at)/.test(
      PANEL_CODE
    ),
    'R-07: prohibido el fallback `approved_at ?? created_at`'
  );
});

/* ================================================================== */
/*  R-08 — una salida a la superficie de edición                       */
/* ================================================================== */

test('T-06 R-08 el panel enlaza a `/onboarding/brief/` y no ofrece edición propia', () => {
  assert.match(PANEL, /\/onboarding\/brief\//);
  assert.match(PANEL_CODE, /<Link\s+href=/);
});

/* ================================================================== */
/*  R-09..R-11 / R-16 / R-19 — las tres ramas y la expansión ÚNICA     */
/* ================================================================== */

test('T-06 ⭐ R-09/R-10 la rama `none-approved` no muestra contenido y distingue los DOS sub-casos', () => {
  assert.match(PANEL_CODE, /source\.state\s*===\s*'none-approved'/);
  const i = PANEL_CODE.indexOf("source.state === 'none-approved'");
  const rama = PANEL_CODE.slice(i, PANEL_CODE.indexOf('const canonical', i));
  assert.ok(
    rama.length > 0,
    'la rama `none-approved` debe salir ANTES de proyectar contenido'
  );
  assert.ok(
    !rama.includes('projectOfvContent'),
    'R-09: sin fila `approved` no hay contenido que mostrar'
  );
  assert.match(
    rama,
    /hayBorradores|editableId\s*!==\s*null/,
    'R-10: los dos sub-casos (hay borradores / no hay ninguna OFV) deben distinguirse'
  );
});

test('T-06 ⭐ R-11 el panel NUNCA muestra el contenido de la fila editable', () => {
  assert.match(
    PANEL_CODE,
    /projectOfvContent\s*\(\s*canonical\??\.content\s*\)/,
    'lo que se proyecta es el `content` de la CANÓNICA, no el de la editable'
  );
  assert.equal(
    contar(PANEL_CODE, /projectOfvContent\s*\(/g),
    1,
    'una sola proyección: si hubiera dos, una podría ser la del borrador'
  );
  assert.ok(
    !/editable\w*\.content|editable\w*\?\.content/.test(PANEL_CODE),
    'R-11: mostrar el borrador como si fuera la OFV reintroduciría la procedencia falsa ' +
      'por la puerta de atrás. Se menciona su EXISTENCIA (R-10), no su contenido'
  );
});

test('T-06 ⭐ R-16 `aligned` NO renderiza aviso de divergencia, pero SÍ contenido', () => {
  // El aviso está condicionado ESTRICTAMENTE a `diverged`.
  assert.match(
    PANEL_CODE,
    /source\.state\s*===\s*'diverged'\s*&&/,
    'R-16: el aviso de divergencia sólo puede aparecer en `diverged`'
  );
  assert.equal(
    contar(PANEL_CODE, /source\.state\s*===\s*'diverged'/g),
    1,
    'una sola condición de divergencia: si hubiera varias podrían discrepar'
  );
  // Y el contenido NO está condicionado al estado: se muestra en `aligned` y en `diverged`.
  // La proyección y el resumen ocurren DESPUÉS del early-return de `none-approved` y
  // FUERA de cualquier condición sobre `diverged`.
  const iCanon = PANEL_CODE.indexOf('const canonical =');
  const iResumen = PANEL_CODE.indexOf('summaryOfvFields(', iCanon);
  const iDiverged = PANEL_CODE.indexOf("source.state === 'diverged'");
  assert.ok(
    iCanon > 0 && iResumen > iCanon && iDiverged > iResumen,
    'el delta-visual-cero de F-119 R-28 aplica a LA SEÑAL, no al contenido: son cosas ' +
      'distintas y en `aligned` el contenido se sigue mostrando'
  );
});

test('T-06 ⭐ R-19 hay UNA sola expansión (no N) y el resumen decisivo se ve por defecto', () => {
  assert.equal(
    contar(PANEL_CODE, /useState\(false\)/g),
    1,
    'R-19: una única expansión — la ficha es un hub, no un segundo editor'
  );
  assert.equal(contar(PANEL_CODE, /setExpanded\s*\(/g), 1);
  assert.match(PANEL_CODE, /summaryOfvFields\s*\(/);
  assert.match(PANEL_CODE, /OFV_VIEW_SECTIONS/);
});

test('T-06 R-13/R-20 el panel proyecta con EL DESCRIPTOR y no lleva una segunda lista de campos', () => {
  assert.match(
    PANEL,
    /import\s*\{[\s\S]*?projectOfvContent[\s\S]*?\}\s*from\s*'@\/lib\/offers\/ofv-view'/
  );
  // Ninguna clave de la OFV está escrita a mano en el panel: la lista vive en el descriptor.
  const VIEW = read(VIEW_REL);
  const claves = (VIEW.match(/key:\s*'([a-z_]+)'/g) ?? []).map((s) =>
    s.replace(/key:\s*'|'/g, '')
  );
  assert.ok(claves.length === 11, 'el descriptor declara las 11 claves');
  for (const k of claves) {
    assert.ok(
      !PANEL_CODE.includes(`'${k}'`),
      `el panel escribe la clave \`${k}\` a mano: eso es la SEGUNDA lista que R-20 prohíbe`
    );
  }
  // Y el vacío se declara como vacío EN LA FILA, no se oculta (R-13).
  assert.match(PANEL_CODE, /field\.isEmpty/);
  assert.match(PANEL, /vacío en la fila/);
});

/* ================================================================== */
/*  ⭐ R-48 — LA PREGUNTA DEL PRECIO QUEDA PARKEADA                     */
/* ================================================================== */

test('T-06 ⭐ R-48 ni la ficha ni el panel muestran precio, tarifa ni "Plan Recomendado" en el bloque de la OFV', () => {
  // El panel entero es el bloque de la OFV: nada de precio, en ninguna parte.
  for (const prohibido of [
    'previews',
    'diagnostics',
    'preview.data.metadata',
    'recommended_tier',
    'Plan Recomendado',
    'precio',
    'Precio',
    'tarifa',
    'Tarifa',
    'price',
    'monthly_fee',
    'setup_fee'
  ]) {
    assert.ok(
      !PANEL.includes(prohibido),
      `el panel referencia «${prohibido}». **La pregunta del precio está PARKEADA** (R-48): ` +
        'es decisión de negocio del operador (límite 1 de CL-103). Lo que el cliente VE con ' +
        'precio viene de `preview.data.metadata` alimentado por el DIAGNÓSTICO, no de la ' +
        'OFV — y F-120 NO resuelve de dónde debe salir. Que el Decision Frame ' +
        '(`option_a/b/c`) se muestre no prejuzga nada: es contenido de la OFV escrito por ' +
        'el operador.'
    );
  }
  // En la ficha, el bloque de la OFV (el montaje del panel) tampoco toca esas fuentes.
  const i = FICHA_CODE.indexOf('<OfvPanel');
  assert.ok(i > 0, 'el panel debe estar montado en la ficha');
  const bloqueOfv = FICHA_CODE.slice(Math.max(0, i - 1200), i + 400);
  for (const prohibido of [
    'preview.data.metadata',
    'recommended_tier',
    'Plan Recomendado'
  ]) {
    assert.ok(
      !bloqueOfv.includes(prohibido),
      `el bloque de la OFV referencia «${prohibido}»`
    );
  }
});

/* ================================================================== */
/*  R-40 — brief y persona NO se tocan                                 */
/* ================================================================== */

test('T-06 ⭐ R-40 las consultas de existencia de `briefs` y `buyer_personas` son BYTE-IDÉNTICAS a `76e7637`', () => {
  // Ancla a commit FIJO, nunca `HEAD` (CL-107): verde en el working tree SIN commit.
  const base = execFileSync('git', ['show', `76e7637:${FICHA_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  for (const tabla of ['briefs', 'buyer_personas']) {
    assert.deepEqual(
      statements(FICHA, tabla),
      statements(base, tabla),
      `${tabla}: NO muestran contenido ⇒ NO necesitan selector canónico. Cambiarlas sin ` +
        'necesidad es superficie de regresión gratis (R-40, R-51)'
    );
  }
});

test('T-06 R-40 las tres insignias `Brief ✓` / `Persona ✓` / `OFV ✓` siguen presentes', () => {
  assert.match(FICHA, /Brief\s*✓/);
  assert.match(FICHA, /Persona\s*✓/);
  assert.match(FICHA, /OFV\s*✓/);
  assert.match(FICHA_CODE, /progress\.briefApproved/);
  assert.match(FICHA_CODE, /progress\.personaApproved/);
  assert.match(FICHA_CODE, /progress\.ofvApproved/);
});

test('T-06 R-04 `progress.ofvApproved` se deriva del seam, con la equivalencia declarada', () => {
  assert.match(
    FICHA_CODE,
    /ofvApproved:\s*ofvSourceResult\.state\s*!==\s*'none-approved'/,
    '`pickCanonicalOffer` devuelve `null` sii no hay candidatos `approved` ⇒ la condición ' +
      'nueva es EXACTAMENTE equivalente al `!!ofvData` anterior: ni relaja ni endurece'
  );
  // Y ya no queda la consulta vieja de existencia de `offers`.
  assert.ok(
    !/from\('offers'\)\s*\.select\('status'\)/.test(
      FICHA_CODE.replace(/\s+/g, '')
    ),
    'la consulta de existencia de `offers` fue REEMPLAZADA, no duplicada'
  );
});

/* ================================================================== */
/*  R-46 — el módulo del read model no tiene I/O ni React              */
/* ================================================================== */

test('T-06 R-20/R-22 `ofv-view.ts` es un seam puro: sin I/O, sin React, sin Supabase', () => {
  const VIEW_CODE = stripComments(read(VIEW_REL));
  for (const prohibido of ['supabase', 'react', 'fetch(', 'import ']) {
    assert.ok(
      !VIEW_CODE.includes(prohibido),
      `\`ofv-view.ts\` contiene «${prohibido}»: debe ser \`node --test\`-able sin montar nada`
    );
  }
});
