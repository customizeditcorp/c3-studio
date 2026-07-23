/**
 * F-088 — Modelo de estados: paridad enum↔tipo, migración aditiva, set de destinos,
 * timeline lineal + honestidad no-lineal, labels.
 *
 * Ejercita el code-path REAL (§6.1): la MISMA seam `client-status.ts` que consume la
 * ficha (`clients/[id]/page.tsx`), no una re-implementación.
 * `Ref: R-01, R-02, R-03, R-04, R-07, R-12, R-13, R-14`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLIENT_STATUS_VALUES,
  STATUS_LABELS,
  STATUS_STEPS,
  isLinearStatus,
  statusStepIndex,
  statusLabel
} from '../../src/lib/clients/client-status.ts';

// Snapshot esperado del enum Postgres `client_status` alineado (post-DDL F-088):
// los 7 previos + `delivered` + `maintenance` (DT-01). `paused` estaba en el enum DB
// pero faltaba en el tipo TS (drift R-03) → aquí presente.
const EXPECTED_SET = [
  'active',
  'churned',
  'delivered',
  'diagnosed',
  'lead',
  'maintenance',
  'negotiating',
  'onboarding',
  'paused'
];

// ===================================================================
// T-10 — paridad enum↔tipo (R-01, R-03)
// ===================================================================
test('T-10 CLIENT_STATUS_VALUES = set exacto del enum client_status (paridad R-01)', () => {
  assert.deepEqual([...CLIENT_STATUS_VALUES].sort(), EXPECTED_SET);
});

test('T-10 paused/delivered/maintenance presentes en el set (R-01/R-03)', () => {
  for (const v of ['paused', 'delivered', 'maintenance'] as const) {
    assert.ok(
      (CLIENT_STATUS_VALUES as readonly string[]).includes(v),
      `${v} debe estar en CLIENT_STATUS_VALUES`
    );
  }
});

test('T-10 el tipo TS ClientStatus no diverge (chequeo de exhaustividad compile-time)', () => {
  // El seam declara `type _EveryStatusIsListed = ClientStatus extends
  // (typeof CLIENT_STATUS_VALUES)[number] ? true : never` + `const _exhaustive`:
  // si el tipo tuviera un valor fuera de la lista, `tsc` falla. Que este módulo compile
  // y corra es la evidencia de la paridad tipo→lista. Aquí atestamos la guarda existe.
  const seamSrc = readFileSync(
    fileURLToPath(
      new URL('../../src/lib/clients/client-status.ts', import.meta.url)
    ),
    'utf8'
  );
  assert.match(seamSrc, /ClientStatus extends[\s\S]*CLIENT_STATUS_VALUES/);
  assert.match(seamSrc, /const _exhaustive/);
});

// ===================================================================
// T-11 — migración aditiva (R-02, R-04)
// ===================================================================
test('T-11 la migración solo agrega valores (ADD VALUE), sin DROP/RENAME (R-02/R-04)', () => {
  const sql = readFileSync(
    fileURLToPath(
      new URL(
        '../../supabase/migrations/20260723_f088_client_lifecycle_states.sql',
        import.meta.url
      )
    ),
    'utf8'
  );
  // Statements ejecutables (sin comentarios `--`).
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  // Aditivo: agrega delivered + maintenance.
  assert.match(statements, /ADD VALUE IF NOT EXISTS 'delivered'/);
  assert.match(statements, /ADD VALUE IF NOT EXISTS 'maintenance'/);
  // NO destructivo: ningún DROP/RENAME/remoción de valor.
  assert.doesNotMatch(statements, /DROP\s+TYPE/i);
  assert.doesNotMatch(statements, /RENAME/i);
  assert.doesNotMatch(statements, /DROP\s+VALUE/i);
  assert.doesNotMatch(statements, /DELETE/i);
  // Único verbo de ALTER TYPE presente = ADD VALUE (aditivo).
  const alters = statements.match(/ALTER TYPE[^;]*/gi) ?? [];
  assert.equal(alters.length, 2, 'exactamente 2 ALTER TYPE ADD VALUE');
  for (const a of alters) assert.match(a, /ADD VALUE/i);
});

// ===================================================================
// T-14 — destinos seleccionables = set completo (R-07)
// ===================================================================
test('T-14 el set de destinos incluye negotiating, delivered, maintenance, paused (R-07)', () => {
  for (const v of [
    'negotiating',
    'delivered',
    'maintenance',
    'paused'
  ] as const) {
    assert.ok((CLIENT_STATUS_VALUES as readonly string[]).includes(v));
  }
  // Cubre TODOS los valores válidos (any-to-any manual).
  assert.equal(CLIENT_STATUS_VALUES.length, 9);
});

// ===================================================================
// T-19 — timeline lineal incluye post-venta en orden (R-12)
// ===================================================================
test('T-19 STATUS_STEPS incluye post-venta en orden DT-01 (...onboarding→active→delivered→maintenance)', () => {
  assert.deepEqual(
    [...STATUS_STEPS],
    [
      'lead',
      'diagnosed',
      'negotiating',
      'onboarding',
      'active',
      'delivered',
      'maintenance'
    ]
  );
  // Orden relativo clave.
  assert.ok(statusStepIndex('active') < statusStepIndex('delivered'));
  assert.ok(statusStepIndex('delivered') < statusStepIndex('maintenance'));
});

test('T-19 currentStatusIndex ubica correctamente delivered/maintenance', () => {
  assert.equal(statusStepIndex('delivered'), 5);
  assert.equal(statusStepIndex('maintenance'), 6);
  assert.ok(isLinearStatus('delivered'));
  assert.ok(isLinearStatus('maintenance'));
});

// ===================================================================
// T-20 — honestidad de la timeline no-lineal (R-13)
// ===================================================================
test('T-20 churned/paused son NO-lineales: statusStepIndex=-1 e isLinearStatus=false (R-13)', () => {
  for (const v of ['churned', 'paused'] as const) {
    assert.equal(statusStepIndex(v), -1, `${v} fuera del carril lineal`);
    assert.equal(isLinearStatus(v), false);
  }
});

test('T-20 un estado desconocido tampoco se ubica como paso 0 (defensa)', () => {
  assert.equal(statusStepIndex('bogus'), -1);
  assert.equal(isLinearStatus('bogus'), false);
});

// ===================================================================
// T-21 — labels legibles para todo el enum (R-14)
// ===================================================================
test('T-21 STATUS_LABELS tiene una etiqueta legible para cada valor del enum (R-14)', () => {
  for (const v of CLIENT_STATUS_VALUES) {
    const label = STATUS_LABELS[v];
    assert.equal(typeof label, 'string');
    assert.ok(label.length > 0, `label vacío para ${v}`);
  }
  // Post-venta + paused explícitos.
  assert.equal(STATUS_LABELS.delivered, 'Entregado');
  assert.equal(STATUS_LABELS.maintenance, 'Mantenimiento');
  assert.equal(STATUS_LABELS.paused, 'Pausado');
});

test('T-21 statusLabel cae al valor crudo si el estado fuese desconocido (degradación honesta)', () => {
  assert.equal(statusLabel('active'), 'Activo');
  assert.equal(statusLabel('weird'), 'weird');
});
