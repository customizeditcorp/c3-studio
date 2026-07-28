/**
 * F-102 T-04d — Constraints estructurales por inspección de fuente de `route.ts`
 * (patrón `f095-constraints.test.ts`). Cubre R-01/R-04/R-05/R-07/R-10/R-11/R-14/R-15/R-16.
 *
 * Estos asserts confirman que el fix se quedó DENTRO de scope: call endurecido,
 * retry-once (no loop), warning condicional, no-regresión de las seams F-064/065/081/089/097,
 * y ausencia de DDL / toques al read-path o al validador anti-AI español (F-103).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const ROUTE = readFileSync(
  resolve(REPO, 'src/app/api/generate-content/route.ts'),
  'utf8'
);

/* ---- R-01/R-04: el call endurecido incluye temperature + response_format ---------- */

test('R-01 el call pasa temperature vía resolveContentTemperature(', () => {
  assert.match(ROUTE, /temperature:\s*resolveContentTemperature\(/);
  assert.match(ROUTE, /process\.env\.OPENAI_CONTENT_TEMPERATURE/);
});

test('R-04 el call setea response_format json_object', () => {
  assert.match(ROUTE, /response_format:\s*\{\s*type:\s*'json_object'/);
});

/* ---- R-05: el user message conserva el keyword json/JSON (requisito API) ----------- */

test('R-05 el user message conserva el keyword JSON', () => {
  assert.match(ROUTE, /Responde SOLO con JSON valido/);
});

/* ---- R-07: retry-once por motivo — cota EXACTA de create(), sin loop/backoff ------- */

test('R-07 create() acotado (retry-once por motivo, no loop)', () => {
  const matches = ROUTE.match(/openai\.chat\.completions\.create\(/g) ?? [];
  // F-102 aporta 2 (call inicial + retry estructural); F-105 (R-05) añade UN tercer
  // call-site: el retry-once dirigido de no-fabricación de prueba social en el branch `ofv`.
  // ⤫ F-118 (R-22/R-26, CL-101) — la cota SUBE de 3 a 4: el guard determinista de
  // fabricación en copy publicable añade su propio retry-once dirigido, acotado a los 8
  // steps de contenido. Es el MISMO movimiento con que F-105 subió esta cota de 2 a 3, y
  // se hace por la misma razón: la cota está para subirse conscientemente cuando aparece
  // un motivo de retry nuevo y legítimo, NO para sortearse con un alias que engañe al
  // grep. La INTENCIÓN del assert queda intacta — sigue siendo una cota EXACTA (no un
  // `>=`), de modo que un call-site no declarado la pone roja igual que antes.
  // Nota: la cota por REQUEST sigue siendo 3 (1 base + 1 F-102 + 1 de no-fabricación);
  // los branches `ofv` (F-105) y de contenido (F-118) son mutuamente excluyentes por
  // `step` y nunca se suman.
  // ⤫ **F-121 (R-20/DT-07) — la cota SUBE de 4 a 5.** RE-ANCLAJE DECLARADO DE UN SOLO
  // `assert`, por el MISMO movimiento con que F-105 la subió de 2 a 3 y F-118 de 3 a 4, y
  // por la misma razón: **la cota está para subirse conscientemente cuando aparece un
  // motivo de retry nuevo y legítimo, NO para sortearse con un alias que engañe al grep.**
  // El call-site nuevo es el retry-once dirigido del guard de ENSAMBLADO del Brief
  // (token-códigos usados como lenguaje + marcador incrustado en prosa), acotado al step
  // `brief` (DT-08).
  //
  // **La INTENCIÓN del assert queda intacta:** sigue siendo una cota EXACTA (no un `>=`),
  // de modo que un call-site no declarado la pone roja igual que antes.
  //
  // Nota: la cota por REQUEST sigue siendo **3** (1 base + 1 F-102 + 1 de guard). Los
  // branches `ofv` (F-105), los 8 steps de contenido (F-118) y `brief` (F-121) son
  // mutuamente excluyentes por `step` y nunca se suman.
  // Los cuatro retries son single-shot y ortogonales (motivos distintos), nunca un loop.
  assert.equal(
    matches.length,
    5,
    'esperaba 5 create() (call + retry estructural F-102 + retry no-fabricación F-105 + retry fabricación F-118 + retry ensamblado F-121)'
  );
  // No hay bucle/backoff en torno a ningún retry.
  assert.doesNotMatch(ROUTE, /for\s*\([^)]*retr/i);
  assert.doesNotMatch(ROUTE, /while\s*\([^)]*retr/i);
  assert.doesNotMatch(ROUTE, /setTimeout|backoff/i);
});

test('R-07 el retry reusa callParams (params idénticos)', () => {
  const matches =
    ROUTE.match(/openai\.chat\.completions\.create\(callParams\)/g) ?? [];
  assert.equal(
    matches.length,
    2,
    'ambos create() deben reusar el mismo callParams'
  );
});

/* ---- R-10/R-11: generation_warning condicional (spread opcional) ------------------- */

test('R-10/R-11 generation_warning se añade de forma condicional (spread opcional)', () => {
  assert.match(
    ROUTE,
    /\.\.\.\(generationWarning\s*\?\s*\{\s*generation_warning(:\s*generationWarning)?\s*\}\s*:\s*\{\}\)/
  );
});

test('R-10 la reason cubre empty_response y unparseable_json', () => {
  assert.match(ROUTE, /empty_response/);
  assert.match(ROUTE, /unparseable_json/);
});

/* ---- R-15: no-regresión — las seams del pipeline siguen invocadas ------------------ */

test('R-15 route.ts sigue invocando las seams F-065/F-064/F-081/F-097/F-089', () => {
  assert.match(ROUTE, /attachMethodGrounding\(/); // F-065
  assert.match(ROUTE, /attachValidation\(/); // F-064
  assert.match(ROUTE, /buildLanguageDirective\(/); // F-081
  assert.match(ROUTE, /resolveWriteMode\(/); // F-097
  assert.match(ROUTE, /shouldPersistGeneratedOutput\(/); // F-089
});

test('R-15 la validación OFV persona_id sigue presente', () => {
  assert.match(ROUTE, /OFV requiere una buyer persona/);
});

/* ---- R-14: sin DDL de F-102 bajo supabase/migrations ------------------------------ */

test('R-14 no hay migración F-102 bajo supabase/migrations', () => {
  const migDir = resolve(REPO, 'supabase/migrations');
  if (!existsSync(migDir)) return; // sin dir → trivialmente satisfecho
  const offenders = readdirSync(migDir).filter((f) => /f-?102/i.test(f));
  assert.deepEqual(offenders, [], 'migración F-102 inesperada: ' + offenders);
});

test('R-14 el warning NO se persiste (generation_warning solo en la respuesta HTTP)', () => {
  // El warning no aparece dentro de ningún .insert/.update/.upsert.
  assert.doesNotMatch(
    ROUTE,
    /generation_warning:[^}]*\n[^}]*\.(insert|update|upsert)/
  );
});

/* ---- R-16: límites de scope — no se toca el validador anti-AI ES ni los prompts ---- */

test('R-16 F-102 no modifica ANTI_AI_RULES (eso es F-103)', () => {
  // Se puede seguir importando/usando el validador existente (F-064), pero NO redefinirlo.
  assert.doesNotMatch(ROUTE, /ANTI_AI_RULES\s*=/);
  assert.doesNotMatch(ROUTE, /const\s+ANTI_AI_RULES/);
});
