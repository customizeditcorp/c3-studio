/**
 * Method grounding (F-065) — deterministic query-by-step map (R-02/R-03).
 *
 * A light "intent of the step" query for each of the 11 steps. `methodology_family`
 * and `step` are the composition anchors the function already uses; the `query` is
 * only the step intent. NO client/industry/brief/persona signals (R-15) — adaptive
 * retrieval is a later phase.
 */
import type { Step } from './types.ts';

/** Uniform grounding for all 11 steps (design §4). */
export const QUERY_BY_STEP: Record<Step, string> = {
  ofv: 'Construcción de la oferta de valor: ecuación de valor, big promise, vehículo, quick win, garantía',
  buyer_persona:
    'Definición de buyer persona: dolores, deseos, objeciones y lenguaje del cliente',
  brief:
    'Elaboración del brief del negocio: contexto, oferta, mercado y diferenciadores',
  gbp_description:
    'Descripción de Google Business Profile optimizada para búsqueda local',
  campaign_copy: 'Copy de campaña de ads persuasivo orientado a conversión',
  gbp_posts: 'Posts de Google Business Profile orientados a conversión',
  social_content:
    'Contenido para redes sociales alineado al framework de ventas',
  nurturing: 'Secuencias de nurturing y email de seguimiento',
  website_home:
    'Home del sitio: propuesta de valor, jerarquía de mensaje y SEO on-page',
  website_service: 'Página de servicio orientada a SEO local y conversión',
  website_location: 'Página de ubicación local orientada a SEO'
};
