/**
 * Anti-AI deterministic validator (F-064 / c3-studio P1).
 *
 * Detective, deterministic content validator that materializes the C3 method's
 * Anti-AI deterministic layer (banlists, formatting, ALL-CAPS, from-x-to-y,
 * superlatives, ellipsis, emojis-in-ads). Ported from the LOGIC of the prior-art
 * `validate_copy()` routine only — client-specific sample data and the hardcoded
 * API key from that prior art are intentionally left behind (ADR-002 / R-17/R-18).
 *
 * Pure and deterministic (R-01): no LLM, no network, no clock, no global state
 * inside the scanning core. The persistence `validated_at` timestamp is injected
 * from the outside via `attachValidation` (R-14). The ruleset is a serializable
 * constant (R-11) so a future P4 feature could dump it to
 * `prompt_versions.validation_rules` without re-deriving criteria.
 */

// ---------------------------------------------------------------------------
// Types (serializable ruleset shape — R-11)
// ---------------------------------------------------------------------------

export type Severity = 'issue' | 'warning';

export type RuleCategory =
  | 'buzzword'
  | 'exaggeration'
  | 'absolute'
  | 'formatting'
  | 'all-caps'
  | 'from-x-to-y'
  | 'superlative'
  | 'emoji'
  | 'ellipsis';

export type MatchSpec =
  | { kind: 'literal'; value: string; caseInsensitive: boolean }
  | { kind: 'regex'; source: string; flags: string };

export interface RuleGuard {
  /** Skip the whole rule for this text if it contains any of these words (case-insensitive). */
  excludeIfContainsAny?: string[];
  /** Tokens that are legitimate ALL-CAPS acronyms and must not be flagged. */
  allowlist?: string[];
  /** Only flag a match when there is no digit in the same segment. */
  requireNoAdjacentDigit?: boolean;
}

export interface RuleScope {
  /** output_type patterns; a trailing `*` matches by prefix (e.g. `gbp_*`). */
  outputTypes?: string[];
}

export interface AntiAiRule {
  id: string;
  category: RuleCategory;
  severity: Severity;
  match: MatchSpec;
  message: string;
  guard?: RuleGuard;
  scope?: RuleScope;
}

export interface Finding {
  rule_id: string;
  field: string;
  snippet: string;
  message: string;
}

export interface ValidationResult {
  is_valid: boolean;
  issues: Finding[];
  warnings: Finding[];
}

export interface ScanContext {
  /** Field path being scanned (used to tag findings). */
  field?: string;
  /** output_type of the row, used for scoped rules (emoji in ads — R-09). */
  outputType?: string;
}

