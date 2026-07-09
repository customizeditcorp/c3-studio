/**
 * F-066 — Slice vertical OFV→GBP→preview — shared types.
 *
 * The slice consumes an APPROVED offer (L1) + APPROVED brandboard (L2) + optional
 * media (L3) + a minimal read-only operational-state model (L4) and PRODUCES a
 * `gbp_profiles` row + a `previews` row (type='gbp') + a `client_assets` status
 * transition (L5). It CONSUMES upstream artifacts; it never re-decides strategy
 * nor repairs the `offers` generation pipeline (R-02).
 *
 * Column names here follow the LIVE schema of Supabase `uxczbwtfcsjsrmrikwoh`
 * (docs/references/supabase-schema-c3-studio.md, revalidated 2026-07-08), NOT the
 * drifted hand-written types in `@/types/c3-domain` (DT-F066-02).
 */

/** Raw `offers` row as read from the DB (loose; strategic fields live in flat
 * columns AND/OR in `content` jsonb — the live pilot has both shapes). */
export interface RawOfferRow {
  id: string;
  client_id: string;
  status: string;
  big_promise?: string | null;
  vehicle_name?: string | null;
  vehicle_description?: string | null;
  quick_win?: string | null;
  guarantee?: string | null;
  urgency?: string | null;
  deliverables?: unknown; // jsonb array | null
  social_proof?: unknown; // jsonb array | null
  decision_frame?: unknown; // jsonb | null
  content?: Record<string, unknown> | null;
}

/** Strategic content of the OFV, normalized (flat column ?? content[key]). */
export interface NormalizedOffer {
  offer_id: string;
  big_promise: string;
  vehicle_name: string | null;
  vehicle_description: string | null;
  quick_win: string | null;
  guarantee: string | null;
  urgency: string | null;
  deliverables: string[];
  social_proof: string[];
  raw_text: string | null;
}

export interface RawBrandboard {
  id: string;
  client_id: string;
  status: string;
  logo_url?: string | null;
  colors?: { primary?: string; secondary?: string; accent?: string } | null;
  typography?: { primary_font?: string; secondary_font?: string } | null;
  tone_voice?: {
    tone?: string;
    adjectives?: string;
    dos?: string;
    donts?: string;
  } | null;
}

export interface RawClient {
  id: string;
  business_name: string;
  industry?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_first_name?: string | null;
  contact_last_name?: string | null;
  address_street?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  service_area_cities?: unknown; // jsonb
  tier?: string | null;
}

/** Raw `client_photos` row (L3). `is_logo`/`gbp_category` are media metadata,
 * NOT authoritative for the logo (R-05). */
export interface RawPhoto {
  id: string;
  gbp_category?: string | null;
  alt_text?: string | null;
  is_logo?: boolean | null;
  is_cover?: boolean | null;
  approved?: boolean | null;
  storage_path?: string | null;
}
