/**
 * F-066 — Prompt assembly for the GBP asset (R-03, R-04, R-10).
 *
 * Grounds the generation in the OFV strategic content (R-03) and the brandboard
 * execution guidelines / tone (R-04), anchoring tone in `tone_voice` (R-10). The
 * generator CONSUMES strategy — it must NOT re-decide it (R-04): the system prompt
 * instructs the model to honor the approved OFV, not invent a new value proposition.
 */
import type { GbpContext } from './context.ts';
import { buildLanguageDirective } from '../content-language.ts';
import { BRIEF_FACT_KEYS, BRIEF_FACT_LABELS } from './brief.ts';

/** Final required GBP fields validated before write (R-10/R-11). `business_name` is
 * NOT here: it is client-sourced (R-03), not decided by the model output. */
export const GBP_REQUIRED_FIELDS = [
  'primary_category',
  'description',
  'short_description',
  'services',
  'service_area'
] as const;

const BUILTIN_SYSTEM_PROMPT = `Eres GBP Profile Specialist del sistema C3 Local Marketing.

MISIÓN: Producir el contenido de un perfil de Google Business Profile (GBP) para un
negocio local, consumiendo su Oferta de Valor (OFV) YA APROBADA y su brandboard YA
APROBADO. CONSUMES la estrategia; NO la re-decides ni inventas una propuesta de valor
nueva: la OFV aprobada es la fuente estratégica y el brandboard es la guía de ejecución
(tono/voz). Ancla el tono en tone_voice (respeta dos/donts/adjectives).

REGLAS:
- No inventes datos de contacto, licencias, reseñas ni cifras que no estén en el input.
- Refleja el big_promise, quick_win, garantía y deliverables de la OFV en el copy.
- Respeta el tono del brandboard; evita lo listado en donts.
- No publiques ni ejecutes nada: solo produces el contenido del perfil.

FORMATO DE SALIDA: Responde SOLO con un objeto JSON válido (sin backticks ni texto
adicional) con estas claves:
- business_name (string)
- primary_category (string)
- secondary_categories (array de strings)
- description (string, 500-750 caracteres, tono de marca)
- short_description (string, <= 300 caracteres)
- services (array de objetos { name, description })
- service_area (objeto { cities: string[], notes?: string })
- from_the_business (string)`;

/** Returns the base system prompt (a live `prompt_versions.system_prompt` if
 * provided, else the built-in). The route may augment it with method grounding. */
export function buildGbpSystemPrompt(base?: string | null): string {
  return base && base.trim().length > 0 ? base : BUILTIN_SYSTEM_PROMPT;
}

/** Assembles the user message grounding the generation in OFV + brandboard + client
 * (R-03/R-04/R-10). Includes degradation notes for logo/media/op-state.
 *
 * F-098 (R-06/R-07): optional `options.complianceDirective` (the retry correction) is
 * inserted AFTER the "Responde SOLO con JSON" line and BEFORE the closing language
 * directive (F-081), so the language directive stays the LAST block (recency). Without
 * the option the output is byte-identical to F-095 (no-regression, R-14).
 *
 * F-099 (R-07/R-08/R-09/R-10): the `options` bag gains a sibling `feedbackDirective`
 * (the client's requested-changes directive). Insertion order after "Responde SOLO con
 * JSON": (1) `feedbackDirective`, (2) `complianceDirective`; the language directive
 * (F-081) stays the LAST block (recency, R-08). Without any option the output is
 * byte-identical to F-095/F-098; `complianceDirective` alone keeps F-098's exact
 * position/output (no-regression, R-10/R-15). */
