/**
 * F-064 anti-AI validator — rule detection tests (T-V02..T-V11).
 * Deterministic, no DB. Run with: node --test tests/anti-ai/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANTI_AI_RULES,
  RULESET_VERSION,
  validate,
  scanText,
  type FieldText
} from '../../src/lib/anti-ai/validator.ts';

const f = (text: string, field = 'copy'): FieldText[] => [{ field, text }];
const run = (text: string, outputType?: string) =>
  validate(f(text), ANTI_AI_RULES, { outputType });

// --- T-V02: buzzwords -> issue ---
test('T-V02 buzzwords produce issues', () => {
  const r = run('This cutting-edge, game-changing platform');
  assert.ok(r.issues.length >= 2, 'expected >=2 buzzword issues');
  assert.ok(r.issues.some((i) => i.rule_id === 'buzzword.cutting-edge'));
  assert.ok(r.issues.some((i) => i.rule_id === 'buzzword.game-changing'));
  assert.equal(r.is_valid, false);
});
test('T-V02 clean copy has no buzzword issue', () => {
  const r = run('We fix roofs in your neighborhood with a 12-month warranty.');
  assert.equal(
    r.issues.filter((i) => i.rule_id.startsWith('buzzword.')).length,
    0
  );
});

// --- T-V03: exaggerations / absolutes -> issue ---
test('T-V03 exaggerations and absolutes produce issues', () => {
  assert.ok(
    run('We are the best in town').issues.some(
      (i) => i.rule_id === 'exaggeration.the-best'
    )
  );
  assert.ok(
    run('We always deliver').issues.some((i) => i.rule_id === 'absolute.always')
  );
  assert.ok(
    run('100% guaranteed results').issues.some((i) => i.rule_id.includes('100'))
  );
});
test('T-V03 neutral copy has no exaggeration issue', () => {
  const r = run('Serving 40 homeowners this spring with honest quotes.');
  assert.equal(r.issues.length, 0);
  assert.equal(r.is_valid, true);
});

// --- T-V04: #1 without proof vs license number ---
test('T-V04 "#1 contractor" is an issue', () => {
  assert.ok(
    run('The #1 contractor in the area').issues.some(
      (i) => i.rule_id === 'exaggeration.number-one'
    )
  );
});
test('T-V04 license #1125194 is NOT flagged by number-one rule', () => {
  const r = run('Licensed CSLB #1125194 and insured');
  assert.equal(
    r.issues.filter((i) => i.rule_id === 'exaggeration.number-one').length,
    0
  );
});

// --- T-V05: formatting (em/en-dash, double space, !!) ---
test('T-V05 em dash produces an issue', () => {
  assert.ok(
    run('Fast service — done right').issues.some(
      (i) => i.rule_id === 'formatting.em-dash'
    )
  );
});
test('T-V05 en dash produces an issue', () => {
  assert.ok(
    run('Open 9–5 daily').issues.some((i) => i.rule_id === 'formatting.en-dash')
  );
});
test('T-V05 double space produces an issue', () => {
  assert.ok(
    run('We  fix  roofs').issues.some(
      (i) => i.rule_id === 'formatting.double-space'
    )
  );
});
test('T-V05 double exclamation produces an issue', () => {
  assert.ok(
    run('Call now!!').issues.some(
      (i) => i.rule_id === 'formatting.multiple-exclamation'
    )
  );
});
test('T-V05 clean copy has no formatting issue', () => {
  const r = run('Call today for a free quote.');
  assert.equal(
    r.issues.filter((i) => i.rule_id.startsWith('formatting.')).length,
    0
  );
});

// --- T-V06: ALL-CAPS with allowlist ---
test('T-V06 3+ ALL-CAPS non-acronyms -> issue', () => {
  const r = run('CALL NOW BEFORE DEADLINE');
  const caps = r.issues.filter((i) => i.rule_id === 'all-caps.excessive');
  assert.equal(caps.length, 1, 'expected single escalated all-caps issue');
  assert.match(caps[0].message, /Too many/);
});
test('T-V06 single ALL-CAPS non-acronym -> warning', () => {
  const r = run('This is URGENT for you');
  assert.ok(r.warnings.some((w) => w.rule_id === 'all-caps.excessive'));
  assert.equal(
    r.issues.filter((i) => i.rule_id === 'all-caps.excessive').length,
    0
  );
});
test('T-V06 allowlisted acronyms -> nothing', () => {
  const r = run('HVAC and GAF certified, CSLB licensed');
  assert.equal(
    r.issues.filter((i) => i.rule_id === 'all-caps.excessive').length,
    0
  );
  assert.equal(
    r.warnings.filter((w) => w.rule_id === 'all-caps.excessive').length,
    0
  );
});
test('T-V06 domain acronyms GBP/SEO/NAP -> nothing (CL-018)', () => {
  for (const acronym of ['GBP', 'SEO', 'NAP']) {
    const r = run(`Optimize your ${acronym} listing today`);
    assert.equal(
      r.issues.filter((i) => i.rule_id === 'all-caps.excessive').length,
      0,
      `${acronym} should not produce an all-caps issue`
    );
    assert.equal(
      r.warnings.filter((w) => w.rule_id === 'all-caps.excessive').length,
      0,
      `${acronym} should not produce an all-caps warning`
    );
  }
});
test('T-V06 non-allowlisted 3-letter acronym XYZ still flagged (no over-suppression)', () => {
  const r = run('Check the XYZ report');
  assert.ok(
    r.warnings.some((w) => w.rule_id === 'all-caps.excessive'),
    'XYZ should still produce an all-caps warning'
  );
});

// --- T-V07: from-x-to-y context-aware ---
test('T-V07 "from chaos to clarity" -> warning', () => {
  assert.ok(
    run('Go from chaos to clarity').warnings.some(
      (w) => w.rule_id === 'from-x-to-y.range'
    )
  );
});
test('T-V07 "from 3 to 5 days" -> no warning (time)', () => {
  const r = run('Delivered from 3 to 5 days');
  assert.equal(
    r.warnings.filter((w) => w.rule_id === 'from-x-to-y.range').length,
    0
  );
});

// --- T-V08: superlatives without numbers + ellipsis mid-text ---
test('T-V08 "amazing transformation" -> warning', () => {
  assert.ok(
    run('An amazing transformation').warnings.some(
      (w) => w.rule_id === 'superlative.vague'
    )
  );
});
test('T-V08 superlative with number in segment -> no warning', () => {
  const r = run('An amazing 15-year track record');
  assert.equal(
    r.warnings.filter((w) => w.rule_id === 'superlative.vague').length,
    0
  );
});
test('T-V08 ellipsis mid-text -> warning', () => {
  assert.ok(
    run('Wait... there is more to know').warnings.some(
      (w) => w.rule_id === 'ellipsis.mid-text'
    )
  );
});
test('T-V08 ellipsis at end -> no warning', () => {
  const r = run('And there is more...');
  assert.equal(
    r.warnings.filter((w) => w.rule_id === 'ellipsis.mid-text').length,
    0
  );
});

// --- T-V09: emojis scoped to ad copy ---
test('T-V09 emoji in campaign_copy -> warning', () => {
  const r = run('Book now 🚀 today', 'campaign_copy');
  assert.ok(r.warnings.some((w) => w.rule_id === 'emoji.in-ads'));
});
test('T-V09 emoji in gbp_posts (gbp_* scope) -> warning', () => {
  const r = run('New post 🎉', 'gbp_posts');
  assert.ok(r.warnings.some((w) => w.rule_id === 'emoji.in-ads'));
});
test('T-V09 emoji in social_content -> no warning', () => {
  const r = run('Great vibes 🚀', 'social_content');
  assert.equal(
    r.warnings.filter((w) => w.rule_id === 'emoji.in-ads').length,
    0
  );
});

// --- T-V10: is_valid semantics (issues govern, warnings do not) ---
test('T-V10 only warnings -> is_valid true', () => {
  const r = run('An amazing transformation'); // superlative warning only
  assert.equal(r.issues.length, 0);
  assert.ok(r.warnings.length >= 1);
  assert.equal(r.is_valid, true);
});
test('T-V10 an issue -> is_valid false', () => {
  const r = run('We are the best');
  assert.ok(r.issues.length >= 1);
  assert.equal(r.is_valid, false);
});

// --- T-V11: ruleset serializable and versioned ---
test('T-V11 ruleset is JSON-serializable', () => {
  assert.doesNotThrow(() => JSON.stringify(ANTI_AI_RULES));
});
test('T-V11 every rule has id/category/severity/match/message', () => {
  for (const rule of ANTI_AI_RULES) {
    assert.ok(rule.id && typeof rule.id === 'string');
    assert.ok(rule.category && typeof rule.category === 'string');
    assert.ok(rule.severity === 'issue' || rule.severity === 'warning');
    assert.ok(
      rule.match &&
        (rule.match.kind === 'literal' || rule.match.kind === 'regex')
    );
    assert.ok(rule.message && typeof rule.message === 'string');
  }
});
test('T-V11 RULESET_VERSION is semver', () => {
  assert.match(RULESET_VERSION, /^\d+\.\d+\.\d+$/);
});
test('T-V11 rule ids are unique', () => {
  const ids = ANTI_AI_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

// scanText is directly exercised (pure primitive)
test('scanText tags findings with the provided field', () => {
  const findings = scanText('cutting-edge', ANTI_AI_RULES, {
    field: 'big_promise'
  });
  assert.ok(findings.every((x) => x.field === 'big_promise'));
});
