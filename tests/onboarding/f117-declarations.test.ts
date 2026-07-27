/**
 * F-117 — T-12/T-13 — Las dos DECLARACIONES de la Fase C: (d) el emplazamiento del
 * Brandboard y (e) la naturaleza de `generated_outputs`.
 *
 * Los ítems (d) y (e) no se **construyen**, se **declaran** (R-28/R-30/R-32). Este test
 * existe para que las declaraciones no queden a medias ni deriven del código:
 *
 *   - **Atadura cruzada (R-30/R-31):** la declaración de `generated_outputs` vive en DOS
 *     lugares —`docs/generated-outputs.md` y el write-path de `route.ts`— y el test
 *     exige que **ambos** digan lo mismo y que **ninguno** afirme la existencia de un
 *     lector. Si estuviera en uno solo, o si alguno hablara de un lector, esto se pone
 *     rojo.
 *   - **Prohibido hardcodear el texto esperado** (patrón F-116 R-32): las afirmaciones
 *     se **extraen de disco** de los dos lados y se **cruzan** entre sí. El test no
 *     lleva una copia del texto que debería estar escrito.
 *   - **R-29:** la UI del Brandboard queda BYTE-IDÉNTICA a `HEAD` — la declaración es
 *     lo único que F-117 paga; el traslado es de la Fase F.
 *
 * **Nota de modalidad (`docs/verification.md` §6):** esto verifica lo que está ESCRITO
 * en disco. Que la tabla siga sin lector en producción es un hecho de datos, verificado
 * por `SELECT` read-only y citado en el documento (3 filas, las 3 `gbp_description`,
 * última 2026-07-21), no re-verificable desde acá.
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

const DOC_OUTPUTS_REL = 'docs/generated-outputs.md';
const DOC_BRANDBOARD_REL = 'docs/brandboard-placement.md';
const ROUTE_REL = 'src/app/api/generate-content/route.ts';
const PAGE_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const TAB_REL = 'src/app/(app)/onboarding/brief/[clientId]/brandboard-tab.tsx';

const DOC_OUTPUTS = read(DOC_OUTPUTS_REL);
const DOC_BRANDBOARD = read(DOC_BRANDBOARD_REL);
const ROUTE = read(ROUTE_REL);

/** El comentario que precede al `insert` en `generated_outputs` (la otra mitad de la
 * declaración de R-30). Se extrae de disco, no se re-escribe acá. */
const declaracionEnCodigo = (): string => {
  const i = ROUTE.indexOf(".from('generated_outputs')");
  assert.ok(i >= 0, 'no se encontró el write-path de `generated_outputs`');
  const bloque = ROUTE.slice(Math.max(0, i - 2000), i);
  const lineas = bloque.split('\n');
  // Las líneas de comentario contiguas inmediatamente anteriores al `const { data … }`.
  const out: string[] = [];
  for (let k = lineas.length - 1; k >= 0; k--) {
    const l = lineas[k].trim();
    if (l.startsWith('//')) out.unshift(l.replace(/^\/\/\s?/, ''));
    else if (out.length > 0 && l !== '' && !l.startsWith('const')) break;
  }
  assert.ok(
    out.length > 0,
    'el write-path de `generated_outputs` no tiene la declaración de R-30'
  );
  return out.join('\n');
};

/* ================================================================== */
/*  (e) `generated_outputs` — R-30 / R-31 / R-32                       */
/* ================================================================== */

test('T-13 ⭐ R-30 la declaración de `generated_outputs` existe en los DOS lugares', () => {
  const enCodigo = declaracionEnCodigo();
  for (const [donde, texto] of [
    [DOC_OUTPUTS_REL, DOC_OUTPUTS],
    [`${ROUTE_REL} (write-path)`, enCodigo]
  ] as const) {
    assert.match(
      texto,
      /registro de\s+\*{0,2}auditoría\/histórico/i,
      `${donde}: falta la formulación "registro de auditoría/histórico de generación"`
    );
    assert.match(
      texto,
      /sin\s+consumidor\s+de\s+lectura|no\s+tiene\s+consumidor\s+de\s+lectura/i,
      `${donde}: falta declarar que NO tiene consumidor de lectura`
    );
  }
});

/** Whitespace-normalizado y sin marcado: el comentario del código está WRAPPEADO a 80
 * columnas y el doc no, así que la comparación no puede ser sensible a saltos de línea
 * ni a los `**` de markdown (R-34, lección F-107). */
const plano = (t: string): string =>
  t.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();

