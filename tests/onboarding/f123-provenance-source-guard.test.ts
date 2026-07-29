/**
 * F-123 — **T-07** — ⭐⭐⭐ **El source-guard de PROCEDENCIA, derivado del repo**
 * (R-01, R-02, R-08, R-12, R-14, R-22, R-23, R-24, R-27).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * QUÉ IMPIDE, Y POR QUÉ HACE FALTA
 * ─────────────────────────────────────────────────────────────────────────────────
 * El defecto de CL-113 vivió **desde 2026-04-14 hasta 2026-07-27** —anterior a F-095 y
 * posterior a F-122— y **ninguna feature del arco lo vio**, porque todas miraban el
 * generador y **esto nunca pasó por el generador**. Contaminó **8 de 18 briefs (44 %)**,
 * **6 ya `approved`**, incluido el que se usaba como patrón de oro.
 *
 * Un arreglo sin guard es una convención: el próximo botón «Sugerir …» con un literal
 * pegado vuelve a mentir y nadie se entera. Este test hace que **no se pueda volver**.
 *
 * ⭐ **La lista se DESCUBRE, no se enumera** (instrumento de F-122 R-18/R-40): las partes
 * literales y los campos alcanzables se derivan **del catálogo**, y los archivos, **de
 * disco**. Un botón nuevo queda cubierto **por construcción**.
 *
 * ⚠️ **Ancla FIJA `3be506d`, jamás `HEAD`** (lección CL-107/CL-109): contra `HEAD` el guard
 * vuelve a verde al commitear, afirmando algo que ya es falso.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  TEMPLATE_BUTTONS,
  TEMPLATE_FIELDS,
  literalParts
} from '../../src/lib/onboarding/field-templates.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** ⭐ Ancla FIJA de F-123: `main` en el commit donde el defecto TODAVÍA vive. */
const BASE = '3be506d';
const CATALOGO = 'src/lib/onboarding/field-templates.ts';
const BRIEF = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';

const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');
const git = (...a: string[]): string =>
  execFileSync('git', a, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
const desde = (rel: string): string => git('show', `${BASE}:${rel}`);
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Todos los `.ts`/`.tsx` de `src/`, descubiertos de disco (nunca hardcodeados). */
function fuentes(): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(resolve(REPO, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (/\.tsx?$/.test(e.name)) out.push(r);
    }
  };
  walk('src');
  return out.sort();
}

/**
 * ⭐ Las partes literales SUSTANTIVAS del catálogo — el sujeto del guard (a). Se descartan
 * los conectores cortos (` en `, ` para `), que aparecen en cualquier prosa y producirían
 * falsos positivos. El umbral es el mismo criterio de identificabilidad de R-11.
 */
const LITERALES: string[] = TEMPLATE_BUTTONS.flatMap((b) =>
  b.fields.flatMap((f) => f.variants.flatMap((v) => literalParts(v)))
)
  .filter((l) => l.trim().length >= 24)
  .filter((l, i, a) => a.indexOf(l) === i);

/**
 * ⭐ Las EXCEPCIONES, declaradas por **ROL** con su razón escrita (R-23). Son roles, no
 * archivos: un sitio nuevo con el mismo rol cae acá; uno con el rol prohibido, no.
 */
const EXCEPCIONES: { rol: string; razon: string }[] = [
  {
    rol: 'el catálogo mismo (`field-templates.ts`)',
    razon:
      'Es la DECLARACIÓN única de las plantillas: es donde los literales deben vivir. ' +
      'Prohibirlos acá haría imposible declararlos en ninguna parte, que es el absurdo ' +
      'de un guard que se encuentra a sí mismo.'
  },
  {
    rol: 'los tests de F-123 y los re-anclados de F-122',
    razon:
      'Los tests NOMBRAN lo prohibido para poder prohibirlo y para fijar la byte-identidad ' +
      'contra el ancla. Medirlos con el mismo criterio que `src/` es la forma degenerada ' +
      'del defecto que `feedback_guards_measure_index_not_world` describe.'
  }
];

/* ================================================================== */
/*  ⭐ Anti-no-op del propio derivador                                  */
/* ================================================================== */

