/**
 * F-117 — T-07/T-08 — Seam puro del **reparto núcleo → canal**
 * (`buildPersonaDownstreamBlock`, `src/lib/personas/method-context.ts`).
 *
 * Tests CONDUCTUALES framework-free (`node --test`) de:
 *   - el reparto exacto por step (R-11/R-12/R-13) y su **default-deny** (R-18);
 *   - la **degradación honesta** (R-16) y el `''` sin encabezado huérfano (R-17);
 *   - el **ANTI-NO-OP sobre la fila real `76b1f28e`** con tokens literales de
 *     producción (R-25);
 *   - la **NO-REGRESIÓN de F-112** sobre sus 6 fixtures reales (R-21/R-22/R-23).
 *
 * ⚠️ **NOTA DE MODALIDAD OBLIGATORIA (`docs/verification.md` §6).**
 * La claim *"el bloque de `ofv` de F-112 no cambió"* es **CONDUCTUAL**: se prueba
 * comparando la SALIDA del ensamblado contra los valores que producía la
 * implementación **anterior a F-117** (extraída de `HEAD` con `git archive` y ejecutada
 * sobre estas mismas fixtures). Un source-guard NO puede probarla — que el archivo
 * "se vea igual" no dice nada sobre lo que emite, y F-117 **sí** reescribió el interior
 * del módulo (extracción del núcleo de normalización, T-05). Por eso el guard de fuente
 * vive aparte (`f117-no-regression.test.ts`) y la byte-identidad vive acá.
 *
 * ⚠️ **FIXTURES DE PRODUCCIÓN (lección CL-096).** Cada fixture replica la FORMA de una
 * fila real de `buyer_personas` y **cita su id**. Los valores marcados como CONFIRMADOS
 * son tokens literales leídos de producción (read-only) y citados en
 * `specs/F-117/requirements.md` §H-5; el resto va marcado como relleno ilustrativo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonaDownstreamBlock,
  normalizePersonaDownstreamFields,
  buildPersonaMethodBlock,
  PERSONA_DOWNSTREAM_LABELS,
  PERSONA_DOWNSTREAM_HEADING,
  PERSONA_DOWNSTREAM_FIELDS_BY_STEP,
  PERSONA_METHOD_LABELS,
  type RawPersonaRow
} from '../../src/lib/personas/method-context.ts';

/* ================================================================== */
/*  Fixture ANTI-NO-OP — fila REAL `76b1f28e`                          */
/* ================================================================== */

/**
 * `76b1f28e` — **SCS Cleaning, `approved`, 26 claves**: la ÚNICA fila de
 * `buyer_personas` que trae `hidden_costs`, y trae **los 8 campos** que F-117 reparte
 * (H-5 de `requirements.md`, `SELECT` read-only 2026-07-26). Forma (1): claves planas
 * snake_case en `content` — la que produce el write-path F-097/F-108.
 *
 * Los 7 valores marcados CONFIRMADO son tokens **literales de producción**. Los asertos
 * anti-no-op leen el token DESDE ESTE OBJETO (`CONTENT_76B1F28E.hidden_costs`, etc.),
 * nunca desde una constante re-declarada con el resultado esperado: si el reparto se
 * volviera inerte, el `includes` fallaría en vez de comparar dos copias del mismo texto.
 */