export interface FieldText {
  field: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Ruleset (R-11) — versioned, serializable constant
// ---------------------------------------------------------------------------

export const RULESET_VERSION = '1.0.0';

/** output_type patterns considered "ad copy" for scoped rules (emojis — R-09). */
export const ADS_SCOPE: string[] = ['campaign_copy', 'gbp_*'];

/** Legitimate acronyms that must not be flagged as ALL-CAPS (R-06). Generic, domain-level — no client tokens (R-17). */
export const SIGLA_ALLOWLIST: string[] = [
  'HVAC',
  'AC',
  'BBB',
  'GAF',
  'CSLB',
  'EPA',
  'OSHA',
  'LLC',
  'CEO',
  'SLO',
  'LA',
  'SF',
  'SD',
  // Local-marketing domain acronyms (CL-018)
  'GBP',
  'SEO',
  'NAP',
  'OFV',
  'CTA',
  'ROI',
  'PPC',
  'CRM',
  'USP',
  'FAQ',
  'SMS',
  'CTR',
  'URL'
];

/** Broad emoji detection (pictographs, symbols, dingbats, regional indicators). */
const EMOJI_REGEX_SOURCE =
  '[\\u{1F300}-\\u{1FAFF}\\u{1F000}-\\u{1F0FF}\\u{1F1E6}-\\u{1F1FF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{2190}-\\u{21FF}\\u{2300}-\\u{23FF}\\u{FE00}-\\u{FE0F}\\u{200D}]';

const BUZZWORDS: string[] = [
  'elevate your',
  'unlock',
  'harness the power',
  'cutting-edge',
  'state-of-the-art',
  'revolutionary',
  'seamless',
  'innovative',
  'game-changing',
  'leverage',
  'synergy',
  'paradigm',
  'next-level',
  'world-class',
  'industry-leading',
  'leveraging synergies',
  'optimize your workflow',
  'streamline operations'
];

/** term -> [category, message]; categories split exaggeration vs absolute per prior art intent. */
const EXAGGERATIONS: Array<[string, RuleCategory, string]> = [
  ['top 1', 'exaggeration', "Claiming 'top 1' without proof"],
  ['the best', 'exaggeration', "Superlative 'the best' is unverifiable"],
  ['the worst', 'exaggeration', "Superlative 'the worst' is exaggerated"],
  ["world's best", 'exaggeration', 'Geographic exaggeration'],
  ["nation's leading", 'exaggeration', 'Unverifiable leading claim'],
  ['everyone', 'absolute', "Absolute claim 'everyone'"],
  ['nobody', 'absolute', "Absolute claim 'nobody'"],
  ['always', 'absolute', "Absolute claim 'always'"],
  ['never', 'absolute', "Absolute claim 'never'"],
  ['100% guaranteed', 'exaggeration', 'Unrealistic guarantee'],
  ['perfect', 'absolute', "Absolute claim 'perfect'"],
  ['zero defects', 'exaggeration', 'Unrealistic zero-defects claim']
];

function slug(term: string): string {
  return term
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function literalRule(
  id: string,
  category: RuleCategory,
  severity: Severity,
  value: string,
  message: string,
  extra?: Partial<AntiAiRule>
): AntiAiRule {
  return {
    id,
    category,
    severity,
    match: { kind: 'literal', value, caseInsensitive: true },
    message,
    ...extra
  };
}

export const ANTI_AI_RULES: AntiAiRule[] = [
  // --- AI buzzwords (issue) — R-02
  ...BUZZWORDS.map((w) =>
    literalRule(
      `buzzword.${slug(w)}`,
      'buzzword',
      'issue',
      w,
      `AI buzzword detected: '${w}'`
    )
  ),
  // --- Exaggerations / absolutes (issue) — R-03
  ...EXAGGERATIONS.map(([term, category, message]) =>
    literalRule(`${category}.${slug(term)}`, category, 'issue', term, message)
  ),
  // --- "#1" without proof, excluding license numbers (issue) — R-04
  {
    id: 'exaggeration.number-one',
    category: 'exaggeration',
    severity: 'issue',
    match: { kind: 'regex', source: '#1(?!\\d)', flags: 'g' },
    message: "Claiming '#1' without proof"
  },
  // --- Forbidden formatting (issue) — R-05
  literalRule(
    'formatting.em-dash',
    'formatting',
    'issue',
    '—',
    'Em dash detected: use a regular dash (-) or comma'
  ),
  literalRule(
    'formatting.en-dash',
    'formatting',
    'issue',
    '–',
    'En dash detected: use a regular dash (-) or comma'
  ),
  {
    id: 'formatting.double-space',
    category: 'formatting',
    severity: 'issue',
    match: { kind: 'regex', source: ' {2,}', flags: 'g' },
    message: 'Multiple consecutive spaces detected'
  },
  {
    id: 'formatting.multiple-exclamation',
    category: 'formatting',
    severity: 'issue',
    match: { kind: 'regex', source: '!{2,}', flags: 'g' },
    message: 'Multiple exclamation marks detected'
  },
  // --- ALL-CAPS with acronym allowlist (issue if >=3, warning if 1-2) — R-06
  {
    id: 'all-caps.excessive',
    category: 'all-caps',
    severity: 'issue',
    match: {
      kind: 'regex',
      source: '\\b[A-Z0-9]*[A-Z][A-Z0-9]*\\b',
      flags: 'g'
    },
    message: 'ALL-CAPS word(s) detected',
    guard: { allowlist: SIGLA_ALLOWLIST }
  },
  // --- from X to Y, context-aware (warning) — R-07
  {
    id: 'from-x-to-y.range',
    category: 'from-x-to-y',
    severity: 'warning',
    match: { kind: 'regex', source: '\\bfrom\\b.+?\\bto\\b', flags: 'gi' },
    message: "Review 'from ... to' usage (possible geographic/vague range)",
    guard: {
      excludeIfContainsAny: [
        'days',
        'hours',
        'minutes',
        'weeks',
        'months',
        'years',
        'anxious',
        'worried',
        'stressed',
        'frustrated'
      ]
    }
  },
  // --- Vague superlatives without numbers (warning) — R-08
  {
    id: 'superlative.vague',
    category: 'superlative',
    severity: 'warning',
    match: {
      kind: 'regex',
      source: '\\b(incredible|amazing|unbelievable|greatest)\\b',
      flags: 'gi'
    },
    message: 'Vague superlative without a supporting number',
    guard: { requireNoAdjacentDigit: true }
  },
  // --- Ellipsis in the middle of the text (warning) — R-08
  {
    id: 'ellipsis.mid-text',
    category: 'ellipsis',
    severity: 'warning',
    match: { kind: 'regex', source: '\\.\\.\\.', flags: 'g' },
    message: 'Ellipsis detected in the middle of the text'
  },
  // --- Emojis, scoped to ad copy (warning) — R-09
  {
    id: 'emoji.in-ads',
    category: 'emoji',
    severity: 'warning',
    match: { kind: 'regex', source: EMOJI_REGEX_SOURCE, flags: 'gu' },
    message: 'Emoji detected in ad copy',
    scope: { outputTypes: ADS_SCOPE }
  }
];

// ---------------------------------------------------------------------------
// Pure scanning core (R-01, R-10)
// ---------------------------------------------------------------------------

function scopeMatches(
  scope: RuleScope | undefined,
  outputType: string | undefined
): boolean {
  if (!scope || !scope.outputTypes || scope.outputTypes.length === 0)
    return true;
  if (!outputType) return false;
  return scope.outputTypes.some((pattern) => {
    if (pattern.endsWith('*'))
      return outputType.startsWith(pattern.slice(0, -1));
    return outputType === pattern;
  });
}

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return prefix + text.slice(start, end).replace(/\s+/g, ' ').trim() + suffix;
}

/** Split into coarse segments (sentence-ish) for adjacent-digit checks. */
function segmentContainingDigitAt(text: string, index: number): boolean {
  const segments = text.split(/[.!?\n]+/);
  let cursor = 0;
  for (const seg of segments) {
    const segStart = text.indexOf(seg, cursor);
    const segEnd = segStart + seg.length;
    if (index >= segStart && index <= segEnd) {
      return /\d/.test(seg);
    }
    cursor = segEnd;
  }
  return /\d/.test(text);
}

function collectRegexMatches(
  text: string,
  source: string,
  flags: string
): Array<{ value: string; index: number }> {
  const globalFlags = flags.includes('g') ? flags : flags + 'g';
  const re = new RegExp(source, globalFlags);
  const out: Array<{ value: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ value: m[0], index: m.index });
    if (m.index === re.lastIndex) re.lastIndex++; // avoid zero-width loop
  }
  return out;
}

