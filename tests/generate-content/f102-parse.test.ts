/**
 * F-102 T-04b — Pure seam de parse (`parseGeneratedContent`).
 *
 * Runner: node:test + node:assert/strict. Cubre R-06 (señal de no-usable), R-08 (fallback),
 * R-12 (parse puro), R-13 (strip belt-and-suspenders), R-15 (fallback byte-idéntico al catch).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGeneratedContent } from '../../src/lib/generate-content/parse.ts';

/* ---- R-12: JSON válido -> ok:true ------------------------------------------------- */

test('R-12 JSON válido con raw_text -> ok:true, content parseado, rawText=raw_text', () => {
  const text = JSON.stringify({ headline: 'Hola', raw_text: '# Markdown' });
  const r = parseGeneratedContent(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.content, { headline: 'Hola', raw_text: '# Markdown' });
  assert.equal(r.rawText, '# Markdown');
});

test('R-12 JSON válido sin raw_text -> rawText === texto original', () => {
  const text = JSON.stringify({ headline: 'Hola' });
  const r = parseGeneratedContent(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.content, { headline: 'Hola' });
  assert.equal(r.rawText, text);
});

/* ---- R-13: strip de backticks belt-and-suspenders --------------------------------- */

test('R-13 JSON envuelto en ```json ... ``` -> parsea OK (strip defensivo)', () => {
  const inner = JSON.stringify({ headline: 'Hola', raw_text: 'X' });
  const text = '```json\n' + inner + '\n```';
  const r = parseGeneratedContent(text);
  assert.equal(r.ok, true);
  assert.equal((r.content as { headline: string }).headline, 'Hola');
  assert.equal(r.rawText, 'X');
});

test('R-13 JSON envuelto en ``` ... ``` (sin lenguaje) -> parsea OK', () => {
  const inner = JSON.stringify({ a: 1 });
  const text = '```\n' + inner + '\n```';
  const r = parseGeneratedContent(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.content, { a: 1 });
});

/* ---- R-06 vacío + R-08 fallback --------------------------------------------------- */

test('R-06 vacío ("") -> ok:false, content {generated_text}, rawText', () => {
  const r = parseGeneratedContent('');
  assert.equal(r.ok, false);
  assert.deepEqual(r.content, { generated_text: '' });
  assert.equal(r.rawText, '');
});

test('R-06 whitespace-only -> ok:false, generated_text = el texto', () => {
  const r = parseGeneratedContent('   ');
  assert.equal(r.ok, false);
  assert.deepEqual(r.content, { generated_text: '   ' });
  assert.equal(r.rawText, '   ');
});

/* ---- R-06 parse-fail + R-08 fallback ---------------------------------------------- */

test('R-06 texto no-JSON -> ok:false, content {generated_text}', () => {
  const text = 'esto no es json en absoluto';
  const r = parseGeneratedContent(text);
  assert.equal(r.ok, false);
  assert.deepEqual(r.content, { generated_text: text });
  assert.equal(r.rawText, text);
});

/* ---- R-15: fallback byte-idéntico al catch actual --------------------------------- */

test('R-15 fallback byte-idéntico: content.generated_text === responseText', () => {
  const text = '<<no parseable>>';
  const r = parseGeneratedContent(text);
  assert.equal((r.content as { generated_text: string }).generated_text, text);
  assert.equal(r.rawText, text);
});

test('R-15 null/undefined-safe -> tratado como vacío, no throw', () => {
  assert.doesNotThrow(() =>
    parseGeneratedContent(undefined as unknown as string)
  );
  const r = parseGeneratedContent(undefined as unknown as string);
  assert.equal(r.ok, false);
  assert.deepEqual(r.content, { generated_text: '' });
});
