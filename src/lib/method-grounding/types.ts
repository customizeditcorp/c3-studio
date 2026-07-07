/**
 * Method grounding (F-065 / c3-studio P2, Fase 2) — shared types.
 *
 * The generate-content route consumes the aeos-hq `retrieve-method` edge function
 * (F-047) and AUGMENTS the static `system_prompt` of each step with canonical C3
 * method retrieved live. Aumentativo, no-bloqueante y degradable: any failure ->
 * empty block + `applied=false`, generation proceeds with the static prompt.
 *
 * These types are serializable and free of client/industry signals (R-15).
 */

/** The 11 generation steps that are grounded uniformly (R-03). */
export type Step =
  | 'ofv'
  | 'buyer_persona'
  | 'brief'
  | 'gbp_description'
  | 'campaign_copy'
  | 'gbp_posts'
  | 'social_content'
  | 'nurturing'
  | 'website_home'
  | 'website_service'
  | 'website_location';

/**
 * A method segment as returned by `retrieve-method` (F-047 §3 response shape),
 * pre-ranked by (tier, similarity) and canonical-only (v2).
 */
export interface MethodSegment {
  content: string;
  section_title: string | null;
  origin_path: string;
  knowledge_layer: string;
  similarity: number;
}

/** Failure reasons produced by the retrieval client itself (design §6). */
export type FetchFailReason =
  | 'timeout'
  | 'network'
  | 'http_4xx'
  | 'http_5xx'
  | 'malformed'
  | 'empty'
  | 'not_configured';

/** Failure reasons produced by the pre-call guard in the route (R-09). */
export type GuardReason = 'no_methodology' | 'unknown_step';

/** Every reason that can surface in `_method_grounding.reason`. */
export type GroundingReason = FetchFailReason | GuardReason;

/** Discriminated result of a retrieval attempt (design §6). */
export type RetrieveResult =
  | { ok: true; segments: MethodSegment[] }
  | { ok: false; reason: FetchFailReason };

/**
 * Additive measurement hook appended to `content._method_grounding` (design §7).
 * Coexists with F-064's `content._validation` as a distinct key (R-11).
 */
export interface MethodGrounding {
  applied: boolean;
  n_segments: number;
  methodology_family: string | null;
  step: string;
  query: string | null;
  origin_paths: string[];
  knowledge_layers: string[];
  /** [max, min] similarity of the injected segments, or null when none. */
  similarity_range: [number, number] | null;
  grounding_version: string;
  retrieved_at: string;
  reason: GroundingReason | null;
}