const CONTENT_76B1F28E = {
  // — CONFIRMADOS (tokens literales de producción, H-5) —
  main_pain:
    'Miedo a que una unidad sucia dañe su reputación o genere quejas de inquilinos',
  hidden_costs:
    'Pérdida de inquilinos/clientes y tiempo perdido resolviendo emergencias de última hora',
  why_failed:
    'Proveedores inconsistentes, sin garantías ni presencia digital verificable que generara confianza',
  objection_price:
    'Teme pagar de más por un servicio que no cumpla sus expectativas',
  objection_trust:
    'Sin reseñas o garantías visibles, duda en contratar a un desconocido',
  objection_time:
    'Necesita agendar rápido, no quiere esperar cotizaciones lentas',
  if_nothing:
    'Sigue dependiendo de proveedores inconsistentes y arriesga su reputación',
  // — relleno ilustrativo (la fila real SÍ trae la clave; su texto no fue transcrito) —
  secondary_pains:
    'Rotación de personal del proveedor y falta de comunicación ante incidencias',
  // — claves NO canónicas que la fila real también trae: no deben emitirse —
  name_age: 'Marta, 48',
  profession: 'Administradora de propiedades',
  raw_text: '- main_pain: OTRO TEXTO, de otro vintage'
} as const;

const PERSONA_76B1F28E_F117: RawPersonaRow = {
  content: { ...CONTENT_76B1F28E },
  raw_text: '- if_nothing: TEXTO DE LA COLUMNA, de otro vintage'
};

/** `400dbe18` — **JD Valley, `approved`**: la persona hueca REAL. Columna `raw_text` =
 * markdown español con TODO en `[PENDIENTE]`; `content.raw_text` = string vacío
 * (invariante F-097 violado: 2234 vs 0). Caso real de R-16/R-17. */
const PERSONA_400DBE18: RawPersonaRow = {
  content: { raw_text: '' },
  raw_text: [
    '# BUYER PERSONA — JD Valley',
    '',
    '## 11. BARRERAS DE COMPRA',
    '- **Objeción de precio**: [PENDIENTE]',
    '- **Objeción de confianza**: [PENDIENTE]',
    '- **Objeción de tiempo**: [PENDIENTE]',
    '',
    '## 12. ESCENARIOS ALTERNATIVOS',
    '- **Qué pasa si no hace nada**: [PENDIENTE]'
  ].join('\n')
};

/** Fila en forma de líneas `- clave: valor` con TODOS los campos del reparto puestos
 * literalmente en `[PENDIENTE]` — el filtro de `pending.ts` (R-15) debe vaciarlos. */
const PERSONA_TODO_PENDIENTE: RawPersonaRow = {
  content: {
    raw_text: [
      '- main_pain: [PENDIENTE]',
      '- secondary_pains: [PENDIENTE]',
      '- hidden_costs: [PENDIENTE]',
      '- why_failed: [PENDIENTE]',
      '- objection_price: [PENDIENTE]',
      '- objection_trust: [PENDIENTE]',
      '- objection_time: [PENDIENTE]',
      '- if_nothing: [PENDIENTE]'
    ].join('\n')
  },
  raw_text: null
};

/** Todas las etiquetas del reparto, por campo (para asertar presencia/ausencia). */
const LABEL: Record<string, string> = Object.fromEntries(
  PERSONA_DOWNSTREAM_LABELS.map(([field, label]) => [field, label])
);

/** ¿El bloque emite una línea `Etiqueta: ` para ese campo? */
const emits = (block: string, field: string): boolean =>
  block.includes('\n' + LABEL[field] + ': ');

/* ================================================================== */
/*  T-07 — El reparto por step                                         */
/* ================================================================== */

/* ---- ANTI-NO-OP (R-25): el reparto HACE algo sobre la fila real ---- */

test('T-07 ⭐ ANTI-NO-OP R-25 `nurturing` sobre `76b1f28e` CONTIENE sus objeciones reales', () => {
  const block = buildPersonaDownstreamBlock({
    step: 'nurturing',
    persona: PERSONA_76B1F28E_F117
  });
  assert.notEqual(block, '', 'el reparto de `nurturing` no puede ser inerte');
  // Los tokens salen del PROPIO fixture (fila real), no de una constante con el
  // resultado esperado: esto es lo que hace que el aserto muerda si el cableado muere.
  assert.ok(
    block.includes(CONTENT_76B1F28E.objection_price),
    'falta el `objection_price` real de `76b1f28e`'
  );
  assert.ok(
    block.includes(CONTENT_76B1F28E.if_nothing),
    'falta el `if_nothing` real de `76b1f28e`'
  );
  assert.ok(block.includes(CONTENT_76B1F28E.objection_trust));
  assert.ok(block.includes(CONTENT_76B1F28E.objection_time));
  assert.ok(block.includes(CONTENT_76B1F28E.why_failed));
  assert.ok(block.startsWith('\n\n' + PERSONA_DOWNSTREAM_HEADING + '\n'));
});

