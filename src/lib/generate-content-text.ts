import type { GenerateContentResponse } from '@/types/generate-content';

/**
 * Normalizes API /generate-content response for UI text fields (descriptions, posts, etc.).
 */
export function textFromGenerateContentResult(
  result: Partial<GenerateContentResponse> & {
    generated_text?: string;
  }
): string {
  if (typeof result.raw_text === 'string' && result.raw_text.trim()) {
    return result.raw_text.trim();
  }
  if (
    typeof result.generated_text === 'string' &&
    result.generated_text.trim()
  ) {
    return result.generated_text.trim();
  }
  const c = result.content;
  if (typeof c === 'string' && c.trim()) return c.trim();
  if (c != null && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    if (typeof o.generated_text === 'string' && o.generated_text.trim()) {
      return o.generated_text.trim();
    }
    if (typeof o.raw_text === 'string' && o.raw_text.trim()) {
      return o.raw_text.trim();
    }
    // Structured outputs (e.g. gbp_description) carry the human text in
    // `description` / `short_description`. Read those before falling back to a
    // raw JSON.stringify, which would surface the whole object to the UI.
    if (typeof o.description === 'string' && o.description.trim()) {
      return o.description.trim();
    }
    if (typeof o.short_description === 'string' && o.short_description.trim()) {
      return o.short_description.trim();
    }
    try {
      return JSON.stringify(c);
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Extracts the GBP description paragraph from a /generate-content result for the
 * `gbp_description` step. The model returns a structured object
 * ({ description, short_description, suggested_services, ... }) and the API sets
 * `raw_text` to the whole JSON string when the object has no `raw_text` field —
 * so the generic helper's `raw_text` early-return would surface raw JSON in the
 * UI. This reads the structured `description` first, then falls back.
 */
export function gbpDescriptionFromResult(
  result: Partial<GenerateContentResponse> & { generated_text?: string }
): string {
  const c = result?.content;
  if (c != null && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    if (typeof o.description === 'string' && o.description.trim()) {
      return o.description.trim();
    }
    if (typeof o.short_description === 'string' && o.short_description.trim()) {
      return o.short_description.trim();
    }
  }
  return textFromGenerateContentResult(result);
}
