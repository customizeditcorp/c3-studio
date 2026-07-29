/**
 * F-123 — **T-01** — El catálogo de plantillas del Brief (R-03, R-04, R-07, R-09, R-10, R-11).
 *
 * ⭐⭐⭐ **R-10 — BYTE-IDENTIDAD CONTRA EL ANCLA, y por qué se mide así.**
 * Los strings esperados **NO se re-tipean acá**: se **extraen de `3be506d`** y se **EJECUTA**
 * la expresión original del `onClick` con el mismo contexto. Un test que re-tipea el texto
 * esperado sólo prueba que dos copias coinciden — y si el autor se equivoca al copiar, el
 * test queda verde sobre un texto que la app nunca produjo. **F-123 corrige la PROCEDENCIA,
 * no rediseña las plantillas:** si un byte cambia, esto tiene que ponerse rojo.
 *
 * (Mismo instrumento que `f122-industry-language.test.ts` usó para el prompt de alt-text:
 * extraer la expresión real del repo y ejecutarla, en vez de afirmar sobre ella.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  TEMPLATE_BUTTONS,
  TEMPLATE_FIELDS,
  DETECTABLE_FIELDS,
  MIN_SKELETON,
  buildTemplate,
  isIdentifiable,
  literalParts,
  templateFor,
  variantFor,
  type TemplateCtx
} from '../../src/lib/onboarding/field-templates.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
/** ⭐ Ancla FIJA de F-123. Jamás `HEAD`: contra `HEAD` el guard vuelve a verde al commitear. */
const BASE = '3be506d';
const PAGE = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';

const git = (...a: string[]): string =>
  execFileSync('git', a, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ANCLA = git('show', `${BASE}:${PAGE}`);

/* ================================================================== */
/*  Extracción de las plantillas REALES del ancla                      */
/* ================================================================== */

/** Corta desde `i` (que apunta al `(` de apertura) hasta su paréntesis balanceado. */
function argsBalanceados(src: string, i: number): string {
  let d = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '(') d++;
    else if (c === ')') {
      d--;
      if (d === 0) return src.slice(i + 1, j);
    }
  }
  throw new Error('paréntesis sin cerrar');
}

/**
 * Todas las llamadas `updateBrief('<campo>', <expr>)` del ancla **que escriben una
 * plantilla** — se descartan las de `onChange`, cuyo segundo argumento es `e.target.value`.
 */
function plantillasDelAncla(): Map<string, string> {
  const code = stripComments(ANCLA);
  const out = new Map<string, string>();
  const re = /updateBrief\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const abre = m.index + m[0].length - 1;
    let args: string;
    try {
      args = argsBalanceados(code, abre);
    } catch {
      continue;
    }
    const coma = args.indexOf(',');
    if (coma < 0) continue;
    const campo = args.slice(0, coma).trim().replace(/^'|'$/g, '');
    const expr = args.slice(coma + 1).trim();
    if (!/^[a-z0-9_]+$/.test(campo)) continue;
    if (expr.includes('e.target.value')) continue; // onChange, no plantilla
    out.set(campo, expr);
  }
  return out;
}

const PLANTILLAS_ANCLA = plantillasDelAncla();

/** EJECUTA la expresión del ancla con el contexto dado. No la parafrasea: la corre. */
function textoDelAncla(campo: string, ctx: TemplateCtx): string {
  const expr = PLANTILLAS_ANCLA.get(campo);
  assert.ok(expr, `el ancla no tiene plantilla para \`${campo}\``);
  return new Function('briefFields', 'ind', `return (${expr});`)(
    { business_name: ctx.business_name ?? '', city: ctx.city ?? '' },
    ctx.industry_label ?? ''
  ) as string;
}

/** Contextos de prueba: con industria, sin industria, y todo vacío (fallbacks). */
const CTXS: TemplateCtx[] = [
  {
    business_name: 'SCS CLeaning Service',
    industry_label: 'Limpieza',
    city: 'Buellton'
  },
  { business_name: 'Clara V Decor', industry_label: null, city: 'Santa Maria' },
  { business_name: '', industry_label: '', city: '' },
  {
    business_name: 'R & M QTB LLC',
    industry_label: 'portable toilet rental service',
    city: ''
  }
];

/* ================================================================== */
/*  ⭐⭐⭐ R-10 — byte-identidad, campo por campo, contexto por contexto */
/* ================================================================== */

