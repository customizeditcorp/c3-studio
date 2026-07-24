/**
 * F-090 — fix directo: drift de la clave `preview_type` en los writers de `previews`.
 *
 * La tabla `previews` (Supabase) tiene la columna `type` (enum preview_type:
 * gbp|website|combined), NO una columna `preview_type`. Dos writers manuales
 * insertaban la clave equivocada `preview_type` → PostgREST 42703 → el insert
 * FALLA DURO. Fix = renombrar la clave del row a `type` preservando el valor.
 *
 * Verificación sobre el código fuente real (patrón wiring §6.1): el insert a
 * `previews` debe usar `type:` y NUNCA `preview_type:` como clave del row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const generatorSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/app/(app)/preview/generator/page.tsx', import.meta.url)
  ),
  'utf8'
);

const diagnosticSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/app/(app)/diagnostic/page.tsx', import.meta.url)
  ),
  'utf8'
);

// Aísla el bloque del insert a `previews` para no confundirlo con el payload
// del logActivity (activity_log), que legítimamente usa metadata.preview_type.
function previewsInsertBlock(src: string): string {
  // Aísla SOLO el .insert a previews (el generator también tiene un
  // .from('previews').select('*') de lectura, que no debe confundirse).
  // F-091: los inserts ahora incluyen un objeto anidado `data: {...}` no-null,
  // por lo que el bloque supera la ventana original de 300 chars. La ventana se
  // amplía; el match sigue siendo lazy y corta en el primer `})` (el `}` que cierra
  // `data` va seguido de `,`, no de `)`), así que la isolación sigue siendo exacta.
  const m = src.match(/\.from\('previews'\)\s*\.insert\(\{[\s\S]{0,1200}?\}\)/);
  assert.ok(
    m,
    "no se encontró el .from('previews').insert({...}) en el fuente"
  );
  return m[0];
}

test('generator: el insert a previews usa la clave `type` (no `preview_type`)', () => {
  const block = previewsInsertBlock(generatorSrc);
  assert.match(block, /\btype:\s*previewType\b/);
  assert.ok(
    !/\bpreview_type:/.test(block),
    'el row del insert a previews NO debe usar la clave preview_type (col no existe → 42703)'
  );
});

test('diagnostic: el insert a previews usa la clave `type` (no `preview_type`)', () => {
  const block = previewsInsertBlock(diagnosticSrc);
  assert.match(block, /\btype:\s*'combined'/);
  assert.ok(
    !/\bpreview_type:/.test(block),
    'el row del insert a previews NO debe usar la clave preview_type (col no existe → 42703)'
  );
});

test('generator: el tipo local Preview y el label usan `type` (lectores alineados)', () => {
  // El campo del tipo local ya no expone preview_type.
  assert.ok(
    !/\bpreview_type:\s*string/.test(generatorSrc),
    'el tipo Preview no debe declarar preview_type'
  );
  assert.match(generatorSrc, /preview\.type/);
});
