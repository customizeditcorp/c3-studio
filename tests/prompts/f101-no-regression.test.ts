/**
 * F-101 — T-08 (R-10, R-11, R-12): no-regresión del read-path del runtime + sin DDL.
 *
 * F-101 recupera la FUENTE de los prompts sin tocar la generación. Este test verifica por
 * inspección de código que el read-path de `generate-content`/`generate-gbp` y el BUILTIN
 * de `gbp-slice/prompt.ts` NO cambiaron su forma de resolver `prompt_versions`, y que el
 * repo NO introduce una migración de `prompt_versions` (Scope A = sin DDL).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string) => readFileSync(join(REPO_ROOT, rel), 'utf8');

test('T-08 generate-content/route.ts resuelve prompt_versions igual (tenant→global fallback)', () => {
  const src = read('src/app/api/generate-content/route.ts');
  assert.match(src, /\.from\('prompt_versions'\)/);
  assert.match(src, /\.eq\('step', step\)/);
  assert.match(src, /\.eq\('active', true\)/);
  assert.match(src, /\.eq\('tenant_id', clientTenantId\)/); // tenant-scoped primero
  assert.match(src, /\.is\('tenant_id', null\)/); // fallback a global
  assert.match(src, /'id, system_prompt, methodology'/); // mismos campos
});

test('T-08 generate-gbp/route.ts resuelve gbp_description por version desc, mismos campos', () => {
  const src = read('src/app/api/generate-gbp/route.ts');
  assert.match(src, /\.from\('prompt_versions'\)/);
  assert.match(src, /GBP_GROUNDING_STEP/);
  assert.match(src, /\.eq\('active', true\)/);
  assert.match(src, /\.order\('version', \{ ascending: false \}\)/);
  assert.match(src, /'id, system_prompt, methodology'/);
});

test('T-08 gbp-slice/prompt.ts conserva el BUILTIN de fallback intacto', () => {
  const src = read('src/lib/gbp-slice/prompt.ts');
  assert.match(src, /BUILTIN_SYSTEM_PROMPT/);
  assert.match(src, /export function buildGbpSystemPrompt/);
});

test('T-08 el repo NO introduce una migración de prompt_versions (sin DDL, R-12)', () => {
  const migrationsDir = join(REPO_ROOT, 'supabase', 'migrations');
  if (!existsSync(migrationsDir)) return; // sin carpeta ⇒ trivialmente sin DDL
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  const createRe = /create\s+table[^;]*prompt_versions/i;
  const alterRe = /alter\s+table[^;]*prompt_versions/i;
  for (const f of files) {
    const sql = readFileSync(join(migrationsDir, f), 'utf8');
    assert.ok(
      !createRe.test(sql),
      `Migración ${f} define/crea prompt_versions (viola R-12)`
    );
    assert.ok(
      !alterRe.test(sql),
      `Migración ${f} altera prompt_versions (viola R-12)`
    );
  }
});
