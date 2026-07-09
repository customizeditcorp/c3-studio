/**
 * F-066 — T-02 — Lector de contexto (OFV + brandboard + media) (R-03..R-06).
 *
 * Pure normalization of already-fetched rows into a single generation context.
 * Implements the degradation rules:
 *   - R-05: `brandboards.logo_url` is the canonical source of truth for the logo.
 *           `client_photos.is_logo` is NEVER authoritative. logo_url empty/NULL ->
 *           degrade (logo pending), never substitute a photo marked is_logo.
 *   - R-06: media is optional/substantive. Empty media library -> still generate.
 */
import type {
  RawOfferRow,
  RawBrandboard,
  RawClient,
  RawPhoto,
  NormalizedOffer
} from './types.ts';
import {
  readOperationalStateGbp,
  type OperationalState,
  type GbpReadinessSignal
} from './operational-state.ts';

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
      .filter((s) => s.trim().length > 0);
  }
  return [];
}

function pickString(flat: unknown, nested: unknown): string | null {
  if (typeof flat === 'string' && flat.trim().length > 0) return flat;
  if (typeof nested === 'string' && nested.trim().length > 0) return nested;
  return null;
}

/**
 * Normalizes the OFV strategic content (R-03). Prefers flat columns, falls back to
 * `content` jsonb (the live pilot stores `deliverables`/`social_proof` only in flat
 * columns while `big_promise`/`quick_win`/`guarantee` appear in both).
 */
export function normalizeOffer(offer: RawOfferRow): NormalizedOffer {
  const c = offer.content ?? {};
  const bigPromise = pickString(offer.big_promise, c.big_promise) ?? '';
  return {
    offer_id: offer.id,
    big_promise: bigPromise,
    vehicle_name: pickString(offer.vehicle_name, c.vehicle_name),
    vehicle_description: pickString(
      offer.vehicle_description,
      c.vehicle_description
    ),
    quick_win: pickString(offer.quick_win, c.quick_win),
    guarantee: pickString(offer.guarantee, c.guarantee),
    urgency: pickString(
      offer.urgency,
      (c as Record<string, unknown>).urgency_scarcity ?? c.urgency
    ),
    deliverables:
      toStringArray(offer.deliverables).length > 0
        ? toStringArray(offer.deliverables)
        : toStringArray(c.deliverables),
    social_proof:
      toStringArray(offer.social_proof).length > 0
        ? toStringArray(offer.social_proof)
        : toStringArray(c.social_proof),
    raw_text:
      typeof (c as Record<string, unknown>).raw_text === 'string'
        ? ((c as Record<string, unknown>).raw_text as string)
        : null
  };
}

export interface LogoResolution {
  logo_url: string | null;
  status: 'present' | 'pending';
  note: string;
}

/**
 * Resolves the logo from the CANONICAL source only (R-05): `brandboards.logo_url`.
 * `client_photos.is_logo` is intentionally ignored — it is raw media metadata, not
 * identity. Empty/NULL -> degrade to `pending`.
 */
export function resolveLogo(brandboard: RawBrandboard): LogoResolution {
  const url =
    typeof brandboard.logo_url === 'string' &&
    brandboard.logo_url.trim().length > 0
      ? brandboard.logo_url.trim()
      : null;
  if (url) {
    return { logo_url: url, status: 'present', note: 'brandboard.logo_url' };
  }
  return {
    logo_url: null,
    status: 'pending',
    note: 'brandboard.logo_url vacío/NULL — logo pendiente (R-05); NO se sustituye por client_photos.is_logo.'
  };
}

export interface MediaResolution {
  count: number;
  degraded: boolean;
  byCategory: Record<string, RawPhoto[]>;
  photos: RawPhoto[];
}

/**
 * Resolves optional media (R-06). Consumes approved photos grouped by
 * `gbp_category`. Empty library -> `degraded=true` and generation still proceeds.
 */
export function resolveMedia(photos: RawPhoto[]): MediaResolution {
  const approved = photos.filter((p) => p.approved === true);
  const byCategory: Record<string, RawPhoto[]> = {};
  for (const p of approved) {
    const cat = p.gbp_category ?? 'other';
    (byCategory[cat] ??= []).push(p);
  }
  return {
    count: approved.length,
    degraded: approved.length === 0,
    byCategory,
    photos: approved
  };
}

export interface GbpContext {
  client: RawClient;
  offer: NormalizedOffer;
  brandboard: {
    tone_voice: NonNullable<RawBrandboard['tone_voice']>;
    colors: NonNullable<RawBrandboard['colors']>;
    typography: NonNullable<RawBrandboard['typography']>;
  };
  logo: LogoResolution;
  media: MediaResolution;
  operational: OperationalState;
}

/**
 * Assembles the full generation context (R-03/R-04/R-05/R-06/R-07). All degradation
 * is applied here so the generator downstream is a pure function of `GbpContext`.
 */
export function readGbpContext(input: {
  client: RawClient;
  offer: RawOfferRow;
  brandboard: RawBrandboard;
  photos?: RawPhoto[];
  operationalSignal?: GbpReadinessSignal | null;
}): GbpContext {
  const { client, offer, brandboard, photos = [], operationalSignal } = input;
  return {
    client,
    offer: normalizeOffer(offer),
    brandboard: {
      tone_voice: brandboard.tone_voice ?? {},
      colors: brandboard.colors ?? {},
      typography: brandboard.typography ?? {}
    },
    logo: resolveLogo(brandboard),
    media: resolveMedia(photos),
    operational: readOperationalStateGbp(operationalSignal)
  };
}