test('T-07 ⭐ ANTI-NO-OP R-25 `website_home` sobre `76b1f28e` CONTIENE su `hidden_costs` real', () => {
  const block = buildPersonaDownstreamBlock({
    step: 'website_home',
    persona: PERSONA_76B1F28E_F117
  });
  assert.notEqual(block, '');
  assert.ok(
    block.includes(CONTENT_76B1F28E.hidden_costs),
    'los costos ocultos nunca llegaron a la landing: ése es el defecto que F-117 cierra'
  );
  assert.ok(block.includes(CONTENT_76B1F28E.main_pain));
});

test('T-07 ⭐ ANTI-NO-OP R-25 `social_content` sobre `76b1f28e` CONTIENE su `main_pain` real', () => {
  const block = buildPersonaDownstreamBlock({
    step: 'social_content',
    persona: PERSONA_76B1F28E_F117
  });
  assert.notEqual(block, '');
  assert.ok(block.includes(CONTENT_76B1F28E.main_pain));
  assert.ok(block.includes(CONTENT_76B1F28E.secondary_pains));
});

/* ---- Reparto EXACTO por step (R-11/R-12/R-13) ---- */

test('T-07 ⭐ R-11 `nurturing` emite las 5 de objeción/escenario y NINGUNA de dolor/costos (ARC5)', () => {
  const block = buildPersonaDownstreamBlock({
    step: 'nurturing',
    persona: PERSONA_76B1F28E_F117
  });
  for (const f of [
    'objection_price',
    'objection_trust',
    'objection_time',
    'why_failed',
    'if_nothing'
  ]) {
    assert.ok(emits(block, f), `nurturing perdió ${f}`);
  }
  for (const f of ['main_pain', 'secondary_pains', 'hidden_costs']) {
    assert.ok(
      !emits(block, f),
      `nurturing NO lleva ${f}: su canon es ARC1+ARC5 (objeciones), no dolor`
    );
  }
  assert.equal(block.split('\n').filter((l) => l.includes(': ')).length, 5);
});

test('T-07 ⭐ R-12 `social_content` emite SÓLO las 2 de dolor — es ARC7, NO ARC5 (H-1)', () => {
  const block = buildPersonaDownstreamBlock({
    step: 'social_content',
    persona: PERSONA_76B1F28E_F117
  });
  assert.ok(emits(block, 'main_pain'));
  assert.ok(emits(block, 'secondary_pains'));
  for (const f of [
    'objection_price',
    'objection_trust',
    'objection_time',
    'why_failed',
    'if_nothing',
    'hidden_costs'
  ]) {
    assert.ok(
      !emits(block, f),
      `social_content NO lleva ${f}: su "Método relacionado" es ARC1 + ARC7 ` +
        '(Referrals & Re-sales), cuyo script pivota sobre el DOLOR. Cablearle las ' +
        'objeciones sería inflar el contexto con campos que el canon asigna a otro ' +
        'consumidor (corrige la afirmación de CL-094)'
    );
  }
  assert.equal(block.split('\n').filter((l) => l.includes(': ')).length, 2);
});

