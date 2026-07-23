// F-088 — `client_status` (Postgres enum) es la única fuente de verdad del set de
// estados del cliente; este union se alinea EXACTAMENTE al enum (R-01), sin divergencia.
// `paused` reconcilia el drift TS↔DB (R-03, DT-05). `delivered`/`maintenance` son los
// estados post-venta agregados por DDL aditivo (R-02, DT-01). `paused`/`churned` son
// estados no-lineales (fuera de la timeline lineal: badge, ver `STATUS_STEPS`).
export type ClientStatus =
  | 'lead'
  | 'diagnosed'
  | 'negotiating'
  | 'onboarding'
  | 'active'
  | 'paused'
  | 'delivered'
  | 'maintenance'
  | 'churned';

export type RecordStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'published';

export interface Client {
  id: string;
  tenant_id: string;
  business_name: string;
  industry: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  phone: string | null;
  email: string | null;
  status: ClientStatus;
  tier: string | null;
  created_at: string;
  updated_at: string;
}

export interface Diagnostic {
  id: string;
  client_id: string;
  tenant_id: string;
  content: Record<string, unknown>;
  status: RecordStatus;
  created_at: string;
}

export interface Brief {
  id: string;
  client_id: string;
  content: Record<string, unknown>;
  raw_text: string | null;
  status: RecordStatus;
  version: number;
  prompt_version_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
  tokens_used: number | null;
  created_at: string;
}

export interface BuyerPersona {
  id: string;
  client_id: string;
  brief_id: string | null;
  content: Record<string, unknown>;
  raw_text: string | null;
  status: RecordStatus;
  version: number;
  prompt_version_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
  tokens_used: number | null;
  created_at: string;
}

export interface Offer {
  id: string;
  client_id: string;
  persona_id: string | null;
  big_promise: string | null;
  vehicle_name: string | null;
  vehicle_description: string | null;
  quick_win: string | null;
  decision_frame: string | null;
  guarantee: string | null;
  urgency: string | null;
  social_proof: string | null;
  deliverables: string | null;
  content: Record<string, unknown>;
  status: RecordStatus;
  version: number;
  prompt_version_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  updated_at: string;
  tokens_used: number | null;
  created_at: string;
}

export interface GeneratedOutput {
  id: string;
  client_id: string;
  offer_id: string | null;
  prompt_version_id: string | null;
  output_type: string;
  content: Record<string, unknown>;
  raw_text: string | null;
  language: string;
  status: RecordStatus;
  version: number;
  created_at: string;
}

export interface Preview {
  id: string;
  client_id: string;
  token: string;
  type: string;
  expires_at: string | null;
  approved: boolean;
  created_by: string | null;
  created_at: string;
}

/** GBP create-vs-existing axis (`gbp_mode` enum, F-083 R-01). Applied by the gated
 * migration `20260722_f083_gbp_mode.sql`; default `existing` preserves AGS/maintenance. */
export type GbpMode = 'create' | 'existing';

export interface GBPProfile {
  id: string;
  client_id: string;
  business_name: string | null;
  primary_category: string | null;
  description: string | null;
  phone: string | null;
  website_url: string | null;
  address: string | null;
  attributes: string[];
  hours: Record<string, unknown>;
  service_area: Record<string, unknown> | null;
  // F-083 (R-01): explicit create-vs-existing axis; default `existing` (R-02).
  gbp_mode: GbpMode;
  // Verification lifecycle (recon §2.6). Pre-existing column, default `pending`;
  // F-083 (R-13/R-14) gave it use: `gbp_exists` derives from it and onboarding can
  // attest `verified`. F-087 (R-04) promotes it from binary flag to a controlled
  // lifecycle. Valid states (app-layer, `VERIFICATION_STATUS_OPTIONS`, NOT a Postgres
  // enum — column stays `text`): `pending` (default) → `created` (operator created the
  // listing on Google, atesta) → `verified` (verified by postal/phone), plus the
  // explicit negative `not_found` (existing-mode: searched, does not exist). Phase E
  // (E2) replaces the attestation with GBP-API truth.
  verification_status: string | null;
  // F-087 (R-05) — method used for the lifecycle transition (postal/phone/email/manual).
  verification_method: string | null;
  // F-087 (R-05) — proof note for the lifecycle transition (reuses the existing column).
  verification_notes: string | null;
  // F-087 (R-01) — asset IDENTITY as additive metadata (NO secrets, R-02). Applied by the
  // gated migration `20260723_f087_gbp_asset_lifecycle.sql`. `operational_email` is the
  // reference Gmail (metadata, not a credential); `gbp_url` is the Maps/g.co listing link
  // (distinct from `website_url`); `place_id` is the Google Place ID (optional).
  operational_email: string | null;
  gbp_url: string | null;
  place_id: string | null;
  // F-087 (R-05) — timestamp of the transition to `created`/`verified`.
  verified_at: string | null;
  created_at: string;
}

export interface GBPPost {
  id: string;
  client_id: string;
  gbp_profile_id: string | null;
  content: Record<string, unknown>;
  raw_text: string | null;
  status: RecordStatus;
  created_at: string;
}

