export type ClientStatus =
  | 'lead'
  | 'diagnosed'
  | 'negotiating'
  | 'onboarding'
  | 'active'
  | 'churned';

export type RecordStatus = 'draft' | 'approved' | 'rejected' | 'archived';

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
  tenant_id: string;
  content: Record<string, unknown>;
  raw_text: string | null;
  status: RecordStatus;
  version: number;
  prompt_version_id: string | null;
  created_at: string;
}

export interface BuyerPersona {
  id: string;
  client_id: string;
  tenant_id: string;
  brief_id: string | null;
  content: Record<string, unknown>;
  raw_text: string | null;
  status: RecordStatus;
  version: number;
  prompt_version_id: string | null;
  created_at: string;
}

export interface Offer {
  id: string;
  client_id: string;
  tenant_id: string;
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
  raw_text: string | null;
  status: RecordStatus;
  version: number;
  prompt_version_id: string | null;
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
  preview_type: string;
  expires_at: string | null;
  approved: boolean;
  created_by: string | null;
  created_at: string;
}

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

export interface NAPCheck {
  id: string;
  client_id: string;
  tenant_id: string;
  created_at: string;
}

export interface Credential {
  id: string;
  client_id: string;
  tenant_id: string;
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