for (const step of ['website_home', 'website_service', 'website_location']) {
  test(`T-07 ⭐ R-13 \`${step}\` emite dolor DOMINANTE + costos ocultos, y NINGUNA objeción`, () => {
    const block = buildPersonaDownstreamBlock({
      step,
      persona: PERSONA_76B1F28E_F117
    });
    assert.ok(emits(block, 'main_pain'));
    assert.ok(emits(block, 'hidden_costs'));
    assert.ok(
      !emits(block, 'secondary_pains'),
      'el canon de la landing pide el dolor DOMINANTE, en singular (DT-4)'
    );
    for (const f of [
      'objection_price',
      'objection_trust',
      'objection_time',
      'why_failed',
      'if_nothing'
    ]) {
      assert.ok(!emits(block, f), `${step} NO lleva ${f} en F-117 (DT-4)`);
    }
    assert.equal(block.split('\n').filter((l) => l.includes(': ')).length, 2);
  });
}

test('T-07 R-13 los 3 `website_*` reciben EXACTAMENTE el mismo bloque', () => {
  const home = buildPersonaDownstreamBlock({
    step: 'website_home',
    persona: PERSONA_76B1F28E_F117
  });
  for (const step of ['website_service', 'website_location']) {
    assert.equal(
      buildPersonaDownstreamBlock({ step, persona: PERSONA_76B1F28E_F117 }),
      home
    );
  }
});

/* ---- Las etiquetas como CONTRATO: texto y orden (R-14 / R-25.1 mutación 5) ---- */

test('T-07 ⭐ R-14 `PERSONA_DOWNSTREAM_LABELS`: los 8 pares, con su TEXTO y su ORDEN exactos', () => {
  // Las etiquetas NO son cosmética: son el texto que el generador lee en su
  // prompt-contexto. Cambiar "Costos ocultos" por un sinónimo rompe la coincidencia
  // TEXTUAL con el canon de la landing (`landing-structure.md` § PROBLEMA → SOLUCIÓN),
  // y renombrar cualquiera de las 6 compartidas haría que el mismo campo tenga dos
  // nombres distintos según el bloque. Por eso se fijan acá, como dato.
  assert.deepEqual(
    PERSONA_DOWNSTREAM_LABELS.map(([f, l]) => [f, l]),
    [
      ['main_pain', 'Dolor principal'],
      ['secondary_pains', 'Dolores secundarios'],
      ['hidden_costs', 'Costos ocultos'],
      ['why_failed', 'Por qué fallaron los intentos previos'],
      ['objection_price', 'Objeción precio'],
      ['objection_trust', 'Objeción confianza'],
      ['objection_time', 'Objeción tiempo'],
      ['if_nothing', 'Si no hace nada (status quo)']
    ]
  );
  assert.equal(
    PERSONA_DOWNSTREAM_HEADING,
    '## BUYER PERSONA — CAMPOS PARA ESTE CANAL'
  );
});

test('T-07 R-14 las 6 etiquetas compartidas con F-112 se escriben IGUAL en los dos bloques', () => {
  const enF112 = new Map(
    PERSONA_METHOD_LABELS.map(([f, l]) => [f, l] as const)
  );
  for (const [field, label] of PERSONA_DOWNSTREAM_LABELS) {
    const otra = enF112.get(field as never);
    if (otra === undefined) continue; // `hidden_costs` y `why_failed` sólo viven acá
    assert.equal(
      label,
      otra,
      `el campo ${field} tendría dos nombres distintos según el bloque`
    );
  }
});

/* ---- Orden fijo de emisión como DATO (R-14) ---- */

test('T-07 R-14 el ORDEN lo fija `PERSONA_DOWNSTREAM_LABELS`, no el array por step ni el `jsonb`', () => {
  const block = buildPersonaDownstreamBlock({
    step: 'nurturing',
    persona: PERSONA_76B1F28E_F117
  });
  const lines = block.split('\n').filter((l) => l.includes(': '));
  assert.deepEqual(
    lines.map((l) => l.slice(0, l.indexOf(': '))),
    [
      LABEL.why_failed,
      LABEL.objection_price,
      LABEL.objection_trust,
      LABEL.objection_time,
      LABEL.if_nothing
    ],
    'el array de `nurturing` declara las objeciones ANTES que `why_failed`; el orden ' +
      'de EMISIÓN debe ser el de las etiquetas, no el del reparto'
  );
});

