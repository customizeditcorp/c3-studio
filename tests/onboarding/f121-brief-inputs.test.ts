/**
 * F-121 — T-03 — `src/lib/onboarding/brief-inputs.ts`: seam puro de insumos
 * (R-06, R-07, R-10, R-11).
 *
 * **Fixtures REALES** (R-30), leídos por `SELECT` read-only sobre
 * `uxczbwtfcsjsrmrikwoh` el 2026-07-27 y citados con su `id` de fila. No hay paráfrasis
 * y no hay writes: la constante `FILAS_REALES` es la única fuente de los fixtures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  BRIEF_CLIENT_INPUT_FIELDS,
  BRIEF_INPUT_SOURCES,
  assessBriefInputs,
  hasUsableDiagnosticInput,
  selectDiagnosticRow,
  type DiagnosticRowLike
} from '../../src/lib/onboarding/brief-inputs.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/* ================================================================== */
/*  ⭐ FIXTURES REALES — una constante única, citada por `id` de fila   */
/* ================================================================== */

/**
 * `SELECT id, client_id, created_at, completed_at, team_size, google_presence,
 * digital_health, revenue_range, license_status, expectation, recommended_tier
 * FROM diagnostics ORDER BY created_at DESC` — 2026-07-27, read-only.
 *
 * ⚠️ `completed_at` es **NULL en las 9 filas** de la tabla. Ése es el dato que existía
 * para decir la verdad y que nadie derivaba (CL-111 hallazgo 1).
 */
const FILAS_REALES = {
  /** R & M QTB LLC (`4a59cbff…`) — fila A. Tier `presencia_digital`, `process`, `new_license`. */
  rym_A: {
    id: 'bc0a1027-983e-41dc-9c89-3865b3209f7c',
    client_id: '4a59cbff-7124-4bea-9c44-81d9b7f63b0d',
    created_at: '2026-03-27 01:01:54.536471+00',
    completed_at: null,
    team_size: '2_5',
    google_presence: 'no_gbp',
    digital_health: 'nothing',
    revenue_range: '10k_25k',
    license_status: 'new_license',
    expectation: 'process',
    recommended_tier: 'presencia_digital'
  },
  /** R & M QTB LLC (`4a59cbff…`) — fila B, **CONTRADICTORIA** con A. Tier `cimientos`, `urgent`, `established`. */
  rym_B: {
    id: '33872f29-8883-4a86-9ffa-9ef8968e8855',
    client_id: '4a59cbff-7124-4bea-9c44-81d9b7f63b0d',
    created_at: '2026-03-27 00:42:47.07546+00',
    completed_at: null,
    team_size: '2_5',
    google_presence: 'no_gbp',
    digital_health: 'nothing',
    revenue_range: '10k_25k',
    license_status: 'established',
    expectation: 'urgent',
    recommended_tier: 'cimientos'
  },
  /** SCS Cleaning Service (`e24ddff3…`) — el control de no-regresión. */
  scs: {
    id: '45f47127-489a-4003-b41d-78eb40192fe2',
    client_id: 'e24ddff3-4cf3-4e74-b9e6-3f2bc007a600',
    created_at: '2026-04-11 03:19:15.560138+00',
    completed_at: null,
    team_size: '2_5',
    google_presence: 'no_gbp',
    digital_health: 'nothing'
  },
  /** Clara V Decor (`122f3593…`). */
  clara: {
    id: '96c58e5f-f119-4c05-aa6f-53fc61a5a21b',
    client_id: '122f3593-4523-4627-b918-1ffd74c89efb',
    created_at: '2026-07-23 02:03:29.134528+00',
    completed_at: null,
    team_size: 'solo',
    google_presence: 'ranking_no_calls',
    digital_health: 'nothing'
  }
} as const;

/**
 * **Fixture CONSTRUIDO y declarado como tal** para R-11: una fila de diagnóstico que
 * existe y **no aporta ningún insumo utilizable**. No sale de producción — se lo declara
 * abiertamente en vez de disfrazarlo de real (`docs/verification.md` §6).
 *
 * No es hipotético: `completed_at` es NULL en las 9 filas reales, es decir el
 * diagnóstico **a medio llenar es la norma**, y el paso 3 (`team_size`) va después del
 * paso 2. Una fila guardada antes de esos pasos tiene esta forma exacta.
 */
const FILA_SIN_INSUMO: DiagnosticRowLike = {
  id: '00000000-0000-4000-8000-00000000f121',
  created_at: '2026-07-01 00:00:00+00',
  team_size: null,
  google_presence: null,
  digital_health: null
};

/** Cliente R & M QTB LLC, tal como lo ve el bloque `## DATOS DEL CLIENTE`. */
const CLIENTE_RYM = {
  id: '4a59cbff-7124-4bea-9c44-81d9b7f63b0d',
  business_name: 'R & M QTB LLC',
  industry: 'portable_toilet_rental_service',
  contact_first_name: null,
  contact_last_name: null,
  phone: null,
  email: null,
  tier: null
};

