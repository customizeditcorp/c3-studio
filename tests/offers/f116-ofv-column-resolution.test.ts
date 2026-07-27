/**
 * F-116 — T-10 — Resolución por columna de `buildOfvWritePayload` (R-19/R-20).
 *
 * **Esta es la parte de F-116 que SÍ es decidible offline.** El helper es puro y
 * determinista: no depende de lo que el modelo emita, así que acá no hay límite de
 * claim que declarar — a diferencia de `f116-core-contract.test.ts`, cuyo objeto es
 * un prompt y cuya verificación autoritativa es LIVE.
 *
 * Lo que cierra: el puente entre los DOS dialectos que hoy son mutuamente
 * ilegibles (`requirements.md`, hallazgo nuevo). `page.tsx:509-510` lee la OFV con
 * `parseContentToFields` = claves EXACTAS con valor `string` (dialecto de
 * formulario, el que R-11 declara en el prompt); las 9 columnas de `offers` tienen
 * otros nombres y otras formas. Sin esta resolución, declarar el formulario en el
 * prompt dejaría `vehicle_description`, `urgency` y `decision_frame` en NULL para
 * siempre.
 *
 * **Fixtures de dialecto con ORIGEN CITADO** (R-34b): censo `SELECT
 * jsonb_object_keys` (read-only) sobre las 16 filas de `offers` del **2026-07-26**
 * — `vehicle_unique` objeto `{name, steps[]}` en 7 filas, `vehicle_steps` string
 * en 4, `urgency_scarcity` en 12, `vehicle_description` en 0 y `urgency` en 0.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildOfvWritePayload,
  ofvFieldsToContent
} from '../../src/lib/offers/write-path.ts';

const writePathSrc = readFileSync(
  fileURLToPath(new URL('../../src/lib/offers/write-path.ts', import.meta.url)),
  'utf8'
);

/* ================================================================== */
/*  (a) Dialecto de FORMULARIO completo → las 9 columnas (R-19)       */
/* ================================================================== */

/** Exactamente las 11 claves + `raw_text` que el contrato de R-11 declara, todas
 * string. Es lo que el prompt del núcleo instruye emitir tras F-116. */
const FORM_DIALECT: Record<string, unknown> = {
  big_promise: 'Presencia digital completa en 90 días con el Sistema VIP™',
  vehicle_name: 'Sistema VIP™',
  vehicle_steps: '1. Verificación\n2. Identidad\n3. Presencia',
  quick_win: 'GBP activo y optimizado en 7 días',
  option_a: 'Paquete base',
  option_b: 'Paquete recomendado',
  option_c: 'Status quo',
  deliverables: 'Perfil verificado\nSet de fotos\nCalendario de publicaciones',
  guarantee: 'Si el Quick Win no está en 14 días, el mes no se cobra',
  urgency_scarcity: 'Cupos reales del mes',
  social_proof: '[PENDIENTE: aportar reseñas/testimonios reales del cliente]',
  raw_text: '# OFERTA DE VALOR\n...'
};

test('T-10(a) R-19 dialecto de formulario completo ⇒ las 9 columnas resueltas', () => {
  const { columns } = buildOfvWritePayload(FORM_DIALECT);
  assert.deepEqual(Object.keys(columns).sort(), [
    'big_promise',
    'decision_frame',
    'deliverables',
    'guarantee',
    'quick_win',
    'social_proof',
    'urgency',
    'vehicle_description',
    'vehicle_name'
  ]);
});

test('T-10(a) R-19 las formas: decision_frame OBJETO, deliverables/social_proof ARRAYS', () => {
  const { columns } = buildOfvWritePayload(FORM_DIALECT);
  assert.deepEqual(columns.decision_frame, {
    option_a: 'Paquete base',
    option_b: 'Paquete recomendado',
    option_c: 'Status quo'
  });
  assert.deepEqual(columns.deliverables, [
    'Perfil verificado',
    'Set de fotos',
    'Calendario de publicaciones'
  ]);
  assert.deepEqual(columns.social_proof, [
    '[PENDIENTE: aportar reseñas/testimonios reales del cliente]'
  ]);
  // Los renames del dialecto de formulario → columna.
  assert.equal(
    columns.vehicle_description,
    '1. Verificación\n2. Identidad\n3. Presencia'
  );
  assert.equal(columns.urgency, 'Cupos reales del mes');
  assert.equal(columns.vehicle_name, 'Sistema VIP™');
});

test('T-10(a) R-19 el dialecto de formulario converge con `ofvFieldsToContent` (misma proyección, dos caminos)', () => {
  // El camino UI (F-107) y el camino generación (F-116) tienen que llenar las
  // MISMAS columnas con los MISMOS valores: si divergen, editar y regenerar dan
  // filas distintas.
  const viaForm = buildOfvWritePayload(FORM_DIALECT).columns;
  const viaUi = buildOfvWritePayload(
    ofvFieldsToContent(FORM_DIALECT as never)
  ).columns;
  assert.deepEqual(viaUi, viaForm);
});