test('T-13 ⭐ R-31 los dos lados dicen LO MISMO: las afirmaciones se cruzan, no se hardcodean', () => {
  const doc = plano(DOC_OUTPUTS);
  const codigo = plano(declaracionEnCodigo());
  // ⚠️ Las afirmaciones se EXTRAEN del doc de disco y se buscan en el código. Ninguna
  // cadena de contenido está escrita en este test (patrón F-116 R-32): si el doc cambia
  // su formulación, el test sigue cruzando la formulación NUEVA contra el código.
  const oracionDelDoc = (ancla: RegExp): string => {
    const m = doc.match(ancla);
    assert.ok(m, `el doc perdió la afirmación ${ancla}`);
    return m[0];
  };
  const afirmaciones = [
    // la tesis central, extraída íntegra del doc
    /No tiene consumidor de lectura en el producto y no se planea uno/,
    // la formulación del tipo de registro
    /registro de auditoría\/histórico de generación/,
    // los hechos duros que sostienen la tesis
    /F-089/,
    /gbp_profiles/
  ];
  for (const ancla of afirmaciones) {
    const texto = oracionDelDoc(ancla);
    assert.ok(
      codigo.includes(texto),
      `el comentario del write-path no sostiene la misma afirmación que ` +
        `${DOC_OUTPUTS_REL}: «${texto}»`
    );
  }
  // Y los 4 homes canónicos que el doc enumera están también en el código.
  for (const home of ['briefs', 'buyer_personas', 'offers', 'gbp_profiles']) {
    assert.ok(doc.includes(home));
    assert.ok(codigo.includes(home), `el write-path no nombra el home ${home}`);
  }
});

test('T-13 ⭐ R-31 NINGUNO de los dos afirma que exista un lector', () => {
  // Criterio: cada mención de "lector"/"lee"/"consume" debe estar en contexto NEGADO.
  // Hablar de que no hay lector, de que el único read se eliminó o de que no hay que
  // construir uno es legítimo; afirmar que alguien lo lee, no.
  const NEGACION =
    /\b(no|ni|sin|nadie|ning[uú]n[ao]?|elimin\w+|prohibid\w+|dej[oó] de|qu[eé] NO es)\b/i;
  // Sólo se examinan las oraciones que hablan DE LA TABLA (una frase sobre lo que lee
  // este test, o sobre los homes canónicos, no es una afirmación sobre `generated_outputs`).
  const SOBRE_LA_TABLA =
    /generated_outputs|\bla tabla\b|\blas? filas?\b|\beste registro\b|consumidor de lectura/i;
  for (const [donde, texto] of [
    [DOC_OUTPUTS_REL, plano(DOC_OUTPUTS)],
    [`${ROUTE_REL} (write-path)`, plano(declaracionEnCodigo())]
  ] as const) {
    const oraciones = texto
      .split(/(?<=[.:])\s+/)
      .filter((o) => SOBRE_LA_TABLA.test(o));
    assert.ok(oraciones.length > 0, `${donde}: no dice nada sobre la tabla`);
    let menciones = 0;
    for (const o of oraciones) {
      // `exec` en bucle en vez de `matchAll` (el `target` del `tsconfig` no permite
      // iterar el `RegExpStringIterator` — TS2802).
      const RE = /\b(lector|lectura|lee|leen|consum\w+)\b/gi;
      let m: RegExpExecArray | null;
      while ((m = RE.exec(o)) !== null) {
        menciones++;
        const ventana = o.slice(Math.max(0, (m.index ?? 0) - 90), m.index ?? 0);
        assert.match(
          ventana,
          NEGACION,
          `${donde}: la mención «${m[0]}» sobre la tabla no está negada ⇒ estaría ` +
            `AFIRMANDO un lector de \`generated_outputs\` que no existe (R-31). ` +
            `Contexto: «…${ventana.slice(-70)}${m[0]}…»`
        );
      }
    }
    assert.ok(
      menciones > 0,
      `${donde}: no declara nada sobre la (no) lectura de la tabla`
    );
  }
});

test('T-13 ⭐ R-30 el doc registra el HECHO verificado (3 filas, todas `gbp_description`, 2026-07-21)', () => {
  assert.match(DOC_OUTPUTS, /\b3\b/);
  assert.match(DOC_OUTPUTS, /gbp_description/);
  assert.match(DOC_OUTPUTS, /2026-07-21/);
  assert.match(
    DOC_OUTPUTS,
    /F-089\s+R-07/,
    'debe citar dónde se eliminó el único read'
  );
});

test('T-13 ⭐ R-32 F-117 NO construye lector, endpoint, UI ni consulta sobre `generated_outputs`', () => {
  // En todo el route, `generated_outputs` sólo aparece en el write-path (`.insert`).
  const RE = /\.from\(\s*'generated_outputs'\s*\)([\s\S]{0,120})/g;
  let usos = 0;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(ROUTE)) !== null) {
    usos++;
    assert.match(
      m[1],
      /\.insert\(/,
      'apareció un acceso a `generated_outputs` que NO es el write-path (R-32)'
    );
  }
  assert.ok(usos > 0);
  const enHead = execFileSync('git', ['show', `HEAD:${ROUTE_REL}`], {
    cwd: REPO,
    encoding: 'utf8'
  });
  assert.equal(
    usos,
    (enHead.match(/\.from\(\s*'generated_outputs'\s*\)/g) ?? []).length,
    'F-117 no puede agregar ni quitar accesos a `generated_outputs`'
  );
});

/* ================================================================== */
/*  (d) Brandboard — R-28 / R-29                                       */
/* ================================================================== */

