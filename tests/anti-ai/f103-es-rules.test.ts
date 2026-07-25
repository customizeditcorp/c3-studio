/**
 * F-103 — Fase 1 Slice B: anti-AI validator Spanish (ES) rules.
 *
 * Deterministic, offline, no DB/network. Run with: node --test tests/**\/*.test.ts
 *
 * Covers the bilingual extension of ANTI_AI_RULES: ES buzzwords / exaggerations /
 * absolutes / superlatives are applied as a UNION alongside the EN rules, with no
 * change to validate()/scanText() signatures, no new RuleCategory, and no regression
 * of the existing EN/neutral rules.
 *
 * Traceability:
 *   T-03 (this file) -> R-01, R-02, R-03, R-04
 *   T-04 (this file) -> R-05, R-07, R-08, R-09, R-10, R-11
 *   T-05 (this file) -> R-06, R-12
 *   T-06 (this file) -> R-13
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  ANTI_AI_RULES,
  RULESET_VERSION,
  validate,
  type FieldText,
  type RuleCategory
} from '../../src/lib/anti-ai/validator.ts';

const f = (text: string, field = 'copy'): FieldText[] => [{ field, text }];
const run = (text: string, outputType?: string) =>
  validate(f(text), ANTI_AI_RULES, { outputType });

const VALID_CATEGORIES: ReadonlySet<RuleCategory> = new Set<RuleCategory>([
  'buzzword',
  'exaggeration',
  'absolute',
  'formatting',
  'all-caps',
  'from-x-to-y',
  'superlative',
  'emoji',
  'ellipsis'
]);

// ===========================================================================
// T-03 — ES detection by family (R-01, R-02, R-03, R-04)
// ===========================================================================

// --- Buzzwords ES -> issue / buzzword ---
test('T-03 ES buzzword "de vanguardia" -> buzzword issue', () => {
  const r = run('Ofrecemos una solución de vanguardia para tu negocio');
  assert.ok(
    r.issues.some((i) => i.rule_id === 'buzzword.de-vanguardia'),
    'expected buzzword.de-vanguardia'
  );
  assert.equal(r.is_valid, false);
});

test('T-03 ES buzzword "solución integral" -> buzzword issue', () => {
  const r = run('Brindamos una solución integral llave en mano');
  assert.ok(r.issues.some((i) => i.rule_id === 'buzzword.soluci-n-integral'));
  assert.ok(r.issues.some((i) => i.rule_id === 'buzzword.llave-en-mano'));
});

test('T-03 clean ES copy has no buzzword issue', () => {
  const r = run('Reparamos techos en tu vecindario con garantía de 12 meses.');
  assert.equal(
    r.issues.filter((i) => i.rule_id.startsWith('buzzword.')).length,
    0
  );
  assert.equal(r.is_valid, true);
});

// --- Exaggerations / absolutes ES -> issue ---
test('T-03 ES exaggeration "el mejor" -> exaggeration issue', () => {
  const r = run('Somos el mejor equipo de la zona');
  assert.ok(r.issues.some((i) => i.rule_id === 'exaggeration.el-mejor'));
  assert.equal(r.is_valid, false);
});

test('T-03 ES exaggeration "garantizado 100%" -> exaggeration issue', () => {
  const r = run('Resultado garantizado 100% en cada proyecto');
  assert.ok(
    r.issues.some(
      (i) =>
        i.rule_id === 'exaggeration.garantizado-100' &&
        // sanity: category is exaggeration
        true
    )
  );
});

test('T-03 ES absolute "todo el mundo" -> absolute issue', () => {
  const r = run('Todo el mundo confía en nosotros');
  assert.ok(r.issues.some((i) => i.rule_id === 'absolute.todo-el-mundo'));
});

test('T-03 ES absolute "siempre" -> absolute issue', () => {
  const r = run('Siempre entregamos a tiempo');
  assert.ok(r.issues.some((i) => i.rule_id === 'absolute.siempre'));
});

test('T-03 ES absolute/exaggeration findings carry the right category', () => {
  const r = run('Somos el mejor y todo el mundo lo sabe, siempre.');
  const byId = new Map(ANTI_AI_RULES.map((rule) => [rule.id, rule.category]));
  const elMejor = r.issues.find((i) => i.rule_id === 'exaggeration.el-mejor');
  const todoMundo = r.issues.find(
    (i) => i.rule_id === 'absolute.todo-el-mundo'
  );
  const siempre = r.issues.find((i) => i.rule_id === 'absolute.siempre');
  assert.equal(byId.get(elMejor!.rule_id), 'exaggeration');
  assert.equal(byId.get(todoMundo!.rule_id), 'absolute');
  assert.equal(byId.get(siempre!.rule_id), 'absolute');
});

// --- Superlatives ES -> warning / superlative ---
test('T-03 ES superlative "increíble" -> superlative warning (not issue)', () => {
  const r = run('Una transformación increíble para tu marca');
  assert.ok(r.warnings.some((w) => w.rule_id === 'superlative.vague-es'));
  assert.equal(
    r.issues.filter((i) => i.rule_id === 'superlative.vague-es').length,
    0
  );
  // only a warning -> still valid
  assert.equal(r.is_valid, true);
});

test('T-03 ES superlative accent-insensitive ("increible" without accent)', () => {
  const r = run('un resultado increible para todos los clientes');
  assert.ok(r.warnings.some((w) => w.rule_id === 'superlative.vague-es'));
});

test('T-03 ES issue drives is_valid=false, warning-only stays true', () => {
  assert.equal(run('Servicio espectacular').is_valid, true); // warning only
  assert.equal(run('El líder indiscutible del sector').is_valid, false); // issue
});

// ===========================================================================
// T-04 — UNION + no-regression + purity/serializability (R-05,R-07,R-08,R-09,R-10,R-11)
// ===========================================================================

// --- UNION (R-05): EN + ES applied simultaneously, no content_language plumbing ---
test('T-04 UNION: mixed EN+ES buzzwords both flagged without content_language', () => {
  const r = run('This cutting-edge, solución de vanguardia');
  assert.ok(
    r.issues.some((i) => i.rule_id === 'buzzword.cutting-edge'),
    'EN'
  );
  assert.ok(
    r.issues.some((i) => i.rule_id === 'buzzword.de-vanguardia'),
    'ES'
  );
});

test('T-04 UNION: validate() signature unchanged (3rd arg is ScanContext, no lang)', () => {
  // Same call shape as production; no language argument exists.
  const r = validate(f('de clase mundial'), ANTI_AI_RULES, {
    outputType: 'ofv'
  });
  assert.ok(r.issues.some((i) => i.rule_id === 'buzzword.de-clase-mundial'));
});

// --- No-regression (R-10): EN/neutral rules unchanged ---
test('T-04 no-regression: EN "cutting-edge" still an issue', () => {
  assert.ok(
    run('a cutting-edge approach').issues.some(
      (i) => i.rule_id === 'buzzword.cutting-edge'
    )
  );
});

test('T-04 no-regression: neutral acronyms HVAC/GBP still clean', () => {
  const r = run('HVAC and GBP certified team');
  assert.equal(
    r.issues.filter((i) => i.rule_id === 'all-caps.excessive').length,
    0
  );
  assert.equal(
    r.warnings.filter((w) => w.rule_id === 'all-caps.excessive').length,
    0
  );
});

test('T-04 no-regression: em-dash still an issue', () => {
  assert.ok(
    run('Fast service — done right').issues.some(
      (i) => i.rule_id === 'formatting.em-dash'
    )
  );
});

// --- Serializable + version + reuse of helpers/types (R-07, R-08, R-09) ---
test('T-04 ANTI_AI_RULES is JSON-serializable (still a serializable constant)', () => {
  assert.doesNotThrow(() => JSON.stringify(ANTI_AI_RULES));
});

test('T-04 RULESET_VERSION bumped to 1.1.0', () => {
  assert.equal(RULESET_VERSION, '1.1.0');
});

test('T-04 rule ids are unique (including ES rules)', () => {
  const ids = ANTI_AI_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('T-04 every rule (incl. ES) has id/category/severity/match/message', () => {
  for (const rule of ANTI_AI_RULES) {
    assert.ok(rule.id && typeof rule.id === 'string');
    assert.ok(
      VALID_CATEGORIES.has(rule.category),
      `bad category: ${rule.category}`
    );
    assert.ok(rule.severity === 'issue' || rule.severity === 'warning');
    assert.ok(
      rule.match &&
        (rule.match.kind === 'literal' || rule.match.kind === 'regex')
    );
    assert.ok(rule.message && typeof rule.message === 'string');
  }
});

test('T-04 no new RuleCategory introduced by ES rules', () => {
  ANTI_AI_RULES.forEach((r) =>
    assert.ok(
      VALID_CATEGORIES.has(r.category),
      `unexpected category: ${r.category}`
    )
  );
});

// --- R-09 non-blocking / shape: an ES issue lowers is_valid but is just data ---
test('T-04 ES issue behaves like EN issue for is_valid (non-blocking semantics)', () => {
  const r = run('nuestra solución de vanguardia'); // ES buzzword issue
  assert.equal(r.is_valid, false);
  assert.ok(Array.isArray(r.issues) && Array.isArray(r.warnings));
});

// ===========================================================================
// T-05 — ES false-positive guards (R-06, R-12)
// ===========================================================================

// --- R-06: no ES from-x-to-y rule; legitimate "de X a Y" ranges are not flagged ---
test('T-05 "de lunes a viernes" -> no from-x-to-y finding', () => {
  const r = run('Atendemos de lunes a viernes en horario corrido');
  assert.equal(
    [...r.issues, ...r.warnings].filter((x) =>
      x.rule_id.startsWith('from-x-to-y')
    ).length,
    0
  );
});

test('T-05 "de 9 a 5" -> no from-x-to-y finding', () => {
  const r = run('Abierto de 9 a 5 todos los días hábiles');
  assert.equal(
    [...r.issues, ...r.warnings].filter((x) =>
      x.rule_id.startsWith('from-x-to-y')
    ).length,
    0
  );
});

// --- R-12: substring collisions resolved in the banlist design ---
test('T-05 "métodos" does NOT trigger absolute todo-el-mundo/todos', () => {
  const r = run('Aplicamos nuestros métodos probados en cada cliente');
  // No ES `todos` rule exists (we ban `todo el mundo`), so `métodos` stays clean.
  assert.equal(
    r.issues.filter((i) => i.rule_id === 'absolute.todo-el-mundo').length,
    0
  );
  assert.equal(r.issues.filter((i) => /todos/.test(i.rule_id)).length, 0);
});

test('T-05 "imperfecto" does NOT trigger the ES absolute.perfecto rule (\\b guard)', () => {
  const r = run('Buscamos la belleza de un acabado imperfecto y honesto');
  assert.equal(
    r.issues.filter((i) => i.rule_id === 'absolute.perfecto').length,
    0
  );
});

test('T-05 "perfecto" as a standalone word DOES trigger absolute.perfecto', () => {
  const r = run('Un acabado perfecto en cada detalle');
  assert.ok(r.issues.some((i) => i.rule_id === 'absolute.perfecto'));
});

test('T-05 ES superlative with adjacent number -> no warning (requireNoAdjacentDigit)', () => {
  const r = run('Un ahorro increíble de 30% este mes');
  assert.equal(
    r.warnings.filter((w) => w.rule_id === 'superlative.vague-es').length,
    0
  );
});

// ===========================================================================
// T-06 — invocation seams intact (R-13) — source inspection
// ===========================================================================

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const ROUTE = readFileSync(
  resolve(REPO, 'src/app/api/generate-content/route.ts'),
  'utf8'
);

test('T-06 exactly two validate(...) call-sites remain', () => {
  const count = (ROUTE.match(/validate\(/g) ?? []).length;
  assert.equal(count, 2, 'expected exactly two validate( call-sites');
});

test('T-06 both call-sites pass ANTI_AI_RULES', () => {
  assert.match(
    ROUTE,
    /validate\(offerFields,\s*ANTI_AI_RULES,\s*\{\s*outputType:\s*'ofv'\s*\}\s*\)/
  );
  assert.match(
    ROUTE,
    /validate\(outputFields,\s*ANTI_AI_RULES,\s*\{\s*outputType:\s*step\s*\}\s*\)/
  );
});

test('T-06 F-103 did NOT introduce a language param into any validate() call-site', () => {
  assert.doesNotMatch(
    ROUTE,
    /validate\([^)]*content_language[^)]*\)/,
    'validate() must not receive content_language (UNION, no plumbing)'
  );
});