test('T-07 ⭐ R-40 el guard DERIVA su sujeto del catálogo y del disco (si sale vacío, es un no-op)', () => {
  assert.ok(
    fuentes().length > 100,
    `sólo ${fuentes().length} archivos en src/: recorrido roto`
  );
  assert.ok(
    LITERALES.length >= 8,
    `sólo ${LITERALES.length} literales sustantivos derivados del catálogo: el derivador ` +
      'dejó de medir y el guard pasaría por vacío'
  );
  assert.equal(TEMPLATE_FIELDS.length, 12);
  for (const e of EXCEPCIONES)
    assert.ok(
      e.razon.length > 60,
      `la excepción «${e.rol}» no declara razón suficiente`
    );
});

/* ================================================================== */
/*  ⭐⭐⭐ (a) R-08/R-22a — cero literales de plantilla fuera del catálogo */
/* ================================================================== */

/** Los archivos de `src/` que llevan algún literal del catálogo escrito en línea. */
function conLiteralesInline(
  leer: (rel: string) => string,
  archivos: string[]
): string[] {
  const out: string[] = [];
  for (const rel of archivos) {
    if (rel.endsWith(CATALOGO)) continue; // excepción declarada: es la declaración
    let code: string;
    try {
      code = stripComments(leer(rel));
    } catch {
      continue;
    }
    for (const lit of LITERALES) {
      if (code.includes(lit)) {
        out.push(`${rel} → «${lit.slice(0, 46)}…»`);
        break;
      }
    }
  }
  return out;
}

test('T-07 ⭐⭐⭐ R-08 ningún archivo de `src/` escribe un literal de plantilla EN LÍNEA', () => {
  assert.deepEqual(
    conLiteralesInline(read, fuentes()),
    [],
    'R-08: estos archivos llevan el texto de una plantilla escrito a mano. El texto debe ' +
      'venir del catálogo: un literal pegado en la pantalla es exactamente la forma en que ' +
      'la UI volvió a afirmar como inferencia lo que era una constante.'
  );
});

/* ================================================================== */
/*  ⭐⭐ (b) R-12/R-22b — la superficie del Brief no afirma generación   */
/* ================================================================== */