/* ================================================================== */
/*  (b) Dialecto LIVE (censo 2026-07-26) → columna (R-19, R-34b)      */
/* ================================================================== */

test('T-10(b) ⭐ R-34b `vehicle_unique: {name, steps[]}` (7 filas live) ⇒ vehicle_name Y vehicle_description no vacías', () => {
  // Hoy este dialecto pierde la Sección 2 ENTERA: `vehicle_name` es NULL en 12/16
  // y `vehicle_description` en 16/16.
  const live: Record<string, unknown> = {
    big_promise: 'BP',
    vehicle_unique: {
      name: 'Sistema VIP™',
      steps: ['Verificación', 'Identidad', 'Presencia']
    },
    urgency_scarcity: 'Cupos limitados reales este mes'
  };
  const { columns } = buildOfvWritePayload(live);
  assert.equal(columns.vehicle_name, 'Sistema VIP™');
  assert.equal(
    columns.vehicle_description,
    'Verificación\nIdentidad\nPresencia'
  );
  assert.ok((columns.vehicle_description as string).length > 0);
  assert.equal(columns.urgency, 'Cupos limitados reales este mes');
});

test('T-10(b) R-34b `vehicle_steps` string (4 filas live) ⇒ vehicle_description, sin pisar `vehicle_name`', () => {
  const live: Record<string, unknown> = {
    vehicle_name: 'Método ABC™',
    vehicle_steps: 'Paso 1\nPaso 2'
  };
  const { columns } = buildOfvWritePayload(live);
  assert.equal(columns.vehicle_name, 'Método ABC™');
  assert.equal(columns.vehicle_description, 'Paso 1\nPaso 2');
});

test('T-10(b) R-19 precedencia del vehículo: canónica > vehicle_steps > vehicle_unique.steps', () => {
  const all: Record<string, unknown> = {
    vehicle_name: 'CANÓNICA',
    vehicle_description: 'CANÓNICA-DESC',
    vehicle_steps: 'FORMULARIO',
    vehicle_unique: { name: 'LIVE', steps: ['LIVE-STEP'] }
  };
  const first = buildOfvWritePayload(all).columns;
  assert.equal(first.vehicle_name, 'CANÓNICA');
  assert.equal(first.vehicle_description, 'CANÓNICA-DESC');

  // Sin la canónica, gana el dialecto de formulario sobre el live.
  const second = buildOfvWritePayload({
    vehicle_steps: 'FORMULARIO',
    vehicle_unique: { name: 'LIVE', steps: ['LIVE-STEP'] }
  }).columns;
  assert.equal(second.vehicle_description, 'FORMULARIO');
  assert.equal(second.vehicle_name, 'LIVE');
});

test('T-10(b) R-19 alias que NO aplican no ensucian: vehicle_unique mal formado ⇒ sin columna', () => {
  for (const bad of [
    { vehicle_unique: 'no es objeto' },
    { vehicle_unique: null },
    { vehicle_unique: { name: '   ', steps: [] } },
    { vehicle_unique: { steps: [{ paso: 1 }] } }
  ]) {
    const { columns } = buildOfvWritePayload(bad as Record<string, unknown>);
    assert.ok(
      !('vehicle_name' in columns),
      `vehicle_name se llenó desde ${JSON.stringify(bad)}`
    );
    assert.ok(
      !('vehicle_description' in columns),
      `vehicle_description se llenó desde ${JSON.stringify(bad)}`
    );
  }
});

test('T-10(b) R-19 fold del Decision Frame: solo las opciones presentes, y nunca objeto vacío', () => {
  assert.deepEqual(buildOfvWritePayload({ option_b: 'B' }).columns, {
    decision_frame: { option_b: 'B' }
  });
  // option_* vacías ⇒ no hay columna (no se escribe `{}` en jsonb).
  assert.deepEqual(
    buildOfvWritePayload({ option_a: '', option_b: '   ' }).columns,
    {}
  );
});

/* ================================================================== */
/*  (c) ⭐ FALLBACK-ONLY y `content` intacto (R-20)                    */
/* ================================================================== */

