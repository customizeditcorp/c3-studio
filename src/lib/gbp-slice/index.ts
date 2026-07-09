/**
 * F-066 — Slice vertical OFV→GBP→preview — public surface.
 *
 * Pure, dependency-free building blocks (guard, context reader, operational-state
 * model, prompt assembly, profile production, transitions). The orchestration lives
 * in `src/app/api/generate-gbp/route.ts` (generation) and the preview approval
 * routes (transition). CONSUME upstream, never re-decide strategy (R-02/R-04);
 * never build/publish or mutate external systems (R-14).
 */
export type {
  RawOfferRow,
  RawBrandboard,
  RawClient,
  RawPhoto,
  NormalizedOffer
} from './types.ts';
export {
  isOfferNonEmpty,
  selectEligibleOffer,
  checkPrecondition,
  type PreconditionReason,
  type PreconditionResult
} from './precondition.ts';
export {
  readOperationalStateGbp,
  assertNoSecrets,
  FORBIDDEN_OP_STATE_KEYS,
  type OperationalState,
  type OpStatus,
  type ManagedBy,
  type GbpReadinessSignal
} from './operational-state.ts';
export {
  normalizeOffer,
  resolveLogo,
  resolveMedia,
  readGbpContext,
  type GbpContext,
  type LogoResolution,
  type MediaResolution
} from './context.ts';
export {
  GBP_REQUIRED_FIELDS,
  buildGbpSystemPrompt,
  buildGbpUserMessage
} from './prompt.ts';
export {
  GbpDomainError,
  parseGbpJson,
  toGbpProfileRow,
  buildPreviewSnapshot,
  assetStatusForDecision,
  assertGbpScope,
  ASSET_STATUS_ON_PREVIEW,
  SLICE_ASSET_TYPE,
  type GbpProfileInsert
} from './profile.ts';