test('T-01 ⭐⭐⭐ R-10 los 12 campos producen texto BYTE-IDÉNTICO al de `3be506d`', () => {
  // Anti-no-op: si la extracción del ancla saliera vacía, todo pasaría solo.
  assert.equal(
    PLANTILLAS_ANCLA.size,
    12,
    `se extrajeron ${PLANTILLAS_ANCLA.size} plantillas del ancla, se esperaban 12: la ` +
      'extracción está rota y el test no estaría comparando contra nada'
  );
  for (const campo of TEMPLATE_FIELDS) {
    const tpl = templateFor(campo);
    assert.ok(tpl, `falta la plantilla de \`${campo}\` en el catálogo`);
    for (const ctx of CTXS) {
      assert.equal(
        buildTemplate(tpl, ctx),
        textoDelAncla(campo, ctx),
        `R-10: \`${campo}\` cambió de texto con ctx=${JSON.stringify(ctx)}. F-123 corrige ` +
          'la PROCEDENCIA, no rediseña las plantillas: rediseñar el contenido es producto, ' +
          'y mezclarlo impediría distinguir un arreglo de señal de un cambio de texto (DT-05).'
      );
    }
  }
});

/* ================================================================== */
/*  ⭐⭐ R-04 — sin industria, la cláusula se OMITE ENTERA               */
/* ================================================================== */