test('T-07 R-14 el bloque es una sección propia: empieza con `\\n\\n` + su encabezado', () => {
  const block = buildPersonaDownstreamBlock({
    step: 'website_home',
    persona: PERSONA_76B1F28E_F117
  });
  assert.ok(
    block.startsWith('\n\n## BUYER PERSONA — CAMPOS PARA ESTE CANAL\n')
  );
  assert.equal(
    block,
    '\n\n' +
      PERSONA_DOWNSTREAM_HEADING +
      '\n' +
      LABEL.main_pain +
      ': ' +
      CONTENT_76B1F28E.main_pain +
      '\n' +
      LABEL.hidden_costs +
      ': ' +
      CONTENT_76B1F28E.hidden_costs
  );
});

/* ---- Degradación honesta (R-16) y vacío ⇒ `''` (R-17) ---- */

test('T-07 R-16 campo AUSENTE ⇒ sin línea, sin etiqueta huérfana, sin `N/A`', () => {
  const parcial: RawPersonaRow = {
    content: { objection_price: 'el precio no es problema' },
    raw_text: null
  };
  const block = buildPersonaDownstreamBlock({
    step: 'nurturing',
    persona: parcial
  });
  assert.equal(
    block,
    '\n\n' +
      PERSONA_DOWNSTREAM_HEADING +
      '\nObjeción precio: el precio no es problema'
  );
  assert.ok(!block.includes('N/A'));
  assert.ok(!block.includes('[PENDIENTE]'));
  assert.ok(!/:\s*$/m.test(block), 'ninguna etiqueta queda sin valor');
});

test('T-07 ⭐ R-16/R-17 `400dbe18` (todo `[PENDIENTE]`) ⇒ `""` en TODOS los steps del reparto', () => {
  for (const step of Object.keys(PERSONA_DOWNSTREAM_FIELDS_BY_STEP)) {
    assert.equal(
      buildPersonaDownstreamBlock({ step, persona: PERSONA_400DBE18 }),
      '',
      `${step} emitió un encabezado huérfano con la persona hueca real`
    );
  }
});

test('T-07 R-15/R-16 el filtro `[PENDIENTE]` (fuente única `pending.ts`) vacía el bloque entero', () => {
  for (const step of Object.keys(PERSONA_DOWNSTREAM_FIELDS_BY_STEP)) {
    assert.equal(
      buildPersonaDownstreamBlock({ step, persona: PERSONA_TODO_PENDIENTE }),
      ''
    );
  }
  // Y el marcador tampoco sobrevive en la normalización.
  const fields = normalizePersonaDownstreamFields(PERSONA_TODO_PENDIENTE);
  for (const value of Object.values(fields)) assert.equal(value, null);
});

test('T-07 R-17 persona sin ningún campo útil ⇒ `""` (sin encabezado huérfano)', () => {
  for (const persona of [
    { content: {}, raw_text: null },
    { content: null, raw_text: null },
    {} as RawPersonaRow,
    { content: { name_age: 'Marta, 48' }, raw_text: '' }
  ] as RawPersonaRow[]) {
    assert.equal(
      buildPersonaDownstreamBlock({ step: 'nurturing', persona }),
      ''
    );
  }
});

/* ---- Default-deny (R-18) ---- */

test('T-08 ⭐ R-18 DEFAULT-DENY: los steps fuera del reparto reciben `""`, uno por uno', () => {
  for (const step of [
    'ofv',
    'buyer_persona',
    'brief',
    'gbp_description',
    'gbp_posts',
    'campaign_copy',
    '',
    'step_que_no_existe'
  ]) {
    assert.equal(
      buildPersonaDownstreamBlock({ step, persona: PERSONA_76B1F28E_F117 }),
      '',
      `el step \`${step}\` NO está en el reparto: default-deny ⇒ ""`
    );
  }
});

