/**
 * F-111 — T-03/T-04/T-05/T-06 — Seam puro del reparto del método (`method-context.ts`).
 *
 * Tests conductuales framework-free (`node --test`) de:
 *   - `normalizeDecisionFrame`: precedencia de las 3 fuentes con fall-through por
 *     vacío, aplanado de la opción-OBJETO, forma legacy string, filtro `[PENDIENTE]`,
 *     `urgency` anidada ignorada, pureza (R-01..R-05, R-28..R-30).
 *   - `OFV_METHOD_FIELDS_BY_STEP`: el reparto como dato + default-deny (R-09..R-12).
 *   - `buildOfvMethodLines`: formato, emisión parcial y **byte-identidad** (`''`)
 *     fuera del reparto y con OFV sin contenido (R-13..R-18).
 *
 * ⚠️ **FIXTURES DE PRODUCCIÓN.** Cada fixture replica la FORMA de una fila real de
 * `offers` observada por el Leader en lectura read-only (2026-07-25) y cita su id en
 * comentario. No son formas inventadas: la v1 del spec asumió "opciones = string" y
 * habría producido una feature INERTE en producción con el 100 % de los tests en
 * verde (design §2.3). Donde el valor textual exacto no fue transcrito, se conservan
 * los tokens confirmados (`Inicio Rápido`, `$499`, la frase de escasez, los nombres y
 * precios citados en `design.md §2.3.1`) y el resto es relleno marcado como tal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDecisionFrame,
  buildOfvMethodLines,
  OFV_METHOD_FIELDS_BY_STEP
} from '../../src/lib/offers/method-context.ts';
import { normalizeOffer } from '../../src/lib/gbp-slice/context.ts';
import type { RawOfferRow } from '../../src/lib/gbp-slice/types.ts';

/* ================================================================== */
/*  Fixtures derivados de filas REALES de `offers` (read-only 2026-07-25) */
/* ================================================================== */

/** `a6c66d5c` — JD Valley, `approved`, **LA OFV CANÓNICA** (la que gana el tie-break
 * de F-109 sobre `b106ad61`). Opciones en forma OBJETO en la columna plana
 * `decision_frame`, con la clave `urgency` ANIDADA (R-29) y `content.urgency_scarcity`
 * poblado mientras la columna plana `offers.urgency` está VACÍA — la forma real de
 * las 16 filas revisadas (R-07). Tokens confirmados: `Inicio Rápido`, `$499` y la
 * frase de escasez (fabricada pre-F-104 — deuda del operador, R-24). */
const OFFER_A6C66D5C: RawOfferRow = {
  id: 'a6c66d5c',
  client_id: 'jd-valley',
  status: 'approved',
  urgency: null, // columna plana VACÍA en las 16 filas de producción
  decision_frame: {
    urgency:
      'Solo 5 espacios disponibles este mes para asegurar la calidad del servicio personalizado',
    option_a: {
      name: 'Inicio Rápido',
      price: '$499',
      description: 'Activación de la presencia local' // relleno ilustrativo
    },
    option_b: {
      name: 'Dominio Local', // relleno ilustrativo
      price: '$999',
      description: 'Presencia local completa'
    },
    option_c: {
      name: 'Seguir como estás',
      description: 'Consecuencias de no actuar: seguir invisible en el mapa'
    }
  },
  content: {
    big_promise: 'Más clientes locales en 60 días',
    urgency_scarcity:
      'Solo 5 espacios disponibles este mes para asegurar la calidad del servicio personalizado'
  }
};

/** `b106ad61` — JD Valley, `approved`, la **vacía-shadow** que el tie-break de F-109
 * descarta. Sin `decision_frame` ni urgencia: caso REAL de no-regresión (R-18). */
const OFFER_B106AD61: RawOfferRow = {
  id: 'b106ad61',
  client_id: 'jd-valley',
  status: 'approved',
  content: {}
};

