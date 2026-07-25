/**
 * F-106 — T-07 (R-11): no-regresión del read-path por inspección estática.
 *
 * F-106 es un cambio de CONTENIDO de prompt (Scope A). El read-path del runtime NO
 * cambia: `generate-content/route.ts` sigue resolviendo el step `buyer_persona` desde
 * `prompt_versions` por `(step, active)`, el step `buyer_persona` NO pasa por el guard
 * de no-fabricación F-105 (acotado a `step === 'ofv'`), y el repo NO introduce
 * migración/DDL.
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
  // El step 'buyer_persona' sigue mapeado a la tabla de outputs 'buyer_personas'.
  assert.match(
    ROUTE,
    /buyer_persona: 'buyer_personas'/,
    'el mapeo de tabla del step buyer_persona cambió'
  );
});

test('T-07 el guard de no-fabricación F-105 sigue acotado a ofv; buyer_persona no pasa por él (R-11)', () => {
  // La invocación del guard vive bajo la guarda `step === 'ofv'`.
  assert.match(
    ROUTE,
    /if \(step === 'ofv'\)/,
    'desapareció la guarda step === ofv'
  );
  assert.match(
    ROUTE,
    /checkOfvNonFabrication/,
    'ya no invoca checkOfvNonFabrication (guard F-105)'
  );
  // El guard NO debe estar condicionado al step buyer_persona.
  assert.ok(
    !/checkOfvNonFabrication[\s\S]{0,120}buyer_persona/.test(ROUTE),
    'el guard de no-fabricación quedó acoplado a buyer_persona'
  );
});

test('T-07 F-106 no introduce migración ni DDL nueva (R-11)', () => {
  const migDir = resolve(ROOT, 'supabase/migrations');
  if (existsSync(migDir)) {
    const migrations = readdirSync(migDir);
    const f106 = migrations.filter((f) => /f[-_]?106/i.test(f));
    assert.deepStrictEqual(
      f106,
      [],
      `F-106 no debe añadir migraciones; encontradas: ${f106.join(', ')}`
    );
  }
});
