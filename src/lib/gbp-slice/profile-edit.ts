/**
 * F-084 — Integridad del draft de perfil GBP: guards de write-path (puros).
 *
 * Estos helpers endurecen el PUNTO DE STORAGE del draft GBP, no el generador
 * (NG-3). Se usan en AMBOS write-paths de `description` (la página de edición
 * `gbp/[clientId]/page.tsx` y el upsert de `generate-gbp/route.ts`) y en el save
 * del perfil (short_description + zip). Son puros (sin DOM ni red) y por tanto
 * unit-testables directamente (lección §6.1: verificar que el write aterriza
 * limpio, no solo la forma del payload).
 */
import { stripCodeFences } from './profile.ts';

/** Límite del resumen corto GBP enforcado en código (DT-2). */
export const SHORT_DESCRIPTION_MAX = 300;

/**
 * R-03 — Recorta el resumen corto al límite `SHORT_DESCRIPTION_MAX` (política:
 * truncar, espejando cómo `description` ya usa `.slice(0, 750)` en la página).
 * Nunca persiste un valor sobre-límite.
 */
export function clampShortDescription(value: string): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, SHORT_DESCRIPTION_MAX);
}

/**
 * R-04 — Sanea el valor de `description` antes de persistir: remueve fences de
 * código (```json / ```) y, si el resultado es un objeto JSON serializado
 * (el blob crudo del generador, p.ej. { description, short_description, ... }),
 * extrae el texto de descripción. Reutiliza `stripCodeFences` (misma lógica que
 * `parseGbpJson`, F-082/F-066). Prosa limpia pasa sin cambios. Nunca lanza.
 */
export function sanitizeGbpDescription(input: string): string {
  if (typeof input !== 'string') return '';
  const cleaned = stripCodeFences(input);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      // Extrae el texto de descripción del blob (determinista, sin LLM).
      const desc = obj.description ?? obj.short_description;
      if (typeof desc === 'string' && desc.trim()) return desc.trim();
      // Objeto sin campo de texto usable → devolver el limpio; el guard R-05 lo
      // rechazará antes de persistir (no adivinamos contenido).
      return cleaned;
    }
  } catch {
    // No es JSON → prosa; se devuelve el texto limpio tal cual.
  }
  return cleaned;
}

/**
 * R-05 — Guard de storage: `true` si el valor, TRAS el saneo, SIGUE pareciendo
 * un blob crudo (empieza con ``` o con `{` parseable como objeto JSON). El
 * write-path debe BLOQUEAR la escritura y reportar un error legible en ese caso,
 * en lugar de persistir el blob.
 */
export function descriptionLooksLikeBlob(value: string): boolean {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (t.startsWith('```')) return true;
  if (t.startsWith('{')) {
    try {
      const parsed = JSON.parse(t);
      return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
    } catch {
      // Empieza con { pero no parsea como objeto → prosa, no blob.
      return false;
    }
  }
  return false;
}

/** Resultado de sanear+guardar la descripción para un write-path. */
export interface DescriptionGuardResult {
  ok: boolean;
  /** Valor limpio a persistir (solo válido cuando `ok`). */
  value: string;
  /** Mensaje legible cuando `ok=false` (blob irrecuperable). */
  message?: string;
}

/**
 * R-04 + R-05 — Combina saneo y guard para un write-path: sanea, y si el
 * resultado sigue pareciendo blob devuelve `ok=false` con mensaje legible (no
 * persistir). Un `input` vacío/whitespace es válido (permitido; devuelve '').
 */
export function guardGbpDescription(input: string): DescriptionGuardResult {
  const value = sanitizeGbpDescription(input);
  if (descriptionLooksLikeBlob(value)) {
    return {
      ok: false,
      value,
      message:
        'La descripción parece un bloque JSON/código crudo y no se puede limpiar automáticamente. ' +
        'Reemplázala por texto plano antes de guardar (R-05).'
    };
  }
  return { ok: true, value };
}

/* ------------------------------------------------------------------------- *
 * F-087 — Guards de identidad del activo GBP (puros, framework-free). Mismo
 * contrato `{ valid, message }` que `validateAddressZip`. Un valor VACÍO es
 * válido (los campos de identidad son opcionales, R-03). NUNCA capturan ni
 * validan secretos (R-02): sólo forma de email / URL de referencia.
 * ------------------------------------------------------------------------- */

/** Resultado de validar un campo de identidad del activo. */
export interface IdentityFieldValidation {
  valid: boolean;
  message?: string;
}

/**
 * R-03 — Valida la forma del `operational_email` (Gmail operativo de referencia).
 * Vacío/whitespace → válido (opcional). No vacío → debe tener forma de email
 * (`local@dominio.tld`). Es metadata de referencia, NO un secreto (R-02).
 */
export function validateOperationalEmail(
  value: string
): IdentityFieldValidation {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { valid: true }; // opcional
  // Forma de email conservadora: sin espacios, un `@`, dominio con TLD.
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  if (!ok) {
    return {
      valid: false,
      message:
        `Email inválido: "${trimmed}". Usá un email con forma válida (ej. negocio@gmail.com) ` +
        'o dejá el campo vacío.'
    };
  }
  return { valid: true };
}

/**
 * R-03 — Valida la forma del `gbp_url` (enlace al listing en Maps/g.co). Vacío →
 * válido (opcional). No vacío → debe ser una URL `http(s)://` bien formada.
 */
export function validateGbpUrl(value: string): IdentityFieldValidation {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { valid: true }; // opcional
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      message:
        `URL inválida: "${trimmed}". Debe empezar con http:// o https:// ` +
        '(ej. https://g.co/kgs/xxxx) o dejá el campo vacío.'
    };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      message: `URL inválida: "${trimmed}". El protocolo debe ser http:// o https://.`
    };
  }
  return { valid: true };
}

/** R-09 — `true` si `zip` tiene formato US válido: 5 dígitos, opcional `+4`. */
export function isValidUsZip(zip: string): boolean {
  if (typeof zip !== 'string') return false;
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}

/** Extrae el componente ZIP (grupo de dígitos, opcional `-4`) al final del address. */
function extractTrailingZip(address: string): string | null {
  const match = address.trim().match(/([0-9][0-9-]*)\s*$/);
  return match ? match[1] : null;
}

/** Resultado de validar el zip del address de un perfil GBP. */
export interface AddressZipValidation {
  valid: boolean;
  zip: string | null;
  message?: string;
}

/**
 * R-09/R-10 — Valida el componente ZIP del `address` del perfil GBP antes de
 * persistir. Address vacío → válido (SAB: negocio de área de servicio puede
 * ocultar la dirección). Address no vacío → debe terminar en un ZIP US válido;
 * un zip truncado/ inválido (p.ej. `9342`) → rechazo legible que lo señala.
 */
export function validateAddressZip(address: string): AddressZipValidation {
  const trimmed = (address ?? '').trim();
  if (!trimmed) return { valid: true, zip: null }; // SAB: address vacío permitido
  const zip = extractTrailingZip(trimmed);
  if (zip === null) {
    return {
      valid: false,
      zip: null,
      message:
        'La dirección no incluye un código postal (ZIP) al final. Agregá un ZIP US de 5 dígitos (ej. 93427).'
    };
  }
  if (!isValidUsZip(zip)) {
    return {
      valid: false,
      zip,
      message:
        `Código postal inválido: "${zip}". Debe ser un ZIP US de 5 dígitos (opcional +4), ` +
        'ej. 93427 o 93427-1234.'
    };
  }
  return { valid: true, zip };
}
