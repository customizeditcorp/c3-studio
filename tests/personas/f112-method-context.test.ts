/**
 * F-112 — T-04/T-05/T-06/T-07 — Seam puro de la cadena `persona → OFV`
 * (`src/lib/personas/method-context.ts`).
 *
 * Tests conductuales framework-free (`node --test`) de:
 *   - `normalizePersonaMethodFields`: precedencia de las 3 fuentes con fall-through
 *     **por fuente COMPLETA** (prohibido el merge), parser de la forma de líneas,
 *     tipos no-string, filtro `[PENDIENTE]`, pureza (R-01..R-08).
 *   - `PERSONA_METHOD_LABELS` / `PERSONA_METHOD_STEPS`: el mapeo como dato +
 *     default-deny (R-10, R-12, R-14).
 *   - `buildPersonaMethodBlock`: formato, emisión parcial y **byte-identidad** (`''`)
 *     fuera del step `ofv` y con persona sin campos útiles (R-11..R-17).
 *
 * ⚠️ **FIXTURES DE PRODUCCIÓN (lección CL-096).** Cada fixture replica la FORMA de una
 * fila real de `buyer_personas` observada por el Leader en lectura read-only
 * (2026-07-25) y **cita su id en comentario**. No son formas inventadas: la v1 del spec
 * de F-111 asumió una forma de datos y habría producido una feature INERTE en
 * producción con el 100 % de los tests en verde. Donde el valor textual exacto no fue
 * transcrito se conservan los tokens confirmados (los de `76b1f28e` y `3c62c1e6`
 * citados en `requirements.md §4.0` y en la tabla del spec) y el resto va marcado como
 * relleno ilustrativo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePersonaMethodFields,
  buildPersonaMethodBlock,
  PERSONA_METHOD_LABELS,
  PERSONA_METHOD_HEADING,
  PERSONA_METHOD_STEPS,
  type RawPersonaRow
} from '../../src/lib/personas/method-context.ts';

/* ================================================================== */
/*  Fixtures derivados de filas REALES de `buyer_personas`             */
/* ================================================================== */

/**
 * `76b1f28e` — **SCS Cleaning, `approved`, 26 claves**: la persona RICA, forma (1)
 * (claves planas snake_case en `content`, la que produce el write-path F-097/F-108).
 * Tokens CONFIRMADOS de producción: el `objection_price` y el `if_nothing` del criterio
 * anti-no-op §4.0. El resto de campos canónicos son relleno ilustrativo (la fila real
 * trae 26 claves, de las que sólo se transcribieron literalmente esas dos).
 */
const PERSONA_76B1F28E: RawPersonaRow = {
  content: {
    // — tokens CONFIRMADOS (criterio §4.0) —
    objection_price:
      'Teme pagar de más por un servicio que no cumpla sus expectativas',
    if_nothing:
      'Sigue dependiendo de proveedores inconsistentes y arriesga su reputación',
    // — relleno ilustrativo con la MISMA forma (claves planas snake_case) —
    main_pain: 'No consigue un servicio de limpieza consistente y confiable',
    secondary_pains:
      'Rotación de personal y falta de comunicación del proveedor',
    dream_result: 'Instalaciones impecables sin tener que supervisar a nadie',
    awareness_level: 'Consciente del problema, comparando proveedores',
    objection_trust: 'Duda de que cumplan lo prometido después del primer mes',
    objection_time: 'No tiene tiempo para gestionar otro cambio de proveedor',
    if_competitor: 'Repite el mismo ciclo con otra empresa igual de genérica',
    if_c3: 'Deja de preocuparse por la limpieza y recupera horas de su semana',
    // — claves NO canónicas que la fila real también trae: no deben emitirse —
    name_age: 'Marta, 48',
    profession: 'Administradora de oficinas',
    raw_text:
      '- main_pain: OTRO TEXTO, de otro vintage\n- objection_price: OTRO TEXTO'
  },
  raw_text: '- if_nothing: TEXTO DE LA COLUMNA, de otro vintage'
};

