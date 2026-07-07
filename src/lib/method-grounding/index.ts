/**
 * Method grounding (F-065 / c3-studio P2, Fase 2) — public surface.
 *
 * The generate-content route consumes aeos-hq's `retrieve-method` (F-047) and
 * AUGMENTS the static `system_prompt` with canonical C3 method retrieved live.
 * Aumentativo, no-bloqueante y degradable. The static prompts are never retired
 * (that is Fase 3) and F-064's anti-AI validator is reused unchanged.
 */
export type {
  Step,
  MethodSegment,
  MethodGrounding,
  GroundingReason,
  RetrieveResult
} from './types.ts';
export { QUERY_BY_STEP } from './query-by-step.ts';
export {
  TOP_K,
  TIMEOUT_MS,
  fetchRetrieveMethod,
  type RetrieveParams,
  type RetrieveOptions
} from './retrieve-method-client.ts';
export {
  PER_SEGMENT_CHAR_CAP,
  BLOCK_TOTAL_CHAR_CAP,
  selectBudgetedSegments,
  buildMethodBlock,
  composeSystemContent
} from './method-block.ts';
export {
  GROUNDING_VERSION,
  buildAppliedGrounding,
  buildUnappliedGrounding,
  attachMethodGrounding
} from './grounding.ts';
