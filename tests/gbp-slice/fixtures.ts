/**
 * F-066 — Test fixtures derived from the LIVE pilot JD Valley Painting
 * (client `1d3b28b1-dce2-4e48-b8ac-a5561b202a6c`), read 2026-07-08 from Supabase
 * `uxczbwtfcsjsrmrikwoh`. Includes the two real approved offers: one EMPTY (smoke
 * artifact, CL-027) and one with REAL ColorBoost™ content.
 */
import type {
  RawOfferRow,
  RawBrandboard,
  RawClient,
  RawPhoto,
  RawBriefRow
} from '../../src/lib/gbp-slice/types.ts';

export const JD_CLIENT_ID = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c';

export const CLIENT: RawClient = {
  id: JD_CLIENT_ID,
  business_name: 'JD Valley Painting',
  industry: 'painting',
  phone: '8057577059',
  email: 'josediaz7705@gmail.com',
  contact_first_name: 'Jose',
  contact_last_name: 'Diaz',
  address_street: null,
  city: null,
  state: null,
  zip_code: null,
  service_area_cities: null,
  tier: 'presencia_digital'
};

/** The EMPTY approved offer (status='approved' but no real content) — CL-027. */
export const EMPTY_OFFER: RawOfferRow = {
  id: 'b106ad61-0d6e-474d-b8b0-940b894cb8ca',
  client_id: JD_CLIENT_ID,
  status: 'approved',
  big_promise: null,
  vehicle_name: null,
  content: { raw_text: '' }
};

/** The REAL approved offer (ColorBoost™). Note: deliverables/social_proof live in
 * flat columns; big_promise/quick_win/guarantee appear both flat and in content. */
export const REAL_OFFER: RawOfferRow = {
  id: 'a6c66d5c-b7ac-4153-b056-eb0410ecc93c',
  client_id: JD_CLIENT_ID,
  status: 'approved',
  big_promise:
    'Presencia digital completa en 30 días con el Método ColorBoost™ — sin detener tu operación',
  vehicle_name: null,
  quick_win:
    'Google Business Profile activo y optimizado en 10 días, con la primera reseña garantizada en los próximos 5 días.',
  guarantee:
    'Garantía de satisfacción del 100% con la optimización inicial de GBP: si no estás satisfecho con el impacto, ajustamos sin costo adicional.',
  deliverables: [
    'Perfil de Negocio en Google creado y optimizado.',
    'Reseñas iniciales generadas para aumentar la credibilidad.',
    'Análisis y reporte de presencia digital inicial.',
    'Plan de acción individual para seguir mejorando.'
  ],
  social_proof: [
    'Más de 50 clientes satisfechos en el último año en CA.',
    'Testimonios de clientes que aumentaron su visibilidad en un 150% tras nuestra intervención.'
  ],
  content: {
    raw_text: '- big_promise: Presencia digital completa en 30 días...',
    big_promise:
      'Presencia digital completa en 30 días con el Método ColorBoost™ — sin detener tu operación',
    quick_win:
      'Google Business Profile activo y optimizado en 10 días, con la primera reseña garantizada en los próximos 5 días.',
    guarantee:
      'Garantía de satisfacción del 100% con la optimización inicial de GBP: si no estás satisfecho con el impacto, ajustamos sin costo adicional.',
    urgency_scarcity:
      'Solo 5 espacios disponibles este mes para asegurar la calidad del servicio personalizado.'
  }
};

/** A draft offer with real content — must NOT be consumed (R-02). */
export const DRAFT_OFFER: RawOfferRow = {
  ...REAL_OFFER,
  id: 'draft-0000-0000-0000-000000000000',
  status: 'draft'
};

/** The approved brandboard — real tone/colors/typography; logo_url NULL (R-05). */
export const APPROVED_BRANDBOARD: RawBrandboard = {
  id: '7acf6d1c-07e8-4ef5-98cf-4014dac8d577',
  client_id: JD_CLIENT_ID,
  status: 'approved',
  logo_url: null,
  colors: { primary: '#1E3A8A', secondary: '#F59E0B', accent: '#DC2626' },
  typography: { primary_font: 'Inter', secondary_font: 'Playfair Display' },
  tone_voice: {
    tone: 'Profesional y cercano; confianza local, sin tecnicismos',
    adjectives: 'Confiable, meticuloso, transparente, puntual',
    dos: 'Resultados concretos y plazos claros; garantía de satisfacción; acabados prolijos y limpieza al terminar el trabajo',
    donts:
      'Evitar promesas vagas, jerga técnica y escasez fabricada; no prometer plazos irreales'
  }
};