/**
 * `3c62c1e6` — **SCS Cleaning, `approved`, 23 claves**: emisión PARCIAL real. Tokens
 * CONFIRMADOS: `objection_price` y `if_nothing`. Los campos canónicos que esta fila no
 * trae NO deben aparecer (sin etiqueta huérfana, R-15).
 */
const PERSONA_3C62C1E6: RawPersonaRow = {
  content: {
    objection_price: 'el precio no es problema',
    if_nothing: 'no avanzo ni tengo tiempo libre para mis nietas'
  },
  raw_text: null
};

/**
 * `f0588eab` — **Customize It, `approved`**: `content` SIN claves de campo, con
 * `content.raw_text` (464 chars) en formato de líneas `- clave: valor`. La columna
 * `raw_text` trae OTRO texto (1069 chars) — invariante F-097 violado (R-26): por eso el
 * fall-through es por fuente COMPLETA y gana `content.raw_text` entera.
 */
const PERSONA_F0588EAB: RawPersonaRow = {
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
};

/**
 * `400dbe18` — **JD Valley, `approved`**: columna `raw_text` = markdown ESPAÑOL con
 * todos los campos canónicos en `[PENDIENTE]`, y `content.raw_text` = string VACÍO
 * (invariante F-097 violado: 2234 vs 0). Caso REAL de R-17.
 *
 * Nota DT-1: la forma markdown-español NO se parsea por decisión de scope (opción B).
 * Aunque se parseara, tras el filtro obligatorio de R-06 el resultado sería el MISMO
 * `''` — la opción (C) del DT central no compra nada real hoy.
 */
const PERSONA_400DBE18: RawPersonaRow = {
  content: {
    raw_text: ''
  },
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
};

/** `b173adec` — **JD Valley, `draft`**: `raw_text` como OBJETO con claves anidadas en
 * español (no string) ⇒ ninguna fuente aporta, sin excepción ni crash. */
const PERSONA_B173ADEC = {
  content: {},
  raw_text: {
    barreras_de_compra: { objeciones_principales: 'no confía en agencias' },
    escenarios: { si_no_hace_nada: 'sigue igual' }
  }
} as unknown as RawPersonaRow;

/**
 * `995a242a` / `e8e8c500` — **SCS Cleaning, `draft`s**: `raw_text` con el VOLCADO DEL
 * PROMPT-CONTEXTO (el input reflejado). El parser exige `- <clave_canónica>:` y ninguna
 * línea matchea ⇒ `''`. **Caso importante:** evita que el modelo reciba su propio input
 * reflejado como si fueran campos de la persona.
 */
const PERSONA_995A242A: RawPersonaRow = {
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
};

/** Los 8 steps de contenido que consumen persona (`needsPersona` menos `buyer_persona`
 * y `ofv`). Ninguno debe recibir el bloque campo-a-campo (R-16). */
const OTROS_STEPS_CON_PERSONA = [
  'gbp_description',
  'gbp_posts',
  'campaign_copy',
  'website_home',
  'website_service',
  'website_location',
  'nurturing',
  'social_content'
] as const;

/** Réplica LITERAL de `fieldsToContent` (`page.tsx:335-347`) — el write-path cuya
 * serialización invierte el parser de R-03. */
function fieldsToContent(
  fields: Record<string, string>
): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v) content[k] = v;
  }
  content.raw_text = Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return content;
}

/* ================================================================== */
/*  T-04 — precedencia, fall-through por fuente COMPLETA y pureza      */
/* ================================================================== */