/** `cabddf01` — las 3 opciones y `urgency_scarcity` en `[PENDIENTE]` (R-30 + R-18). */
const OFFER_CABDDF01: RawOfferRow = {
  id: 'cabddf01',
  client_id: 'cliente-pendiente',
  status: 'draft',
  content: {
    decision_frame: {
      option_a: '[PENDIENTE]',
      option_b: '[PENDIENTE]',
      option_c: '[PENDIENTE]'
    },
    urgency_scarcity: '[PENDIENTE]'
  }
};

/** `ee346c76` — SCS Cleaning, `approved`. Opciones en forma **STRING** (la otra forma
 * real de almacenamiento). Misma forma en `e6d90c41`, `5b26dc56`, `4b0483c2`. */
const OFFER_EE346C76: RawOfferRow = {
  id: 'ee346c76',
  client_id: 'scs-cleaning',
  status: 'approved',
  decision_frame: {
    option_a: 'Paquete básico: Activación de Google Business Profile.',
    option_b: 'Paquete recomendado: presencia local completa.', // relleno ilustrativo
    option_c: 'No hacer nada: seguir sin aparecer en el mapa.'
  },
  content: { urgency_scarcity: 'Agenda limitada a 4 instalaciones por semana.' }
};

const REPARTO_STEPS = [
  'website_home',
  'website_service',
  'website_location',
  'gbp_posts',
  'campaign_copy'
] as const;

const FUERA_DEL_REPARTO = [
  'gbp_description',
  'nurturing',
  'social_content',
  'buyer_persona',
  'ofv',
  'foo_bar' // step desconocido / futuro → default-deny (R-11)
] as const;

/** Atajo: normaliza la fila y construye las líneas como lo hace el route (R-07: la
 * urgencia viaja por `normalizeOffer`, NO se re-implementa acá). */
function lines(step: string, offer: RawOfferRow): string {
  return buildOfvMethodLines({
    step,
    offer: normalizeOffer(offer),
    decisionFrame: normalizeDecisionFrame(offer)
  });
}

/* ================================================================== */
/*  T-03 — precedencia, fall-through, forma legacy y pureza            */
/* ================================================================== */

test('T-03 R-01 la columna plana `decision_frame` gana sobre content', () => {
  const df = normalizeDecisionFrame({
    id: 'x',
    client_id: 'c',
    status: 'approved',
    decision_frame: { option_a: 'PLANA' },
    content: { decision_frame: { option_a: 'CONTENT' } }
  });
  assert.equal(df.option_a, 'PLANA');
});

test('T-03 R-01/R-04 plana null/{}/opciones vacías ⇒ fall-through a content.decision_frame', () => {
  const base = {
    id: 'x',
    client_id: 'c',
    status: 'approved',
    content: { decision_frame: { option_b: 'DESDE CONTENT' } }
  };
  for (const plana of [
    null,
    undefined,
    {},
    { option_a: '', option_b: '   ' },
    { urgency: 'solo urgencia anidada, ninguna opción' }
  ]) {
    const df = normalizeDecisionFrame({
      ...base,
      decision_frame: plana
    } as RawOfferRow);
    assert.equal(df.option_b, 'DESDE CONTENT');
  }
});

test('T-03 R-01 fall-through a la forma legacy `content.option_a|b|c`', () => {
  const df = normalizeDecisionFrame({
    id: 'x',
    client_id: 'c',
    status: 'approved',
    decision_frame: null,
    content: {
      decision_frame: {},
      option_a: 'Legacy A',
      option_c: 'Legacy C'
    }
  });
  assert.deepEqual(df, {
    option_a: 'Legacy A',
    option_b: null,
    option_c: 'Legacy C',
    text: null
  });
});

test('T-03 R-03 `decision_frame` como STRING entero ⇒ `text` (sin descomponer)', () => {
  const df = normalizeDecisionFrame({
    id: 'x',
    client_id: 'c',
    status: 'approved',
    decision_frame:
      'Texto suelto de decision frame, forma legacy no estructurada.'
  });
  assert.equal(
    df.text,
    'Texto suelto de decision frame, forma legacy no estructurada.'
  );
  assert.equal(df.option_a, null);
  assert.equal(df.option_b, null);
  assert.equal(df.option_c, null);
});