export const DRAFT_BRANDBOARD: RawBrandboard = {
  ...APPROVED_BRANDBOARD,
  id: 'bb-draft',
  status: 'draft'
};

/** A media library photo marked is_logo — must NOT be used as the logo (R-05). */
export const PHOTO_MARKED_LOGO: RawPhoto = {
  id: 'photo-logo',
  gbp_category: 'logo',
  is_logo: true,
  is_cover: false,
  approved: true,
  storage_path: 'clients/jd/logo.png',
  alt_text: 'logo'
};

export const PHOTO_EXTERIOR: RawPhoto = {
  id: 'photo-ext',
  gbp_category: 'exterior',
  is_logo: false,
  is_cover: true,
  approved: true,
  storage_path: 'clients/jd/exterior.jpg',
  alt_text: 'exterior'
};

/**
 * F-095 — An APPROVED brief for JD Valley, `content` a flat key→string object as the
 * onboarding UI persists it. Includes the 5 Scope-A facts plus noise fields (raw_text,
 * budget) that MUST be ignored by `resolveBriefFacts`.
 */
export const APPROVED_BRIEF: RawBriefRow = {
  id: 'brief-jd-approved',
  client_id: JD_CLIENT_ID,
  status: 'approved',
  created_at: '2026-07-20T10:00:00.000Z',
  content: {
    licenses: '1155610',
    years_experience: '20',
    differentiators:
      'Preparación profesional de superficies y limpieza total al terminar',
    guarantees: 'Garantía de satisfacción del 100%',
    success_cases:
      'Repintado completo de una comunidad en Buellton con cero quejas',
    // noise that must NOT surface as a Scope-A fact:
    budget: '5000',
    raw_text: '- licenses: 1155610\n- years_experience: 20'
  }
};

/** F-095 — Brief with `content` as a JSON STRING (defensive parse path). */
export const APPROVED_BRIEF_STRING_CONTENT: RawBriefRow = {
  id: 'brief-jd-string',
  client_id: JD_CLIENT_ID,
  status: 'approved',
  created_at: '2026-07-21T10:00:00.000Z',
  content: JSON.stringify({
    licenses: '1155610',
    years_experience: '20'
  })
};

/** F-095 — Brief with blank/absent/non-string Scope-A fields (all must be omitted). */
export const APPROVED_BRIEF_SPARSE: RawBriefRow = {
  id: 'brief-jd-sparse',
  client_id: JD_CLIENT_ID,
  status: 'approved',
  created_at: '2026-07-22T10:00:00.000Z',
  content: {
    licenses: '1155610',
    years_experience: '   ', // blank -> omit
    differentiators: '', // empty -> omit
    guarantees: 42 as unknown as string // non-string -> omit
    // success_cases absent -> omit
  }
};

/** A well-formed generated GBP JSON (as the model would return). */
export const VALID_GBP_JSON = {
  business_name: 'JD Valley Painting',
  primary_category: 'Painter',
  secondary_categories: ['House painter', 'Commercial painter'],
  description:
    'JD Valley Painting entrega presencia y trabajos de pintura con resultados concretos y plazos claros para negocios y hogares en la Costa Central de California.',
  short_description:
    'Pintura profesional con acabados prolijos y garantía de satisfacción.',
  services: [
    {
      name: 'Pintura interior',
      description: 'Acabados prolijos y limpieza al terminar.'
    },
    {
      name: 'Pintura exterior',
      description: 'Protección duradera con plazos claros.'
    }
  ],
  service_area: {
    cities: ['Santa Maria', 'Santa Barbara'],
    notes: 'Costa Central, CA'
  },
  from_the_business:
    'Confiables, meticulosos y puntuales: cumplimos lo prometido con garantía de satisfacción.'
};
