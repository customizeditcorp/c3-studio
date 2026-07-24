/**
 * F-091 — desbloqueo real de los generadores manuales de preview.
 *
 * `previews.data` (jsonb) es NOT NULL sin default; los dos writers manuales lo
 * omitían → 400. El diagnóstico además mandaba `metadata: previewMeta` (columna
 * inexistente → 42703). Fix (sin DDL):
 *   - generator: añade `data` snapshot mínimo (kind/source/client_id/generated_at).
 *   - diagnóstico: quita `metadata` top-level y reubica previewMeta a `data.metadata`.
 *   - view público: lee el plan desde `preview.data?.metadata` (antes read muerto).
 *
 * Verificación sobre el código fuente real (patrón wiring §6.1). Se AÍSLA el
 * bloque `.insert({...})` con un extractor de llaves balanceadas para no
 * confundirlo con `.select(...)` ni con el `data.metadata` interno.
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

const viewSrc = readFileSync(
  fileURLToPath(
    new URL(
      '../../src/app/preview/[token]/preview-public-view.tsx',
      import.meta.url
    )
  ),
  'utf8'
);

/**
 * Extrae el objeto literal del `.from('previews').insert({ ... })` usando
 * conteo de llaves balanceadas — robusto ante el objeto anidado `data: {...}`.
 * Devuelve el texto entre las llaves externas del insert (sin las `{}`).
 */
function previewsInsertObject(src: string): string {
  const marker = ".from('previews')";
  const from = src.indexOf(marker);
  assert.ok(from !== -1, "no se encontró .from('previews') en el fuente");
  const insertIdx = src.indexOf('.insert(', from);
  assert.ok(insertIdx !== -1, "no se encontró .insert( tras .from('previews')");
  const open = src.indexOf('{', insertIdx);
  assert.ok(open !== -1, 'no se encontró la llave de apertura del insert');
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error('llaves desbalanceadas en el insert a previews');
}

// Aísla solo el sub-objeto `data: { ... }` (llaves balanceadas) dentro del insert.
function dataSubObject(insertObj: string): string {
  const key = insertObj.indexOf('data:');
  assert.ok(key !== -1, 'el insert no contiene un campo `data:`');
  const open = insertObj.indexOf('{', key);
  assert.ok(open !== -1, 'el campo `data:` no es un objeto literal');
  let depth = 0;
  for (let i = open; i < insertObj.length; i++) {
    const c = insertObj[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return insertObj.slice(open + 1, i);
    }
  }
  throw new Error('llaves desbalanceadas en data: {...}');
}

// --- T-10 (R-01/R-03/R-04/R-05): snapshot mínimo del generator ---

test('generator: el insert a previews incluye un campo `data` (satisface NOT NULL)', () => {
  const obj = previewsInsertObject(generatorSrc);
  assert.match(
    obj,
    /\bdata:\s*\{/,
    'el insert del generator debe incluir data: {...}'
  );
});

test('generator: data contiene kind=previewType, source=manual-generator, client_id y generated_at', () => {
  const data = dataSubObject(previewsInsertObject(generatorSrc));
  assert.match(
    data,
    /\bkind:\s*previewType\b/,
    'kind debe reflejar el previewType'
  );
  assert.match(data, /\bsource:\s*'manual-generator'/);
  assert.match(data, /\bclient_id:\s*selectedClientId\b/);
  assert.match(data, /\bgenerated_at:\s*new Date\(\)\.toISOString\(\)/);
});

// --- T-11 (R-02/R-06): snapshot del diagnóstico + sin metadata top-level ---

test('diagnóstico: el insert a previews incluye `data` y NO la clave `metadata` top-level', () => {
  const obj = previewsInsertObject(diagnosticSrc);
  assert.match(
    obj,
    /\bdata:\s*\{/,
    'el insert del diagnóstico debe incluir data: {...}'
  );
  // La clave `metadata:` NO debe aparecer a nivel raíz del insert; solo dentro de data.
  const data = dataSubObject(obj);
  const objWithoutData = obj.replace(data, '');
  assert.ok(
    !/\bmetadata:/.test(objWithoutData),
    'metadata NO debe ser clave top-level del insert (columna inexistente → 42703)'
  );
});

test('diagnóstico: data contiene kind=combined, source=diagnostic, client_id, generated_at y metadata=previewMeta', () => {
  const data = dataSubObject(previewsInsertObject(diagnosticSrc));
  assert.match(data, /\bkind:\s*'combined'/);
  assert.match(data, /\bsource:\s*'diagnostic'/);
  assert.match(data, /\bclient_id:\s*savedClientId\b/);
  assert.match(data, /\bgenerated_at:\s*new Date\(\)\.toISOString\(\)/);
  assert.match(
    data,
    /\bmetadata:\s*previewMeta\b/,
    'previewMeta debe reubicarse dentro de data.metadata'
  );
});

// --- T-12 (R-07/R-08/R-09): el view lee el plan desde preview.data?.metadata ---

test('view: lee el plan desde preview.data?.metadata y NO desde preview.metadata (read muerto)', () => {
  assert.match(
    viewSrc,
    /preview\.data\?\.metadata\?\.plan_name/,
    'el guard de la tarjeta de plan debe leer preview.data?.metadata?.plan_name'
  );
  // Matchea reads reales (`preview.metadata?` / `preview.metadata.`), no menciones
  // en comentarios (`preview.metadata` seguido de backtick).
  assert.ok(
    !/preview\.metadata[?.]/.test(viewSrc),
    'no debe quedar ningún read a preview.metadata (columna inexistente)'
  );
});

test('view: la tarjeta de plan está guardada por optional chaining (se oculta sin error si no hay metadata)', () => {
  // El bloque "Plan Recomendado" se renderiza condicionalmente al guard →
  // un preview GBP (data sin metadata) lo oculta sin lanzar (R-09).
  assert.match(viewSrc, /\{preview\.data\?\.metadata\?\.plan_name &&/);
});

test('view: el Props type declara data?.metadata (jsonb real), no preview.metadata', () => {
  // El shape del plan vive bajo data.metadata en el tipo (R-08).
  assert.match(viewSrc, /data\?:\s*\{[\s\S]*?metadata\?:/);
});