test('T-12 ⭐ R-28 la declaración del Brandboard existe, nombra el GATE y difiere a la Fase F', () => {
  assert.match(
    DOC_BRANDBOARD,
    /!ofvApproved/,
    'la declaración DEBE nombrar el gate a preservar, o el traslado lo pierde'
  );
  assert.match(DOC_BRANDBOARD, /ofvApproved/);
  assert.match(
    DOC_BRANDBOARD,
    /Fase\s+F/i,
    'el traslado se difiere a la Fase F'
  );
  assert.match(
    DOC_BRANDBOARD,
    /conveniencia\s+de\s+gating/i,
    'debe declarar que está alojado por conveniencia de gating, no por pertenencia'
  );
  assert.match(DOC_BRANDBOARD, /no\s+por\s+pertenencia/i);
  for (const prop of ['clientId', 'tenantId', 'userId']) {
    assert.ok(
      DOC_BRANDBOARD.includes(prop),
      `la declaración no dice que el destino deberá proveer ${prop}`
    );
  }
  assert.match(DOC_BRANDBOARD, /brandboard-tab\.tsx/);
});

/**
 * **⤫ F-119 — GUARD PREEXISTENTE RE-ANCLADO (no debilitado).** *(Mismo patrón e idéntica
 * autorización que los re-anclajes ⤫ F-118 de `f116`/`f117` — lección CL-107 / F-118 H-5.)*
 *
 * La intención de R-29 es **que el Brandboard no se mueva**: F-117 lo *declara* alojado por
 * conveniencia de gating, y el traslado es de la Fase F. Esa intención **sigue viva y se
 * preserva entera**. Lo que dejó de ser cierto es el vehículo: *"`page.tsx` byte-idéntico a
 * `HEAD`"* — F-119 (Fase E) edita ese archivo por diseño, en partes que **nada tienen que ver
 * con el Brandboard** (derivación de `version` + señal de procedencia). Y contra `HEAD` el
 * guard volvería a verde **por movimiento del ancla** al commitear, afirmando algo ya falso.
 *
 * Re-anclaje: `brandboard-tab.tsx` sigue exigido **byte-idéntico** (es LA UI del Brandboard),
 * contra el **commit FIJO `2c072b6`** en vez de `HEAD`; y de `page.tsx` se exige que **el
 * Brandboard no se haya movido**: mismo `TabsTrigger` gateado, mismo `TabsContent`, mismo
 * import del tab, y **cero** líneas del bloque Brandboard tocadas por el diff de F-119.
 */
test('T-12 ⭐ R-29 (⤫ F-119) el Brandboard NO se movió: `brandboard-tab.tsx` byte-idéntico a `2c072b6` y su bloque en `page.tsx` intacto', () => {
  const BASE = '2c072b6';
  const desde = (rel: string): string =>
    execFileSync('git', ['show', `${BASE}:${rel}`], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });
  // La UI del Brandboard propiamente dicha: byte-identidad plena, ancla FIJA.
  assert.equal(
    read(TAB_REL),
    desde(TAB_REL),
    `${TAB_REL}: el traslado del Brandboard es de la Fase F (R-29) — F-119 no lo toca`
  );
  // Y en `page.tsx`, el bloque del Brandboard sigue exactamente donde y como estaba.
  const PAGE = read(PAGE_REL);
  const BASE_PAGE = desde(PAGE_REL);
  const bloqueBrandboard = (src: string): string => {
    const i = src.indexOf("<TabsContent value='brandboard'");
    assert.ok(i > 0, 'no se encontró el `TabsContent` del Brandboard');
    return src.slice(i, src.indexOf('</TabsContent>', i));
  };
  assert.equal(bloqueBrandboard(PAGE), bloqueBrandboard(BASE_PAGE));
  for (const src of [PAGE, BASE_PAGE]) {
    assert.match(
      src,
      /<TabsTrigger\s+value='brandboard'\s+disabled=\{\s*!ofvApproved\s*\}/
    );
    assert.match(src, /BrandboardTab/);
  }
  // El diff de F-119 sobre `page.tsx` no menciona el Brandboard en ninguna línea.
  const diff = execFileSync('git', ['diff', BASE, '--', PAGE_REL], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  })
    .split('\n')
    .filter(
      (l) =>
        (l.startsWith('+') || l.startsWith('-')) &&
        !l.startsWith('+++') &&
        !l.startsWith('---')
    );
  assert.deepEqual(
    diff.filter((l) => /brandboard/i.test(l)),
    [],
    'F-119 no puede tocar ninguna línea del Brandboard (R-29: el traslado es Fase F)'
  );
});

test('T-12 R-29 el gate `disabled={!ofvApproved}` sigue vivo en el `TabsTrigger`', () => {
  const PAGE = read(PAGE_REL);
  assert.match(
    PAGE,
    /<TabsTrigger\s+value='brandboard'\s+disabled=\{\s*!ofvApproved\s*\}/,
    'el gate del Brandboard no puede perderse'
  );
  assert.match(PAGE, /<TabsContent\s+value='brandboard'/);
});
