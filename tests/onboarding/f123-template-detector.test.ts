/**
 * F-123 — **T-02** — El detector de procedencia (R-25).
 *
 * ⭐⭐ **La cobertura se DERIVA del catálogo, no se enumera** (mismo instrumento que
 * F-122 R-40). Si mañana el catálogo gana una plantilla y el detector no la ve, este test
 * se pone rojo **solo** — que es exactamente lo que ningún guard del arco tenía cuando el
 * defecto entró.
 *
 * ⚠️ **El criterio de éxito NO es «detectar todo lo posible».** Es **detectar sin producir
 * un solo falso positivo**: un falso rojo enseña al operador a ignorar el aviso, y ahí el
 * guard muere. Por eso los negativos usan **texto humano REAL** de producción, no inventado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATE_BUTTONS,
  DETECTABLE_FIELDS,
  buildTemplate,
  detectTemplateFields,
  templateFor,
  type TemplateCtx
} from '../../src/lib/onboarding/field-templates.ts';

const MARCADOR = '[' + 'PENDIENTE' + ']';

/**
 * ⭐ **R-36 (disciplina heredada de F-122) — fixtures REALES, citados con su fila.**
 * Texto tecleado por el operador, leído por `SELECT` read-only el 2026-07-28 del campo
 * `differentiators` —**no alcanzable** por ningún botón— de los briefs de SCS
 * (`73a3f894` · `bde29cca` · `874bf5b6`). Los typos («mas alla», «quimocos») son suyos y
 * se conservan: son justamente lo que hace que el fixture sea humano y no una paráfrasis.
 */
const HUMANO_REAL =
  'Sandra va mas alla de solo limpiar verdaderamente se preocupa por sus clientes y su ' +
  'trato es personalizado. Ella le pide a sus clientes que le provea los quimocos de ' +
  'limpieza de preferencia del cliente y ese es el que usa.';

const CTX: TemplateCtx = {
  business_name: 'SCS CLeaning Service',
  industry_label: 'Limpieza',
  city: 'Buellton'
};

/* ================================================================== */
/*  ⭐⭐⭐ R-25 — cobertura DERIVADA: toda variante de todo campo se ve  */
/* ================================================================== */

test('T-02 ⭐⭐⭐ R-25 el detector ve TODA variante de TODO campo detectable (derivado del catálogo)', () => {
  let comprobadas = 0;
  for (const btn of TEMPLATE_BUTTONS) {
    for (const tpl of btn.fields) {
      if (tpl.detectable === false) continue;
      for (const v of tpl.variants) {
        // Contexto que fuerza ESTA variante: con industria si la usa, sin ella si no.
        const usaInd = v.parts.some(
          (p) => typeof p !== 'string' && p.slot === 'industry_label'
        );
        const ctx: TemplateCtx = usaInd
          ? CTX
          : { ...CTX, industry_label: null };
        const texto = buildTemplate(tpl, ctx);
        const hits = detectTemplateFields({ [tpl.field]: texto }, ctx);
        assert.ok(
          hits.some((h) => h.field === tpl.field),
          `R-25: el detector NO ve la plantilla de \`${tpl.field}\` (variante ${
            usaInd ? 'con' : 'sin'
          } industria). Si el catálogo crece y el detector no lo sigue, el aviso miente por omisión.`
        );
        comprobadas++;
      }
    }
  }
  // Anti-no-op: si el recorrido no comprobara nada, el test pasaría solo.
  assert.ok(
    comprobadas >= 13,
    `sólo se comprobaron ${comprobadas} variantes: el recorrido derivado está roto`
  );
});

/* ================================================================== */
/*  ⭐⭐ R-25 — las parametrizadas sobreviven a un cambio de contexto    */
/* ================================================================== */

test('T-02 ⭐⭐ R-25 una plantilla parametrizada sigue detectándose si el ctx cambió DESPUÉS del click', () => {
  // El operador clickeó con Buellton y después cambió la ciudad a Santa Maria. El valor
  // guardado ya no es byte-idéntico al que produce el ctx actual — pero su ESQUELETO sí está.
  const ctxAlClickear: TemplateCtx = CTX;
  const ctxAhora: TemplateCtx = { ...CTX, city: 'Santa Maria' };
  const parametrizadas = ['main_problem', 'search_behavior', 'goal_12m'];
  for (const campo of parametrizadas) {
    const valorViejo = buildTemplate(templateFor(campo)!, ctxAlClickear);
    const hits = detectTemplateFields({ [campo]: valorViejo }, ctxAhora);
    const hit = hits.find((h) => h.field === campo);
    assert.ok(
      hit,
      `R-25: \`${campo}\` deja de detectarse en cuanto cambia el contexto ⇒ el aviso ` +
        'sería inútil justo en los casos que más importan'
    );
    assert.equal(
      hit.confidence,
      'skeleton',
      `\`${campo}\`: con el ctx cambiado la confianza debe ser \`skeleton\`, no \`exact\``
    );
  }
  // Y con el ctx intacto, la confianza es `exact`.
  const exacto = detectTemplateFields(
    { goal_12m: buildTemplate(templateFor('goal_12m')!, CTX) },
    CTX
  );
  assert.equal(exacto[0].confidence, 'exact');
});

