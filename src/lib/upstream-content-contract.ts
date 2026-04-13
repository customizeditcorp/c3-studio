export type UpstreamDisplayMode = 'editable-text' | 'structured-view';

export function getCanonicalEditableText(
  content: unknown,
  rawText?: string | null
): string {
  if (typeof rawText === 'string' && rawText.trim()) {
    return rawText.trim();
  }

  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;
    if (typeof record.raw_text === 'string' && record.raw_text.trim()) {
      return record.raw_text.trim();
    }
    return JSON.stringify(content, null, 2);
  }

  return typeof content === 'string' ? content : String(content || '');
}

export function getCanonicalStructuredContent<T>(content: unknown): T | null {
  if (!content) return null;

  if (typeof content === 'string') {
    try {
      return JSON.parse(content) as T;
    } catch {
      return null;
    }
  }

  if (typeof content === 'object') {
    return content as T;
  }

  return null;
}

export function explainUpstreamDisplayRule(mode: UpstreamDisplayMode): string {
  if (mode === 'editable-text') {
    return 'Use raw_text as canonical editable text. Fall back to content-derived text only when raw_text is missing.';
  }

  return 'Use content as canonical structured source for cards/views. Do not parse human-editable text as primary structured truth unless no structured content exists.';
}