test('T-03 R-04 tipos no soportados (número, booleano, array suelto) ⇒ aporte nulo + fall-through', () => {
  for (const plana of [42, true, ['a', 'b']]) {
    const df = normalizeDecisionFrame({
      id: 'x',
      client_id: 'c',
      status: 'approved',
      decision_frame: plana,
      content: { decision_frame: { option_a: 'GANA CONTENT' } }
    } as RawOfferRow);
    assert.equal(df.option_a, 'GANA CONTENT');
  }
  // Y sin fuente que aporte: los 4 campos en null (sin línea, R-04).
  assert.deepEqual(
    normalizeDecisionFrame({
      id: 'x',
      client_id: 'c',
      status: 'approved',
      decision_frame: 42,
      content: { decision_frame: false }
    } as RawOfferRow),
    { option_a: null, option_b: null, option_c: null, text: null }
  );
});

test('T-03 R-04 ninguna fuente (fila sin decision_frame ni content) ⇒ los 4 campos null', () => {
  assert.deepEqual(normalizeDecisionFrame(OFFER_B106AD61), {
    option_a: null,
    option_b: null,
    option_c: null,
    text: null
  });
});

test('T-03 R-05 pureza: misma entrada ⇒ misma salida, y la fila NO muta', () => {
  const snapshot = JSON.stringify(OFFER_A6C66D5C);
  const first = normalizeDecisionFrame(OFFER_A6C66D5C);
  const second = normalizeDecisionFrame(OFFER_A6C66D5C);
  assert.deepEqual(first, second);
  assert.notEqual(first, second); // objetos distintos, no una referencia compartida
  assert.equal(JSON.stringify(OFFER_A6C66D5C), snapshot);
});

/* ================================================================== */
/*  T-04 — FORMAS REALES DE PRODUCCIÓN (la tarea que evita el no-op)   */
/* ================================================================== */

/* ---- Caso 1 — `a6c66d5c`: CRITERIO ANTI-NO-OP (§4.0, el más importante) ---- */

test('T-04(1) ⭐ ANTI-NO-OP (§4.0): la OFV canónica `a6c66d5c` (opciones OBJETO) SÍ produce líneas', () => {
  const out = lines('campaign_copy', OFFER_A6C66D5C);
  assert.notEqual(out, ''); // si esto falla, la feature es INERTE en producción
  assert.match(out, /Inicio Rápido/);
  assert.match(out, /\$499/);
});

test('T-04(2) `3c971ff7` — {name, price, benefit, details[]} ⇒ aplanado con `details:`', () => {
  const df = normalizeDecisionFrame({
    id: '3c971ff7',
    client_id: 'c',
    status: 'draft',
    decision_frame: {
      option_a: {
        name: 'Plan Esencial',
        price: '$500',
        benefit: 'Ideal para un inicio rápido',
        details: ['Evaluación de Marca™', 'Configuración básica de GBP']
      }
    }
  });
  assert.equal(
    df.option_a,
    'Plan Esencial — $500 — Ideal para un inicio rápido — details: Evaluación de Marca™, Configuración básica de GBP'
  );
});

test('T-04(3) `923f117c` — {price, title, features[]} (sin `name`, con `title`)', () => {
  const df = normalizeDecisionFrame({
    id: '923f117c',
    client_id: 'c',
    status: 'draft',
    decision_frame: {
      option_a: {
        price: '$500',
        title: 'Paquete Básico',
        features: ['Optimización de GBP', 'Identidad Visual Básica']
      }
    }
  });
  assert.equal(
    df.option_a,
    'Paquete Básico — $500 — features: Optimización de GBP, Identidad Visual Básica'
  );
});

test('T-04(4) `e682af22`/`5208996c` — {name, price, description} + clave extra `badge` NO se descarta (DT-9)', () => {
  const df = normalizeDecisionFrame({
    id: 'e682af22',
    client_id: 'customize-it',
    status: 'draft',
    decision_frame: {
      option_a: {
        name: 'Solución Básica',
        price: '$99/mes',
        description: 'GBP activo en 7 días'
      },
      option_b: {
        name: 'Solución Pro',
        price: '$199/mes',
        description: 'Presencia local completa',
        badge: 'Más popular'
      }
    }
  });
  assert.equal(df.option_a, 'Solución Básica — $99/mes — GBP activo en 7 días');
  assert.equal(
    df.option_b,
    'Solución Pro — $199/mes — Presencia local completa — badge: Más popular'
  );
});

