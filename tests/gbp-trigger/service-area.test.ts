/**
 * F-068 — CL-036 — T-04 (parseServiceArea, R-07/R-08/R-10)
 *          + T-05 (serializeServiceArea + round-trip, R-09/R-10).
 *
 * Proves the jsonb `service_area` {notes, cities} renders as legible sub-fields
 * (never `[object Object]`), tolerates legacy/unknown shapes without throwing,
 * and round-trips safely back to `{notes, cities:string[]}` (no flat string[],
 * no blind String()/JSON.stringify).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseServiceArea,
  serializeServiceArea
} from '../../src/lib/gbp-trigger-state.ts';

// --- R-07: canonical object {notes, cities} -> legible sub-fields -------------

test('R-07 object {notes, cities} -> notes string + cities joined', () => {
  const sa = parseServiceArea({
    notes: 'Costa Central, CA',
    cities: ['Santa Maria', 'Santa Barbara', 'San Luis Obispo']
  });
  assert.equal(sa.notes, 'Costa Central, CA');
  assert.equal(sa.cities, 'Santa Maria, Santa Barbara, San Luis Obispo');
  // Never the stringified-object failure mode.
  assert.doesNotMatch(sa.notes, /\[object Object\]/);
  assert.doesNotMatch(sa.cities, /\[object Object\]/);
});

test('R-07 object with notes only -> cities empty, no throw', () => {
  const sa = parseServiceArea({ notes: 'Solo nota' });
  assert.equal(sa.notes, 'Solo nota');
  assert.equal(sa.cities, '');
});

test('R-07 object with cities only -> notes empty', () => {
  const sa = parseServiceArea({ cities: ['A', 'B'] });
  assert.equal(sa.notes, '');
  assert.equal(sa.cities, 'A, B');
});

// --- R-08: legacy shapes (array / string) ------------------------------------

test('R-08 array legacy string[] -> cities joined, notes empty', () => {
  const sa = parseServiceArea(['A', 'B']);
  assert.equal(sa.notes, '');
  assert.equal(sa.cities, 'A, B');
});

test('R-08 string legacy -> treated as cities', () => {
  const sa = parseServiceArea('Santa Maria, Lompoc');
  assert.equal(sa.notes, '');
  assert.equal(sa.cities, 'Santa Maria, Lompoc');
});

// --- R-08 / R-10: null / undefined / unknown shapes degrade safely -----------

test('R-08 null/undefined -> both empty', () => {
  assert.deepEqual(parseServiceArea(null), { notes: '', cities: '' });
  assert.deepEqual(parseServiceArea(undefined), { notes: '', cities: '' });
});

test('R-10 unknown shapes (number/object without fields) -> both empty, no throw', () => {
  assert.deepEqual(parseServiceArea(42), { notes: '', cities: '' });
  assert.deepEqual(parseServiceArea({}), { notes: '', cities: '' });
  assert.deepEqual(parseServiceArea({ foo: 'bar' }), { notes: '', cities: '' });
  assert.deepEqual(parseServiceArea(true), { notes: '', cities: '' });
});

test('R-10 object with non-canonical field types never yields [object Object]', () => {
  const sa = parseServiceArea({ notes: 123, cities: 'no-array' });
  // notes is non-string -> '' ; cities is string -> passthrough.
  assert.equal(sa.notes, '');
  assert.equal(sa.cities, 'no-array');
  assert.doesNotMatch(sa.notes, /\[object Object\]/);
});

// --- R-09: serializeServiceArea -> canonical jsonb {notes, cities:string[]} ---

test('R-09 serialize -> {notes, cities:string[]} (never flat string[])', () => {
  const out = serializeServiceArea(
    'Costa Central, CA',
    'Santa Maria, Santa Barbara'
  );
  assert.deepEqual(out, {
    notes: 'Costa Central, CA',
    cities: ['Santa Maria', 'Santa Barbara']
  });
  // Structured object, not a bare array.
  assert.equal(Array.isArray(out), false);
});

test('R-09 serialize trims and drops empty city tokens', () => {
  const out = serializeServiceArea('  nota  ', ' Santa Maria , , Lompoc ,');
  assert.deepEqual(out, { notes: 'nota', cities: ['Santa Maria', 'Lompoc'] });
});

test('R-10 both sub-fields empty -> null (nullable column, no empty husk)', () => {
  assert.equal(serializeServiceArea('', ''), null);
  assert.equal(serializeServiceArea('   ', '  ,  '), null);
});

test('R-10 notes only -> {notes, cities:[]}', () => {
  assert.deepEqual(serializeServiceArea('solo nota', ''), {
    notes: 'solo nota',
    cities: []
  });
});

// --- R-09/R-10: round-trip stability (parse ∘ serialize) ---------------------

test('R-09 round-trip: parse(serialize(...)) is stable', () => {
  const notes = 'Costa Central, CA';
  const cities = 'Santa Maria, Santa Barbara';
  const serialized = serializeServiceArea(notes, cities);
  assert.ok(serialized);
  const reparsed = parseServiceArea(serialized);
  assert.equal(reparsed.notes, notes);
  assert.equal(reparsed.cities, cities);
});

test('R-09 round-trip: load(jsonb) -> save without editing preserves the object', () => {
  const jsonb = {
    notes: 'Costa Central, CA',
    cities: ['Santa Maria', 'Santa Barbara', 'San Luis Obispo']
  };
  const fields = parseServiceArea(jsonb);
  const back = serializeServiceArea(fields.notes, fields.cities);
  assert.deepEqual(back, jsonb);
});

test('R-10 round-trip: null jsonb -> parse -> serialize stays null', () => {
  const fields = parseServiceArea(null);
  assert.equal(serializeServiceArea(fields.notes, fields.cities), null);
});
