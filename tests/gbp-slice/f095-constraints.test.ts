/**
 * F-095 — Structural "Unwanted" constraints (R-09/R-10/R-12).
 *
 * These assert the fix stayed within scope: prompt semantics untouched (R-09), no DDL
 * and read-only access to `briefs` (R-10), and client_id-scoped brief load (R-12).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildGbpSystemPrompt } from '../../src/lib/gbp-slice/prompt.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const ROUTE = readFileSync(
  resolve(REPO, 'src/app/api/generate-gbp/route.ts'),
  'utf8'
);

/** The single `briefs` query statement (from `.from('briefs')` to its terminating
 * `.maybeSingle();`), isolated so write-method assertions don't leak into unrelated
 * later statements (e.g. the activity_log `.insert`). */
function briefsStatement(src: string): string {
  const start = src.indexOf(".from('briefs')");
  assert.ok(start >= 0, "route must query .from('briefs')");
  const end = src.indexOf('.maybeSingle();', start);
  assert.ok(end >= 0, 'briefs query must terminate with .maybeSingle();');
  return src.slice(start, end + '.maybeSingle();'.length);
}

/* ---- R-09: the prompt (BUILTIN_SYSTEM_PROMPT / buildGbpSystemPrompt) is untouched --- */

test('R-09 built-in system prompt keeps its consume-not-redecide semantics', () => {
  const sys = buildGbpSystemPrompt();
  assert.match(sys, /GBP Profile Specialist/);
  assert.match(sys, /CONSUMES la estrategia/);
  assert.match(sys, /NO la re-decides/);
  assert.match(
    sys,
    /No inventes datos de contacto, licencias, reseñas ni cifras/
  );
});

test('R-09 a provided base prompt still wins over the built-in (no behavior change)', () => {
  assert.equal(buildGbpSystemPrompt('BASE'), 'BASE');
  assert.match(buildGbpSystemPrompt(''), /GBP Profile Specialist/);
});

/* ---- R-10: no DDL for F-095 + `briefs` is read-only in the route ------------------- */

test('R-10 no F-095 migration/DDL under supabase/migrations', () => {
  const migDir = resolve(REPO, 'supabase/migrations');
  if (!existsSync(migDir)) return; // no migrations dir at all -> trivially satisfied
  const offenders = readdirSync(migDir).filter((f) => /f-?095/i.test(f));
  assert.deepEqual(offenders, [], 'unexpected F-095 migration: ' + offenders);
});

test('R-10 the route only .select on briefs — never insert/update/upsert', () => {
  const stmt = briefsStatement(ROUTE);
  assert.match(stmt, /\.select\(/);
  assert.doesNotMatch(stmt, /\.insert\(/);
  assert.doesNotMatch(stmt, /\.update\(/);
  assert.doesNotMatch(stmt, /\.upsert\(/);
});

/* ---- R-12: brief load is scoped to client_id (tenant isolation) -------------------- */

test('R-12 brief load is scoped by client_id and status=approved', () => {
  const stmt = briefsStatement(ROUTE);
  assert.match(stmt, /\.eq\('client_id', client_id\)/);
  assert.match(stmt, /\.eq\('status', 'approved'\)/);
  assert.match(stmt, /\.order\('created_at', \{ ascending: false \}\)/);
  assert.match(stmt, /\.limit\(1\)/);
});
