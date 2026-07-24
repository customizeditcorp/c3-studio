/**
 * F-095 — Brief facts injection + controlled temperature (R-01..R-08).
 *
 * Runner: node:test + node:assert/strict (repo convention). Seams under test are pure:
 *   - resolveBriefFacts   (brief.ts)      — T-09  (R-01/R-02/R-03)
 *   - buildGbpUserMessage  (prompt.ts)    — T-10  (R-02..R-06)  via readGbpContext
 *   - resolveGbpTemperature (generation-params.ts) — T-11 (R-07/R-08)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBriefFacts } from '../../src/lib/gbp-slice/brief.ts';
import { readGbpContext } from '../../src/lib/gbp-slice/context.ts';
import { buildGbpUserMessage } from '../../src/lib/gbp-slice/prompt.ts';
import {
  resolveGbpTemperature,
  DEFAULT_GBP_TEMPERATURE
} from '../../src/lib/gbp-slice/generation-params.ts';
import {
  CLIENT,
  REAL_OFFER,
  APPROVED_BRANDBOARD,
  APPROVED_BRIEF,
  APPROVED_BRIEF_STRING_CONTENT,
  APPROVED_BRIEF_SPARSE
} from './fixtures.ts';

/* ---------------------------- T-09: resolveBriefFacts (R-01/R-02/R-03) --------------- */

test('T-09 (R-01) brief with the 5 Scope-A fields -> BriefFacts with all 5', () => {
  const facts = resolveBriefFacts(APPROVED_BRIEF);
  assert.equal(facts.licenses, '1155610');
  assert.equal(facts.years_experience, '20');
  assert.match(String(facts.differentiators), /Preparación profesional/);
  assert.match(String(facts.guarantees), /100%/);
  assert.match(String(facts.success_cases), /Buellton/);
});

test('T-09 (R-02) noise fields (raw_text, budget) are NOT surfaced as facts', () => {
  const facts = resolveBriefFacts(APPROVED_BRIEF) as Record<string, unknown>;
  assert.equal(facts.raw_text, undefined);
  assert.equal(facts.budget, undefined);
  assert.deepEqual(Object.keys(facts).sort(), [
    'differentiators',
    'guarantees',
    'licenses',
    'success_cases',
    'years_experience'
  ]);
});

test('T-09 (R-02) blank / empty / non-string / absent fields are omitted (no placeholder)', () => {
  const facts = resolveBriefFacts(APPROVED_BRIEF_SPARSE);
  assert.equal(facts.licenses, '1155610'); // present -> kept
  assert.equal('years_experience' in facts, false); // '   ' blank -> omit
  assert.equal('differentiators' in facts, false); // '' empty -> omit
  assert.equal('guarantees' in facts, false); // non-string -> omit
  assert.equal('success_cases' in facts, false); // absent -> omit
});

test('T-09 (R-02) string values are trimmed', () => {
  const facts = resolveBriefFacts({
    id: 'b',
    status: 'approved',
    content: { licenses: '  1155610  ' }
  });
  assert.equal(facts.licenses, '1155610');
});

test('T-09 (R-02) content as JSON string -> parsed', () => {
  const facts = resolveBriefFacts(APPROVED_BRIEF_STRING_CONTENT);
  assert.equal(facts.licenses, '1155610');
  assert.equal(facts.years_experience, '20');
});

test('T-09 (R-02) invalid JSON string content -> {} without throwing', () => {
  const facts = resolveBriefFacts({
    id: 'b',
    status: 'approved',
    content: '{ not json'
  });
  assert.deepEqual(facts, {});
});

test('T-09 (R-03) brief === null -> {} (honest degradation)', () => {
  assert.deepEqual(resolveBriefFacts(null), {});
});

test('T-09 (R-03) brief with null content -> {}', () => {
  assert.deepEqual(
    resolveBriefFacts({ id: 'b', status: 'approved', content: null }),
    {}
  );
});

/* ---------------------------- T-10: buildGbpUserMessage (R-02..R-06) ----------------- */

