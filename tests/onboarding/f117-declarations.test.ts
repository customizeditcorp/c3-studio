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
/** ⤫ F-120 — el componente se MOVIÓ acá (byte-idéntico). Ruta vieja, sólo como ancla git. */
const TAB_REL = 'src/components/brandboard/brandboard-tab.tsx';
const TAB_REL_ORIGEN =
  'src/app/(app)/onboarding/brief/[clientId]/brandboard-tab.tsx';
/** ⤫ F-120 — el destino del tab Brandboard: la ficha del cliente. */
const FICHA_REL = 'src/app/(app)/clients/[id]/page.tsx';

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
 * **⤫ F-120 — GUARD PREEXISTENTE RE-ANCLADO (no debilitado; ENDURECIDO).**
 * *(Mismo patrón e idéntica doctrina que el re-anclaje ⤫ F-119 que este mismo test llevaba,
 * y que los ⤫ F-118 de `f116`/`f117` — lección CL-107 / F-118 H-5 / F-119 R-37. Autorización:
 * `CL-103`, spec `specs/F-120/` R-45, previsto por escrito en `design.md` §10.3 fila 1.)*
 *
 * **Qué dejó de ser cierto y por qué.** El enunciado anterior era *"el Brandboard NO se movió"*,
 * y su razón literal era *"el traslado es de la **Fase F**"*. **F-120 ES la Fase F.** El guard
 * afirmaba exactamente lo que esta feature vino a ejecutar (R-23), con la bendición escrita de
 * `docs/brandboard-placement.md`. Mantenerlo tal cual obligaría a F-120 a evadirlo; borrarlo
 * perdería la única red que protege el gate.
 *
 * **Qué se preserva — la intención real, entera.** La intención de R-29 nunca fue "que nada se
 * mueva": era **que el componente no se altere y que el gate no se pierda en silencio** — el
 * riesgo que `docs/brandboard-placement.md` nombra por escrito (*"hacerlo al final de una
 * feature de cableado es exactamente cómo se pierde un gate en silencio"*). Ambas cosas siguen
 * exigidas, ahora en el destino:
 *
 *   1. `brandboard-tab.tsx` sigue exigido **BYTE-IDÉNTICO**, contra el **commit FIJO `76e7637`**
 *      (la ruta vieja en git ↔ la ruta nueva en disco). El movimiento no autoriza ni una línea.
 *   2. El `TabsTrigger value='brandboard' disabled={!ofvApproved}` sigue exigido — **en la
 *      ficha**, su nuevo hogar — junto con su `TabsContent`.
 *
 * **Lo que se AÑADE (el guard viejo no podía pedirlo):** la pantalla del núcleo tiene **CERO**
 * referencias al Brandboard. El guard viejo sólo podía comprobar que el bloque siguiera ahí;
 * éste comprueba además que **no quedó nada atrás**, que es lo que hace del traslado un
 * traslado y no una duplicación.
 *
 * **Ancla FIJA, nunca `HEAD`.** Contra `HEAD` este guard volvería a verde **por movimiento del
 * ancla** en cuanto se commitee, afirmando algo ya falso; un guard que sólo puede estar verde
 * DESPUÉS del commit está mal anclado (CL-107). Verde en el working tree **sin commit**.
 */
const BASE_F120 = '76e7637';

test('T-12 ⭐ R-29 (⤫ F-120) el Brandboard SE MOVIÓ sin perder el gate: componente byte-idéntico a `76e7637`, gate en el DESTINO, cero rastros en el ORIGEN', () => {
  const desde = (rel: string): string =>
    execFileSync('git', ['show', `${BASE_F120}:${rel}`], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024
    });

  // (1) La UI del Brandboard: byte-identidad plena a través del movimiento. Ancla FIJA.
  assert.equal(
    read(TAB_REL),
    desde(TAB_REL_ORIGEN),
    `${TAB_REL}: el traslado es de UBICACIÓN, no de comportamiento (R-26) — ni una línea ` +
      'del editor puede cambiar al mudarse'
  );

  // (2) El gate, en el DESTINO. Whitespace-tolerante (el hook husky/prettier reformatea).
  const FICHA = read(FICHA_REL);
  assert.match(
    FICHA,
    /<TabsTrigger\s+value='brandboard'\s+disabled=\{\s*!ofvApproved\s*\}/,
    'el gate del Brandboard NO puede perderse en el traslado — es el riesgo concreto que ' +
      '`docs/brandboard-placement.md` nombró por escrito'
  );
  assert.match(FICHA, /<TabsContent\s+value='brandboard'/);
  assert.match(FICHA, /BrandboardTab/);

  // (3) Lo que el guard viejo no podía pedir: CERO rastros en el ORIGEN (R-23).
  const PAGE = read(PAGE_REL);
  assert.equal(
    (PAGE.match(/brandboard/gi) ?? []).length,
    0,
    'la pantalla del núcleo contiene el núcleo y nada adicional (CL-102, mandato 1): ' +
      'tras el traslado no puede quedar ni una referencia al Brandboard'
  );
  // Y el archivo ya no existe en la ruta vieja: es un MOVIMIENTO, no una copia.
  assert.throws(
    () => read(TAB_REL_ORIGEN),
    'el componente no puede quedar duplicado en la carpeta de ruta del núcleo'
  );
});

test('T-12 R-29 (⤫ F-120) el gate `disabled={!ofvApproved}` se DERIVA de la lectura canónica, no de una consulta propia', () => {
  const FICHA = read(FICHA_REL);
  assert.match(
    FICHA,
    /<TabsTrigger\s+value='brandboard'\s+disabled=\{\s*!ofvApproved\s*\}/,
    'el gate del Brandboard no puede perderse'
  );
  assert.match(FICHA, /<TabsContent\s+value='brandboard'/);
  // R-25: `ofvApproved` sale del seam de procedencia, no de un `.eq('status','approved')`
  // propio del gate. `pickCanonicalOffer` devuelve `null` sii no hay candidatos ⇒ la
  // condición es EXACTAMENTE equivalente a la existencia que el gate usaba en el origen.
  assert.match(
    FICHA,
    /const\s+ofvApproved\s*=[\s\S]{0,160}?ofvSource[\s\S]{0,120}?'none-approved'/,
    'R-25: el gate se recomputa DERIVÁNDOLO de la lectura canónica que la feature ya trae'
  );
});
