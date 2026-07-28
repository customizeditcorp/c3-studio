/**
 * F-121 (R-13/R-14/R-15/R-16, DT-02(b) / DT-05) — **Declaración ÚNICA** industria →
 * etiqueta legible.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 * ─────────────────────────────────────────────────────────────────────────────────
 * `clients.industry` es un **vocabulario cerrado** de la aplicación (`landscaping`,
 * `roofing`, …, `other`). No es lenguaje natural. Hasta F-121, tres criterios
 * distintos convivían sobre el MISMO dato:
 *
 *   1. `components/clients/ClientForm.tsx` — tabla `INDUSTRIES` (copia 1)
 *   2. `app/(app)/diagnostic/page.tsx`     — tabla `INDUSTRIES` (copia 2, idéntica)
 *   3. `lib/gbp-slice/knowledge-panel.ts`  — `formatIndustry` (`_` → espacio)
 *
 * …y un CUARTO camino, el que produjo el defecto: `generate-content/route.ts`
 * inyectaba el **código crudo** en el user message (`Industria: other`), y la pantalla
 * de onboarding lo copiaba crudo al campo manual. El modelo, correctamente, lo trató
 * como sustantivo y escribió *"Top 3 en Google Maps para other"* (Clara V Decor,
 * `e1ad789c`) y *"para cleaning en la zona"* (SCS, `be43470f`).
 *
 * Mientras haya más de un criterio, uno seguirá emitiendo el código crudo (DT-05).
 * Esta es la fuente única; los cuatro consumidores la importan.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRATO
 * ─────────────────────────────────────────────────────────────────────────────────
 *   · valor de la tabla        → su etiqueta declarada          (R-14)
 *   · `other` / vacío / null   → `null` = **ausencia explícita de industria
 *                                 declarada**; NUNCA el token (R-15)
 *   · valor fuera de la tabla  → des-tokenizado, `_` → espacio  (R-16)
 *
 * Devolver `null` (y no un string de relleno) es deliberado: el llamador decide cómo
 * expresar la ausencia en SU superficie — una línea omitida en el prompt, un texto de
 * ausencia en la UI. La degradación honesta es del consumidor, no de la tabla.
 *
 * Módulo puro: sin I/O, sin red, sin Supabase, sin React (`node --test`-able).
 */

/**
 * Una entrada del vocabulario cerrado de industrias.
 *
 * **[F-122 ENMIENDA 2026-07-28 · R-50]** `labelEn` es la etiqueta **inglesa** de la MISMA
 * fila. La declaración sigue siendo **ÚNICA hablando dos idiomas** — no hay dos
 * declaraciones, una por idioma. Una segunda tabla o un mapa `es→en` en otro archivo
 * sería la **copia nº 3**, exactamente la clase de fallo que DT-05 de F-121 cerró.
 */
export interface IndustryOption {
  value: string;
  label: string;
  labelEn: string;
}

/**
 * ⭐ La tabla, declarada UNA sola vez en todo el repo (R-14). El orden es el de los
 * dos `<select>` que la consumen y se preserva: `INDUSTRIES.map(...)` renderiza
 * exactamente las mismas opciones, en el mismo orden, que antes de F-121.
 *
 * **[ENMIENDA 2026-07-28]** Cada fila gana su `labelEn`. Las españolas **no cambian ni
 * un byte** (R-54): los ~14 consumidores ya enrutados siguen viendo exactamente lo mismo.
 * Seis rubros tenían etiqueta española (`Plomería`, `Pintura`, `Limpieza`, `Cercas`,
 * `Electricidad`, `Contratista General`); los otros cuatro ya coincidían en los dos
 * idiomas y se declaran igual para que **ninguna fila dependa de una coincidencia**.
 */
export const INDUSTRIES: readonly IndustryOption[] = [
  { value: 'landscaping', label: 'Landscaping', labelEn: 'Landscaping' },
  { value: 'roofing', label: 'Roofing', labelEn: 'Roofing' },
  { value: 'plumbing', label: 'Plomería', labelEn: 'Plumbing' },
  { value: 'hvac', label: 'HVAC', labelEn: 'HVAC' },
  { value: 'painting', label: 'Pintura', labelEn: 'Painting' },
  { value: 'cleaning', label: 'Limpieza', labelEn: 'Cleaning' },
  { value: 'fencing', label: 'Cercas', labelEn: 'Fencing' },
  { value: 'electrical', label: 'Electricidad', labelEn: 'Electrical' },
  {
    value: 'general_contractor',
    label: 'Contratista General',
    labelEn: 'General Contractor'
  },
  { value: 'other', label: 'Otro', labelEn: 'Other' }
];

/**
 * Los valores que significan «no hay industria declarada». `other` está acá **por
 * definición del formulario**: es la opción «Otro», es decir, el operador declaró que
 * ninguna de las categorías aplica — no que el rubro se llame "other" (R-15).
 */
const NO_INDUSTRY_VALUES = new Set(['other']);

