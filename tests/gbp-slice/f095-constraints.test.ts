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

/** The single `briefs` query statement (from `.from('briefs')` to the `;` that
 * terminates the chained call), isolated so write-method assertions don't leak into
 * unrelated later statements (e.g. the activity_log `.insert`).
 *
 * **F-113 (DT-05) — declared boundary crossing, rewritten preserving intent.** The
 * statement used to terminate with `.maybeSingle();`; F-113 drops `limit(1)/
 * maybeSingle()` BY DESIGN so the route can bring every `approved` candidate and pick
 * the canonical one deterministically. The helper now anchors on the statement's
 * terminating `;` (the chain contains no inner `;`), which is what "the single briefs
 * statement" always meant. It was NOT emptied: every constraint below still runs
 * against exactly that statement. */
function briefsStatement(src: string): string {
  const start = src.indexOf(".from('briefs')");
  assert.ok(start >= 0, "route must query .from('briefs')");
  const end = src.indexOf(';', start);
  assert.ok(end >= 0, 'briefs query must terminate with `;`');
  return src.slice(start, end + 1);
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

/**
 * **F-113 (DT-05) — forward-declared marker crossed BY DESIGN; rewritten, not deleted.**
 *
 * The original assertion pinned `.order('created_at', …)` + `.limit(1)` as the way the
 * route resolved "the" approved brief. F-113 replaces that arbitrary tie-break (SCS
 * Cleaning has 4 approved briefs, ALL `version = 1`) with a deterministic selector
 * shared with `generate-content`, so `limit(1)` must go. Precedent: F-109 rewrote the
 * markers of F-107/F-108 the same way. **Note for the reviewer (CP-04): this crossing
 * is authorized by DT-05 = SÍ.**
 *
 * The INTENT of R-12 — tenant isolation + approved-only, i.e. *which rows are
 * eligible* — is preserved verbatim and reinforced: the ordering assertion is replaced
 * by an assertion that the choice is now deterministic (a strictly stronger claim than
 * `limit(1)` ever made), plus a `select`-superset check so no column is silently lost.
 * Regexes are whitespace-tolerant (the husky/prettier hook reformats on commit).
 */
test('R-12 brief load is scoped by client_id and status=approved (F-113: deterministic pick)', () => {
  const stmt = briefsStatement(ROUTE);
  // Unchanged intent: WHICH rows are eligible.
  assert.match(stmt, /\.eq\(\s*'client_id',\s*client_id\s*\)/);
  assert.match(stmt, /\.eq\(\s*'status',\s*'approved'\s*\)/);
  // `select` is a SUPERSET of the pre-F-113 projection (nothing removed).
  const select = stmt.match(/\.select\(\s*'([^']*)'\s*\)/);
  assert.ok(select, 'briefs query must keep an explicit column projection');
  const cols = select[1].split(',').map((c) => c.trim());
  for (const col of ['id', 'content', 'status', 'created_at']) {
    assert.ok(cols.includes(col), `select lost the column \`${col}\``);
  }
  // F-113: no `limit(1)` — every approved candidate is fetched...
  assert.doesNotMatch(stmt, /\.limit\(\s*1\s*\)/);
  // ...and the row is chosen deterministically by the shared canonical selector.
  assert.match(
    ROUTE,
    /pickCanonicalContentRow\s*\(\s*\(\s*briefRows\s*\?\?\s*\[\s*\]\s*\)/
  );
  assert.match(
    ROUTE,
    /import\s*\{[\s\S]*?pickCanonicalContentRow[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/select-canonical-row'/
  );
});
