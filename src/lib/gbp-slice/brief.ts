/**
 * F-095 — Pure seam: extract Scope-A facts from an APPROVED brief (R-01/R-02/R-03).
 *
 * The ONLY place that knows the brief field names and the "no inventes datos" rule.
 * Framework-free and unit-testable without DOM (pattern of `normalizeOffer`/`resolveLogo`).
 *
 * Scope-A = licencia/certificaciones, años de experiencia, diferenciadores, garantías,
 * casos de éxito. The generator downstream must reflect these trust factors — but only
 * when present and non-empty; absent/blank/non-string fields are OMITTED (R-02), never
 * filled with a placeholder. Brief absent/null -> `{}` (R-03).
 */
import type { RawBriefRow, BriefFacts } from './types.ts';

/** The 5 Scope-A field keys of `briefs.content` (order = render order). */
export const BRIEF_FACT_KEYS = [
  'licenses',
  'years_experience',
  'differentiators',
  'guarantees',
  'success_cases'
] as const satisfies readonly (keyof BriefFacts)[];

/** Human-readable ES labels for each Scope-A fact (used by the user-message render). */
export const BRIEF_FACT_LABELS: Record<keyof BriefFacts, string> = {
  licenses: 'Licencia/certificaciones',
  years_experience: 'Años de experiencia',
  differentiators: 'Diferenciadores',
  guarantees: 'Garantías',
  success_cases: 'Casos de éxito'
};

/**
 * Defensively resolves `briefs.content` to a flat object. Mirrors the UI's
 * `parseContentToFields`: if `content` is a string, `JSON.parse` inside try/catch;
 * invalid string or non-object -> `{}`.
 */
function toContentObject(
  content: RawBriefRow['content']
): Record<string, unknown> {
  if (!content) return {};
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof content === 'object' ? content : {};
}

/**
 * Extracts ONLY the Scope-A facts that are present and non-empty (R-01/R-02).
 * `brief === null`/absent -> `{}` (R-03). Values are trimmed; blank/non-string -> omitted.
 */
export function resolveBriefFacts(brief: RawBriefRow | null): BriefFacts {
  if (!brief) return {};
  const obj = toContentObject(brief.content);
  const facts: BriefFacts = {};
  for (const key of BRIEF_FACT_KEYS) {
    const raw = obj[key];
    if (typeof raw !== 'string') continue; // R-02: non-string -> omit
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue; // R-02: empty/blank -> omit
    facts[key] = trimmed;
  }
  return facts;
}