/** Scan a single text with the ruleset. Returns findings tagged with `ctx.field`. */
export function scanText(
  text: string,
  rules: AntiAiRule[],
  ctx: ScanContext = {}
): Finding[] {
  const findings: Finding[] = [];
  if (typeof text !== 'string' || text.length === 0) return findings;
  const field = ctx.field ?? '';
  const lower = text.toLowerCase();

  for (const rule of rules) {
    if (!scopeMatches(rule.scope, ctx.outputType)) continue;

    // Guard: skip whole rule if excluded word present (from-x-to-y context-aware).
    if (
      rule.guard?.excludeIfContainsAny &&
      rule.guard.excludeIfContainsAny.length > 0
    ) {
      const excluded = rule.guard.excludeIfContainsAny.some((w) =>
        lower.includes(w.toLowerCase())
      );
      if (excluded) continue;
    }

    // Special handling: ALL-CAPS count-dependent severity (R-06).
    if (rule.category === 'all-caps') {
      const allowlist = rule.guard?.allowlist ?? [];
      const capsWords: Array<{ value: string; index: number }> = [];
      for (const mm of collectRegexMatches(
        text,
        rule.match.kind === 'regex' ? rule.match.source : '',
        'g'
      )) {
        const token = mm.value;
        const letters = token.replace(/[^A-Za-z]/g, '');
        if (
          letters.length > 2 &&
          token === token.toUpperCase() &&
          !/[a-z]/.test(token) &&
          !allowlist.includes(token)
        ) {
          capsWords.push(mm);
        }
      }
      if (capsWords.length >= 3) {
        findings.push({
          rule_id: rule.id,
          field,
          snippet: capsWords.map((w) => w.value).join(', '),
          message: `Too many ALL-CAPS words: ${capsWords.map((w) => w.value).join(', ')}`
        });
      } else {
        for (const w of capsWords) {
          findings.push({
            rule_id: rule.id,
            field,
            snippet: w.value,
            message: `ALL-CAPS word detected: '${w.value}'`
          });
        }
      }
      continue;
    }

    // Special handling: ellipsis only when NOT the trailing content (R-08),
    // faithful to prior art (single flag per text).
    if (rule.id === 'ellipsis.mid-text') {
      if (text.includes('...') && !text.trim().endsWith('...')) {
        const idx = text.indexOf('...');
        findings.push({
          rule_id: rule.id,
          field,
          snippet: snippetAround(text, idx, 3),
          message: rule.message
        });
      }
      continue;
    }

    // Literal match (case-insensitive substring, faithful to prior art).
    if (rule.match.kind === 'literal') {
      const needle = rule.match.caseInsensitive
        ? rule.match.value.toLowerCase()
        : rule.match.value;
      const haystack = rule.match.caseInsensitive ? lower : text;
      let idx = haystack.indexOf(needle);
      while (idx !== -1) {
        findings.push({
          rule_id: rule.id,
          field,
          snippet: snippetAround(text, idx, rule.match.value.length),
          message: rule.message
        });
        idx = haystack.indexOf(needle, idx + Math.max(1, needle.length));
      }
      continue;
    }

    // Regex match.
    const matches = collectRegexMatches(
      text,
      rule.match.source,
      rule.match.flags
    );
    for (const mm of matches) {
      if (
        rule.guard?.requireNoAdjacentDigit &&
        segmentContainingDigitAt(text, mm.index)
      ) {
        continue;
      }
      findings.push({
        rule_id: rule.id,
        field,
        snippet: snippetAround(text, mm.index, mm.value.length),
        message: rule.message
      });
    }
  }

  return findings;
}