/**
 * ⭐ Código de industria → etiqueta legible, o `null` si no hay industria declarada.
 *
 * `null` significa **ausencia**, y el llamador debe expresarla como ausencia. Nunca
 * devuelve el token crudo: ese es exactamente el defecto que F-121 cierra.
 */
export function toIndustryLabel(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (v.length === 0) return null;
  if (NO_INDUSTRY_VALUES.has(v.toLowerCase())) return null;
  for (let i = 0; i < INDUSTRIES.length; i++) {
    if (INDUSTRIES[i].value === v) return INDUSTRIES[i].label;
  }
  // R-16 — fuera de la tabla (`portable_toilet_rental_service`, R & M `b56d1fa3`):
  // des-tokenizar, nunca emitir crudo. No se capitaliza: el valor puede venir de un
  // catálogo externo y title-case-arlo inventaría una forma que nadie declaró.
  return v.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * ⭐⭐ **[F-122 ENMIENDA 2026-07-28 · R-50/R-51/R-54]** Código de industria → etiqueta
 * legible **EN INGLÉS**, o `null` si no hay industria declarada.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE (el defecto, verificado y no supuesto)
 * ─────────────────────────────────────────────────────────────────────────────────
 * `api/generate-alt-text/route.ts` compone `'Industry: ' + toIndustryLabel(...)` dentro
 * de un prompt que dice **`English only`**, y `toIndustryLabel` devuelve `Plomería` /
 * `Limpieza` / `Cercas`. Antes de F-122 esa línea llevaba el **código crudo**
 * (`plumbing`), que al menos se lee como inglés ⇒ **para esa superficie F-122 fue una
 * REGRESIÓN**, y ningún guard la vio: R-14/R-18 medían *"¿la industria pasa por la
 * declaración única?"* —la respuesta era **sí**— **midiendo la RUTA del dato, no el
 * IDIOMA del artefacto**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⭐ LA REGLA DE ASIGNACIÓN (R-52) — para que no quede a criterio del próximo autor
 * ─────────────────────────────────────────────────────────────────────────────────
 * **El rendering acompaña al idioma del TEXTO QUE LO RODEA en el artefacto producido.**
 * No al idioma del código, ni al del repo, ni al de la UI que lo dispara. El criterio es
 * **observable en el propio literal** que se está componiendo — por eso es verificable
 * por un guard (R-53) en vez de ser una convención. Los cuatro casos vivos:
 *
 *   · `api/generate-alt-text/route.ts` → el literal dice `English only`  ⇒ **inglés**
 *   · `api/generate-content/route.ts`  → el literal dice `Industria:`    ⇒ **español**
 *   · `lib/gbp-slice/prompt.ts`        → el literal dice `Industria:`    ⇒ **español**
 *   · ficha / lista / preview público  → UI española                     ⇒ **español**
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * CONTRATO — el MISMO que el español, en el otro idioma
 * ─────────────────────────────────────────────────────────────────────────────────
 *   · valor de la tabla        → su `labelEn` declarada
 *   · `other` / vacío / null   → `null` = ausencia explícita; NUNCA el token
 *   · valor fuera de la tabla  → des-tokenizado **tal cual, SIN traducir**
 *
 * ⛔ **El rubro libre NO se traduce** (non-goal 11): un `Decoración de interiores`
 * escrito por el operador se emite **tal como se escribió**, también acá. El rendering
 * inglés sale de la **tabla**; traducir texto libre exigiría un traductor y una decisión
 * de producto que nadie tomó.
 *
 * ⛔ **Es una función NUEVA a propósito (R-54):** `toIndustryLabel` no cambia de firma,
 * de contrato ni de salida. Cambiarle la firma "para agregar el idioma" tocaría los ~14
 * consumidores que F-122 acaba de enrutar, con riesgo de regresión en superficies que hoy
 * están bien, para servir a **una** superficie inglesa.
 */
export function toIndustryLabelEn(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (v.length === 0) return null;
  if (NO_INDUSTRY_VALUES.has(v.toLowerCase())) return null;
  for (let i = 0; i < INDUSTRIES.length; i++) {
    if (INDUSTRIES[i].value === v) return INDUSTRIES[i].labelEn;
  }
  // Fuera de la tabla: des-tokenizar, jamás emitir crudo — y jamás traducir.
  return v.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * ¿Este valor de industria es un **token-código** que el modelo leería como sustantivo
 * si viajara crudo? True para todo lo que NO es ya una etiqueta declarada: `other`,
 * vacío, y cualquier `snake_case` fuera de tabla. Lo consume el detector de
 * `assembly-guard.ts` para construir su vocabulario cerrado sin duplicar la tabla.
 */
export function isIndustryCodeToken(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string') return false;
  const v = raw.trim();
  if (v.length === 0) return false;
  if (NO_INDUSTRY_VALUES.has(v.toLowerCase())) return true;
  for (let i = 0; i < INDUSTRIES.length; i++) {
    if (INDUSTRIES[i].value === v) return true;
  }
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(v);
}
