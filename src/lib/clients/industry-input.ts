/**
 * F-122 (R-10/R-11/R-12/R-13 · DT-01 opción c) — **Seam puro del RUBRO LIBRE.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 * ─────────────────────────────────────────────────────────────────────────────────
 * F-121 dejó `other` con su significado correcto: **ausencia de industria declarada**
 * (R-15 de F-121, que F-122 **no** rehabilita). Pero la superficie de captura seguía
 * siendo un sumidero: elegir «Otro» guardaba el cliente **sin ningún rubro**, y de ahí
 * salían las pantallas que decían *"para other"*. Clara V Decor (`122f3593`) es el caso
 * verificado.
 *
 * El Slice A no resucita el token: **captura el rubro real**. El texto se persiste
 * verbatim en `clients.industry` (DT-01 c) — la columna que todos los consumidores ya
 * leen y que `toIndustryLabel` ya resuelve para valores fuera de tabla (R-16 de F-121,
 * verificado en producción con `portable_toilet_rental_service`).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * EL COSTO DECLARADO DE DT-01(c), Y POR QUÉ ESTE MÓDULO ES INSEPARABLE DE ELLA
 * ─────────────────────────────────────────────────────────────────────────────────
 * `clients.industry` pasa a tener **dos poblaciones**: códigos del vocabulario cerrado y
 * texto libre. Sin defensa, «Otro» + teclear `cleaning` crea **dos representaciones del
 * mismo rubro** — que es exactamente la causa raíz que DT-05 de F-121 vino a eliminar,
 * reintroducida por la puerta de atrás. Por eso:
 *
 *   · **R-12** — colisión con el vocabulario cerrado ⇒ RECHAZO (normalizando trim,
 *     minúsculas y acentos: `Cleaning`, `  cleaning  ` y `cleáning` son la misma
 *     colisión).
 *   · **R-13** — token de ausencia (`other`, `otro`) ⇒ RECHAZO. Sin esto, «Otro» +
 *     escribir "otro" reproduce el defecto con un carácter de diferencia.
 *   · **R-10** — vacío / sólo espacios ⇒ RECHAZO. Éste es el que hace que «Otro» deje
 *     de ser un sumidero.
 *
 * ⭐ **La tabla NO se re-declara acá**: se importa de la declaración única
 * (`industry-label.ts`). Un módulo de validación con su propia copia de la lista sería
 * el quinto criterio sobre el mismo dato — el defecto que R-08 prohíbe.
 *
 * Módulo puro: sin I/O, sin red, sin Supabase, sin React (`node --test`-able).
 */
import { INDUSTRIES } from './industry-label.ts';

/** Por qué se rechazó un rubro libre. El llamador redacta el mensaje de SU superficie. */
export type FreeIndustryRejection = 'empty' | 'collision' | 'absence_token';

/** Resultado del seam. `ok: true` ⇒ `value` es el texto a persistir en `clients.industry`. */
export interface FreeIndustryResult {
  ok: boolean;
  value?: string;
  reason?: FreeIndustryRejection;
  /** En `collision`: el `value` del vocabulario cerrado con el que chocó (para el aviso). */
  collidesWith?: string;
}

/**
 * Los tokens que significan «ninguna categoría aplica». `other` es el `value` real del
 * vocabulario; `otro` es su etiqueta en la UI, que el operador puede teclear sin darse
 * cuenta de que está escribiendo la ausencia (R-13).
 */
const ABSENCE_TOKENS = new Set(['other', 'otro']);

/**
 * Forma de comparación: trim + minúsculas + sin acentos. Sirve para decidir IGUALDAD,
 * nunca para producir el valor persistido — lo que se guarda es el texto **verbatim**
 * del operador (R-11).
 */
export function normalizeIndustryText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * ⭐ ¿Este rubro libre se puede persistir? (R-10/R-11/R-12/R-13)
 *
 * En caso `ok`, devuelve el texto **trim y verbatim**: no se capitaliza, no se
 * des-tokeniza, no se traduce. El operador declaró un rubro y el sistema lo guarda como
 * lo declaró — la doctrina de F-121 R-29 (el sistema no sobrescribe lo que puso el
 * humano) aplicada al momento de la captura.
 */
export function validateFreeIndustry(raw: unknown): FreeIndustryResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'empty' };

  const norm = normalizeIndustryText(trimmed);

  // R-13 primero: `other` también está en la tabla, y el motivo honesto de su rechazo
  // es «es la ausencia», no «ya existe esa categoría».
  if (ABSENCE_TOKENS.has(norm)) return { ok: false, reason: 'absence_token' };

  for (let i = 0; i < INDUSTRIES.length; i++) {
    const opt = INDUSTRIES[i];
    if (
      normalizeIndustryText(opt.value) === norm ||
      normalizeIndustryText(opt.label) === norm
    ) {
      return { ok: false, reason: 'collision', collidesWith: opt.value };
    }
  }

  return { ok: true, value: trimmed };
}

/* ================================================================================== */
/*  ⭐⭐⭐ BLOQUE G — LA VUELTA: leer un rubro YA GUARDADO (R-56/R-57/R-58)             */
/* ================================================================================== */

