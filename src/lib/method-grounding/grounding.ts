/**
 * Method grounding (F-065) — `content._method_grounding` hook + shape
 * (R-09/R-10/R-11).
 *
 * `attachMethodGrounding` is a pure helper analogous to F-064's `attachValidation`;
 * `retrieved_at` (ISO) is injected from the route so this stays pure. It MUST run
 * AFTER `attachValidation` so F-064's extractor never scans this metadata (R-11);
 * F-064 is not modified (R-16).
 */
import type {
  GroundingReason,
  MethodGrounding,
  MethodSegment
} from './types.ts';

/** Versions the grounding logic (analogous to F-064's ruleset_version). */
export const GROUNDING_VERSION = '1.0.0';

/** Build the `applied=true` grounding record from the injected segments. */
export function buildAppliedGrounding(args: {
  segments: MethodSegment[];
  methodology_family: string;
  step: string;
  query: string;
  retrievedAtIso: string;
}): MethodGrounding {
  const sims = args.segments
    .map((s) => s.similarity)
    .filter((n): n is number => typeof n === 'number');
  return {
    applied: true,
    n_segments: args.segments.length,
    methodology_family: args.methodology_family,
    step: args.step,
    query: args.query,
    origin_paths: args.segments.map((s) => s.origin_path),
    knowledge_layers: args.segments.map((s) => s.knowledge_layer),
    similarity_range: sims.length
      ? [Math.max(...sims), Math.min(...sims)]
      : null,
    grounding_version: GROUNDING_VERSION,
    retrieved_at: args.retrievedAtIso,
    reason: null
  };
}

/** Build an `applied=false` grounding record for any guard/failure branch. */
export function buildUnappliedGrounding(args: {
  reason: GroundingReason;
  methodology_family: string | null;
  step: string;
  query: string | null;
  retrievedAtIso: string;
}): MethodGrounding {
  return {
    applied: false,
    n_segments: 0,
    methodology_family: args.methodology_family,
    step: args.step,
    query: args.query,
    origin_paths: [],
    knowledge_layers: [],
    similarity_range: null,
    grounding_version: GROUNDING_VERSION,
    retrieved_at: args.retrievedAtIso,
    reason: args.reason
  };
}

/**
 * Return a new `content` object with `_method_grounding` appended (additive).
 * Does not mutate the input; coexists with `_validation` as a distinct key (R-11).
 */
export function attachMethodGrounding(
  content: Record<string, unknown>,
  grounding: MethodGrounding
): Record<string, unknown> {
  return { ...content, _method_grounding: grounding };
}
