/**
 * F-065 method grounding — block format (T-V04), budget/truncation (T-V05),
 * and augment-with-static-intact (T-V06).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMethodBlock,
  selectBudgetedSegments,
  composeSystemContent,
  PER_SEGMENT_CHAR_CAP,
  BLOCK_TOTAL_CHAR_CAP
} from '../../src/lib/method-grounding/method-block.ts';
import type { MethodSegment } from '../../src/lib/method-grounding/types.ts';

const seg = (over: Partial<MethodSegment>): MethodSegment => ({
  content: 'contenido',
  section_title: 'Título',
  origin_path: 'protocols/x.md',
  knowledge_layer: 'source_foundational',
  similarity: 0.7,
  ...over
});

// --- T-V04: format ---
test('T-V04 block has header, instruction and one sub-block per segment in order', () => {
  const segments = [
    seg({
      section_title: 'Uno',
      knowledge_layer: 'source_foundational',
      content: 'aaa'
    }),
    seg({
      section_title: 'Dos',
      knowledge_layer: 'protocol_canonical',
      content: 'bbb'
    })
  ];
  const block = buildMethodBlock(segments);
  assert.ok(block.startsWith('## MÉTODO C3 (recuperado en vivo)'));
  assert.ok(block.includes('No cites estas rutas'));
  assert.ok(block.includes('### Uno · source_foundational\naaa'));
  assert.ok(block.includes('### Dos · protocol_canonical\nbbb'));
  // order preserved (Uno before Dos)
  assert.ok(block.indexOf('### Uno') < block.indexOf('### Dos'));
});

test('T-V04 falls back to origin_path when section_title is null', () => {
  const block = buildMethodBlock([
    seg({
      section_title: null,
      origin_path: 'source/foundations.md',
      content: 'z'
    })
  ]);
  assert.ok(block.includes('### source/foundations.md · source_foundational'));
});

test('T-V04 empty segments -> empty string (header omitted)', () => {
  assert.equal(buildMethodBlock([]), '');
});

// --- T-V05: budget + deterministic truncation ---
test('T-V05 per-segment content truncated to cap with word boundary + ellipsis', () => {
  const long = 'palabra '.repeat(400); // ~3200 chars
  const block = buildMethodBlock([seg({ content: long })]);
  // extract the content line
  const contentPart = block.split('source_foundational\n')[1];
  assert.ok(
    contentPart.length <= PER_SEGMENT_CHAR_CAP + 1,
    'over per-segment cap'
  );
  assert.ok(contentPart.endsWith('…'), 'expected ellipsis suffix');
});

test('T-V05 total cap keeps best-ranked and omits the rest, deterministically', () => {
  // 5 segments each ~1200 chars -> only the first few fit under 5000.
  const big = 'x'.repeat(PER_SEGMENT_CHAR_CAP);
  const segments = [0, 1, 2, 3, 4].map((i) =>
    seg({ section_title: `S${i}`, content: big, similarity: 0.9 - i * 0.1 })
  );
  const selected = selectBudgetedSegments(segments);
  // sub-block length ~ 1200 + heading; 5000/~1230 -> 4 fit at most, likely 4.
  assert.ok(selected.length >= 1 && selected.length < 5, 'some omitted');
  // best-ranked survive (prefix of the input order)
  selected.forEach((s, i) => assert.equal(s.section_title, `S${i}`));
  // deterministic across runs
  const a = buildMethodBlock(segments);
  const b = buildMethodBlock(segments);
  assert.equal(a, b);
  assert.ok(a.length <= BLOCK_TOTAL_CHAR_CAP + 500, 'block near total cap');
});

// --- T-V06: augment with static prompt intact ---
test('T-V06 systemContent = static prompt + block, static untouched', () => {
  const staticPrompt = 'ROLE: OFV Creator\nInstructions...';
  const block = buildMethodBlock([seg({ content: 'metodo' })]);
  const composed = composeSystemContent(staticPrompt, block);
  assert.ok(composed.startsWith(staticPrompt));
  assert.equal(composed, staticPrompt + '\n\n' + block);
});

test('T-V06 empty block -> systemContent === static prompt', () => {
  const staticPrompt = 'ROLE: OFV Creator';
  assert.equal(composeSystemContent(staticPrompt, ''), staticPrompt);
});