test('T-07 ⭐⭐ R-12 `sparkles` no aparece en la superficie del Brief', () => {
  assert.ok(
    !stripComments(read(BRIEF)).includes('sparkles'),
    'R-12: el ícono de chispas volvió al Brief. Ese ícono AFIRMA generación por modelo, y ' +
      'los botones de plantilla no llaman a ningún modelo: es la procedencia falsa otra vez.'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ (c) R-14/R-22c — ningún campo alcanzable se marca `ai` literal */
/* ================================================================== */

/**
 * Los `<Field>` que declaran `dot='ai'` **literal** y envuelven un campo **alcanzable**.
 * El mapeo `Field`→campo se DERIVA de las referencias `briefFields.<key>` /
 * `updateBrief('<key>'` que aparecen dentro del bloque del `Field`.
 */
function camposMarcadosAiLiteral(fuente: string): string[] {
  const code = stripComments(fuente);
  const out: string[] = [];
  const re = /<Field\b[^>]*?dot='ai'[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const bloque = code.slice(m.index, m.index + 900);
    for (const campo of TEMPLATE_FIELDS) {
      const refs = new RegExp(
        `briefFields\\.${campo}\\b|updateBrief\\('${campo}'`
      );
      if (refs.test(bloque) && !out.includes(campo)) out.push(campo);
    }
  }
  return out;
}

test("T-07 ⭐⭐⭐ R-14 ningún campo alcanzable por un botón queda marcado `dot='ai'` literal", () => {
  assert.deepEqual(
    camposMarcadosAiLiteral(read(BRIEF)),
    [],
    "R-14: estos campos pueden contener texto de plantilla y siguen declarando `dot='ai'` " +
      'fijo ⇒ la pantalla afirma que los infirió el modelo. Su marca debe DERIVARSE del ' +
      'valor (`provenanceOf`), que además los apaga solos cuando el operador edita o el ' +
      'modelo sobrescribe.'
  );
  // ⚠️ Y el complemento que impide la MENTIRA SIMÉTRICA: los `Field` que NO son alcanzables
  // conservan `dot='ai'`, porque ahí la IA sí genera. Borrarlo en bloque —la lectura
  // literal de «quitar dot='ai'»— habría sido cambiar una mentira por la otra.
  const aiRestantes = (stripComments(read(BRIEF)).match(/dot='ai'/g) ?? [])
    .length;
  assert.ok(
    aiRestantes >= 25,
    `sólo quedan ${aiRestantes} campos con \`dot='ai'\`: se borró la marca en campos que ` +
      'el modelo SÍ genera (Buyer Persona / OFV) ⇒ mentira simétrica'
  );
});

/* ================================================================== */
/*  ⭐⭐ (d) R-02/R-27 — F-123 no escribe NADA                          */
/* ================================================================== */

test('T-07 ⭐⭐ R-02/R-27 el código de F-123 no emite ninguna escritura', () => {
  const nuevos = [CATALOGO];
  for (const rel of nuevos) {
    const code = stripComments(read(rel));
    for (const w of ['.insert(', '.update(', '.delete(', 'supabase']) {
      assert.ok(
        !code.includes(w),
        `${rel}: contiene \`${w}\`. F-123 SEÑALA la contaminación; corregir las 8 filas ` +
          'existentes es del operador (R-02 / F-121 R-04 / F-122 R-35).'
      );
    }
  }
  // Y el componente del aviso no gatea ni muta: cero `disabled`, cero handlers.
  const aviso = stripComments(read(BRIEF)).slice(
    stripComments(read(BRIEF)).indexOf('function TemplateProvenanceNotice'),
    stripComments(read(BRIEF)).indexOf('function TemplateProvenanceNotice') +
      1400
  );
  for (const prohibido of [
    'disabled',
    'onClick',
    'updateBrief(',
    'setBriefFields'
  ]) {
    assert.ok(
      !aviso.includes(prohibido),
      `el aviso de procedencia contiene \`${prohibido}\`: DT-02 lo fijó ADVISORY — el ` +
        'operador pidió explícitamente no cambiar todavía la autoridad de aprobación.'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ (e) R-24 — ANTI-NO-OP: el guard ENCUENTRA el defecto en `3be506d` */
/* ================================================================== */

test('T-07 ⭐⭐⭐ R-24 los MISMOS asserts, corridos contra `3be506d`, encuentran el defecto', () => {
  // Un guard que sólo se corre contra el estado ARREGLADO no prueba nada: verde por
  // ausencia de sujeto. Se lo corre contra el ancla —donde el defecto SÍ está— y tiene que
  // encontrarlo, o está ciego y su verde de hoy no significa nada.
  const anclaBrief = desde(BRIEF);

  // (a) en el ancla, los literales SÍ están inline en la pantalla.
  const inline = conLiteralesInline((rel) => desde(rel), [BRIEF]);
  assert.equal(
    inline.length,
    1,
    'contra el ancla el guard NO encuentra los literales inline del Brief: el detector de ' +
      '(a) está ciego'
  );

  // (b) en el ancla, el ícono de chispas está.
  assert.ok(
    stripComments(anclaBrief).includes('sparkles'),
    'contra el ancla no aparece `sparkles`: el assert (b) no mide lo que dice'
  );

  // (c) en el ancla, los 12 campos alcanzables están marcados `dot='ai'` literal.
  const marcados = camposMarcadosAiLiteral(anclaBrief);
  assert.equal(
    marcados.length,
    12,
    `contra el ancla el guard encuentra ${marcados.length} campos marcados \`ai\`, se ` +
      'esperaban los 12 alcanzables. Si no los ve, el mapeo `Field`→campo está roto y el ' +
      'verde de hoy es vacío.'
  );
  // Y el catálogo NO existía en el ancla: es la prueba de que el ancla es anterior al fix.
  let existia = true;
  try {
    desde(CATALOGO);
  } catch {
    existia = false;
  }
  assert.equal(
    existia,
    false,
    `\`${CATALOGO}\` ya existía en ${BASE}: el ancla no sirve`
  );
});

/* ================================================================== */
/*  ⭐ (f) R-23 — las excepciones no están obsoletas                    */
/* ================================================================== */

test('T-07 ⭐ R-23 cada excepción corresponde a un sitio REAL de hoy', () => {
  // El catálogo existe y contiene los literales: si no, la excepción 1 sobra.
  const cat = read(CATALOGO);
  assert.ok(
    LITERALES.every((l) => cat.includes(l)),
    'la excepción del catálogo quedó obsoleta: los literales ya no viven ahí'
  );
  // Y los tests de F-123 existen y nombran literales: si no, la excepción 2 sobra.
  const testsF123 = readdirSync(resolve(REPO, 'tests/onboarding')).filter((f) =>
    /^f123-.*\.test\.ts$/.test(f)
  );
  assert.ok(
    testsF123.length >= 3,
    `sólo ${testsF123.length} tests de F-123: la excepción 2 quedaría sin sujeto`
  );
});