test('T-10(c) ⭐ R-20 la clave canónica GANA: el alias no la pisa nunca', () => {
  const both: Record<string, unknown> = {
    vehicle_name: 'CANÓNICA',
    vehicle_description: 'CANÓNICA',
    urgency: 'CANÓNICA',
    decision_frame: { option_a: 'CANÓNICA' },
    deliverables: ['CANÓNICA'],
    social_proof: ['CANÓNICA'],
    // …y todos los alias presentes a la vez, compitiendo:
    vehicle_unique: { name: 'ALIAS', steps: ['ALIAS'] },
    vehicle_steps: 'ALIAS',
    urgency_scarcity: 'ALIAS',
    option_a: 'ALIAS'
  };
  const { columns } = buildOfvWritePayload(both);
  assert.equal(columns.vehicle_name, 'CANÓNICA');
  assert.equal(columns.vehicle_description, 'CANÓNICA');
  assert.equal(columns.urgency, 'CANÓNICA');
  assert.deepEqual(columns.decision_frame, { option_a: 'CANÓNICA' });
  assert.deepEqual(columns.deliverables, ['CANÓNICA']);
  assert.deepEqual(columns.social_proof, ['CANÓNICA']);
});

test('T-10(c) ⭐ R-20 `content` se devuelve SIN MODIFICAR (procedencia: se persiste lo que dijo el modelo)', () => {
  const input: Record<string, unknown> = {
    vehicle_unique: { name: 'Sistema VIP™', steps: ['A', 'B'] },
    urgency_scarcity: 'Cupos reales',
    option_a: 'A',
    deliverables: 'uno\ndos'
  };
  const snapshot = structuredClone(input);
  const { content, columns } = buildOfvWritePayload(input);
  // Identidad referencial: es el MISMO objeto, no una copia adaptada.
  assert.equal(content, input);
  // Y no fue mutado: ni una clave de columna se coló dentro.
  assert.deepEqual(content, snapshot);
  assert.ok(!('vehicle_name' in content));
  assert.ok(!('vehicle_description' in content));
  assert.ok(!('urgency' in content));
  assert.ok(!('decision_frame' in content));
  // Mientras que las columnas SÍ se resolvieron.
  assert.equal(columns.vehicle_name, 'Sistema VIP™');
  assert.deepEqual(columns.deliverables, ['uno', 'dos']);
});

test('T-10(c) R-20 el orden de claves de `columns` sigue siendo el de OFV_COLUMN_KEYS (byte-equivalencia F-107)', () => {
  const { columns } = buildOfvWritePayload(FORM_DIALECT);
  assert.deepEqual(Object.keys(columns), [
    'big_promise',
    'vehicle_name',
    'vehicle_description',
    'quick_win',
    'decision_frame',
    'guarantee',
    'urgency',
    'social_proof',
    'deliverables'
  ]);
});

/* ================================================================== */
/*  (d) Claves ajenas ignoradas · entrada vacía                       */
/* ================================================================== */

test('T-10(d) las claves ajenas siguen ignoradas y la entrada vacía da columns vacío', () => {
  assert.deepEqual(buildOfvWritePayload({}).columns, {});
  const noise = buildOfvWritePayload({
    raw_text: 'no es columna',
    _validation: { is_valid: true },
    _method_grounding: { used: true },
    _source: 'ai'
  }).columns;
  assert.deepEqual(noise, {});
});

test('T-10(d) R-19 deliverables/social_proof string ⇒ array; array ⇒ tal cual; vacío ⇒ sin columna', () => {
  assert.deepEqual(
    buildOfvWritePayload({ deliverables: 'uno\n\n  dos  \n' }).columns
      .deliverables,
    ['uno', 'dos']
  );
  const arr = ['ya', 'era', 'array'];
  assert.equal(
    buildOfvWritePayload({ social_proof: arr }).columns.social_proof,
    arr
  );
  assert.deepEqual(
    buildOfvWritePayload({ deliverables: '   \n ' }).columns,
    {}
  );
});

/* ================================================================== */
/*  (e) Pureza del seam (mismo assert que f107-ofv-write-path.test.ts) */
/* ================================================================== */

test('T-10(e) write-path.ts sigue puro: sin next/server, sin cliente supabase, sin process.env', () => {
  assert.doesNotMatch(writePathSrc, /next\/server/);
  assert.doesNotMatch(
    writePathSrc,
    /@supabase|createClient|createServerClient/
  );
  assert.doesNotMatch(writePathSrc, /process\.env/);
  assert.equal(typeof buildOfvWritePayload, 'function');
  assert.equal(typeof ofvFieldsToContent, 'function');
});

test('T-10(e) R-19 la precedencia está declarada como DATO (tabla), no como condicionales dispersos', () => {
  assert.match(
    writePathSrc,
    /const\s+OFV_COLUMN_FALLBACKS/,
    'la resolución dejó de estar declarada como tabla de datos (R-19, patrón F-112/F-107)'
  );
  // La firma pública no cambió (R-19: mismo contrato de entrada/salida).
  assert.match(
    writePathSrc,
    /export\s+function\s+buildOfvWritePayload\(\s*content:\s*Record<string,\s*unknown>\s*\):\s*OfvWritePayload/
  );
});