test('T-10 (R-04/R-05) populated brief -> section header + concrete values verbatim', () => {
  const ctx = readGbpContext({
    client: CLIENT,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: APPROVED_BRIEF
  });
  const msg = buildGbpUserMessage(ctx);
  assert.match(msg, /## DATOS DEL BRIEF APROBADO/);
  assert.match(msg, /1155610/); // license number verbatim
  assert.match(msg, /Años de experiencia: 20/);
  assert.match(msg, /Preparación profesional/); // differentiator text
  assert.match(msg, /Buellton/); // success case (real city, kills the "in CA" drift)
});

test('T-10 (R-04) brief section is inserted AFTER DATOS DEL CLIENTE and BEFORE OFV', () => {
  const ctx = readGbpContext({
    client: CLIENT,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: APPROVED_BRIEF
  });
  const msg = buildGbpUserMessage(ctx);
  const iClient = msg.indexOf('## DATOS DEL CLIENTE');
  const iBrief = msg.indexOf('## DATOS DEL BRIEF APROBADO');
  const iOfv = msg.indexOf('## OFERTA DE VALOR APROBADA');
  assert.ok(iClient >= 0 && iBrief >= 0 && iOfv >= 0);
  assert.ok(iClient < iBrief, 'brief section after client data');
  assert.ok(iBrief < iOfv, 'brief section before OFV');
});

test('T-10 (R-02) an omitted brief field -> its label does NOT appear in the message', () => {
  const ctx = readGbpContext({
    client: CLIENT,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: APPROVED_BRIEF_SPARSE // only licenses present
  });
  const msg = buildGbpUserMessage(ctx);
  assert.match(msg, /Licencia\/certificaciones: 1155610/);
  assert.doesNotMatch(msg, /Años de experiencia:/);
  assert.doesNotMatch(msg, /Diferenciadores:/);
  assert.doesNotMatch(msg, /Garantías:/);
  assert.doesNotMatch(msg, /Casos de éxito:/);
});

test('T-10 (R-03) no brief -> no brief section, but client + OFV sections intact', () => {
  const ctx = readGbpContext({
    client: CLIENT,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: null
  });
  const msg = buildGbpUserMessage(ctx);
  assert.doesNotMatch(msg, /## DATOS DEL BRIEF APROBADO/);
  assert.match(msg, /## DATOS DEL CLIENTE/);
  assert.match(msg, /## OFERTA DE VALOR APROBADA/);
});

test('T-10 (R-06) language directive stays the LAST block WITH a brief (en)', () => {
  const ctx = readGbpContext({
    client: { ...CLIENT, content_language: 'en' },
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: APPROVED_BRIEF
  });
  const msg = buildGbpUserMessage(ctx);
  assert.match(msg, /IDIOMA DE SALIDA \(OBLIGATORIO\)/);
  assert.ok(
    msg.indexOf('IDIOMA DE SALIDA') >
      msg.indexOf('## DATOS DEL BRIEF APROBADO'),
    'directive after the brief section'
  );
  assert.ok(
    msg.indexOf('IDIOMA DE SALIDA') > msg.indexOf('Responde SOLO con JSON'),
    'directive at the close, after the JSON instruction'
  );
});

test('T-10 (R-06) language directive stays the LAST block WITHOUT a brief (default es)', () => {
  const ctx = readGbpContext({
    client: CLIENT,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: null
  });
  const msg = buildGbpUserMessage(ctx);
  assert.match(msg, /IDIOMA DE SALIDA \(OBLIGATORIO\)/);
  assert.ok(
    msg.indexOf('IDIOMA DE SALIDA') > msg.indexOf('Responde SOLO con JSON'),
    'directive at the close'
  );
});

/* ---------------------------- T-11: resolveGbpTemperature (R-07/R-08) ---------------- */

test('T-11 (DT-01) DEFAULT_GBP_TEMPERATURE === 0.3', () => {
  assert.equal(DEFAULT_GBP_TEMPERATURE, 0.3);
});

test("T-11 (R-07) '0.3' -> 0.3", () => {
  assert.equal(resolveGbpTemperature('0.3'), 0.3);
});

test("T-11 (R-07) '0' -> 0 (a legit explicit zero is honored)", () => {
  assert.equal(resolveGbpTemperature('0'), 0);
});

test('T-11 (R-08) undefined / empty / non-numeric -> default, no throw', () => {
  assert.equal(resolveGbpTemperature(undefined), DEFAULT_GBP_TEMPERATURE);
  assert.equal(resolveGbpTemperature(''), DEFAULT_GBP_TEMPERATURE);
  assert.equal(resolveGbpTemperature('   '), DEFAULT_GBP_TEMPERATURE);
  assert.equal(resolveGbpTemperature('abc'), DEFAULT_GBP_TEMPERATURE);
});
