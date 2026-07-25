/**
 * F-102 T-04a — Pure seam de temperature (`resolveContentTemperature`).
 *
 * Runner: node:test + node:assert/strict. Cubre R-01/R-02/R-03: fallback robusto que
 * nunca throwea + override de env válido honrado + default finito bajo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONTENT_TEMPERATURE,
  resolveContentTemperature
} from '../../src/lib/generate-content/generation-params.ts';

/* ---- R-02: fallback robusto, nunca throwea --------------------------------------- */

test('R-02 undefined -> default, no throw', () => {
  assert.equal(
    resolveContentTemperature(undefined),
    DEFAULT_CONTENT_TEMPERATURE
  );
});

test('R-02 empty string -> default (not 0)', () => {
  // `Number('')===0` es finito, pero una env vacía es "unset" → cae al default.
  assert.equal(resolveContentTemperature(''), DEFAULT_CONTENT_TEMPERATURE);
});

test('R-02 whitespace-only -> default', () => {
  assert.equal(resolveContentTemperature('   '), DEFAULT_CONTENT_TEMPERATURE);
});

test('R-02 non-numeric -> default, no throw', () => {
  assert.doesNotThrow(() => resolveContentTemperature('abc'));
  assert.equal(resolveContentTemperature('abc'), DEFAULT_CONTENT_TEMPERATURE);
});

/* ---- R-03: override de env válido honrado ----------------------------------------- */

test('R-03 "0.7" -> 0.7 (override honrado)', () => {
  assert.equal(resolveContentTemperature('0.7'), 0.7);
});

test('R-03 "0" -> 0 (cero explícito es finito y válido)', () => {
  assert.equal(resolveContentTemperature('0'), 0);
});

/* ---- R-01: default finito bajo ---------------------------------------------------- */

test('R-01 DEFAULT_CONTENT_TEMPERATURE es un número finito bajo (< 1.0)', () => {
  assert.equal(typeof DEFAULT_CONTENT_TEMPERATURE, 'number');
  assert.ok(Number.isFinite(DEFAULT_CONTENT_TEMPERATURE));
  assert.ok(DEFAULT_CONTENT_TEMPERATURE < 1.0);
  assert.ok(DEFAULT_CONTENT_TEMPERATURE >= 0);
});
