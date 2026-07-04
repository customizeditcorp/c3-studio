/**
 * F-064 anti-AI validator — determinism + extractors + persistence (T-V01, T-V12..T-V16).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANTI_AI_RULES,
  RULESET_VERSION,
  validate,
  extractOffersFields,
  extractGeneratedOutputFields,
  attachValidation,
  type FieldText
} from '../../src/lib/anti-ai/validator.ts';

// --- T-V01: determinism (N identical runs) ---
test('T-V01 core is deterministic across N runs', () => {
  const fields: FieldText[] = [
    {
      field: 'a',
      text: 'cutting-edge — the best!! from chaos to clarity CALL NOW BEFORE'
    },
    { field: 'b', text: 'amazing transformation... 🚀' }
  ];
  const first = JSON.stringify(
    validate(fields, ANTI_AI_RULES, { outputType: 'campaign_copy' })
  );
  for (let i = 0; i < 50; i++) {
    const next = JSON.stringify(
      validate(fields, ANTI_AI_RULES, { outputType: 'campaign_copy' })
    );
    assert.equal(next, first, `run ${i} diverged`);
  }
});

// --- T-V12: offers extractor ---
test('T-V12 extractOffersFields includes the 9 named fields + content.raw_text', () => {
  const row = {
    big_promise: 'bp',
    vehicle_name: 'vn',
    vehicle_description: 'vd',
    quick_win: 'qw',
    decision_frame: 'df',
    guarantee: 'g',
    urgency: 'u',
    social_proof: 'sp',
    deliverables: 'dl',
    content: {
      raw_text: 'RAW',
      extra_note: 'note-leaf',
      nested: { deep: 'deep-leaf' }
    }
  };
  const fields = extractOffersFields(row);
  const paths = fields.map((x) => x.field);
  for (const name of [
    'big_promise',
    'vehicle_name',
    'vehicle_description',
    'quick_win',
    'decision_frame',
    'guarantee',
    'urgency',
    'social_proof',
    'deliverables'
  ]) {
    assert.ok(paths.includes(name), `missing ${name}`);
  }
  assert.ok(paths.includes('content.raw_text'));
  assert.ok(paths.includes('content.extra_note'));
  assert.ok(paths.includes('content.nested.deep'));
  // Never references a top-level raw_text column (F-058).
  assert.equal(paths.includes('raw_text'), false);
  // raw_text scanned exactly once (not duplicated by the flatten pass).
  assert.equal(paths.filter((p) => p === 'content.raw_text').length, 1);
});

// --- T-V13: generated_outputs extractor ---
test('T-V13 extractGeneratedOutputFields flattens content string leaves in stable order', () => {
  const row = {
    output_type: 'campaign_copy',
    content: {
      zeta: 'z',
      alpha: 'a',
      list: ['one', 'two'],
      obj: { m: 'm-leaf', n: 42 }
    }
  };
  const fields = extractGeneratedOutputFields(row);
  const paths = fields.map((x) => x.field);
  // sorted-key order => alpha before zeta; numbers dropped
  assert.deepEqual(paths, [
    'content.alpha',
    'content.list[0]',
    'content.list[1]',
    'content.obj.m',
    'content.zeta'
  ]);
  // idempotent / deterministic
  assert.deepEqual(
    extractGeneratedOutputFields(row).map((x) => x.field),
    paths
  );
});

// --- T-V14 + T-V16: persistence shape, additive, only touches content ---
test('T-V14 attachValidation appends content._validation with 5 keys, rest intact', () => {
  const content = { raw_text: 'hello', big_promise: 'bp', other: { x: 1 } };
  const result = validate(
    [{ field: 'raw_text', text: 'the best' }],
    ANTI_AI_RULES
  );
  const iso = '2026-07-03T00:00:00.000Z';
  const next = attachValidation(content, result, iso) as Record<string, any>;

  // original keys intact
  assert.equal(next.raw_text, 'hello');
  assert.equal(next.big_promise, 'bp');
  assert.deepEqual(next.other, { x: 1 });

  // _validation present with exactly 5 keys
  const v = next._validation;
  assert.deepEqual(Object.keys(v).sort(), [
    'is_valid',
    'issues',
    'ruleset_version',
    'validated_at',
    'warnings'
  ]);
  assert.equal(v.ruleset_version, RULESET_VERSION);
  assert.equal(v.validated_at, iso);
  assert.equal(v.is_valid, false); // 'the best' is an issue

  // additive: only new top-level key is _validation
  const added = Object.keys(next).filter(
    (k) => !Object.keys(content).includes(k)
  );
  assert.deepEqual(added, ['_validation']);
});

test('T-V16 attachValidation does not mutate the input content object', () => {
  const content = { raw_text: 'x' };
  const before = JSON.stringify(content);
  attachValidation(
    content,
    validate([], ANTI_AI_RULES),
    '2026-07-03T00:00:00.000Z'
  );
  assert.equal(JSON.stringify(content), before);
  assert.equal('_validation' in content, false);
});

test('T-V14 validated_at is injected (pure core reads no clock)', () => {
  // Two attaches with different iso values differ only in validated_at.
  const content = { a: 'b' };
  const res = validate([], ANTI_AI_RULES);
  const a = attachValidation(content, res, 'ISO-A') as any;
  const b = attachValidation(content, res, 'ISO-B') as any;
  assert.notEqual(a._validation.validated_at, b._validation.validated_at);
  assert.equal(a._validation.is_valid, b._validation.is_valid);
});
