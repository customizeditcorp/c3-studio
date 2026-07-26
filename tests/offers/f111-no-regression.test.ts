/**
 * F-111 — T-08 — Source-guards de NO-REGRESIÓN y anti-scope-creep.
 *
 * Inspección de fuente (`readFileSync` + `assert.match` **whitespace-tolerante**:
 * `\s*` entre tokens, nunca match de línea literal — el hook husky/prettier
 * reformatea al commit, lección F-107).
 *
 * Cubre: R-06 (`normalizeOffer`/`NormalizedOffer` intactos, `decision_frame` NO entra
 * al contrato del slice GBP), R-19 (las líneas de F-110 siguen en su sitio y la
 * llamada nueva va DESPUÉS), R-20 (`buildGbpUserMessage`, write-path y prompts sin
 * cableado nuevo), R-21 (sin DDL ni delete).
 *
 * Nota de modalidad (`docs/verification.md §6`): la claim de byte-identidad NO se
 * verifica acá — un source-guard no puede probar que la SALIDA no cambió. Esa claim
 * es conductual y vive en `f111-method-context.test.ts` (`assert.equal(..., '')`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

const ROUTE = read('src/app/api/generate-content/route.ts');
const CONTEXT = read('src/lib/gbp-slice/context.ts');
const TYPES = read('src/lib/gbp-slice/types.ts');
const PROMPT = read('src/lib/gbp-slice/prompt.ts');
const WRITE_PATH = read('src/lib/offers/write-path.ts');
const METHOD_CONTEXT = read('src/lib/offers/method-context.ts');

/* ---- R-19: las líneas de F-110 intactas y la llamada nueva DESPUÉS -------------- */

test('T-08 R-19 el bloque OFV preserva F-110 y la llamada de F-111 va DESPUÉS', () => {
  assert.match(ROUTE, /contextChain\s*\+=\s*['"]\\nEntregables:/);
  assert.match(ROUTE, /contextChain\s*\+=\s*['"]\\nPrueba social:/);
  assert.match(ROUTE, /o\.deliverables\.join\(\s*['"] \| ['"]\s*\)/);
  assert.match(ROUTE, /o\.social_proof\.join\(\s*['"] \| ['"]\s*\)/);
  const iSocialProof = ROUTE.indexOf('Prueba social:');
  const iMethodLines = ROUTE.search(/contextChain\s*\+=\s*buildOfvMethodLines/);
  assert.ok(
    iSocialProof >= 0,
    'no se encontró la línea Prueba social de F-110'
  );
  assert.ok(iMethodLines > iSocialProof, 'F-111 debe ANEXAR, no anteponerse');
});

test('T-08 R-19 la llamada usa el seam puro con el `step` y el `o` de normalizeOffer', () => {
  assert.match(
    ROUTE,
    /buildOfvMethodLines\s*\(\s*\{[\s\S]*?step[\s\S]*?offer:\s*o[\s\S]*?decisionFrame:\s*normalizeDecisionFrame\s*\(/
  );
  assert.match(
    ROUTE,
    /import\s*\{[\s\S]*?buildOfvMethodLines[\s\S]*?\}\s*from\s*['"]@\/lib\/offers\/method-context['"]/
  );
});

test('T-08 R-19 normalizeOffer sigue IMPORTADO, no reimplementado en route.ts', () => {
  assert.match(ROUTE, /import[^;]*normalizeOffer[^;]*from/);
  assert.doesNotMatch(ROUTE, /function\s+normalizeOffer\s*\(/);
  assert.doesNotMatch(ROUTE, /const\s+normalizeOffer\s*=/);
});

/* ---- R-06: el slice GBP no gana superficie nueva -------------------------------- */

test('T-08 R-06 `NormalizedOffer` NO gana `decision_frame` (contrato del slice GBP intacto)', () => {
  const iStart = TYPES.indexOf('export interface NormalizedOffer');
  assert.ok(iStart >= 0);
  const block = TYPES.slice(iStart, TYPES.indexOf('}', iStart));
  assert.doesNotMatch(block, /decision_frame|decisionFrame/);
  assert.match(block, /urgency\s*:\s*string\s*\|\s*null/); // el que YA existía
});

test('T-08 R-06 `normalizeOffer` sin cambios (incluido su fallback de urgency)', () => {
  assert.match(CONTEXT, /export\s+function\s+normalizeOffer\s*\(/);
  assert.match(
    CONTEXT,
    /urgency\s*:\s*pickString\s*\(\s*offer\.urgency\s*,[\s\S]*?urgency_scarcity[\s\S]*?c\.urgency\s*\)/
  );
  assert.doesNotMatch(CONTEXT, /decision_frame|decisionFrame|option_a/);
});

/* ---- R-20: GBP, write-path y prompts fuera de scope ----------------------------- */

test('T-08 R-20 `buildGbpUserMessage` (prompt.ts) sin urgency/decision_frame', () => {
  assert.doesNotMatch(PROMPT, /urgency|decision_frame|decisionFrame/i);
});

test('T-08 R-20 el fold del write-path (option_a/b/c → decision_frame) intacto', () => {
  assert.match(WRITE_PATH, /if\s*\(\s*fields\.option_a\s*\)/);
  assert.match(WRITE_PATH, /if\s*\(\s*fields\.option_b\s*\)/);
  assert.match(WRITE_PATH, /if\s*\(\s*fields\.option_c\s*\)/);
  assert.match(WRITE_PATH, /content\.decision_frame\s*=\s*decisionFrame/);
  assert.match(
    WRITE_PATH,
    /content\.urgency\s*=\s*fields\.urgency_scarcity/ // el rename de F-107
  );
  assert.doesNotMatch(WRITE_PATH, /buildOfvMethodLines|method-context/);
});

test('T-08 R-20 el módulo nuevo no cablea persona→OFV ni toca el path GBP', () => {
  // El guard mira CÓDIGO, no prosa: el comentario del reparto NOMBRA a propósito
  // `gbp_description` / `buyer_persona` para documentar sus ausencias deliberadas
  // (CL-094), y eso es exactamente lo que T-01(d) pide.
  const CODE = METHOD_CONTEXT.replace(/\/\*[\s\S]*?\*\//g, '').replace(
    /\/\/.*$/gm,
    ''
  );
  assert.doesNotMatch(
    CODE,
    /buyer_persona|persona|generate-gbp|gbp_description/i
  );
  assert.doesNotMatch(CODE, /supabase|createClient|fetch\s*\(/i);
});

/* ---- R-21: sin DDL ni delete ---------------------------------------------------- */

test('T-08 R-21 ninguna fuente tocada introduce DDL ni delete', () => {
  for (const [name, src] of [
    ['route.ts', ROUTE],
    ['method-context.ts', METHOD_CONTEXT]
  ] as const) {
    assert.doesNotMatch(
      src,
      /alter table|create table|create index|drop |delete from/i,
      name
    );
  }
});
