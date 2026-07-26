/**
 * F-110 T-03/T-04 — Source-guards por inspección de fuente de `route.ts`
 * (patrón `f102-constraints.test.ts`: `readFileSync` + `assert.match` whitespace-tolerante,
 * lección F-107). Cubre el cambio (a): `deliverables`/`social_proof` al bloque OFV del
 * `contextChain` de generate-content, con formato consistente con `buildGbpUserMessage`
 * y degradación honesta (omisión on-length). Anti-scope-creep: sin urgency/decision_frame,
 * sin DDL, `normalizeOffer` intacto.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const ROUTE = readFileSync(
  resolve(REPO, 'src/app/api/generate-content/route.ts'),
  'utf8'
);

/* Segmento acotado al bloque OFV del contextChain: desde la etiqueta del bloque
 * hasta el inicio del `userMessageBase` (la sentencia que le sigue). Acotar evita
 * colisionar con otros usos de las palabras clave en el resto del archivo (T-04). */
const iStart = ROUTE.indexOf('## OFERTA DE VALOR (APROBADA)');
const iEnd = ROUTE.indexOf('userMessageBase');
assert.ok(iStart >= 0, 'no se encontró el bloque OFV en route.ts');
assert.ok(iEnd > iStart, 'no se encontró userMessageBase tras el bloque OFV');
const ROUTE_OFV_BLOCK = ROUTE.slice(iStart, iEnd);

/* ---- R-01/R-03: deliverables inyectado, etiqueta + join(' | ') ------------------- */

test('R-01/R-03 el contextChain incluye Entregables con join(" | ")', () => {
  assert.match(ROUTE_OFV_BLOCK, /contextChain\s*\+=\s*['"]\\nEntregables:/);
  assert.match(ROUTE_OFV_BLOCK, /o\.deliverables\.join\(\s*['"] \| ['"]\s*\)/);
});

/* ---- R-02/R-03: social_proof inyectado, etiqueta + join(' | ') ------------------- */

test('R-02/R-03 el contextChain incluye Prueba social con join(" | ")', () => {
  assert.match(ROUTE_OFV_BLOCK, /contextChain\s*\+=\s*['"]\\nPrueba social:/);
  assert.match(ROUTE_OFV_BLOCK, /o\.social_proof\.join\(\s*['"] \| ['"]\s*\)/);
});

/* ---- R-04: ambas líneas guardadas por length (omisión en array vacío) ------------ */

test('R-04 Entregables/Prueba social están guardadas por .length (degradación honesta)', () => {
  assert.match(ROUTE_OFV_BLOCK, /if\s*\(\s*o\.deliverables\.length\s*\)/);
  assert.match(ROUTE_OFV_BLOCK, /if\s*\(\s*o\.social_proof\.length\s*\)/);
});

/* ---- R-06: los campos previos del bloque OFV siguen presentes -------------------- */

test('R-06 el bloque OFV preserva los campos previos (no-regresión)', () => {
  assert.match(ROUTE_OFV_BLOCK, /Big Promise: /);
  assert.match(ROUTE_OFV_BLOCK, /Vehiculo: /);
  assert.match(ROUTE_OFV_BLOCK, /o\.vehicle_description/);
  assert.match(ROUTE_OFV_BLOCK, /Quick Win: /);
  assert.match(ROUTE_OFV_BLOCK, /Garantia: /);
});

/* ---- R-07: normalizeOffer no se reimplementa en route.ts (sigue importado) ------- */

test('R-07 normalizeOffer sigue importado, NO reimplementado en route.ts', () => {
  assert.match(ROUTE, /import[^;]*normalizeOffer[^;]*from/);
  assert.doesNotMatch(ROUTE, /function\s+normalizeOffer\s*\(/);
  assert.doesNotMatch(ROUTE, /const\s+normalizeOffer\s*=/);
});

/* ---- R-08: sin urgency/decision_frame en el bloque OFV (reservado F-B/GATE-1) ---- */

test('R-08 el bloque OFV NO introduce urgency ni decision_frame', () => {
  assert.doesNotMatch(ROUTE_OFV_BLOCK, /urgency|decision_frame/i);
});

/* ---- R-11: sin DDL en route.ts -------------------------------------------------- */

test('R-11 route.ts no introduce DDL', () => {
  assert.doesNotMatch(ROUTE, /alter table|create table|create index/i);
});