test('T-04 R-01 la fuente (1) `content.<clave plana>` gana sobre content.raw_text y sobre la columna', () => {
  const fields = normalizePersonaMethodFields(PERSONA_76B1F28E);
  assert.equal(
    fields.main_pain,
    'No consigue un servicio de limpieza consistente y confiable'
  );
  assert.equal(
    fields.objection_price,
    'Teme pagar de más por un servicio que no cumpla sus expectativas'
  );
  assert.equal(
    fields.if_nothing,
    'Sigue dependiendo de proveedores inconsistentes y arriesga su reputación'
  );
  // Ni el `content.raw_text` ni la columna (ambos de otro vintage) se filtran.
  assert.doesNotMatch(JSON.stringify(fields), /OTRO TEXTO|COLUMNA/);
});

test('T-04 R-01 fall-through a `content.raw_text` cuando `content` no trae claves canónicas', () => {
  const fields = normalizePersonaMethodFields(PERSONA_F0588EAB);
  assert.equal(
    fields.main_pain,
    'nadie lo encuentra en Google cuando buscan su servicio'
  );
  assert.equal(
    fields.if_nothing,
    'sigue dependiendo del boca a boca y factura menos cada mes'
  );
  assert.equal(fields.objection_price, null); // no está en esa fuente
});

test('T-04 R-01 fall-through a la COLUMNA `raw_text` cuando las dos anteriores no aportan', () => {
  const fields = normalizePersonaMethodFields({
    content: {
      name_age: 'Marta, 48',
      raw_text: '- profession: sin claves canónicas'
    },
    raw_text:
      '- objection_time: no tengo margen para otro proyecto este trimestre'
  });
  assert.equal(
    fields.objection_time,
    'no tengo margen para otro proyecto este trimestre'
  );
});

test('T-04 ⭐ R-02 PROHIBIDO EL MERGE: una fuente gana COMPLETA (nada de persona Frankenstein)', () => {
  // `content` aporta SOLO `objection_price`; la columna trae OTRAS claves canónicas.
  const fields = normalizePersonaMethodFields({
    content: { objection_price: 'DESDE CONTENT' },
    raw_text: '- if_nothing: DESDE LA COLUMNA\n- main_pain: DESDE LA COLUMNA'
  });
  assert.equal(fields.objection_price, 'DESDE CONTENT');
  assert.equal(fields.if_nothing, null); // NO se mezcla
  assert.equal(fields.main_pain, null); // NO se mezcla
  // Y el bloque emitido tampoco contiene nada de la fuente perdedora.
  const block = buildPersonaMethodBlock({
    step: 'ofv',
    persona: {
      content: { objection_price: 'DESDE CONTENT' },
      raw_text: '- if_nothing: DESDE LA COLUMNA'
    }
  });
  assert.doesNotMatch(block, /DESDE LA COLUMNA/);
});

test('T-04 R-05 ninguna fuente aporta ⇒ los 10 campos en null', () => {
  const esperado = {
    main_pain: null,
    secondary_pains: null,
    dream_result: null,
    awareness_level: null,
    objection_price: null,
    objection_trust: null,
    objection_time: null,
    if_nothing: null,
    if_competitor: null,
    if_c3: null
  };
  assert.deepEqual(normalizePersonaMethodFields({}), esperado);
  assert.deepEqual(normalizePersonaMethodFields(PERSONA_400DBE18), esperado);
  assert.deepEqual(normalizePersonaMethodFields(PERSONA_B173ADEC), esperado);
  assert.deepEqual(normalizePersonaMethodFields(PERSONA_995A242A), esperado);
});

test('T-04 R-04 tipos no soportados (objeto, booleano, null) ⇒ campo ausente', () => {
  const fields = normalizePersonaMethodFields({
    content: {
      main_pain: { texto: 'un objeto anidado' },
      objection_trust: true,
      objection_time: null,
      dream_result: 'este SÍ aporta' // ancla: la fuente gana igual
    }
  });
  assert.equal(fields.main_pain, null);
  assert.equal(fields.objection_trust, null);
  assert.equal(fields.objection_time, null);
  assert.equal(fields.dream_result, 'este SÍ aporta');
});

