/**
 * F-102 — Pure seam: OpenAI generation parameters for the generate-content call (R-01/R-02/R-03).
 *
 * The generate-content generation (shared by the 10 upstream steps) historically set no
 * `temperature`, defaulting to the provider's 1.0 (high sampling variance -> generic copy).
 * DT-01 fixes a low-but-alive value, env-overridable with a robust constant fallback.
 * A DEDICATED seam (not the GBP one): env `OPENAI_CONTENT_TEMPERATURE` governs the 10
 * non-GBP steps, keeping F-095's `OPENAI_GBP_TEMPERATURE`/`resolveGbpTemperature` intact.
 *
 * Unit-testable without importing the route (which pulls in `next/server`).
 */

/** DT-01 — low-but-alive default for the mixed factual+creative upstream copy. */
export const DEFAULT_CONTENT_TEMPERATURE = 0.4;

/**
 * Resolves the generate-content temperature from an env value. Any invalid source
 * (absent, empty/whitespace-only, non-numeric) falls back to
 * `DEFAULT_CONTENT_TEMPERATURE` and never throws (R-02).
 */
export function resolveContentTemperature(raw: string | undefined): number {
  // Guard empty/whitespace-only explicitly: `Number('')` is 0 (finite) but an empty
  // env var is "unset" and must fall back to the default, not to 0 (R-02).
  if (raw == null || raw.trim().length === 0)
    return DEFAULT_CONTENT_TEMPERATURE;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_CONTENT_TEMPERATURE;
}
