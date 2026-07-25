/**
 * F-104 — T-07 (R-11): no-regresión del read-path por inspección estática.
 *
 * F-104 es un cambio de CONTENIDO de prompt (Scope A). El read-path del runtime NO
 * cambia: `generate-content/route.ts` sigue resolviendo el step `ofv` desde
 * `prompt_versions` por `(step, active [, tenant])`, y el repo NO introduce migración/DDL.
 *
 * Test puro: solo fs-read del código fuente. Sin LLM, sin red, sin DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const ROUTE_PATH = resolve(ROOT, 'src/app/api/generate-content/route.ts');
const ROUTE = readFileSync(ROUTE_PATH, 'utf8');

test('T-07 el read-path sigue resolviendo prompt_versions por step + active (R-11)', () => {
  assert.match(
    ROUTE,
    /\.from\('prompt_versions'\)/,
    'ya no consulta prompt_versions'
  );
  assert.match(
    ROUTE,
    /\.eq\('step', step\)/,
    'ya no filtra la resolución por step'
  );
  assert.match(
    ROUTE,
    /\.eq\('active', true\)/,
    'ya no filtra la resolución por active=true'
  );
  // El step 'ofv' sigue mapeado a la tabla de outputs 'offers' (persistencia intacta).
  assert.match(ROUTE, /ofv: 'offers'/, 'el mapeo de tabla del step ofv cambió');
});

test('T-07 F-104 no introduce migración ni DDL nueva (R-11)', () => {
  const migDir = resolve(ROOT, 'supabase/migrations');
  if (existsSync(migDir)) {
    const migrations = readdirSync(migDir);
    const f104 = migrations.filter((f) => /f[-_]?104/i.test(f));
    assert.deepStrictEqual(
      f104,
      [],
      `F-104 no debe añadir migraciones; encontradas: ${f104.join(', ')}`
    );
  }
});
