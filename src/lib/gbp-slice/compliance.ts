/**
 * F-098 — Compliance-guard de generación GBP (Scope A): seam PURA, framework-free.
 *
 * Cierra F-095: los hechos concretos del brief LLEGAN al contexto (`buildGbpUserMessage`)
 * pero el modelo puede OMITIRLOS igual (live JD Valley: licencia `1155610` en ctx pero
 * ausente en la descripción). Esta seam verifica la VERDAD DEL OUTPUT — que la
 * `description` generada contenga los hechos concretos VERIFICABLES presentes en `ctx`:
 *   - CIUDAD  (`ctx.client.city`)                — match case/acento-insensitive (R-03)
 *   - LICENCIA (`ctx.briefFacts.licenses`)       — match por secuencia de dígitos (R-04)
 *   - AÑOS    (`ctx.briefFacts.years_experience`)— match por secuencia de dígitos (R-04)
 *
 * NO verifica prosa blanda (diferenciadores/garantías/casos): el modelo la parafrasea
 * legítimamente → falsos negativos (R-05). Solo hechos concretos deterministas.
 *
 * Deriva los hechos EXCLUSIVAMENTE de `ctx` (R-15), present-only (R-02): un hecho ausente
 * en ctx —o, para license/years, sin dígitos verificables— NUNCA se exige. Sin hechos
 * presentes → `{ ok:true, missing:[] }` (nunca fuerza retry sin datos, R-02/R-11).
 *
 * Framework-free y `node --test`-able (patrón `resolveBriefFacts`/`normalizeOffer`).
 * La orquestación del retry-once vive en la ruta (`generate-gbp/route.ts`), no aquí.
 */
import type { GbpContext } from './context.ts';

export type ComplianceFactKind = 'city' | 'license' | 'years';

/** Hechos concretos verificables, ya resueltos desde ctx (present-only, R-02). */
export interface ComplianceFacts {
  city?: string; // ctx.client.city (string no-vacío)
  license?: string; // ctx.briefFacts.licenses (present + con dígitos)
  years?: string; // ctx.briefFacts.years_experience (present + con dígitos)
}

export interface MissingFact {
  kind: ComplianceFactKind;
  /** ES legible: 'ciudad' | 'número de licencia' | 'años de experiencia'. */
  label: string;
  /** El valor concreto que debía aparecer (p. ej. 'Buellton', '1155610', '20'). */
  value: string;
}

export interface FactComplianceResult {
  /** true = todos los must-have presentes en la descripción (o no había must-have). */
  ok: boolean;
  missing: MissingFact[];
}

/** ES labels legibles por tipo de hecho (usados en `missing[].label` y directivas). */
const FACT_LABELS: Record<ComplianceFactKind, string> = {
  city: 'ciudad',
  license: 'número de licencia',
  years: 'años de experiencia'
};

/**
 * Normalización case-insensitive Y acento-insensitive (R-03): NFD-decompone, elimina
 * las marcas diacríticas combinantes (U+0300..U+036F) y baja a minúsculas.
 * `Buellton` ↔ `buellton`, `Peñasco` ↔ `penasco`.
 */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Stream de dígitos de un string (R-04): descarta todo no-dígito (separadores, letras). */
function digits(s: string): string {
  return s.replace(/\D/g, '');
}

/**
 * Deriva los hechos a verificar EXCLUSIVAMENTE del `ctx` (R-15), present-only (R-02/R-04):
 *   - city    = `ctx.client.city` si es string no-vacío (trim).
 *   - license = `ctx.briefFacts.licenses` si contiene ≥1 dígito (verificable por dígitos).
 *   - years   = `ctx.briefFacts.years_experience` si contiene ≥1 dígito.
 * `briefFacts` ya viene trim/saneado de `resolveBriefFacts` (F-095); aquí solo se filtra
 * por "verificable por dígitos" — un valor sin dígitos no es exigible (R-04).
 */
export function resolveComplianceFacts(ctx: GbpContext): ComplianceFacts {
  const facts: ComplianceFacts = {};

  const rawCity = ctx.client.city;
  const city = typeof rawCity === 'string' ? rawCity.trim() : '';
  if (city.length > 0) facts.city = city;

  const license = ctx.briefFacts.licenses;
  if (typeof license === 'string' && digits(license) !== '') {
    facts.license = license;
  }

  const years = ctx.briefFacts.years_experience;
  if (typeof years === 'string' && digits(years) !== '') {
    facts.years = years;
  }

  return facts;
}

/**
 * Núcleo puro (R-01/R-03/R-04/R-05): ¿la `description` contiene cada hecho must-have
 * PRESENTE en `facts`? city vía `fold` (substring case/acento-insensitive); license/years
 * vía `digits` (substring de la secuencia de dígitos). Acumula los ausentes en `missing`.
 * `ok = missing.length === 0`. Sin hechos presentes → `{ ok:true, missing:[] }` (R-02/R-11).
 * NUNCA verifica prosa blanda: solo recorre `facts` (city/license/years) (R-05).
 */
export function checkGbpFactCompliance(
  description: string,
  facts: ComplianceFacts
): FactComplianceResult {
  const desc = typeof description === 'string' ? description : '';
  const foldedDesc = fold(desc);
  const digitDesc = digits(desc);
  const missing: MissingFact[] = [];

  if (facts.city !== undefined) {
    if (!foldedDesc.includes(fold(facts.city))) {
      missing.push({
        kind: 'city',
        label: FACT_LABELS.city,
        value: facts.city
      });
    }
  }
  if (facts.license !== undefined) {
    if (!digitDesc.includes(digits(facts.license))) {
      missing.push({
        kind: 'license',
        label: FACT_LABELS.license,
        value: facts.license
      });
    }
  }
  if (facts.years !== undefined) {
    if (!digitDesc.includes(digits(facts.years))) {
      missing.push({
        kind: 'years',
        label: FACT_LABELS.years,
        value: facts.years
      });
    }
  }

  return { ok: missing.length === 0, missing };
}

/** Frase por hecho faltante para la directiva del retry (R-07). */
function directiveLineFor(m: MissingFact): string {
  switch (m.kind) {
    case 'city':
      return '- la ciudad: ' + m.value;
    case 'license':
      return '- el número de licencia: ' + m.value;
    case 'years':
      return '- los años de experiencia: ' + m.value;
  }
}

/**
 * Instrucción dirigida para el retry (R-07): encabezado de corrección + una línea por
 * hecho faltante con su valor literal + cierre "no inventes otro dato". La ruta la inserta
 * en el user message ANTES del cierre de idioma (F-081 sigue siendo el último bloque).
 * `missing` vacío → string vacío (no debería llamarse en ese caso).
 */
export function buildComplianceRetryDirective(missing: MissingFact[]): string {
  if (missing.length === 0) return '';
  return [
    'CORRECCIÓN OBLIGATORIA: la descripción anterior omitió hechos verificables del negocio.',
    'La nueva descripción DEBE incluir explícitamente y de forma literal:',
    ...missing.map(directiveLineFor),
    'No inventes ningún otro dato; usa solo los hechos ya provistos.'
  ].join('\n');
}

/**
 * Mensaje ES legible del warning transitorio para la UI `/gbp` (R-12). Puro → testeable.
 * `missing` vacío → string vacío.
 */
export function formatComplianceWarning(missing: MissingFact[]): string {
  if (missing.length === 0) return '';
  const parts = missing.map((m) => m.label + ' (' + m.value + ')');
  return (
    'La descripción generada no incluyó: ' +
    parts.join(', ') +
    '. Edítala y guarda antes de aprobar el contenido.'
  );
}
