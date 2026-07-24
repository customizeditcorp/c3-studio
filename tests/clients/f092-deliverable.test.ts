/**
 * F-092 — Read-model del entregable (`buildDeliverableSummary`): agrega los 6 campos de
 * R-03, deriva la honestidad de contenido de `content_status` vivo (R-04), refleja los
 * activos faltantes como pendientes sin falso positivo (R-05), y degrada `delivered_at`
 * honestamente (R-09). + Migración aditiva nullable (R-16) + tolerancia de frontera (R-16).
 *
 * Ejercita el code-path REAL (§6.1): la MISMA función pura que consume la pestaña
 * `Entregable` de la ficha, no una re-implementación. `Ref: R-01, R-03, R-04, R-05, R-09, R-16`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildDeliverableSummary,
  CONTENT_APPROVED_LABEL,
  CONTENT_STALE_LABEL,
  type DeliverableInputs
} from '../../src/lib/clients/deliverable.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Inputs de un cliente ENTREGADO por completo (los 6 activos presentes/aprobados/live).
const FULLY_DELIVERED: DeliverableInputs = {
  deliveredAt: '2026-07-23T12:00:00.000Z',
  gbpProfile: {
    gbp_url: 'https://maps.google.com/?cid=123',
    place_id: 'ChIJabc',
    verification_status: 'verified',
    verified_at: '2026-07-20T00:00:00.000Z',
    content_status: 'approved'
  },
  hasApprovedPhotos: true,
  preview: { approved: true, approved_at: '2026-07-19T00:00:00.000Z' },
  gbpAsset: { status: 'live' }
};

// ===================================================================
// T-17 — agrega correctamente los 6 campos de R-03 (R-01, R-03)
// ===================================================================
test('T-17 buildDeliverableSummary agrega los 6 campos desde inputs conocidos (R-01/R-03)', () => {
  const s = buildDeliverableSummary(FULLY_DELIVERED);

  // (i) GBP live link — presente + detail con url y place_id.
  assert.equal(s.gbpLink.present, true);
  assert.match(s.gbpLink.detail ?? '', /maps\.google\.com/);
  assert.match(s.gbpLink.detail ?? '', /ChIJabc/);

  // (ii) Verificación (F-087) — verified → presente, detail = verified_at.
  assert.equal(s.verification.present, true);
  assert.equal(s.verification.detail, '2026-07-20T00:00:00.000Z');

  // (iii) Contenido (F-089).
  assert.equal(s.content.present, true);
  assert.equal(s.contentApproved, true);

  // (iv) Fotos aprobadas.
  assert.equal(s.photos.present, true);

  // (v) Preview aprobado + approved_at.
  assert.equal(s.preview.present, true);
  assert.equal(s.preview.detail, '2026-07-19T00:00:00.000Z');

  // (vi) Canal GBP (client_assets) — live → presente.
  assert.equal(s.gbpChannel.present, true);
  assert.equal(s.gbpChannel.detail, 'live');

  // delivered_at pasado a través.
  assert.equal(s.deliveredAt, '2026-07-23T12:00:00.000Z');
});

test('T-17 el read-model es READ-ONLY/puro: no muta los inputs (D1)', () => {
  const inputs = structuredClone(FULLY_DELIVERED);
  const snapshot = structuredClone(inputs);
  buildDeliverableSummary(inputs);
  assert.deepEqual(inputs, snapshot, 'no debe mutar los inputs');
});

test('T-17 canal GBP `approved` también cuenta como entregado (R-03 vi)', () => {
  const s = buildDeliverableSummary({
    ...FULLY_DELIVERED,
    gbpAsset: { status: 'approved' }
  });
  assert.equal(s.gbpChannel.present, true);
});

// ===================================================================
// T-18 — honestidad de contenido: approved vs draft (R-04)
// ===================================================================
test('T-18 content_status=approved → flag "aprobado" (R-04)', () => {
  const s = buildDeliverableSummary(FULLY_DELIVERED);
  assert.equal(s.contentApproved, true);
  assert.equal(s.content.present, true);
  assert.equal(s.content.label, CONTENT_APPROVED_LABEL);
});

test('T-18 content_status=draft (re-draft F-089) → flag "editado desde la aprobación / requiere re-aprobación" (R-04)', () => {
  const s = buildDeliverableSummary({
    ...FULLY_DELIVERED,
    gbpProfile: { ...FULLY_DELIVERED.gbpProfile!, content_status: 'draft' }
  });
  assert.equal(s.contentApproved, false);
  assert.equal(s.content.present, false);
  assert.equal(s.content.label, CONTENT_STALE_LABEL);
  assert.match(s.content.label, /requiere re-aprobación/i);
});

test('T-18 cualquier estado no-approved (in_review) también se marca stale (R-04)', () => {
  const s = buildDeliverableSummary({
    ...FULLY_DELIVERED,
    gbpProfile: { ...FULLY_DELIVERED.gbpProfile!, content_status: 'in_review' }
  });
  assert.equal(s.contentApproved, false);
  assert.equal(s.content.label, CONTENT_STALE_LABEL);
});

// ===================================================================
// T-19 — honestidad de agregación: activos faltantes = pendiente, sin falso positivo (R-05)
// ===================================================================
test('T-19 activos faltantes/no-aprobados se reflejan como pendiente, sin falso positivo de "entregado" (R-05)', () => {
  const s = buildDeliverableSummary({
    deliveredAt: null,
    gbpProfile: {
      gbp_url: null,
      place_id: null,
      verification_status: 'pending',
      verified_at: null,
      content_status: 'draft'
    },
    hasApprovedPhotos: false,
    preview: { approved: false, approved_at: null },
    gbpAsset: { status: 'pending' }
  });
  // Ningún campo debe reportar `present: true`.
  assert.equal(s.gbpLink.present, false);
  assert.equal(s.verification.present, false);
  assert.equal(s.content.present, false);
  assert.equal(s.photos.present, false);
  assert.equal(s.preview.present, false);
  assert.equal(s.gbpChannel.present, false);
});

test('T-19 filas ausentes (gbpProfile/preview/gbpAsset = null) no rompen y quedan pendientes (R-05)', () => {
  const s = buildDeliverableSummary({
    deliveredAt: null,
    gbpProfile: null,
    hasApprovedPhotos: false,
    preview: null,
    gbpAsset: null
  });
  assert.equal(s.gbpLink.present, false);
  assert.equal(s.verification.present, false);
  assert.equal(s.content.present, false);
  assert.equal(s.photos.present, false);
  assert.equal(s.preview.present, false);
  assert.equal(s.gbpChannel.present, false);
  // No throw + delivered_at degradado.
  assert.equal(s.deliveredAt, null);
});

test('T-19 gbp_url vacío/espacios NO cuenta como entregado (sin falso positivo, R-05)', () => {
  const s = buildDeliverableSummary({
    ...FULLY_DELIVERED,
    gbpProfile: { ...FULLY_DELIVERED.gbpProfile!, gbp_url: '   ' }
  });
  assert.equal(s.gbpLink.present, false);
});

// ===================================================================
// T-20 — degradación honesta de delivered_at (R-09)
// ===================================================================
test('T-20 delivered_at NULL → deliveredAt=null (display "aún no entregado", R-09)', () => {
  const s = buildDeliverableSummary({ ...FULLY_DELIVERED, deliveredAt: null });
  assert.equal(s.deliveredAt, null);
});

test('T-20 delivered_at presente → se propaga la fecha (R-09)', () => {
  const s = buildDeliverableSummary({
    ...FULLY_DELIVERED,
    deliveredAt: '2026-07-23T12:00:00.000Z'
  });
  assert.equal(s.deliveredAt, '2026-07-23T12:00:00.000Z');
});

// ===================================================================
// T-13 — migración: aditiva, nullable, sin NOT NULL/DEFAULT/DROP/RENAME (R-16)
// ===================================================================
test('T-13 la migración solo agrega delivered_at timestamptz (aditivo, nullable) (R-16)', () => {
  const sql = read(
    '../../supabase/migrations/20260723_f092_clients_delivered_at.sql'
  );
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  // Aditivo: ADD COLUMN delivered_at timestamptz.
  assert.match(
    statements,
    /ADD COLUMN IF NOT EXISTS\s+delivered_at\s+timestamptz/i
  );
  // Nullable: sin NOT NULL, sin DEFAULT, sin backfill (UPDATE), sin destructivo.
  assert.doesNotMatch(statements, /NOT NULL/i);
  assert.doesNotMatch(statements, /DEFAULT/i);
  assert.doesNotMatch(statements, /UPDATE/i);
  assert.doesNotMatch(statements, /DROP/i);
  assert.doesNotMatch(statements, /RENAME/i);
  assert.doesNotMatch(statements, /GENERATED/i);
  // Único ALTER TABLE = el ADD COLUMN.
  const alters = statements.match(/ALTER TABLE[^;]*/gi) ?? [];
  assert.equal(alters.length, 1);
  assert.match(alters[0], /ADD COLUMN/i);
});

