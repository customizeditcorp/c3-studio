/**
 * F-065 method grounding — grounding shape (T-V10), coexistence with _validation
 * (T-V11), guard records (T-V09), non-mutation, no hard-block persistence (T-V13).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAppliedGrounding,
  buildUnappliedGrounding,
  attachMethodGrounding,
  GROUNDING_VERSION
} from '../../src/lib/method-grounding/grounding.ts';
import {
  attachValidation,
  validate,
  ANTI_AI_RULES
} from '../../src/lib/anti-ai/validator.ts';
import type { MethodSegment } from '../../src/lib/method-grounding/types.ts';

const ISO = '2026-07-07T18:20:05.123Z';
const SEGS: MethodSegment[] = [
  {
    content: 'a',
    section_title: 't1',
    origin_path: 'source/a.md',
    knowledge_layer: 'source_foundational',
    similarity: 0.71
  },
  {
    content: 'b',
    section_title: 't2',
    origin_path: 'protocols/b.md',
    knowledge_layer: 'protocol_canonical',
    similarity: 0.52
  }
];

const GROUNDING_KEYS = [
  'applied',
  'grounding_version',
  'knowledge_layers',
  'methodology_family',
  'n_segments',
  'origin_paths',
  'query',
  'reason',
  'retrieved_at',
  'similarity_range',
  'step'
];

// --- T-V10: applied=true shape ---
test('T-V10 applied grounding has full shape and similarity_range [max,min]', () => {
  const g = buildAppliedGrounding({
    segments: SEGS,
    methodology_family: 'c3_value_method',
    step: 'ofv',
    query: 'q',
    retrievedAtIso: ISO
  });
  assert.deepEqual(Object.keys(g).sort(), GROUNDING_KEYS);
  assert.equal(g.applied, true);
  assert.equal(g.n_segments, 2);
  assert.deepEqual(g.origin_paths, ['source/a.md', 'protocols/b.md']);
  assert.deepEqual(g.knowledge_layers, [
    'source_foundational',
    'protocol_canonical'
  ]);
  assert.deepEqual(g.similarity_range, [0.71, 0.52]);
  assert.equal(g.grounding_version, GROUNDING_VERSION);
  assert.equal(g.retrieved_at, ISO);
  assert.equal(g.reason, null);
});

// --- T-V09 + T-V10: applied=false shape for guard + failure reasons ---
test('T-V09 no_methodology guard produces applied=false with null family', () => {
  const g = buildUnappliedGrounding({
    reason: 'no_methodology',
    methodology_family: null,
    step: 'ofv',
    query: null,
    retrievedAtIso: ISO
  });
  assert.deepEqual(Object.keys(g).sort(), GROUNDING_KEYS);
  assert.equal(g.applied, false);
  assert.equal(g.n_segments, 0);
  assert.equal(g.methodology_family, null);
  assert.equal(g.query, null);
  assert.deepEqual(g.origin_paths, []);
  assert.deepEqual(g.knowledge_layers, []);
  assert.equal(g.similarity_range, null);
  assert.equal(g.reason, 'no_methodology');
});

test('T-V09 unknown_step guard keeps family, reason:unknown_step', () => {
  const g = buildUnappliedGrounding({
    reason: 'unknown_step',
    methodology_family: 'c3_value_method',
    step: 'not_a_step',
    query: null,
    retrievedAtIso: ISO
  });
  assert.equal(g.applied, false);
  assert.equal(g.methodology_family, 'c3_value_method');
  assert.equal(g.reason, 'unknown_step');
});

// --- T-V11: coexistence with _validation, distinct keys, attach order ---
test('T-V11 _validation and _method_grounding coexist as distinct keys', () => {
  const parsed = { raw_text: 'the best offer', big_promise: 'bp' };
  const validation = validate(
    [{ field: 'raw_text', text: 'the best offer' }],
    ANTI_AI_RULES
  );
  const validated = attachValidation(parsed, validation, ISO);
  const grounding = buildAppliedGrounding({
    segments: SEGS,
    methodology_family: 'c3_value_method',
    step: 'ofv',
    query: 'q',
    retrievedAtIso: ISO
  });
  const grounded = attachMethodGrounding(validated, grounding);

  assert.ok('_validation' in grounded);
  assert.ok('_method_grounding' in grounded);
  // _validation untouched by grounding attach
  assert.deepEqual(grounded._validation, validated._validation);
  // original content keys intact
  assert.equal(
    (grounded as Record<string, unknown>).raw_text,
    'the best offer'
  );
  assert.equal((grounded as Record<string, unknown>).big_promise, 'bp');
});

test('T-V11 grounding attach does not mutate its input content', () => {
  const content = { a: 'b' };
  const before = JSON.stringify(content);
  attachMethodGrounding(
    content,
    buildUnappliedGrounding({
      reason: 'empty',
      methodology_family: 'c3_value_method',
      step: 'ofv',
      query: 'q',
      retrievedAtIso: ISO
    })
  );
  assert.equal(JSON.stringify(content), before);
  assert.equal('_method_grounding' in content, false);
});

// --- T-V13: applied=false still yields a normal persistable content object ---
test('T-V13 failed grounding still produces additive content (no gate)', () => {
  const parsed = { raw_text: 'clean copy', status_marker: 'draft' };
  const grounded = attachMethodGrounding(
    parsed,
    buildUnappliedGrounding({
      reason: 'http_5xx',
      methodology_family: 'c3_value_method',
      step: 'ofv',
      query: 'q',
      retrievedAtIso: ISO
    })
  ) as Record<string, any>;
  // content preserved, grounding recorded applied=false, nothing removed/blocked
  assert.equal(grounded.raw_text, 'clean copy');
  assert.equal(grounded.status_marker, 'draft');
  assert.equal(grounded._method_grounding.applied, false);
  assert.equal(grounded._method_grounding.reason, 'http_5xx');
});
