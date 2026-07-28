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

/** Una entrada del vocabulario cerrado de industrias. */
export interface IndustryOption {
  value: string;
  label: string;
}

/**
 * ⭐ La tabla, declarada UNA sola vez en todo el repo (R-14). El orden es el de los
 * dos `<select>` que la consumen y se preserva: `INDUSTRIES.map(...)` renderiza
 * exactamente las mismas opciones, en el mismo orden, que antes de F-121.
 */
export const INDUSTRIES: readonly IndustryOption[] = [
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'plumbing', label: 'Plomería' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'painting', label: 'Pintura' },
  { value: 'cleaning', label: 'Limpieza' },
  { value: 'fencing', label: 'Cercas' },
  { value: 'electrical', label: 'Electricidad' },
  { value: 'general_contractor', label: 'Contratista General' },
  { value: 'other', label: 'Otro' }
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
