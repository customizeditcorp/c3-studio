/**
 * F-101 — T-04 (R-01, R-02): fidelidad byte-a-byte del round-trip serialize/parse.
 *
 * Garantía estructural: si el round-trip es exacto, el `export` captura fielmente el
 * estado prod y el primer `apply` es no-op. Ejercita el núcleo puro (sin red).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serializePrompt,
  parsePromptFile
} from '../../scripts/lib/prompt-sync-core.mjs';

/** Row de muestra: system_prompt multilínea + validation_rules jsonb no trivial. */
const SAMPLE_ROW = {
  step: 'ofv',
  system_prompt:
    'Eres OFV Strategist del sistema C3.\n\n' +
    'MISIÓN: producir la Oferta de Valor.\n' +
    '- Regla con "comillas" y símbolos: <>&%$\n' +
    '- Línea final sin newline extra',
  methodology: 'c3_value_method',
  vertical: null,
  validation_rules: {
    required: ['big_promise', 'quick_win'],
    min_len: { big_promise: 20 },
    forbidden: ['inventar cifras'],
    nested: { a: [1, 2, { b: true }], flag: false }
  },
  version: 1,
  tenant: '__primary__'
};

test('T-04 parsePromptFile(serializePrompt(row)) deep-equals row (fidelidad, R-02)', () => {
  const files = serializePrompt(SAMPLE_ROW);
  const back = parsePromptFile(files);
  assert.deepStrictEqual(back, SAMPLE_ROW);
});

test('T-04 serializePrompt(parsePromptFile(files)) reproduce los archivos byte-a-byte (R-02)', () => {
  const files = serializePrompt(SAMPLE_ROW);
  const reserialized = serializePrompt(parsePromptFile(files));
  // Byte-exacto en cada archivo (idempotencia).
  assert.strictEqual(reserialized.systemPromptMd, files.systemPromptMd);
  assert.strictEqual(reserialized.metaJson, files.metaJson);
  assert.deepStrictEqual(reserialized, files);
});

test('T-04 system_prompt va VERBATIM en system_prompt.md (sin trailing-newline añadido)', () => {
  const files = serializePrompt(SAMPLE_ROW);
  assert.strictEqual(files.systemPromptMd, SAMPLE_ROW.system_prompt);
  // No se añadió un "\n" final (footgun de fidelidad).
  assert.ok(!files.systemPromptMd.endsWith('\n'));
});

test('T-04 meta.json es JSON válido, con validation_rules jsonb exacto y trailing "\\n"', () => {
  const files = serializePrompt(SAMPLE_ROW);
  assert.ok(files.metaJson.endsWith('\n'));
  const meta = JSON.parse(files.metaJson);
  assert.deepStrictEqual(meta.validation_rules, SAMPLE_ROW.validation_rules);
});

test('T-04 parsePromptFile recupera los 6 campos requeridos (R-01)', () => {
  const files = serializePrompt(SAMPLE_ROW);
  const row = parsePromptFile(files);
  for (const field of [
    'step',
    'system_prompt',
    'methodology',
    'vertical',
    'validation_rules',
    'version'
  ]) {
    assert.ok(field in row, `falta el campo ${field}`);
  }
});

test('T-04 round-trip preserva methodology/vertical null (nullable)', () => {
  const row = { ...SAMPLE_ROW, methodology: null, vertical: null };
  const back = parsePromptFile(serializePrompt(row));
  assert.strictEqual(back.methodology, null);
  assert.strictEqual(back.vertical, null);
});