/** Cliente Clara V Decor: `industry` = `other` ⇒ ausencia de industria declarada. */
const CLIENTE_CLARA = {
  id: '122f3593-4523-4627-b918-1ffd74c89efb',
  business_name: 'Clara V Decor',
  industry: 'other',
  contact_first_name: null,
  contact_last_name: null,
  phone: null,
  email: null,
  tier: null
};

/* ================================================================== */
/*  ⭐ R-10 — selección DETERMINISTA y DECLARADA de la fila            */
/* ================================================================== */

test('T-03 ⭐⭐ R-10 R & M tiene DOS filas contradictorias: el seam elige UNA, y SIEMPRE la misma', () => {
  const A = FILAS_REALES.rym_A;
  const B = FILAS_REALES.rym_B;
  // Las dos filas SÍ se contradicen — el fixture no es decorativo.
  assert.notEqual(A.recommended_tier, B.recommended_tier);
  assert.notEqual(A.expectation, B.expectation);
  assert.notEqual(A.license_status, B.license_status);

  const esperado = A.id; // `created_at` 01:01:54 > 00:42:47
  // Invariante bajo el ORDEN DE LLEGADA: las 2 permutaciones dan lo mismo.
  assert.equal(selectDiagnosticRow([A, B])?.id, esperado);
  assert.equal(selectDiagnosticRow([B, A])?.id, esperado);
  // Y es idempotente: llamarlo N veces no cambia el veredicto.
  for (let i = 0; i < 5; i++) {
    assert.equal(selectDiagnosticRow([B, A])?.id, esperado);
  }
});

test('T-03 ⭐ R-10 el criterio es `created_at desc` con desempate TOTAL por `id` asc', () => {
  const mismoInstante = [
    { id: 'bbbb', created_at: '2026-03-27 01:01:54.536471+00' },
    { id: 'aaaa', created_at: '2026-03-27 01:01:54.536471+00' }
  ];
  // Sin desempate total, esto quedaría a merced del orden de llegada.
  assert.equal(selectDiagnosticRow(mismoInstante)?.id, 'aaaa');
  assert.equal(
    selectDiagnosticRow(mismoInstante.slice().reverse())?.id,
    'aaaa'
  );
  // Fechas ausentes / no parseables pierden contra una fecha válida.
  assert.equal(
    selectDiagnosticRow([
      { id: 'sin_fecha', created_at: null },
      FILAS_REALES.rym_B
    ])?.id,
    FILAS_REALES.rym_B.id
  );
});

test('T-03 R-10 el seam NO muta el array recibido y degrada honesto en los bordes', () => {
  const rows = [FILAS_REALES.rym_B, FILAS_REALES.rym_A];
  const copia = rows.slice();
  selectDiagnosticRow(rows);
  assert.deepEqual(
    rows,
    copia,
    'la ficha puede reusar el array para renderizar'
  );
  assert.equal(selectDiagnosticRow([]), null);
  assert.equal(selectDiagnosticRow(null), null);
  assert.equal(selectDiagnosticRow(undefined), null);
});

/* ================================================================== */
/*  ⭐ R-11 — fila presente que NO aporta insumo utilizable            */
/* ================================================================== */

test('T-03 ⭐⭐ R-11 diagnóstico PRESENTE sin insumo utilizable ⇒ `hasUsableDiagnosticInput === false`', () => {
  const r = assessBriefInputs({
    client: CLIENTE_RYM,
    diagnostics: [FILA_SIN_INSUMO]
  });
  // La fila EXISTE — y la señal NO afirma disponibilidad. Ése es el arreglo entero.
  assert.equal(r.diagnosticRowUsed, FILA_SIN_INSUMO.id);
  assert.equal(
    r.hasUsableDiagnosticInput,
    false,
    'existencia de fila ≠ insumos disponibles: es exactamente lo que `!!diagnosticData` ' +
      'no distinguía (`clients/[id]/page.tsx:315`)'
  );
});

test('T-03 ⭐ R-11 un código FUERA del vocabulario cerrado no cuenta como insumo', () => {
  assert.equal(
    hasUsableDiagnosticInput({
      id: 'x',
      team_size: 'un_valor_que_no_existe',
      google_presence: 'zzz',
      digital_health: 'yyy'
    }),
    false,
    'si no se lo puede expresar en lenguaje, no llega nada al Brief (F-104/F-106)'
  );
});

test('T-03 R-11 los campos que NO llegan al generador NO cuentan como insumo', () => {
  // `revenue_range`, `license_status`, `expectation`, `recommended_*` existen en la fila
  // y **no viajan al Brief**: contarlos volvería a prometer lo que el pipeline no entrega.
  assert.equal(
    hasUsableDiagnosticInput({
      id: 'x',
      revenue_range: '10k_25k',
      license_status: 'new_license',
      expectation: 'process',
      recommended_tier: 'presencia_digital',
      recommended_price: 3300
    } as DiagnosticRowLike),
    false
  );
  // Las filas REALES sí aportan: tienen `team_size` y los 2 códigos de presencia.
  for (const fila of [
    FILAS_REALES.rym_A,
    FILAS_REALES.rym_B,
    FILAS_REALES.scs,
    FILAS_REALES.clara
  ]) {
    assert.equal(hasUsableDiagnosticInput(fila), true, `fila ${fila.id}`);
  }
  assert.equal(hasUsableDiagnosticInput(null), false);
  assert.equal(hasUsableDiagnosticInput(undefined), false);
});