/* ================================================================== */
/*  ⭐⭐⭐ R-25 — CERO falsos positivos, con texto humano REAL           */
/* ================================================================== */

test('T-02 ⭐⭐⭐ R-25 el texto tecleado por un humano NO se detecta (cero falsos positivos)', () => {
  // Se prueba el texto real contra TODOS los campos detectables: ninguno debe reconocerlo.
  for (const campo of DETECTABLE_FIELDS) {
    const hits = detectTemplateFields({ [campo]: HUMANO_REAL }, CTX);
    assert.deepEqual(
      hits,
      [],
      `R-25: el detector marcó como plantilla un texto REAL escrito por el operador ` +
        `(campo \`${campo}\`). Un falso rojo enseña a ignorar el aviso — y un aviso que se ` +
        'ignora es peor que no tenerlo.'
    );
  }
  // Variantes cercanas pero humanas: comparten palabras con las plantillas, no su esqueleto.
  const parecidos = [
    'Decide por el precio y por las reseñas de Google',
    'Depende del boca a boca pero ya tiene algo de pipeline',
    'Top 3 en Maps',
    'Valora la limpieza y la puntualidad'
  ];
  for (const p of parecidos) {
    for (const campo of DETECTABLE_FIELDS) {
      assert.deepEqual(
        detectTemplateFields({ [campo]: p }, CTX),
        [],
        `falso positivo con «${p}» en \`${campo}\`: el criterio se volvió difuso`
      );
    }
  }
});

test('T-02 ⭐⭐ vacío, espacios y el MARCADOR legítimo no se detectan (no se pisa F-104/F-106)', () => {
  for (const valor of [
    '',
    '   ',
    MARCADOR,
    `su presencia está en ${MARCADOR}`
  ]) {
    for (const campo of DETECTABLE_FIELDS) {
      assert.deepEqual(
        detectTemplateFields({ [campo]: valor }, CTX),
        [],
        `\`${campo}\` con «${valor}»: el marcador de pendiente es degradación honesta ` +
          'legítima (F-104/F-106) y F-123 no lo trata como defecto'
      );
    }
  }
  // Y un campo ausente no rompe.
  assert.deepEqual(detectTemplateFields({}, CTX), []);
});

/* ================================================================== */
/*  ⭐⭐ La excepción declarada NUNCA se detecta                        */
/* ================================================================== */

test('T-02 ⭐⭐ `demo_age` no se detecta NUNCA, ni con su propio valor de plantilla', () => {
  // Es la excepción declarada: `'35-55'` es un rango que cualquier humano tipea.
  const hits = detectTemplateFields({ demo_age: '35-55' }, CTX);
  assert.deepEqual(
    hits,
    [],
    'R-25: `demo_age` está declarada `detectable: false` porque no tiene esqueleto ' +
      'distintivo. Costo aceptado y declarado: un brief cuyo ÚNICO rastro sea `demo_age` no ' +
      'se señala — pero el botón de demografía escribe 4 campos y los otros 3 SÍ se detectan.'
  );
  // Y la compensación es real: los otros 3 del mismo botón sí disparan.
  const demografia = TEMPLATE_BUTTONS.find((b) => b.id === 'demographics')!;
  const valores: Record<string, string> = {};
  for (const f of demografia.fields) valores[f.field] = buildTemplate(f, CTX);
  const detectados = detectTemplateFields(valores, CTX).map((h) => h.field);
  assert.deepEqual(
    detectados.sort(),
    ['demo_income', 'demo_language', 'demo_occupation'],
    'el botón de demografía debe seguir siendo detectable por sus otros 3 campos'
  );
});

/* ================================================================== */
/*  ⭐⭐ Un brief entero de plantilla se detecta completo                */
/* ================================================================== */

test('T-02 ⭐⭐ un brief con TODAS las plantillas puestas detecta los 11 campos detectables', () => {
  const valores: Record<string, string> = {};
  for (const b of TEMPLATE_BUTTONS)
    for (const f of b.fields) valores[f.field] = buildTemplate(f, CTX);
  const hits = detectTemplateFields(valores, CTX);
  assert.equal(
    hits.length,
    11,
    `se detectaron ${hits.length} de 11 campos detectables (los 12 menos \`demo_age\`)`
  );
  // Y el detector DISCRIMINA: si además devolviera campos no puestos, sería ruido.
  assert.deepEqual(
    hits.map((h) => h.field).sort(),
    [...DETECTABLE_FIELDS].sort()
  );
});