test('T-04(5) `ee346c76`/`e6d90c41`/`5b26dc56`/`4b0483c2` — opciones STRING pasan tal cual (sin aplanado)', () => {
  const df = normalizeDecisionFrame(OFFER_EE346C76);
  assert.equal(
    df.option_a,
    'Paquete básico: Activación de Google Business Profile.'
  );
  assert.doesNotMatch(df.option_a ?? '', / — /); // sin aplanado: nada de separador interno
  const out = lines('website_home', OFFER_EE346C76);
  assert.match(
    out,
    /A \(entrada\): Paquete básico: Activación de Google Business Profile\./
  );
});

test('T-04(6) MEZCLA — `option_a` objeto + `option_b` string en la misma fila ⇒ ambas con su forma', () => {
  const df = normalizeDecisionFrame({
    id: 'mixto',
    client_id: 'c',
    status: 'draft',
    decision_frame: {
      option_a: { name: 'Inicio Rápido', price: '$499' },
      option_b: 'Paquete recomendado en texto plano.'
    }
  });
  assert.equal(df.option_a, 'Inicio Rápido — $499');
  assert.equal(df.option_b, 'Paquete recomendado en texto plano.');
});

test('T-04(7) R-29 `b655483e`/`a6c66d5c` — la `urgency` ANIDADA en decision_frame NO aparece en la línea', () => {
  // `b655483e`: "Los espacios ... limitados a 5 por mes." anidada junto a las opciones.
  const df = normalizeDecisionFrame({
    id: 'b655483e',
    client_id: 'c',
    status: 'draft',
    decision_frame: {
      urgency: 'Los espacios están limitados a 5 por mes.',
      option_a: { name: 'Plan Base', price: '$300' }
    }
  });
  assert.equal(df.option_a, 'Plan Base — $300');
  assert.doesNotMatch(
    JSON.stringify(df),
    /limitados a 5 por mes|Solo 5 espacios/
  );
  // Y en la línea emitida de `a6c66d5c` la anidada tampoco aparece DENTRO del
  // Decision Frame: la urgencia sale por su propia línea (vía normalizeOffer).
  const out = lines('campaign_copy', OFFER_A6C66D5C);
  const dfLine = out.split('\n').find((l) => l.startsWith('Decision Frame:'));
  assert.ok(dfLine);
  assert.doesNotMatch(dfLine, /Solo 5 espacios/);
  // Anti-duplicación: la frase de escasez aparece UNA sola vez en todo el output.
  assert.equal(out.split('Solo 5 espacios').length - 1, 1);
});

test('T-04(7b) R-29 una clave `urgency` DENTRO de una opción-objeto tampoco se aplana (anti-duplicación)', () => {
  const df = normalizeDecisionFrame({
    id: 'sintetico-r29',
    client_id: 'c',
    status: 'draft',
    decision_frame: {
      option_a: { name: 'Plan Base', urgency: 'Quedan 2 cupos' }
    }
  });
  assert.equal(df.option_a, 'Plan Base');
});

test('T-04(8) R-30 `cabddf01` — todo `[PENDIENTE]` ⇒ `buildOfvMethodLines` devuelve ""', () => {
  const df = normalizeDecisionFrame(OFFER_CABDDF01);
  assert.deepEqual(df, {
    option_a: null,
    option_b: null,
    option_c: null,
    text: null
  });
  for (const step of REPARTO_STEPS) {
    assert.equal(lines(step, OFFER_CABDDF01), '');
  }
});

test('T-04(8b) R-30/R-15 variante mixta (A `[PENDIENTE]`, B/C con contenido) ⇒ emisión PARCIAL', () => {
  const row: RawOfferRow = {
    id: 'cabddf01-mixto',
    client_id: 'c',
    status: 'draft',
    content: {
      decision_frame: {
        option_a: '[PENDIENTE]',
        option_b: 'Paquete recomendado.',
        option_c: 'Seguir igual.'
      }
    }
  };
  assert.equal(
    lines('campaign_copy', row),
    '\nDecision Frame: B (recomendado): Paquete recomendado. | C (status quo): Seguir igual.'
  );
});

