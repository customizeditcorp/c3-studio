/**
 * F-102 — Pure seam: parse the generate-content model output (R-12/R-13).
 *
 * Extracts the strip+parse+fallback that historically lived inline in
 * `generate-content/route.ts` (the try/catch), exposing an `ok` flag so the route can
 * decide whether to retry. The `ok:false` contract is byte-identical to the previous
 * `catch` branch (`{ generated_text: <text> }`, `rawText = <text>`) so downstream
 * persistence is unchanged (no-regression, R-15).
 *
 * Unit-testable without importing the route (which pulls in `next/server`).
 */

export interface ParsedGeneratedContent {
  /** false = empty response or parse-fail (output NOT usable). */
  ok: boolean;
  /** parsed object, or the fallback `{ generated_text }` blob. */
  content: Record<string, unknown>;
  rawText: string;
}

/**
 * Pure, node --test-able. On usable output returns the parsed object; on empty or
 * parse-fail returns the byte-identical fallback of the previous inline catch (R-12/R-15).
 */
export function parseGeneratedContent(
  responseText: string
): ParsedGeneratedContent {
  const text = responseText ?? '';
  if (text.trim().length === 0) {
    // Empty response -> NOT usable (R-06); fallback blob (R-08).
    return { ok: false, content: { generated_text: text }, rawText: text };
  }
  try {
    // R-13 belt-and-suspenders: strip ```json / ``` fences defensively even with
    // `response_format: json_object` active (drift / env-disabled response_format).
    const cleaned = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const rawText = (parsed.raw_text as string) || text;
    return { ok: true, content: parsed, rawText };
  } catch {
    // Parse-fail -> NOT usable (R-06); byte-identical fallback of the old catch (R-08/R-15).
    return { ok: false, content: { generated_text: text }, rawText: text };
  }
}
