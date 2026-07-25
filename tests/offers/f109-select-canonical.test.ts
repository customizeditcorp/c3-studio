/**
 * F-109 — T-11 — Selector puro `pickCanonicalOffer` (tie-break, R-10/R-11/R-16).
 *
 * Unit tests framework-free (`node --test`) del seam puro. Verifica el criterio
 * DT-03 (version desc → contenido-no-vacío → updated_at desc → id asc), el caso
 * canónico del tie de JD Valley (la OFV real gana a la vacía-shadow) y el
 * determinismo. El selector NO borra ni muta filas (R-16).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickCanonicalOffer,
  type CanonicalOfferRow
} from '../../src/lib/offers/select-canonical.ts';

/* ================================================================== */
/*  R-10/R-11 — tie de JD Valley: la real gana a la vacía-shadow      */
/* ================================================================== */

test('T-11 tie JD Valley (real a6c66d5c vs vacía b106ad61, ambas approved v1) → gana la real (R-11)', () => {
  const empty: CanonicalOfferRow = {
    id: 'b106ad61',
    version: 1,
    content: {},
    updated_at: '2026-07-20T10:00:00.000Z' // la vacía se editó DESPUÉS
  };
  const real: CanonicalOfferRow = {
    id: 'a6c66d5c',
    version: 1,
    content: { big_promise: 'Más clientes locales en 60 días' },
    big_promise: 'Más clientes locales en 60 días',
    updated_at: '2026-07-18T10:00:00.000Z'
  };
  // Aunque la vacía tenga updated_at más reciente, contenido-no-vacío gana ANTES
  // que updated_at (DT-03): la vacía es el bug.
  assert.equal(pickCanonicalOffer([empty, real])?.id, 'a6c66d5c');
  assert.equal(pickCanonicalOffer([real, empty])?.id, 'a6c66d5c'); // orden de entrada irrelevante
});

test('T-11 contenido real via content.big_promise (columna plana vacía) también gana', () => {
  const empty: CanonicalOfferRow = { id: 'z', version: 1, content: null };
  const realNested: CanonicalOfferRow = {
    id: 'a',
    version: 1,
    content: { big_promise: 'promesa real' }
  };
  assert.equal(pickCanonicalOffer([empty, realNested])?.id, 'a');
});

/* ================================================================== */
/*  R-10 — orden de criterios DT-03                                   */
/* ================================================================== */

test('T-11 version desc es criterio primario (mayor versión gana aunque sea vacía)', () => {
  const v2empty: CanonicalOfferRow = { id: 'x', version: 2, content: {} };
  const v1real: CanonicalOfferRow = {
    id: 'y',
    version: 1,
    content: { big_promise: 'real' }
  };
  assert.equal(pickCanonicalOffer([v1real, v2empty])?.id, 'x');
});

test('T-11 desempate por updated_at desc cuando version y realness empatan', () => {
  const older: CanonicalOfferRow = {
    id: 'a',
    version: 1,
    content: { big_promise: 'r1' },
    updated_at: '2026-07-01T00:00:00.000Z'
  };
  const newer: CanonicalOfferRow = {
    id: 'b',
    version: 1,
    content: { big_promise: 'r2' },
    updated_at: '2026-07-10T00:00:00.000Z'
  };
  assert.equal(pickCanonicalOffer([older, newer])?.id, 'b');
});

test('T-11 desempate final por id asc (determinismo total)', () => {
  const rowB: CanonicalOfferRow = {
    id: 'bbb',
    version: 1,
    content: { big_promise: 'r' },
    updated_at: '2026-07-01T00:00:00.000Z'
  };
  const rowA: CanonicalOfferRow = {
    id: 'aaa',
    version: 1,
    content: { big_promise: 'r' },
    updated_at: '2026-07-01T00:00:00.000Z'
  };
  assert.equal(pickCanonicalOffer([rowB, rowA])?.id, 'aaa');
});

/* ================================================================== */
/*  Determinismo + bordes + no-mutación (R-16)                        */
/* ================================================================== */

test('T-11 [] → null', () => {
  assert.equal(pickCanonicalOffer([]), null);
});

test('T-11 determinismo: mismo input (cualquier orden) → mismo id', () => {
  const rows: CanonicalOfferRow[] = [
    { id: 'c', version: 1, content: {} },
    { id: 'a', version: 2, content: { big_promise: 'x' } },
    { id: 'b', version: 1, content: { big_promise: 'y' } }
  ];
  const first = pickCanonicalOffer(rows)?.id;
  const shuffled = pickCanonicalOffer([rows[2], rows[0], rows[1]])?.id;
  assert.equal(first, 'a');
  assert.equal(first, shuffled);
});

test('T-11 NO muta el array de entrada (R-16: no borra/reordena el original)', () => {
  const rows: CanonicalOfferRow[] = [
    { id: 'empty', version: 1, content: {} },
    { id: 'real', version: 1, content: { big_promise: 'r' } }
  ];
  const snapshot = rows.map((r) => r.id).join(',');
  pickCanonicalOffer(rows);
  assert.equal(rows.map((r) => r.id).join(','), snapshot);
  assert.equal(rows.length, 2); // ambas filas siguen presentes (no borra)
});