/**
 * Validate a list of extracted fields. Pure: `is_valid = issues.length === 0`;
 * warnings never affect validity (R-10). No clock, no I/O.
 */
export function validate(
  fields: FieldText[],
  rules: AntiAiRule[],
  ctx: ScanContext = {}
): ValidationResult {
  const issues: Finding[] = [];
  const warnings: Finding[] = [];
  for (const { field, text } of fields) {
    const findings = scanText(text, rules, {
      field,
      outputType: ctx.outputType
    });
    for (const f of findings) {
      const rule = rules.find((r) => r.id === f.rule_id);
      // ALL-CAPS escalates to issue only when 3+ (message carries "Too many"); otherwise warning.
      const isCapsWarning =
        rule?.category === 'all-caps' && !f.message.startsWith('Too many');
      const severity: Severity = isCapsWarning
        ? 'warning'
        : (rule?.severity ?? 'issue');
      if (severity === 'issue') issues.push(f);
      else warnings.push(f);
    }
  }
  return { is_valid: issues.length === 0, issues, warnings };
}

// ---------------------------------------------------------------------------
// Field extractors per shape (R-12, R-13)
// ---------------------------------------------------------------------------

const OFFERS_TEXT_FIELDS: string[] = [
  'big_promise',
  'vehicle_name',
  'vehicle_description',
  'quick_win',
  'decision_frame',
  'guarantee',
  'urgency',
  'social_proof',
  'deliverables'
];

