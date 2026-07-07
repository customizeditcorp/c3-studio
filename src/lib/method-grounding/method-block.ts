/**
 * Method grounding (F-065) — method block formatter + deterministic budget
 * (R-04/R-05/R-06).
 *
 * Serializes pre-ranked `segments` into the `## MÉTODO C3 (recuperado en vivo)`
 * block. The order the function delivers (tier + similarity) is preserved — never
 * re-ordered. Budget is deterministic: a per-segment char cap and a total block
 * cap; segments are added in order until the next would exceed the total cap
 * (best-ranked survive). Empty input -> '' (the static system prompt is used
 * unchanged, R-08).
 */
import type { MethodSegment } from './types.ts';

/** Per-segment content char cap (word-boundary truncation, '…' suffix). */
export const PER_SEGMENT_CHAR_CAP = 1200;

/** Total block char cap over the segment sub-blocks (design §5). */
export const BLOCK_TOTAL_CHAR_CAP = 5000;

const HEADER = '## MÉTODO C3 (recuperado en vivo)';

const INSTRUCTION =
  'Guía de método canónica C3 recuperada en vivo para este paso. Es la autoridad de método para esta generación: aplícala por encima de heurísticas genéricas. No cites estas rutas ni menciones que el método fue "recuperado".';

/** Truncate at a word boundary, appending '…'. Deterministic. */
function truncateAtWord(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const slice = text.slice(0, cap);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return cut.replace(/\s+$/, '') + '…';
}

/** Render a single segment sub-block (heading + content). */
function renderSegment(seg: MethodSegment): string {
  const title = seg.section_title || seg.origin_path;
  const content = truncateAtWord(seg.content ?? '', PER_SEGMENT_CHAR_CAP);
  return `### ${title} · ${seg.knowledge_layer}\n${content}`;
}

/**
 * Select the segments that fit the budget, in pre-ranked order, with per-segment
 * truncation applied. Deterministic. Used by both `buildMethodBlock` (formatting)
 * and the route (to build `_method_grounding` from the injected set — design §7).
 */
export function selectBudgetedSegments(
  segments: MethodSegment[]
): MethodSegment[] {
  const out: MethodSegment[] = [];
  if (!Array.isArray(segments)) return out;
  let total = 0;
  for (const seg of segments) {
    const truncated: MethodSegment = {
      ...seg,
      content: truncateAtWord(seg.content ?? '', PER_SEGMENT_CHAR_CAP)
    };
    const subBlockLen = renderSegment(truncated).length;
    if (total + subBlockLen > BLOCK_TOTAL_CHAR_CAP) break;
    out.push(truncated);
    total += subBlockLen;
  }
  return out;
}

/**
 * Build the augmenting method block. Empty/failed retrieval -> '' (caller omits
 * the header, design §5). The static system prompt is never modified (R-14).
 */
export function buildMethodBlock(segments: MethodSegment[]): string {
  const selected = selectBudgetedSegments(segments);
  if (selected.length === 0) return '';
  const parts = selected.map(renderSegment);
  return `${HEADER}\n\n${INSTRUCTION}\n\n${parts.join('\n\n')}`;
}

/**
 * Compose the completion's system message: static prompt untouched, method block
 * appended only when non-empty (R-04/R-14). Empty case omits the header entirely.
 */
export function composeSystemContent(
  systemPrompt: string,
  methodBlock: string
): string {
  return systemPrompt + (methodBlock ? '\n\n' + methodBlock : '');
}
