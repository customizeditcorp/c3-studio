/**
 * F-095 — Pure seam: OpenAI generation parameters for the GBP asset (R-07/R-08).
 *
 * The GBP generation historically set no `temperature`, defaulting to the provider's
 * 1.0 (high sampling variance -> generic copy). DT-01 fixes a low/controlled value,
 * env-overridable with a robust constant fallback (pattern of `OPENAI_MODEL`).
 *
 * Unit-testable without importing the route (which pulls in `next/server`).
 */

/** DT-01 — low-but-alive default for grounded, natural marketing copy. */
export const DEFAULT_GBP_TEMPERATURE = 0.3;

/**
 * Resolves the GBP generation temperature from an env value. Any invalid source
 * (absent, empty, non-numeric) falls back to `DEFAULT_GBP_TEMPERATURE` and never
 * throws (R-08).
 */
export function resolveGbpTemperature(raw: string | undefined): number {
  // Guard empty/whitespace-only explicitly: `Number('')` is 0 (finite) but an empty
  // env var is "unset" and must fall back to the default, not to 0 (R-08).
  if (raw == null || raw.trim().length === 0) return DEFAULT_GBP_TEMPERATURE;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_GBP_TEMPERATURE;
}