test('T-08 ⭐ R-18/CL-092 `gbp_description` no recibe NADA por este camino tampoco', () => {
  assert.equal(
    buildPersonaDownstreamBlock({
      step: 'gbp_description',
      persona: PERSONA_76B1F28E_F117
    }),
    '',
    'CL-092: el GBP se queda con brief + OFV. F-117 lo sacó de `needsPersona` Y lo ' +
      'dejó fuera del reparto ⇒ cero persona por ambos caminos'
  );
  assert.ok(
    !Object.keys(PERSONA_DOWNSTREAM_FIELDS_BY_STEP).includes('gbp_description')
  );
});

/* ---- Pureza (R-18 / criterio de F-112) ---- */

test('T-07 pureza: misma entrada ⇒ misma salida, y la fila de entrada NO muta', () => {
  const antes = JSON.stringify(PERSONA_76B1F28E_F117);
  const a = buildPersonaDownstreamBlock({
    step: 'nurturing',
    persona: PERSONA_76B1F28E_F117
  });
  const b = buildPersonaDownstreamBlock({
    step: 'nurturing',
    persona: PERSONA_76B1F28E_F117
  });
  assert.equal(a, b);
  assert.equal(JSON.stringify(PERSONA_76B1F28E_F117), antes);
});

test('T-07 R-14 la salida NO depende del orden de inserción de las claves del `jsonb`', () => {
  const claves = Object.keys(CONTENT_76B1F28E);
  const invertido: Record<string, unknown> = {};
  for (const k of [...claves].reverse())
    invertido[k] = (CONTENT_76B1F28E as Record<string, unknown>)[k];
  for (const step of Object.keys(PERSONA_DOWNSTREAM_FIELDS_BY_STEP)) {
    assert.equal(
      buildPersonaDownstreamBlock({
        step,
        persona: { content: invertido, raw_text: null }
      }),
      buildPersonaDownstreamBlock({
        step,
        persona: { content: { ...CONTENT_76B1F28E }, raw_text: null }
      })
    );
  }
});

/* ---- Precedencia de las 3 fuentes, heredada del núcleo compartido ---- */

test('T-07 R-15 las 3 fuentes con fall-through POR FUENTE COMPLETA (núcleo compartido con F-112)', () => {
  // (1) claves planas ganan ENTERAS sobre `content.raw_text` y sobre la columna.
  assert.equal(
    normalizePersonaDownstreamFields(PERSONA_76B1F28E_F117).main_pain,
    CONTENT_76B1F28E.main_pain
  );
  assert.equal(
    normalizePersonaDownstreamFields(PERSONA_76B1F28E_F117).if_nothing,
    CONTENT_76B1F28E.if_nothing,
    'la columna `raw_text` trae OTRO vintage: no debe mezclarse (DT-5 de F-112)'
  );
  // (2) sin claves planas ⇒ gana `content.raw_text` entera.
  const soloContentRaw: RawPersonaRow = {
    content: { raw_text: '- hidden_costs: pierde inquilinos cada temporada' },
    raw_text: '- hidden_costs: OTRO VINTAGE'
  };
  assert.equal(
    normalizePersonaDownstreamFields(soloContentRaw).hidden_costs,
    'pierde inquilinos cada temporada'
  );
  // (3) sin las dos anteriores ⇒ gana la columna `raw_text`.
  const soloColumna: RawPersonaRow = {
    content: {},
    raw_text: '- main_pain: nadie lo encuentra en Google'
  };
  assert.equal(
    normalizePersonaDownstreamFields(soloColumna).main_pain,
    'nadie lo encuentra en Google'
  );
});

/* ================================================================== */
/*  T-08 — NO-REGRESIÓN CONDUCTUAL de F-112                            */
/* ================================================================== */

