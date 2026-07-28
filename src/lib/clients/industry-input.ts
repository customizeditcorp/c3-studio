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