/** Recursively collect string leaves of a JSON value, in stable (sorted-key) order. */
function flattenStrings(
  value: unknown,
  path: string,
  out: FieldText[],
  skipTopLevelKeys?: Set<string>
): void {
  if (typeof value === 'string') {
    if (value.length > 0) out.push({ field: path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => flattenStrings(item, `${path}[${i}]`, out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      if (skipTopLevelKeys && skipTopLevelKeys.has(key)) continue;
      flattenStrings(
        (value as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        out
      );
    }
  }
}

/**
 * Extract scannable fields for the `offers` shape (R-12): the 9 named text
 * columns (stable order) + `content.raw_text` + remaining string leaves of the
 * `content` jsonb. NEVER reads a `raw_text` column — it does not exist (F-058).
 */
export function extractOffersFields(row: Record<string, unknown>): FieldText[] {
  const out: FieldText[] = [];
  for (const field of OFFERS_TEXT_FIELDS) {
    const v = row[field];
    if (typeof v === 'string' && v.length > 0) out.push({ field, text: v });
  }
  const content = row.content;
  if (
    content !== null &&
    typeof content === 'object' &&
    !Array.isArray(content)
  ) {
    const c = content as Record<string, unknown>;
    if (typeof c.raw_text === 'string' && c.raw_text.length > 0) {
      out.push({ field: 'content.raw_text', text: c.raw_text });
    }
    // Remaining string leaves of content, excluding raw_text and the 9 named
    // fields (already scanned above) to avoid duplication.
    const skip = new Set<string>([
      ...OFFERS_TEXT_FIELDS,
      'raw_text',
      '_validation'
    ]);
    flattenStrings(content, 'content', out, skip);
  }
  return out;
}

/**
 * Extract scannable fields for the `generated_outputs` shape (R-13): all string
 * leaves of the `content` jsonb, in stable order. `output_type` is used as
 * context for scoped rules (emojis — R-09).
 */
export function extractGeneratedOutputFields(
  row: Record<string, unknown>
): FieldText[] {
  const out: FieldText[] = [];
  const content = row.content;
  if (content !== null && typeof content === 'object') {
    flattenStrings(content, 'content', out, new Set<string>(['_validation']));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistence helper (R-14, R-16) — pure; the ISO clock read happens in the route
// ---------------------------------------------------------------------------

export interface PersistedValidation {
  is_valid: boolean;
  issues: Finding[];
  warnings: Finding[];
  ruleset_version: string;
  validated_at: string;
}

/**
 * Return a new `content` object with `_validation` appended (additive — R-14/R-16).
 * Only the `content` jsonb is touched; no new columns/tables. `validatedAtIso`
 * is injected from the persistence layer so this stays pure/deterministic (R-01).
 */
export function attachValidation(
  content: Record<string, unknown>,
  result: ValidationResult,
  validatedAtIso: string
): Record<string, unknown> {
  const _validation: PersistedValidation = {
    is_valid: result.is_valid,
    issues: result.issues,
    warnings: result.warnings,
    ruleset_version: RULESET_VERSION,
    validated_at: validatedAtIso
  };
  return { ...content, _validation };
}
