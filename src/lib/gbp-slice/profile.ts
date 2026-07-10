/**
 * F-066 — Producción del asset GBP + preview + transición (R-10..R-14).
 *
 * Pure logic for: parsing the model output, mapping it to a `gbp_profiles` insert
 * with EXPLICIT failure BEFORE any write (R-11 — blindaje F-058), building the
 * `previews.data` snapshot (R-12), deciding the `client_assets` status transition on
 * client decision (R-13), and enforcing the slice's asset scope (R-14).
 */
import type { GbpContext } from './context.ts';
import { GBP_REQUIRED_FIELDS } from './prompt.ts';
import type { AssetType, AssetStatus } from '@/types/c3-domain';

/** Domain error: legible, thrown BEFORE persisting anything (R-11). */
export class GbpDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GbpDomainError';
  }
}

/** Parses the model's JSON output (strips code fences). Throws a legible domain
 * error on unparseable output so the route never writes a partial row (R-11). */
export function parseGbpJson(text: string): Record<string, unknown> {
  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not-an-object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new GbpDomainError(
      'GBP generation produced non-JSON / malformed output; aborting before write (R-11).'
    );
  }
}

/** Shape written to `gbp_profiles` (live-schema columns only; NO tenant_id/status). */
export interface GbpProfileInsert {
  client_id: string;
  business_name: string;
  primary_category: string;
  secondary_categories: string[];
  description: string;
  short_description: string;
  services: unknown;
  service_area: unknown;
  from_the_business: string | null;
  phone: string | null;
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function nonEmptyValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

/** Coerces a jsonb value (expected: string[]) into a filtered string array. */
function toCityArray(v: unknown): string[] {
  return Array.isArray(v) ? (v.filter(nonEmptyString) as string[]) : [];
}

/**
 * R-06 — Maps the model's category keys to the domain shape. The live raw (Fase 0)
 * shows OpenAI emits `suggested_categories: string[]`; a legacy `primary_category`
 * (+ `secondary_categories`) shape is accepted as a robust fallback (map-in-parser:
 * we do not depend on the model emitting exact keys).
 */
function mapCategories(parsed: Record<string, unknown>): {
  primary: string | undefined;
  secondary: string[];
} {
  const source: unknown[] = Array.isArray(parsed.suggested_categories)
    ? (parsed.suggested_categories as unknown[])
    : [
        parsed.primary_category,
        ...(Array.isArray(parsed.secondary_categories)
          ? (parsed.secondary_categories as unknown[])
          : [])
      ];
  const categories = source.filter(nonEmptyString) as string[];
  return { primary: categories[0], secondary: categories.slice(1) };
}

/**
 * R-04/R-05 — Effective `service_area`: use the model's value if non-empty; else
 * seed from `client.service_area_cities` as `{ cities: [...] }`. Returns `undefined`
 * when neither source is available, so the R-11 guard aborts before any write.
 */
function computeServiceArea(
  fromModel: unknown,
  clientCities: unknown
): unknown | undefined {
  if (nonEmptyValue(fromModel)) return fromModel;
  const cities = toCityArray(clientCities);
  return cities.length > 0 ? { cities } : undefined;
}

/**
 * Validates client readiness AND the generated content, then maps to the insert
 * shape. Throws `GbpDomainError` listing every missing required field BEFORE
 * returning, so the caller never persists a partial `gbp_profiles` row (R-10/R-11).
 */
export function toGbpProfileRow(
  clientId: string,
  parsed: Record<string, unknown>,
  ctx: GbpContext
): GbpProfileInsert {
  // R-03/R-11: business_name is CLIENT-sourced (NOT NULL on `clients`), never decided
  // by the model. Abort before any write if the client field is missing.
  if (!nonEmptyString(ctx.client.business_name)) {
    throw new GbpDomainError(
      'Cliente sin business_name: entrada requerida incompleta; aborta antes de escribir (R-11).'
    );
  }

  // R-04/R-06: map the model's REAL keys to the final domain values BEFORE validating,
  // so the R-11 guard checks the mapped values — not the raw output keys.
  const { primary: primaryCategory, secondary: secondaryCategories } =
    mapCategories(parsed);
  const services = nonEmptyValue(parsed.suggested_services)
    ? parsed.suggested_services
    : parsed.services;
  const serviceArea = computeServiceArea(
    parsed.service_area,
    ctx.client.service_area_cities
  );

  // R-05/R-07/R-11: fail-explicit before write if any FINAL required field is empty
  // (incl. service_area with no source, and genuinely-generated content fields).
  const finalValues: Record<string, unknown> = {
    primary_category: primaryCategory,
    description: parsed.description,
    short_description: parsed.short_description,
    services,
    service_area: serviceArea
  };
  const missing: string[] = [];
  for (const field of GBP_REQUIRED_FIELDS) {
    if (!nonEmptyValue(finalValues[field])) missing.push(field);
  }
  if (missing.length > 0) {
    throw new GbpDomainError(
      'GBP generado incompleto: faltan campos requeridos [' +
        missing.join(', ') +
        ']. Aborta antes de escribir; no se persiste fila parcial (R-10/R-11).'
    );
  }

  return {
    client_id: clientId,
    business_name: ctx.client.business_name,
    primary_category: primaryCategory as string,
    secondary_categories: secondaryCategories,
    description: parsed.description as string,
    short_description: parsed.short_description as string,
    services,
    service_area: serviceArea,
    from_the_business: nonEmptyString(parsed.from_the_business)
      ? (parsed.from_the_business as string)
      : null,
    phone: ctx.client.phone ?? null
  };
}

/**
 * Builds the `previews.data` snapshot of the GBP content shown to the client (R-12).
 * Includes degradation flags so the reviewer sees the same context the generator saw.
 */
export function buildPreviewSnapshot(
  row: GbpProfileInsert,
  ctx: GbpContext
): Record<string, unknown> {
  return {
    kind: 'gbp',
    profile: {
      business_name: row.business_name,
      primary_category: row.primary_category,
      secondary_categories: row.secondary_categories,
      description: row.description,
      short_description: row.short_description,
      services: row.services,
      service_area: row.service_area,
      from_the_business: row.from_the_business,
      phone: row.phone
    },
    grounded_in: {
      offer_id: ctx.offer.offer_id,
      big_promise: ctx.offer.big_promise,
      tone: ctx.brandboard.tone_voice.tone ?? null
    },
    degradation: {
      logo: ctx.logo.status,
      media_empty: ctx.media.degraded,
      operational_state: ctx.operational.status
    }
  };
}

/**
 * Decides the `client_assets(asset_type='gbp')` status from the client's preview
 * decision (R-13): approved -> 'approved'; rejected (feedback, not approved) ->
 * 'review' (awaiting regeneration).
 */
export function assetStatusForDecision(approved: boolean): AssetStatus {
  return approved ? 'approved' : 'review';
}

/** Status the GBP asset takes when a preview is created and awaits client review. */
export const ASSET_STATUS_ON_PREVIEW: AssetStatus = 'review';

/** The single asset_type this slice is allowed to touch (R-14). */
export const SLICE_ASSET_TYPE: AssetType = 'gbp';

/**
 * Scope guardrail (R-14): the slice only ever touches asset_type='gbp'. Any other
 * asset_type is a scope violation and must abort.
 */
export function assertGbpScope(assetType: string): void {
  if (assetType !== SLICE_ASSET_TYPE) {
    throw new GbpDomainError(
      `Scope-out (R-14): el slice F-066 solo produce asset_type='gbp'; recibido '${assetType}'.`
    );
  }
}