export interface ClientPhoto {
  id: string;
  client_id: string;
  file_name: string;
  storage_path: string;
  public_url: string | null;
  file_size: number | null;
  mime_type: string | null;
  category: string | null;
  approved: boolean;
  alt_text: string | null;
  created_at: string;
}

/** NAP consistency risk enum (`nap_risk` in Supabase). */
export type NapRisk = 'consistent' | 'partial' | 'inconsistent';

/** `nap_checks` — columns mirror the LIVE schema (uxczbwtfcsjsrmrikwoh, 2026-07-17).
 * NOTE: there is NO `tenant_id` column; isolation is via join to `clients`. */
export interface NAPCheck {
  id: string;
  client_id: string;
  checked_by: string | null;
  google_name_match: boolean | null;
  cslb_name_match: boolean | null;
  address_consistent: boolean | null;
  phone_consistent: boolean | null;
  cslb_active: boolean | null;
  entity_verified: boolean | null;
  items_passed: number | null;
  risk_level: NapRisk | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** `credentials` — columns mirror the LIVE schema. `items_completed` is an INTEGER
 * (computed default), NOT an array; there is NO `items_total` column. The `sos_status`
 * / `cslb_active` / `legal_name_verified` columns are added by the F-078 migration
 * (per-client home of the inherited legal signal, R-16). No `tenant_id` column. */
export interface Credential {
  id: string;
  client_id: string;
  entity_type: string | null;
  legal_name: string | null;
  dba_number: string | null;
  cslb_number: string | null;
  city_license: string | null;
  gbp_access: boolean | null;
  google_ads_access: boolean | null;
  meta_suite_access: boolean | null;
  instagram_access: boolean | null;
  facebook_page_access: boolean | null;
  business_email_access: boolean | null;
  website_access: boolean | null;
  analytics_access: boolean | null;
  items_completed: number | null;
  notes: string | null;
  // F-078 additive legal signal columns (applied by gated migration):
  sos_status: SosStatus | null;
  cslb_active: boolean | null;
  legal_name_verified: boolean | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// F-078 — Readiness core (veredicto de elegibilidad GBP)
// Hand-authored to MATCH the proposed migration
// (supabase/migrations/20260717_f078_readiness_core.sql). Once the gated DDL is
// applied, `generate_typescript_types` will confirm these (LIVE, Leader/operador).
// ---------------------------------------------------------------------------

/** Legal entity status with the CA Secretary of State (`sos_status` enum). */
export type SosStatus = 'active' | 'suspended' | 'dissolved' | 'unknown';

/** Unified eligibility verdict produced by the readiness engine (`eligibility_verdict`). */
export type EligibilityVerdict =
  | 'elegible'
  | 'bloqueado'
  | 'necesita_fix'
  | 'datos_insuficientes';

/** Closed taxonomy of concrete blockers (`readiness_blocker`). */
export type ReadinessBlocker =
  | 'sos_inactive'
  | 'cslb_inactive'
  | 'nap_inconsistent'
  | 'gbp_duplicate'
  | 'gbp_missing'
  | 'legal_name_mismatch';

/** `readiness_assessments` row (historizable, append-only). Mirrors design §2.2. */
export interface ReadinessAssessment {
  id: string;
  client_id: string;
  location_label: string | null;
  gbp_profile_id: string | null;
  nap_check_id: string | null;
  credential_id: string | null;
  verdict: EligibilityVerdict;
  blockers: ReadinessBlocker[];
  snap_sos_status: SosStatus | null;
  snap_cslb_active: boolean | null;
  snap_cslb_name_match: boolean | null;
  snap_nap_risk: NapRisk | null;
  snap_nap_consistent: boolean | null;
  snap_gbp_exists: boolean | null;
  snap_gbp_duplicate: boolean | null;
  // F-083 (R-15): auto-descriptive snapshot of the create-vs-existing mode used, so
  // each historical verdict records whether `elegible` meant "clear to create" or
  // "existing GBP healthy". Nullable (legacy rows predate the column).
  snap_gbp_mode: GbpMode | null;
  rationale: string | null;
  assessed_by: string | null;
  assessed_at: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  tenant_id: string;
  user_id: string;
  client_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Brandboard {
  id: string;
  client_id: string;
  tenant_id: string;
  logo_url: string | null;
  logo_storage_path: string | null;
  colors: { primary: string; secondary: string; accent: string };
  typography: { primary_font: string; secondary_font: string };
  tone_voice: { tone: string; adjectives: string; dos: string; donts: string };
  status: 'draft' | 'approved';
  created_at: string;
  updated_at: string;
}

export type AssetType = 'gbp' | 'website' | 'seo' | 'geo' | 'social';
export type AssetStatus =
  | 'locked'
  | 'pending'
  | 'in_progress'
  | 'review'
  | 'approved'
  | 'live';

export interface ClientAsset {
  id: string;
  client_id: string;
  tenant_id: string;
  asset_type: AssetType;
  status: AssetStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
