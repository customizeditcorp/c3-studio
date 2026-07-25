/**
 * F-109 — (c) Guard de aprobación (helper puro, DT-01).
 *
 * Seam framework-free (`node --test`-able, sin I/O) que decide si el contenido de
 * una entidad de onboarding (brief / buyer_persona / OFV) es APROBABLE. Se antepone
 * al acto de escribir `status:'approved'` en los 3 approve handlers de `page.tsx`
 * (R-05/R-06). El save-draft NUNCA pasa por aquí (draft siempre permitido).
 *
 * INVARIANTE DE COHERENCIA (no negociable) — F-104/F-106:
 *   `[PENDIENTE]` es un MARCADOR LEGÍTIMO de hecho duro genuinamente ausente. El
 *   umbral del guard es "contenido vacío / esencialmente-todo-placeholder", NUNCA
 *   "contiene algún `[PENDIENTE]`". Un contenido bien generado con 1-2 `[PENDIENTE]`
 *   honestos DEBE poder aprobarse (R-04/R-14). `Ref: feature_list.json F-104/F-106`.
 *
 * Umbral (DT-01, el más conservador posible): un campo es "meaningful" si su valor
 * `trim()` es no-vacío Y no consiste ÚNICAMENTE en marcador(es) placeholder. El
 * contenido es aprobable sii `meaningfulFieldCount > 0`. Cualquier contenido genuino
 * tiene >0 campos meaningful → no puede conflictuar con F-104/F-106.
 *
 * SIN DDL, sin prompts. Patrón seam-puro del repo (write-path.ts F-107,
 * gbp-asset.ts F-087, content-status.ts F-089).
 */

export interface ApprovalAssessment {
  /** true = aprobable (al menos un campo con contenido real). */
  ok: boolean;
  /** presente solo cuando `ok === false`. */
  reason?: 'empty' | 'all_placeholder';
  /** cantidad de campos con contenido real (no vacío, no solo-placeholder). */
  meaningfulFieldCount: number;
}

/**
 * Marcador(es) placeholder tolerados como AUSENCIA-honesta (no bloquean por sí
 * solos): `[PENDIENTE]`, `[PENDING]`, tolerante a whitespace interno
 * (`[ PENDIENTE ]`) y case-insensitive. Global para poder removerlos todos.
 */
const PLACEHOLDER_TOKEN = /\[\s*(?:PENDIENTE|PENDING)\s*\]/gi;

/**
 * True sii el valor consiste ÚNICAMENTE en marcador(es) placeholder (posiblemente
 * con whitespace/puntuación envolvente o entre tokens), sin ninguna prosa real.
 *
 * Método: se remueven todos los tokens placeholder; si lo que queda, tras quitar
 * whitespace y puntuación/símbolos, es vacío Y se removió al menos un placeholder,
 * el valor era placeholder-only. Un valor con prosa real + un `[PENDIENTE]` inline
 * deja residuo no vacío → NO es placeholder-only → cuenta como meaningful (la clave
 * del invariante F-104/F-106).
 *
 * Un valor vacío / solo-whitespace NO es "placeholder-only" (es "empty"): se
 * distingue arriba, en `assessApproval`, para el `reason`.
 */
export function isPlaceholderOnly(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  const withoutPlaceholders = trimmed.replace(PLACEHOLDER_TOKEN, '');
  const removedSomePlaceholder = withoutPlaceholders.length < trimmed.length;
  if (!removedSomePlaceholder) return false;
  // Sin `\p{...}` (target es5): "prosa real" = queda alguna letra (Latin +
  // acentos ES) o dígito tras remover los placeholders. Si solo queda
  // whitespace/puntuación, el valor era placeholder-only.
  return !/[a-zA-Z0-9À-ɏ]/.test(withoutPlaceholders);
}

/** Un campo es "meaningful" si tiene contenido real (no vacío, no solo-placeholder). */
function isMeaningful(value: string): boolean {
  if (value.trim().length === 0) return false;
  return !isPlaceholderOnly(value);
}

/**
 * Evalúa si los campos de contenido de una entidad son aprobables (R-01..R-04).
 * Puro, determinista, sin I/O. Ignora claves ausentes/no-string de forma segura.
 *
 * - `meaningfulFieldCount > 0` → `{ ok: true }` (aprobable).
 * - 0 meaningful y ningún campo era placeholder → `reason: 'empty'`.
 * - 0 meaningful y ≥1 campo era placeholder-only → `reason: 'all_placeholder'`.
 */
export function assessApproval(fields: object): ApprovalAssessment {
  // Param `object` (no `Record<string,string>`) para aceptar directamente las
  // interfaces de campos (BriefFields/PersonaFields/OFVFields) SIN cast y SIN
  // introducir errores tsc (esas interfaces carecen de index signature; target
  // es5). Los valores se leen laxos y se coercionan a string.
  let meaningfulFieldCount = 0;
  let sawPlaceholder = false;

  for (const raw of Object.values(fields ?? {})) {
    const v = typeof raw === 'string' ? raw : String(raw ?? '');
    if (v.trim().length === 0) continue; // vacío → no cuenta
    if (isPlaceholderOnly(v)) {
      sawPlaceholder = true;
      continue; // solo-placeholder → no cuenta (pero recuerda el motivo)
    }
    meaningfulFieldCount++;
  }

  if (meaningfulFieldCount > 0) {
    return { ok: true, meaningfulFieldCount };
  }
  return {
    ok: false,
    reason: sawPlaceholder ? 'all_placeholder' : 'empty',
    meaningfulFieldCount: 0
  };
}