/**
 * ⭐⭐ **Por qué este tramo existe: el defecto ESPEJO, encontrado en producción.**
 *
 * DT-01(c) hizo de `clients.industry` una columna con **dos poblaciones** —códigos del
 * vocabulario cerrado y texto libre—. El Slice A cubrió la **ida** (capturar el rubro real)
 * y los guards midieron el write-path y la derivación de consumidores. **Nadie midió la
 * vuelta.** Con `industry = 'Sign Shop'` (`b016f86b`, Customize It) el `<select>` no tiene
 * ninguna `<option>` que matchee ⇒ **renderiza vacío** ⇒ al enviar,
 * `resolveIndustryForPersist('', '')` devuelve `null` ⇒ el submit se corta ⇒ **el cliente
 * entero quedó no editable**, y el formulario ni siquiera mostraba qué rubro tenía.
 *
 * ⭐ **El patrón NO es nuevo: es el de `CitySelect` (R-23), aplicado al otro dato.** Un
 * valor que no está en la lista se **muestra**, se **señala** como fuera de catálogo y
 * **no se pierde**. Es la misma doctrina de F-121 R-04: el sistema no borra ni sobrescribe
 * en silencio lo que el humano puso.
 *
 * ⛔ **Las dos salidas fáciles están prohibidas, y por qué:**
 *   · agregar el valor libre a `INDUSTRIES` **mutaría el vocabulario cerrado** y rompería
 *     la declaración única (F-121 DT-05) — la lista dejaría de ser una declaración para
 *     pasar a ser un acumulador de lo que alguien tipeó;
 *   · degradarlo a `other` violaría **F-121 R-15** (`other` = ausencia de industria
 *     declarada, **no** un rubro) y perdería el dato que el operador ya había declarado.
 *
 * ⛔ **R-58 — el contrato de PERSISTENCIA no se toca.** `resolveIndustryForPersist` queda
 * exactamente igual: `other` **nunca** se persiste, y elegir «Otro» **explícitamente**
 * sigue exigiendo el rubro libre. Lo que este tramo corrige es la **LECTURA de un valor ya
 * guardado**, no la **validación de uno nuevo**.
 */

/**
 * ¿Este valor de `industry` pertenece al vocabulario cerrado?
 *
 * `''`/`null` ⇒ `true`: "sin industria" **no** es "fuera de catálogo"; es **ausencia**, y
 * señalarla como valor raro sería inventar un defecto. Es el mismo criterio —y a propósito
 * la misma forma— que `isCityInCatalog` en `locations.ts` (R-23).
 */
export function isIndustryInCatalog(raw: string | null | undefined): boolean {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v.length === 0) return true;
  for (let i = 0; i < INDUSTRIES.length; i++) {
    if (INDUSTRIES[i].value === v) return true;
  }
  return false;
}

/** El sufijo con el que se SEÑALA un valor guardado fuera del vocabulario cerrado. */
export const OUT_OF_CATALOG_SUFFIX = ' — fuera de catálogo';

/** Una opción del desplegable de industria. La misma forma que las de `INDUSTRIES`. */
export interface IndustrySelectOption {
  value: string;
  label: string;
}

/**
 * ⭐⭐ **R-56 — la opción que representa un valor guardado FUERA de la tabla, o `null`.**
 *
 * El desplegable renderiza `INDUSTRIES` **más** esta opción cuando hace falta: la tabla
 * **no se muta** y el valor **no se pierde**.
 *
 *   · dentro del vocabulario / vacío / `null` ⇒ `null` (no hay nada que agregar);
 *   · fuera del vocabulario ⇒ `{ value, label }` con el rubro **legible** y **señalado**.
 *
 * ⚠️ **El `value` es el string CRUDO, sin `trim`, a propósito:** el control se enlaza a
 * `formData.industry` tal cual está en la fila, y una opción con el valor recortado no
 * matchearía — que es exactamente el defecto que este tramo cierra. El `trim` se usa para
 * DECIDIR y para la etiqueta, nunca para producir el valor de la opción.
 *
 * ⚠️ **Residual declarado:** si el operador cambia el desplegable a una categoría de la
 * tabla, esta opción desaparece y el rubro libre anterior ya no se puede re-elegir desde
 * la lista. Es la misma semántica que tiene sobrescribir cualquier campo: el valor viejo se
 * reemplaza porque **el humano lo reemplazó**, no en silencio.
 */
export function outOfCatalogIndustryOption(
  raw: string | null | undefined
): IndustrySelectOption | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (isIndustryInCatalog(trimmed)) return null;
  return { value: raw, label: trimmed + OUT_OF_CATALOG_SUFFIX };
}

/**
 * ⭐ **H-6 — el rubro se resuelve a `industry` ANTES del write.**
 *
 * El alta hace `insert({...newClientData})` con **spread**: cualquier clave nueva del
 * estado local entraría a `clients` automáticamente. Por eso el rubro libre NO vive
 * dentro de ese objeto, y esta función es el único punto donde el par
 * (código elegido, rubro libre) colapsa en **el valor de `clients.industry`**.
 *
 *   · elegido ≠ `other`  → el código del vocabulario cerrado, tal cual (no cambia nada).
 *   · elegido = `other`  → el rubro libre **verbatim**, si es válido.
 *   · elegido = `other` + rubro inválido → `null` ⇒ **no hay valor que persistir** y la
 *     superficie NO debe emitir el write (R-10). `other` **nunca** se persiste (R-07).
 */
export function resolveIndustryForPersist(
  selected: string | null | undefined,
  freeText: string | null | undefined
): string | null {
  const code = typeof selected === 'string' ? selected.trim() : '';
  if (code.length === 0) return null;
  if (!ABSENCE_TOKENS.has(code.toLowerCase())) return code;
  const verdict = validateFreeIndustry(freeText);
  return verdict.ok ? (verdict.value as string) : null;
}