// ===================================================================
// T-26 — tolerancia de frontera: código offline no asume el apply del DDL (R-16)
// ===================================================================
test("T-26 la ficha lee delivered_at vía select('*') (tolera columna ausente hasta el apply) (R-16)", () => {
  const ficha = read('../../src/app/(app)/clients/[id]/page.tsx');
  // El cliente se carga con select('*') (no rompe si la columna aún no existe).
  assert.match(ficha, /\.from\('clients'\)[\s\S]*?\.select\('\*'\)/);
  // La escritura de delivered_at está scopeada al seam (transición a delivered), no aquí.
  assert.match(ficha, /currentDeliveredAt: client\.delivered_at/);
});

test('T-26 la escritura de delivered_at está scopeada SOLO a la transición a delivered (R-16)', () => {
  const seam = read('../../src/lib/clients/client-status.ts');
  // La única asignación de delivered_at está guardada por target==='delivered' && !current.
  assert.match(
    seam,
    /target === 'delivered' && !deps\.currentDeliveredAt[\s\S]*?values\.delivered_at = now/
  );
});

test('T-26 la migración documenta la frontera F-074 (apply gateado, apply antes del deploy) (R-16)', () => {
  const sql = read(
    '../../supabase/migrations/20260723_f092_clients_delivered_at.sql'
  );
  assert.match(sql, /F-074/);
  assert.match(sql, /NO aplicada/i);
  assert.match(sql, /PRECEDE al deploy/i);
});
