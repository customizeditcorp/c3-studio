/**
 * F-081 — Idioma por-cliente en la generación de contenido (R-03/R-04/R-05/R-06/R-07).
 *
 * Helper puro (sin DOM ni red) que gobierna el idioma de salida por-cliente. Se usa
 * en ambos paths de generación (`generate-content` y `generate-gbp` vía
 * `buildGbpUserMessage`) para anexar una directiva imperativa de idioma al cierre
 * del user message (recency para gpt-4o), y para fijar el tag
 * `generated_outputs.language`. La fuente de verdad es `clients.content_language`
 * (`'es'`/`'en'`, default `'es'`); esta directiva SOBRESCRIBE el idioma redaccional
 * de los `prompt_versions` sin reescribirlos — precedente que ya funciona en prod:
 * `generate-alt-text/route.ts:101` ("English only").
 *
 * NULL/undefined/valor desconocido → `'es'` (default, R-03/R-06).
 */

/** Valores acotados del idioma de contenido (espejo del CHECK de la columna). */
export type ContentLanguage = 'es' | 'en';

/**
 * Normaliza cualquier entrada (NULL/undefined/valor fuera del conjunto) al idioma
 * acotado, con default `'es'` (R-03). `'en'` es el único valor que produce inglés;
 * todo lo demás cae a `'es'`. Es el valor usado para el tag `generated_outputs.language`
 * (R-07) y para elegir el label de la directiva.
 */
export function normalizeContentLanguage(
  lang?: string | null
): ContentLanguage {
  return lang === 'en' ? 'en' : 'es';
}

/**
 * Construye la directiva imperativa de idioma que se anexa al CIERRE del user message
 * (recency). Nombra el idioma destino según `content_language` (R-04/R-05/R-06). El
 * texto de las instrucciones va en español (idioma del sistema) pero el LABEL gobierna
 * el idioma de salida — coherente con el precedente alt-text (instrucción en inglés que
 * fuerza inglés). NULL/undefined/desconocido → "español" (R-03/R-06).
 */
export function buildLanguageDirective(lang?: string | null): string {
  const label =
    normalizeContentLanguage(lang) === 'en' ? 'inglés (English)' : 'español';
  return (
    '\n\n## IDIOMA DE SALIDA (OBLIGATORIO)\n' +
    'Generá TODO el output —todos los campos, incluido raw_text— en ' +
    label +
    ', sin importar el idioma de los inputs, el brief, la persona, la oferta ' +
    'ni las instrucciones. Si algún input está en otro idioma, traducí el sentido ' +
    'pero producí el resultado final EXCLUSIVAMENTE en ' +
    label +
    '.'
  );
}