test('T-04(8c) R-30 `[PENDIENTE]` dentro de una opción-objeto y de un array se trata como ausente', () => {
  const df = normalizeDecisionFrame({
    id: 'sintetico-r30',
    client_id: 'c',
    status: 'draft',
    decision_frame: {
      option_a: {
        name: 'Plan Base',
        price: '[PENDIENTE]',
        details: ['Item real', '[pendiente]', '']
      },
      option_b: { price: '[PENDIENTE]' } // queda sin nada ⇒ opción ausente
    }
  });
  assert.equal(df.option_a, 'Plan Base — details: Item real');
  assert.equal(df.option_b, null);
});

test('T-04(9) ⭐ R-07 LOAD-BEARING: `offers.urgency` vacía + `content.urgency_scarcity` poblado ⇒ SÍ se emite', () => {
  // Forma REAL de las 16 filas de producción: la columna plana está vacía y el valor
  // vive en `content.urgency_scarcity`. La línea existe ÚNICAMENTE por el fallback de
  // `normalizeOffer` — por eso se consume, no se re-implementa.
  assert.equal(OFFER_A6C66D5C.urgency, null);
  const out = lines('website_home', OFFER_A6C66D5C);
  assert.match(
    out,
    /\nUrgencia: Solo 5 espacios disponibles este mes para asegurar la calidad del servicio personalizado$/
  );
});

test('T-04(10) R-28.2 determinismo: el orden de inserción de las claves NO cambia la salida', () => {
  const a = normalizeDecisionFrame({
    id: 'det-1',
    client_id: 'c',
    status: 'draft',
    decision_frame: {
      option_a: {
        name: 'Plan Esencial',
        price: '$500',
        benefit: 'Ideal para un inicio rápido',
        details: ['A', 'B'],
        badge: 'Popular'
      }
    }
  });
  const b = normalizeDecisionFrame({
    id: 'det-2',
    client_id: 'c',
    status: 'draft',
    decision_frame: {
      option_a: {
        badge: 'Popular',
        details: ['A', 'B'],
        price: '$500',
        benefit: 'Ideal para un inicio rápido',
        name: 'Plan Esencial'
      }
    }
  });
  assert.equal(a.option_a, b.option_a);
  assert.equal(
    a.option_a,
    'Plan Esencial — $500 — Ideal para un inicio rápido — badge: Popular — details: A, B'
  );
});

/* ================================================================== */
/*  T-05 — el reparto como dato + gating (default-deny)                */
/* ================================================================== */

test('T-05 R-09/R-12 `OFV_METHOD_FIELDS_BY_STEP` tiene EXACTAMENTE los 5 steps del reparto', () => {
  assert.deepEqual(Object.keys(OFV_METHOD_FIELDS_BY_STEP).sort(), [
    'campaign_copy',
    'gbp_posts',
    'website_home',
    'website_location',
    'website_service'
  ]);
  for (const step of REPARTO_STEPS) {
    assert.deepEqual(
      [...OFV_METHOD_FIELDS_BY_STEP[step]].sort(),
      ['decision_frame', 'urgency'].sort()
    );
  }
});

test('T-05 R-11 los steps excluidos NO son claves del reparto (CL-094)', () => {
  for (const step of [
    'gbp_description',
    'nurturing',
    'social_content',
    'buyer_persona',
    'ofv'
  ]) {
    assert.ok(!(step in OFV_METHOD_FIELDS_BY_STEP), step);
  }
});

test('T-05 R-10 los 5 steps del reparto emiten AMBAS líneas con la OFV canónica', () => {
  for (const step of REPARTO_STEPS) {
    const out = lines(step, OFFER_A6C66D5C);
    assert.match(out, /\nDecision Frame: /, step);
    assert.match(out, /\nUrgencia: /, step);
  }
});