test('T-04 R-08 pureza: misma entrada ⇒ misma salida (deepEqual) y la fila NO muta', () => {
  const snapshot = JSON.stringify(PERSONA_76B1F28E);
  const first = normalizePersonaMethodFields(PERSONA_76B1F28E);
  const second = normalizePersonaMethodFields(PERSONA_76B1F28E);
  assert.deepEqual(first, second);
  assert.notEqual(first, second); // objetos distintos, no una referencia compartida
  assert.equal(JSON.stringify(PERSONA_76B1F28E), snapshot);
});

test('T-04 R-08 determinismo: el ORDEN DE INSERCIÓN de las claves del jsonb es irrelevante', () => {
  const a: RawPersonaRow = {
    content: {
      main_pain: 'A',
      objection_price: 'B',
      if_nothing: 'C',
      dream_result: 'D'
    }
  };
  const b: RawPersonaRow = {
    content: {
      dream_result: 'D',
      if_nothing: 'C',
      objection_price: 'B',
      main_pain: 'A'
    }
  };
  assert.deepEqual(
    normalizePersonaMethodFields(a),
    normalizePersonaMethodFields(b)
  );
  assert.equal(
    buildPersonaMethodBlock({ step: 'ofv', persona: a }),
    buildPersonaMethodBlock({ step: 'ofv', persona: b })
  );
});

/* ================================================================== */
/*  T-05 — FORMAS REALES DE PRODUCCIÓN (la tarea que evita el no-op)   */
/* ================================================================== */

/* ---- Caso 1 — `76b1f28e`: CRITERIO ANTI-NO-OP (§4.0, el más importante) ---- */

test('T-05(1) ⭐ ANTI-NO-OP (§4.0): `76b1f28e` (SCS, claves planas) SÍ produce el bloque con SUS objeciones', () => {
  const out = buildPersonaMethodBlock({
    step: 'ofv',
    persona: PERSONA_76B1F28E
  });
  // Si esto falla, la feature es INERTE en producción aunque el resto esté verde.
  assert.notEqual(out, '');
  assert.match(
    out,
    /Objeción precio: Teme pagar de más por un servicio que no cumpla sus expectativas/
  );
  assert.match(
    out,
    /Si no hace nada \(status quo\): Sigue dependiendo de proveedores inconsistentes y arriesga su reputación/
  );
});

/* ---- Caso 2 — `3c62c1e6`: emisión PARCIAL real, sin etiqueta huérfana ---- */

test('T-05(2) R-15 `3c62c1e6` — emisión PARCIAL: sólo los 2 campos presentes, sin placeholders', () => {
  const out = buildPersonaMethodBlock({
    step: 'ofv',
    persona: PERSONA_3C62C1E6
  });
  assert.equal(
    out,
    '\n\n' +
      PERSONA_METHOD_HEADING +
      '\n' +
      'Objeción precio: el precio no es problema\n' +
      'Si no hace nada (status quo): no avanzo ni tengo tiempo libre para mis nietas'
  );
  // Los canónicos que la fila NO trae no aparecen ni como etiqueta vacía.
  assert.doesNotMatch(out, /Dolor principal|Resultado soñado|Si elige C3|N\/A/);
});

/* ---- Caso 3 — `f0588eab`: parser de líneas, claves no canónicas ignoradas ---- */

test('T-05(3) R-03 `f0588eab` — `content.raw_text` en líneas: recupera los canónicos e IGNORA los no canónicos', () => {
  const out = buildPersonaMethodBlock({
    step: 'ofv',
    persona: PERSONA_F0588EAB
  });
  assert.match(
    out,
    /Dolor principal: nadie lo encuentra en Google cuando buscan su servicio/
  );
  assert.match(
    out,
    /Objeción confianza: ya le prometieron resultados antes y no pasó nada/
  );
  // `name_age`, `location_language`, `profession` NO son canónicos ⇒ no se emiten.
  assert.doesNotMatch(out, /40 hemeterio|Miami, español|dueño de taller/);
});