/* ================================================================== */
/*  ⭐ R-06 / R-07 — present / missing sobre los insumos REALES        */
/* ================================================================== */

test('T-03 ⭐ R-07 la declaración enumera EXACTAMENTE las 2 fuentes del step `brief`', () => {
  assert.deepEqual(BRIEF_INPUT_SOURCES.slice().sort(), [
    'clients',
    'input_data.structured_fields'
  ]);
  // `diagnostics` NO es una fuente: es la rama (2), elevada (GATE-D1), NO implementada.
  assert.ok(!BRIEF_INPUT_SOURCES.includes('diagnostics' as never));
  assert.ok(!BRIEF_INPUT_SOURCES.includes('contextChain' as never));
});

test('T-03 ⭐⭐ R-06 R & M sin campos manuales: la señal dice lo que el generador REALMENTE recibe', () => {
  const r = assessBriefInputs({
    client: CLIENTE_RYM,
    diagnostics: [FILAS_REALES.rym_A, FILAS_REALES.rym_B]
  });
  // Lo que sí llega: el nombre y la industria (des-tokenizada).
  assert.ok(r.present.includes('business_name'));
  assert.ok(r.present.includes('industry'));
  // Lo que NO llega — y el Brief salió con 23/29 [PENDIENTE] precisamente por esto.
  for (const ausente of [
    'contact_first_name',
    'contact_last_name',
    'phone',
    'email',
    'tier',
    'structured_fields'
  ] as const) {
    assert.ok(r.missing.includes(ausente), `\`${ausente}\` debía faltar`);
  }
  // present ⊎ missing = la declaración completa: ningún insumo queda sin clasificar.
  assert.equal(
    r.present.length + r.missing.length,
    BRIEF_CLIENT_INPUT_FIELDS.length + 1
  );
  assert.deepEqual(
    r.present.filter((p) => r.missing.includes(p)),
    [],
    'ningún insumo puede estar presente y ausente a la vez'
  );
  // Y la fila elegida es la declarada por R-10, no "la que vino primera".
  assert.equal(r.diagnosticRowUsed, FILAS_REALES.rym_A.id);
});

test('T-03 ⭐ R-06 Clara V (`industry = other`): la industria cuenta como AUSENTE, no como presente', () => {
  const r = assessBriefInputs({
    client: CLIENTE_CLARA,
    diagnostics: [FILAS_REALES.clara]
  });
  assert.ok(
    r.missing.includes('industry'),
    '`other` no aporta rubro: aporta un token que el modelo leería como sustantivo ' +
      '("Top 3 en Google Maps para other", brief `e1ad789c`)'
  );
  assert.ok(!r.present.includes('industry'));
});

test('T-03 R-06 con campos manuales reales, `structured_fields` pasa a PRESENTE', () => {
  const r = assessBriefInputs({
    client: CLIENTE_RYM,
    diagnostics: [FILAS_REALES.rym_A],
    // Valor REAL del campo manual de R & M (brief `b56d1fa3`).
    manualFields: { differentiators: 'TEST T-04' }
  });
  assert.ok(r.present.includes('structured_fields'));
  // Campos manuales vacíos NO cuentan (degradación honesta).
  const vacio = assessBriefInputs({
    client: CLIENTE_RYM,
    manualFields: { differentiators: '', guarantees: '   ' }
  });
  assert.ok(vacio.missing.includes('structured_fields'));
  assert.equal(vacio.diagnosticRowUsed, null);
  assert.equal(vacio.hasUsableDiagnosticInput, false);
});

test('T-03 R-07 el seam no lanza ante entradas degeneradas', () => {
  for (const client of [null, undefined, {}]) {
    const r = assessBriefInputs({ client });
    assert.equal(r.present.length + r.missing.length, 8);
    assert.equal(r.diagnosticRowUsed, null);
    assert.equal(r.hasUsableDiagnosticInput, false);
  }
});

/* ================================================================== */
/*  Pureza del seam (R-07: sin I/O, sin efectos)                       */
/* ================================================================== */

test('T-03 R-07 `brief-inputs.ts` es un seam PURO: sin Supabase, sin React, sin red', () => {
  const CODE = readFileSync(
    resolve(REPO, 'src/lib/onboarding/brief-inputs.ts'),
    'utf8'
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const prohibido of ['supabase', 'react', 'fetch(', 'process.env']) {
    assert.ok(!CODE.includes(prohibido), `contiene «${prohibido}»`);
  }
  // Los únicos imports permitidos son los otros dos seams puros de F-121.
  const imports = Array.from(CODE.matchAll(/from\s+'([^']+)'/g), (m) => m[1]);
  assert.deepEqual(imports.slice().sort(), [
    '../clients/industry-label.ts',
    './diagnostic-labels.ts'
  ]);
});