test('T-01 ⭐⭐ R-04 sin industria declarada no hay hueco, ni `undefined`, ni token', () => {
  const sinInd: TemplateCtx = {
    business_name: 'X',
    industry_label: null,
    city: 'Buellton'
  };
  for (const campo of TEMPLATE_FIELDS) {
    const texto = buildTemplate(templateFor(campo)!, sinInd);
    assert.ok(!texto.includes('undefined'), `${campo}: emitió \`undefined\``);
    assert.ok(!texto.includes('null'), `${campo}: emitió \`null\``);
    assert.ok(
      !/\bother\b/.test(texto),
      `${campo}: emitió el token \`other\` (F-121 R-15)`
    );
    assert.ok(
      !/\s{2,}/.test(texto),
      `${campo}: quedó un HUECO de doble espacio`
    );
    assert.ok(
      !/ para \s*$| para $/.test(texto),
      `${campo}: quedó la cláusula «para …» colgando`
    );
  }
  // Y el caso que produjo el defecto de Clara V, explícito.
  assert.equal(
    buildTemplate(templateFor('goal_12m')!, sinInd),
    'Top 3 en Google Maps en Buellton + 15-20 leads/mes'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-07 / R-11 — estructura y ESQUELETO identificable              */
/* ================================================================== */

test('T-01 ⭐⭐ R-07 el catálogo tiene 7 botones y 12 campos, y ninguno se repite', () => {
  assert.equal(TEMPLATE_BUTTONS.length, 7, 'deben ser 7 botones');
  assert.equal(TEMPLATE_FIELDS.length, 12, 'deben ser 12 campos alcanzables');
  assert.equal(
    new Set(TEMPLATE_FIELDS).size,
    12,
    'hay un campo declarado dos veces'
  );
  for (const b of TEMPLATE_BUTTONS) {
    assert.ok(b.fields.length >= 1, `${b.id}: botón sin campos`);
    for (const f of b.fields)
      assert.ok(f.variants.length >= 1, `${f.field}: sin variantes`);
  }
});

test('T-01 ⭐⭐⭐ R-11 toda variante DETECTABLE tiene esqueleto identificable (suma ordenada)', () => {
  // ⚠️ ENMIENDA DEL OPERADOR (2026-07-28): el umbral se mide sobre la SUMA ORDENADA de las
  // partes literales, no sobre la parte suelta más larga. Medido por la parte mayor,
  // `goal_12m` daba FALSO POSITIVO (su parte mayor es `'Top 3 en Google Maps'`, 20) cuando
  // su esqueleto completo suma 42+ y es inconfundible. R-11 pide identificar LA VARIANTE.
  const sinEsqueleto: string[] = [];
  for (const b of TEMPLATE_BUTTONS) {
    for (const f of b.fields) {
      if (f.detectable === false) continue; // excepción declarada, ver abajo
      for (const v of f.variants) {
        if (!isIdentifiable(v))
          sinEsqueleto.push(`${f.field} → «${literalParts(v).join('')}»`);
      }
    }
  }
  assert.deepEqual(
    sinEsqueleto,
    [],
    `R-11: estas variantes DETECTABLES no llegan a ${MIN_SKELETON} caracteres de literal en ` +
      'orden ⇒ el detector daría un verde vacío sobre ellas. O ganan esqueleto, o se ' +
      'declaran `detectable: false` con su razón.'
  );
  // Y el umbral DISCRIMINA: si aceptara cualquier cosa, R-11 sería inerte.
  assert.equal(
    isIdentifiable({ when: () => true, parts: ['35-55'] }),
    false,
    'un umbral que acepta `35-55` como esqueleto haría al detector producir falsos positivos'
  );
});

test('T-01 ⭐⭐ la excepción `demo_age` está DECLARADA, es la ÚNICA, y no está obsoleta', () => {
  const noDetectables = TEMPLATE_BUTTONS.flatMap((b) =>
    b.fields.filter((f) => f.detectable === false).map((f) => f.field)
  );
  assert.deepEqual(
    noDetectables,
    ['demo_age'],
    'la excepción de detección debe ser UNA y estar declarada: `demo_age` («35-55») no ' +
      'tiene esqueleto distintivo y detectarlo metería falsos positivos (R-25). Una ' +
      'excepción nueva sin razón escrita es un agujero con nombre.'
  );
  // Anti-obsolescencia: la excepción existe porque su literal es corto. Si dejara de serlo,
  // la excepción sobra y este test lo dice.
  const tpl = templateFor('demo_age')!;
  assert.ok(
    !isIdentifiable(tpl.variants[0]),
    'el literal de `demo_age` ya supera el umbral ⇒ la excepción quedó obsoleta y debe irse'
  );
  // Y sigue estando EN el catálogo: R-08 no admite literales inline en `page.tsx`.
  assert.ok(TEMPLATE_FIELDS.includes('demo_age'));
  assert.ok(!DETECTABLE_FIELDS.includes('demo_age'));
  assert.equal(DETECTABLE_FIELDS.length, 11);
});

/* ================================================================== */
/*  ⭐⭐ R-09 / R-03 — pureza y frontera con la industria                */
/* ================================================================== */

test('T-01 ⭐⭐ R-09 el módulo del catálogo es PURO: sin React, sin Supabase, sin red', () => {
  const src = readFileSync(
    resolve(REPO, 'src/lib/onboarding/field-templates.ts'),
    'utf8'
  );
  const code = stripComments(src);
  for (const prohibido of [
    'react',
    '@supabase',
    'next/',
    'fetch(',
    'process.env'
  ]) {
    assert.ok(
      !code.includes(prohibido),
      `el catálogo importa/usa \`${prohibido}\`: deja de ser testeable sin renderizar (R-09)`
    );
  }
  assert.ok(
    !/^import /m.test(code),
    'el catálogo no debe importar nada: es una declaración'
  );
});

test('T-01 ⭐⭐ R-03 el catálogo NO conoce `clients.industry` ni re-declara `INDUSTRIES`', () => {
  const code = stripComments(
    readFileSync(resolve(REPO, 'src/lib/onboarding/field-templates.ts'), 'utf8')
  );
  assert.ok(
    !/\.industry\b/.test(code),
    'R-03: el catálogo debe recibir `industry_label` YA RESUELTO por `toIndustryLabel`. ' +
      'Si leyera `clients.industry` crudo, F-122 R-18 ganaría un sujeto nuevo que vigilar.'
  );
  assert.ok(
    !/INDUSTRIES/.test(code),
    'R-03: reapareció una copia de la tabla de industrias'
  );
});

/* ================================================================== */
/*  ⭐ La elección de variante es determinista y la última es total     */
/* ================================================================== */

test('T-01 ⭐ `variantFor` elige la PRIMERA aplicable y la última variante es incondicional', () => {
  for (const b of TEMPLATE_BUTTONS) {
    for (const f of b.fields) {
      const ultima = f.variants[f.variants.length - 1];
      assert.equal(
        ultima.when({}),
        true,
        `${f.field}: la última variante no es incondicional ⇒ habría contextos sin plantilla`
      );
      // Con industria, una plantilla de 2 variantes debe tomar la primera.
      if (f.variants.length > 1) {
        assert.notEqual(
          variantFor(f, { industry_label: 'Limpieza' }),
          ultima,
          `${f.field}: con industria debe elegir la variante que la usa`
        );
      }
    }
  }
});
