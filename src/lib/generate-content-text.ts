/**
 * Normalizes API /generate-content response for UI text fields (descriptions, posts, etc.).
 */
export function textFromGenerateContentResult(result: {
  raw_text?: string;
  content?: unknown;
  generated_text?: string;
}): string {
  if (typeof result.raw_text === 'string' && result.raw_text.trim()) {
    return result.raw_text.trim();
  }
  if (typeof result.generated_text === 'string' && result.generated_text.trim()) {
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
    try {
      return JSON.stringify(c);
    } catch {
      return '';
    }
  }
  return '';
}