/* ---- Caso 4 — round-trip contra el write-path (fidelidad de R-03) ---- */

test('T-05(4) R-03 ROUND-TRIP: el parser invierte `fieldsToContent` para los 10 campos', () => {
  const originales: Record<string, string> = {
    main_pain: 'Dolor uno',
    secondary_pains: 'Dolor dos y tres',
    dream_result: 'Resultado soñado del cliente',
    awareness_level: 'Consciente de la solución',
    objection_price: 'Le parece caro comparado con su proveedor actual',
    objection_trust: 'No cree que cumplan el plazo',
    objection_time: 'Cree que le va a costar horas de gestión',
    if_nothing: 'Sigue exactamente igual',
    if_competitor: 'Repite el ciclo con otro proveedor',
    if_c3: 'Resuelve el problema de raíz'
  };
  const serializado = fieldsToContent(originales).raw_text as string;
  const fields = normalizePersonaMethodFields({
    content: { raw_text: serializado }
  });
  for (const [k, v] of Object.entries(originales)) {
    assert.equal(fields[k as keyof typeof fields], v, k);
  }
});

/* ---- Caso 5 — `400dbe18`: la persona hueca REAL (R-06 + R-17) ---- */

test('T-05(5) R-06/R-17 `400dbe18` (JD Valley) — todos los canónicos `[PENDIENTE]` ⇒ bloque `""`', () => {
  assert.equal(
    buildPersonaMethodBlock({ step: 'ofv', persona: PERSONA_400DBE18 }),
    ''
  );
  // La forma markdown-español no se parsea (DT-1, opción B). Aunque se parseara, tras
  // el filtro de R-06 el resultado sería EL MISMO `''`: la opción (C) no compra nada.
  const conParserHipotetico = normalizePersonaMethodFields({
    content: {
      objection_price: '[PENDIENTE]',
      if_nothing: '[PENDIENTE]',
      main_pain: '[PENDIENTE]'
    }
  });
  assert.deepEqual(
    [
      conParserHipotetico.objection_price,
      conParserHipotetico.if_nothing,
      conParserHipotetico.main_pain
    ],
    [null, null, null]
  );
});

/* ---- Caso 6 — `b173adec`: `raw_text` como OBJETO ---- */

test('T-05(6) `b173adec` (JD Valley, draft) — `raw_text` como OBJETO ⇒ `""` sin excepción', () => {
  assert.doesNotThrow(() =>
    buildPersonaMethodBlock({ step: 'ofv', persona: PERSONA_B173ADEC })
  );
  assert.equal(
    buildPersonaMethodBlock({ step: 'ofv', persona: PERSONA_B173ADEC }),
    ''
  );
});

/* ---- Caso 7 — `995a242a`/`e8e8c500`: volcado del prompt-contexto ---- */

test('T-05(7) ⭐ `995a242a`/`e8e8c500` — `raw_text` = volcado del PROMPT-CONTEXTO ⇒ `""`', () => {
  const out = buildPersonaMethodBlock({
    step: 'ofv',
    persona: PERSONA_995A242A
  });
  // El parser exige `- <clave_canónica>:`; `## DATOS DEL CLIENTE` / `Nombre:` no matchean.
  assert.equal(out, '');
  assert.doesNotMatch(out, /DATOS DEL CLIENTE|BRIEF DEL NEGOCIO/);
});

/* ---- Caso 8 — `[PENDIENTE]` exacto vs embebido (R-06 + residual declarado) ---- */

test('T-05(8) R-06 `[PENDIENTE]` exacto (con case y whitespace) ⇒ campo ausente', () => {
  for (const marcador of ['[PENDIENTE]', '[pendiente]', '  [PENDIENTE]  ']) {
    const fields = normalizePersonaMethodFields({
      content: { objection_price: marcador, main_pain: 'ancla real' }
    });
    assert.equal(fields.objection_price, null, marcador);
    assert.equal(fields.main_pain, 'ancla real');
  }
  // Y por la fuente de líneas, con el mismo criterio.
  const porLineas = normalizePersonaMethodFields({
    content: { raw_text: '- objection_price: [PENDIENTE]\n- if_nothing: real' }
  });
  assert.equal(porLineas.objection_price, null);
  assert.equal(porLineas.if_nothing, 'real');
});