/**
 * Las 6 fixtures REALES de F-112 y el bloque que `buildPersonaMethodBlock({step:'ofv'})`
 * producía **ANTES de F-117**. Los valores esperados NO se derivaron de la
 * implementación nueva: se obtuvieron ejecutando la implementación de `HEAD`
 * (`3564385`, extraída con `git archive` a un directorio aislado) sobre estas mismas
 * fixtures. Es la comparación "salida con y sin el cambio" que R-21 exige.
 */
const F112_FIXTURES: readonly (readonly [string, RawPersonaRow, string])[] = [
  [
    '76b1f28e',
    {
      content: {
        objection_price:
          'Teme pagar de más por un servicio que no cumpla sus expectativas',
        if_nothing:
          'Sigue dependiendo de proveedores inconsistentes y arriesga su reputación',
        main_pain:
          'No consigue un servicio de limpieza consistente y confiable',
        secondary_pains:
          'Rotación de personal y falta de comunicación del proveedor',
        dream_result:
          'Instalaciones impecables sin tener que supervisar a nadie',
        awareness_level: 'Consciente del problema, comparando proveedores',
        objection_trust:
          'Duda de que cumplan lo prometido después del primer mes',
        objection_time:
          'No tiene tiempo para gestionar otro cambio de proveedor',
        if_competitor:
          'Repite el mismo ciclo con otra empresa igual de genérica',
        if_c3:
          'Deja de preocuparse por la limpieza y recupera horas de su semana',
        name_age: 'Marta, 48',
        profession: 'Administradora de oficinas',
        raw_text:
          '- main_pain: OTRO TEXTO, de otro vintage\n- objection_price: OTRO TEXTO'
      },
      raw_text: '- if_nothing: TEXTO DE LA COLUMNA, de otro vintage'
    },
    '\n\n## BUYER PERSONA — CAMPOS CANÓNICOS (MAPEO AL MÉTODO)\nDolor principal: No consigue un servicio de limpieza consistente y confiable\nDolores secundarios: Rotación de personal y falta de comunicación del proveedor\nResultado soñado: Instalaciones impecables sin tener que supervisar a nadie\nNivel de conciencia: Consciente del problema, comparando proveedores\nObjeción precio: Teme pagar de más por un servicio que no cumpla sus expectativas\nObjeción confianza: Duda de que cumplan lo prometido después del primer mes\nObjeción tiempo: No tiene tiempo para gestionar otro cambio de proveedor\nSi no hace nada (status quo): Sigue dependiendo de proveedores inconsistentes y arriesga su reputación\nSi elige la competencia: Repite el mismo ciclo con otra empresa igual de genérica\nSi elige C3: Deja de preocuparse por la limpieza y recupera horas de su semana'
  ],
  [
    '3c62c1e6',
    {
      content: {
        objection_price: 'el precio no es problema',
        if_nothing: 'no avanzo ni tengo tiempo libre para mis nietas'
      },
      raw_text: null
    },
    '\n\n## BUYER PERSONA — CAMPOS CANÓNICOS (MAPEO AL MÉTODO)\nObjeción precio: el precio no es problema\nSi no hace nada (status quo): no avanzo ni tengo tiempo libre para mis nietas'
  ],
  [
    'f0588eab',
    {
      content: {
        raw_text: [
          '- name_age: 40 hemeterio',
          '- location_language: Miami, español',
          '- profession: dueño de taller',
          '- main_pain: nadie lo encuentra en Google cuando buscan su servicio',
          '- objection_trust: ya le prometieron resultados antes y no pasó nada',
          '- if_nothing: sigue dependiendo del boca a boca y factura menos cada mes'
        ].join('\n')
      },
      raw_text:
        'PERFIL DEL CLIENTE IDEAL\n\nOtro texto, de otro vintage (1069 chars en la fila real).'
    },
    '\n\n## BUYER PERSONA — CAMPOS CANÓNICOS (MAPEO AL MÉTODO)\nDolor principal: nadie lo encuentra en Google cuando buscan su servicio\nObjeción confianza: ya le prometieron resultados antes y no pasó nada\nSi no hace nada (status quo): sigue dependiendo del boca a boca y factura menos cada mes'
  ],
  [
    '400dbe18',
    {
      content: { raw_text: '' },
      raw_text: [
        '# BUYER PERSONA — JD Valley',
        '',
        '## 11. BARRERAS DE COMPRA',
        '- **Objeciones principales**: [PENDIENTE]',
        '- **Objeción de precio**: [PENDIENTE]',
        '- **Objeción de confianza**: [PENDIENTE]',
        '- **Objeción de tiempo**: [PENDIENTE]',
        '',
        '## 12. ESCENARIOS ALTERNATIVOS',
        '- **Qué pasa si no hace nada**: [PENDIENTE]',
        '- **Qué pasa si elige la competencia**: [PENDIENTE]',
        '- **Qué pasa si elige C3**: [PENDIENTE]'
      ].join('\n')
    },
    ''
  ],
  [
    'b173adec',
    {
      content: {},
      raw_text: {
        barreras_de_compra: { objeciones_principales: 'no confía en agencias' },
        escenarios: { si_no_hace_nada: 'sigue igual' }
      }
    } as unknown as RawPersonaRow,
    ''
  ],
  [
    '995a242a',
    {
      content: {},
      raw_text: [
        '## DATOS DEL CLIENTE',
        'Nombre: SCS Cleaning Services',
        'Ciudad: Miami',
        '',
        '## BRIEF DEL NEGOCIO (APROBADO)',
        '- El negocio ofrece limpieza comercial recurrente.',
        '- Diferencial: personal fijo por cuenta.',
        '',
        '## INPUT DEL OPERADOR',
        'Genera la buyer persona.'
      ].join('\n')
    },
    ''
  ]
] as const;

