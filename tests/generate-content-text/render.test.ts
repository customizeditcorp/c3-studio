/**
 * Fix render UI de la descripción GBP — la UI mostraba JSON crudo en vez del
 * párrafo. Causa: /generate-content setea `raw_text` = el JSON entero cuando el
 * output estructurado (gbp_description) no trae `raw_text`, y el helper genérico
 * retorna `raw_text` primero (early-return) → JSON en el <Textarea>.
 *
 * Estos tests ejercitan los helpers REALES. El campo correcto = content.description.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  textFromGenerateContentResult,
  gbpDescriptionFromResult
} from '../../src/lib/generate-content-text.ts';

// Replica la forma real de la respuesta de /api/generate-content para
// gbp_description: content = objeto estructurado; raw_text = JSON entero
// (route.ts:330 `rawText = parsedContent.raw_text || responseText`).
function gbpDescriptionResult() {
  const content = {
    description:
      'JD Valley Painting offers expert painting services in CA, prioritizing quality craftsmanship.',
    short_description: 'Expert interior and exterior painting across CA.',
    suggested_services: ['Interior painting', 'Exterior painting'],
    suggested_categories: ['Painting']
  };
  return {
    success: true,
    step: 'gbp_description',
    content,
    raw_text: JSON.stringify(content) // <- polución: el JSON entero
  };
}

// ------------------------------------------------------------------
// gbpDescriptionFromResult: lee content.description aunque raw_text sea el JSON

test('gbpDescriptionFromResult devuelve content.description, NO el JSON crudo', () => {
  const out = gbpDescriptionFromResult(gbpDescriptionResult());
  assert.equal(
    out,
    'JD Valley Painting offers expert painting services in CA, prioritizing quality craftsmanship.'
  );
  assert.ok(!out.trim().startsWith('{'), 'no debe empezar con { (JSON crudo)');
});

test('gbpDescriptionFromResult cae a short_description si no hay description', () => {
  const r = gbpDescriptionResult();
  delete (r.content as Record<string, unknown>).description;
  const out = gbpDescriptionFromResult(r);
  assert.equal(out, 'Expert interior and exterior painting across CA.');
});

test('gbpDescriptionFromResult cae al helper genérico (generated_text) si no hay description', () => {
  const out = gbpDescriptionFromResult({
    success: true,
    step: 'gbp_description',
    content: { generated_text: 'texto plano' },
    raw_text: ''
  });
  assert.equal(out, 'texto plano');
});

// ------------------------------------------------------------------
// textFromGenerateContentResult: el branch-objeto lee description antes de
// JSON.stringify (defensa para consumidores que reciben el objeto sin raw_text)

test('textFromGenerateContentResult lee description del objeto antes de JSON.stringify', () => {
  const out = textFromGenerateContentResult({
    success: true,
    step: 'gbp_description',
    content: {
      description: 'Paragraph text.',
      suggested_categories: ['Painting']
    },
    raw_text: '' // sin raw_text de nivel superior → cae al branch-objeto
  } as never);
  assert.equal(out, 'Paragraph text.');
});

test('textFromGenerateContentResult mantiene prioridad de raw_text real (no regresión posts)', () => {
  const out = textFromGenerateContentResult({
    success: true,
    step: 'gbp_posts',
    content: { post_content: 'ignored' },
    raw_text: 'Post real en texto plano.'
  } as never);
  assert.equal(out, 'Post real en texto plano.');
});

// ------------------------------------------------------------------
// Wiring real: el call-site de la descripción usa el helper dedicado (no el genérico)

test('el call-site handleGenerateDescription usa gbpDescriptionFromResult', () => {
  const src = readFileSync(
    fileURLToPath(
      new URL('../../src/app/(app)/gbp/[clientId]/page.tsx', import.meta.url)
    ),
    'utf8'
  );
  // La sección de gbp_description debe invocar el helper dedicado.
  const idx = src.indexOf("step: 'gbp_description'");
  assert.ok(idx > 0, 'existe el bloque gbp_description');
  const near = src.slice(idx, idx + 400);
  assert.ok(
    near.includes('gbpDescriptionFromResult(result)'),
    'la descripción se extrae con gbpDescriptionFromResult'
  );
});

test('el preview público pasa content.description, no el objeto content completo', () => {
  const src = readFileSync(
    fileURLToPath(
      new URL('../../src/app/preview/[token]/page.tsx', import.meta.url)
    ),
    'utf8'
  );
  assert.ok(
    !src.includes('generatedDescription={generatedOutputs?.content || null}'),
    'ya no pasa el objeto content crudo'
  );
  assert.ok(src.includes('c?.description'), 'extrae description del content');
});