test('T-05(8b) R-06 RESIDUAL DECLARADO: un `[PENDIENTE]` EMBEBIDO sí se propaga', () => {
  const fields = normalizePersonaMethodFields({
    content: {
      objection_price: 'Objeciones principales: [PENDIENTE] y falta de tiempo'
    }
  });
  // Filtrarlo exigiría reescribir contenido aprobado (fuera de scope). Se assertaLo
  // que el sistema HACE, no lo que uno querría que hiciera.
  assert.equal(
    fields.objection_price,
    'Objeciones principales: [PENDIENTE] y falta de tiempo'
  );
});

/* ---- Caso 9 — arrays y números (R-04 / DT-7) ---- */

test('T-05(9) R-04 array de escalares ⇒ `join(" | ")`; vacío o todo-`[PENDIENTE]` ⇒ ausente; número ⇒ texto', () => {
  const fields = normalizePersonaMethodFields({
    content: {
      secondary_pains: ['a', 'b', ''],
      objection_price: [],
      objection_trust: ['[PENDIENTE]', '  [pendiente] '],
      awareness_level: 3
    }
  });
  assert.equal(fields.secondary_pains, 'a | b');
  assert.equal(fields.objection_price, null);
  assert.equal(fields.objection_trust, null);
  assert.equal(fields.awareness_level, '3');
});

/* ---- Caso 10 — valor multi-línea (residual declarado de R-03) ---- */

test('T-05(10) R-03 RESIDUAL DECLARADO: un valor serializado en 2 líneas ⇒ sólo se recupera la primera', () => {
  const fields = normalizePersonaMethodFields({
    content: {
      raw_text: '- main_pain: primera línea del dolor\nsegunda línea del dolor'
    }
  });
  // `fieldsToContent` NO escapa saltos de línea; corregirlo exigiría tocar el
  // write-path. Se asserta el comportamiento DECLARADO, no se finge que funciona.
  assert.equal(fields.main_pain, 'primera línea del dolor');
});

/* ================================================================== */
/*  T-06 — gating, formato y estructura del bloque                     */
/* ================================================================== */

test('T-06 R-12 `PERSONA_METHOD_STEPS` contiene EXACTAMENTE `["ofv"]`', () => {
  // Assert sobre el array completo: agregar un step sin decisión doctrinal rompe acá.
  assert.deepEqual([...PERSONA_METHOD_STEPS], ['ofv']);
});

test('T-06 R-10 `PERSONA_METHOD_LABELS` tiene los 10 campos EN EL ORDEN del mapeo cerrado', () => {
  assert.deepEqual(
    PERSONA_METHOD_LABELS.map(([field]) => field),
    [
      'main_pain',
      'secondary_pains',
      'dream_result',
      'awareness_level',
      'objection_price',
      'objection_trust',
      'objection_time',
      'if_nothing',
      'if_competitor',
      'if_c3'
    ]
  );
  assert.equal(PERSONA_METHOD_LABELS.length, 10);
});

test('T-06 R-14 las etiquetas van CON ACENTOS, exactamente como el prompt las referencia (DT-6)', () => {
  assert.deepEqual(
    PERSONA_METHOD_LABELS.map(([, label]) => label),
    [
      'Dolor principal',
      'Dolores secundarios',
      'Resultado soñado',
      'Nivel de conciencia',
      'Objeción precio',
      'Objeción confianza',
      'Objeción tiempo',
      'Si no hace nada (status quo)',
      'Si elige la competencia',
      'Si elige C3'
    ]
  );
});