export function buildGbpUserMessage(
  ctx: GbpContext,
  options?: { complianceDirective?: string; feedbackDirective?: string }
): string {
  const { client, offer, brandboard, logo, media, operational, briefFacts } =
    ctx;

  const cities = Array.isArray(client.service_area_cities)
    ? (client.service_area_cities as unknown[]).join(', ')
    : '';

  const lines: string[] = [];
  lines.push('## DATOS DEL CLIENTE');
  lines.push('Negocio: ' + client.business_name);
  lines.push('Industria: ' + (client.industry ?? 'N/A'));
  lines.push('Teléfono: ' + (client.phone ?? 'N/A'));
  lines.push(
    'Dirección: ' +
      [client.address_street, client.city, client.state, client.zip_code]
        .filter(Boolean)
        .join(', ')
  );
  if (cities) lines.push('Ciudades de servicio: ' + cities);

  // F-095 (R-04/R-05): sección de hechos verificables del brief aprobado, insertada
  // TRAS los datos del cliente. Una línea por hecho presente (R-02: omitir ausentes);
  // si no hay hechos (sin brief aprobado o todo vacío) NO se emite la sección (R-03).
  const briefFactLines = BRIEF_FACT_KEYS.filter(
    (key) => typeof briefFacts[key] === 'string' && briefFacts[key]!.length > 0
  ).map((key) => '- ' + BRIEF_FACT_LABELS[key] + ': ' + briefFacts[key]);
  if (briefFactLines.length > 0) {
    lines.push('');
    lines.push(
      '## DATOS DEL BRIEF APROBADO (hechos verificables — usar, no inventar)'
    );
    lines.push(...briefFactLines);
  }

  lines.push('');
  lines.push(
    '## OFERTA DE VALOR APROBADA (fuente estratégica — CONSUMIR, no re-decidir)'
  );
  lines.push('Big Promise: ' + offer.big_promise);
  if (offer.vehicle_name) lines.push('Vehículo: ' + offer.vehicle_name);
  if (offer.quick_win) lines.push('Quick Win: ' + offer.quick_win);
  if (offer.guarantee) lines.push('Garantía: ' + offer.guarantee);
  if (offer.deliverables.length)
    lines.push('Entregables: ' + offer.deliverables.join(' | '));
  if (offer.social_proof.length)
    lines.push('Prueba social: ' + offer.social_proof.join(' | '));

  lines.push('');
  lines.push('## BRANDBOARD APROBADO (guía de ejecución / tono)');
  lines.push('Tono: ' + (brandboard.tone_voice.tone ?? 'N/A'));
  lines.push('Adjetivos: ' + (brandboard.tone_voice.adjectives ?? 'N/A'));
  lines.push('Dos: ' + (brandboard.tone_voice.dos ?? 'N/A'));
  lines.push('Donts: ' + (brandboard.tone_voice.donts ?? 'N/A'));
  lines.push(
    'Colores: ' +
      [
        brandboard.colors.primary,
        brandboard.colors.secondary,
        brandboard.colors.accent
      ]
        .filter(Boolean)
        .join(' / ')
  );
  lines.push(
    'Tipografía: ' +
      [brandboard.typography.primary_font, brandboard.typography.secondary_font]
        .filter(Boolean)
        .join(' / ')
  );

  lines.push('');
  lines.push('## NOTAS DE CONTEXTO (degradación)');
  lines.push(
    'Logo: ' +
      (logo.status === 'present'
        ? logo.logo_url
        : 'PENDIENTE (' + logo.note + ')')
  );
  lines.push(
    'Media: ' +
      (media.degraded
        ? 'sin fotos aprobadas — generar igualmente (media opcional, R-06)'
        : media.count + ' foto(s) aprobada(s) por categoría')
  );
  lines.push(
    'Estado operativo GBP: ' +
      operational.status +
      ' (condiciona publicación, NO la generación; el slice no publica)'
  );

  lines.push('');
  lines.push(
    'Genera el contenido del perfil GBP en JSON válido, respetando el tono de marca. Responde SOLO con JSON.'
  );

  // F-099 (R-07/R-08): directiva de REVISIÓN del cliente (regenerar-con-feedback),
  // insertada TRAS "Responde SOLO con JSON" y ANTES de la de compliance y del cierre de
  // idioma → el idioma (F-081) sigue siendo el ÚLTIMO bloque. Feedback ANTES de compliance.
  if (
    options?.feedbackDirective &&
    options.feedbackDirective.trim().length > 0
  ) {
    lines.push('');
    lines.push(options.feedbackDirective);
  }

  // F-098 (R-06/R-07): directiva de corrección del retry-once, insertada TRAS la línea
  // "Responde SOLO con JSON" y ANTES del cierre de idioma → la directiva de idioma
  // (F-081) sigue siendo el ÚLTIMO bloque (recency). Sin option → salida idéntica a F-095.
  if (
    options?.complianceDirective &&
    options.complianceDirective.trim().length > 0
  ) {
    lines.push('');
    lines.push(options.complianceDirective);
  }

  // F-081 (R-05/R-06): directiva imperativa de idioma al CIERRE del user message
  // (recency) driven por client.content_language. Mantiene el ensamblado del mensaje
  // en un solo lugar (testeable). NULL/ausente → español (default, R-03).
  lines.push(buildLanguageDirective(client.content_language));

  return lines.join('\n');
}