test('T-05 R-11 default-deny: steps excluidos y step DESCONOCIDO devuelven ""', () => {
  for (const step of FUERA_DEL_REPARTO) {
    assert.equal(lines(step, OFFER_A6C66D5C), '', step);
  }
});

test('T-05 R-08/R-30 urgency null/""/"   "/"[PENDIENTE]" ⇒ sin línea de urgencia', () => {
  const decisionFrame = normalizeDecisionFrame(OFFER_EE346C76);
  for (const urgency of [null, '', '   ', '[PENDIENTE]', '  [pendiente] ']) {
    const out = buildOfvMethodLines({
      step: 'gbp_posts',
      offer: { urgency },
      decisionFrame
    });
    assert.doesNotMatch(out, /Urgencia/, JSON.stringify(urgency));
    assert.match(out, /^\nDecision Frame: /); // el decision frame sigue emitiéndose
  }
});

/* ================================================================== */
/*  T-06 — formato exacto y NO-REGRESIÓN byte-idéntica                 */
/* ================================================================== */

test('T-06 R-13/R-14/R-16 formato exacto: Decision Frame ANTES de Urgencia, roles A/B/C, join(" | ")', () => {
  const out = lines('campaign_copy', OFFER_A6C66D5C);
  const rows = out.split('\n');
  assert.equal(rows[0], ''); // el string EMPIEZA con '\n' (se ANEXA al bloque)
  assert.equal(rows.length, 3);
  assert.equal(
    rows[1],
    'Decision Frame: A (entrada): Inicio Rápido — $499 — Activación de la presencia local | ' +
      'B (recomendado): Dominio Local — $999 — Presencia local completa | ' +
      'C (status quo): Seguir como estás — Consecuencias de no actuar: seguir invisible en el mapa'
  );
  assert.equal(
    rows[2],
    'Urgencia: Solo 5 espacios disponibles este mes para asegurar la calidad del servicio personalizado'
  );
});

test('T-06 R-28.4 el separador interno " — " no colisiona con el separador de opciones " | "', () => {
  const out = lines('campaign_copy', OFFER_A6C66D5C);
  const dfLine = out.split('\n')[1];
  assert.equal(dfLine.split(' | ').length, 3); // exactamente 3 opciones
  assert.match(dfLine, / — /); // y el aplanado usa el otro separador
});

test('T-06 R-15 parcial (solo B y C) sin placeholders ni N/A', () => {
  const row: RawOfferRow = {
    id: 'parcial',
    client_id: 'c',
    status: 'draft',
    decision_frame: { option_b: 'Recomendado', option_c: 'Status quo' }
  };
  const out = lines('gbp_posts', row);
  assert.equal(
    out,
    '\nDecision Frame: B (recomendado): Recomendado | C (status quo): Status quo'
  );
  assert.doesNotMatch(out, /N\/A|A \(entrada\)|\[PENDIENTE\]/i);
});

test('T-06 R-03 forma legacy `text` se emite tal cual bajo la misma etiqueta', () => {
  const row: RawOfferRow = {
    id: 'legacy-text',
    client_id: 'c',
    status: 'draft',
    decision_frame: 'Tres opciones descritas en prosa, sin estructura.'
  };
  assert.equal(
    lines('website_service', row),
    '\nDecision Frame: Tres opciones descritas en prosa, sin estructura.'
  );
});

test('T-06(a) R-17 BYTE-IDENTIDAD: steps fuera del reparto con la OFV COMPLETA ⇒ ""', () => {
  for (const step of [
    'gbp_description',
    'nurturing',
    'social_content',
    'foo_bar'
  ]) {
    assert.equal(lines(step, OFFER_A6C66D5C), '', step);
  }
});

test('T-06(b) R-18 BYTE-IDENTIDAD: steps DEL reparto con `b106ad61` (vacía-shadow) y `cabddf01` ⇒ ""', () => {
  for (const step of REPARTO_STEPS) {
    assert.equal(lines(step, OFFER_B106AD61), '', 'b106ad61/' + step);
    assert.equal(lines(step, OFFER_CABDDF01), '', 'cabddf01/' + step);
  }
});