for (const [id, persona, esperado] of F112_FIXTURES) {
  test(`T-08 ⭐ R-21/R-23 BYTE-IDENTIDAD conductual: \`${id}\` en el step \`ofv\` produce lo MISMO que antes de F-117`, () => {
    assert.equal(
      buildPersonaMethodBlock({ step: 'ofv', persona }),
      esperado,
      'la extracción del núcleo de normalización (T-05) debía ser PRESERVADORA de ' +
        'comportamiento: si esto falla, el refactor cambió la salida de F-112'
    );
  });
}

test('T-08 ⭐ R-21/R-22 el aporte TOTAL de F-117 al `contextChain` del step `ofv` es la cadena VACÍA', () => {
  for (const [id, persona] of F112_FIXTURES.map(([i, p]) => [i, p] as const)) {
    assert.equal(
      buildPersonaDownstreamBlock({ step: 'ofv', persona }),
      '',
      `F-117 no puede aportar nada al step \`ofv\` (fixture ${id}): ésa es la forma ` +
        'ESTRUCTURAL de la byte-identidad — `ofv` no está en el reparto, no es disciplina'
    );
  }
  assert.ok(!Object.keys(PERSONA_DOWNSTREAM_FIELDS_BY_STEP).includes('ofv'));
});

test('T-08 R-23 los dos bloques NUNCA coexisten: ningún step recibe ambos', () => {
  for (const step of [
    'ofv',
    'buyer_persona',
    'brief',
    'gbp_description',
    'gbp_posts',
    'campaign_copy',
    'website_home',
    'website_service',
    'website_location',
    'nurturing',
    'social_content'
  ]) {
    const a = buildPersonaMethodBlock({
      step,
      persona: PERSONA_76B1F28E_F117
    });
    const b = buildPersonaDownstreamBlock({
      step,
      persona: PERSONA_76B1F28E_F117
    });
    assert.ok(
      a === '' || b === '',
      `el step \`${step}\` recibiría los DOS bloques: un campo se duplicaría en el ` +
        'mismo prompt-contexto'
    );
  }
});