test('T-06 R-11/R-13 el bloque empieza con `\\n\\n` + HEADING y NO contiene el blob', () => {
  const out = buildPersonaMethodBlock({
    step: 'ofv',
    persona: PERSONA_76B1F28E
  });
  assert.ok(out.startsWith('\n\n' + PERSONA_METHOD_HEADING + '\n'));
  // R-13: son DOS bloques distintos; el helper sólo ANEXA, no reescribe el blob.
  assert.doesNotMatch(out, /## BUYER PERSONA \(APROBADO\)/);
  assert.notEqual(PERSONA_METHOD_HEADING, '## BUYER PERSONA (APROBADO)');
});

test('T-06 R-11 una línea `Etiqueta: valor` por campo presente, en el orden del mapeo', () => {
  const out = buildPersonaMethodBlock({
    step: 'ofv',
    persona: PERSONA_76B1F28E
  });
  const rows = out.split('\n');
  assert.equal(rows[0], '');
  assert.equal(rows[1], '');
  assert.equal(rows[2], PERSONA_METHOD_HEADING);
  const emitidas = rows.slice(3);
  assert.equal(emitidas.length, 10); // la fila rica trae los 10
  assert.deepEqual(
    emitidas.map((l) => l.slice(0, l.indexOf(':'))),
    [
      'Dolor principal',
      'Dolores secundarios',
      'Resultado soñado',
      'Nivel de conciencia',
      'Objeción precio',
      'Objeción confianza',
      'Objeción tiempo',
      'Si no hace nada (status quo)',
      'Si elige la competencia',
      'Si elige C3'
    ]
  );
  for (const linea of emitidas) assert.match(linea, /^[^:]+: .+$/);
});

test('T-06 R-15 emisión parcial sin placeholders, sin `N/A` y sin líneas en blanco', () => {
  const out = buildPersonaMethodBlock({
    step: 'ofv',
    persona: PERSONA_3C62C1E6
  });
  const emitidas = out.split('\n').slice(3);
  assert.equal(emitidas.length, 2);
  for (const linea of emitidas) assert.notEqual(linea.trim(), '');
  assert.doesNotMatch(out, /N\/A|\[PENDIENTE\]|: *$/im);
});

/* ================================================================== */
/*  T-07 — NO-REGRESIÓN byte-idéntica, CONDUCTUAL                      */
/* ================================================================== */

test('T-07(a) ⭐ R-16 BYTE-IDENTIDAD: los 8 steps de contenido con la persona RICA ⇒ ""', () => {
  for (const step of OTROS_STEPS_CON_PERSONA) {
    assert.equal(
      buildPersonaMethodBlock({ step, persona: PERSONA_76B1F28E }),
      '',
      step
    );
  }
});

test('T-07(a) R-12 BYTE-IDENTIDAD: step DESCONOCIDO (`foo_bar`) y `buyer_persona` con la persona RICA ⇒ ""', () => {
  for (const step of ['foo_bar', 'buyer_persona', '', 'OFV', ' ofv']) {
    assert.equal(
      buildPersonaMethodBlock({ step, persona: PERSONA_76B1F28E }),
      '',
      step
    );
  }
});

test('T-07(b) ⭐ R-17 BYTE-IDENTIDAD: step `ofv` con la persona HUECA REAL `400dbe18` ⇒ ""', () => {
  assert.equal(
    buildPersonaMethodBlock({ step: 'ofv', persona: PERSONA_400DBE18 }),
    ''
  );
  // Y con las otras filas reales sin campos canónicos útiles.
  assert.equal(
    buildPersonaMethodBlock({ step: 'ofv', persona: PERSONA_B173ADEC }),
    ''
  );
  assert.equal(
    buildPersonaMethodBlock({ step: 'ofv', persona: PERSONA_995A242A }),
    ''
  );
  // Como el helper sólo ANEXA, `''` ⇒ el bloque de persona del `contextChain` queda
  // byte-idéntico a post-F-111 en todos estos casos.
});
