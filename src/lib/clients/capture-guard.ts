/**
 * F-122 (R-28/R-29/R-30 · DT-03(b) / DT-05) — **El marcador NO es un dato de captura.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * QUÉ PROBLEMA CIERRA (y cuál NO)
 * ─────────────────────────────────────────────────────────────────────────────────
 * El marcador `[PENDIENTE]` es **degradación honesta legítima** cuando ocupa la ranura
 * completa de un campo **de un artefacto generado** (`briefs`, `buyer_personas`,
 * `offers`): eso lo instituyeron F-104/F-106 y lo tolera F-109 al aprobar. **Este módulo
 * no cambia ni un byte de esa doctrina** (R-01/R-30).
 *
 * Lo que este módulo prohíbe es **el CRUCE de frontera**:
 *
 *      ESPACIO-GENERACIÓN                    │        ESPACIO-CAPTURA
 *      briefs.content.city = "[PENDIENTE]"   │   clients.city = "[PENDIENTE]"
 *      ✅ legítimo (F-104/F-106)              │   ❌ un HECHO FALSO del home canónico
 *
 * Es una regla sobre **dónde** puede estar el marcador, no sobre **si** puede existir.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EL GUARD VIVE EN EL WRITE-PATH Y NO EN EL FORMULARIO (§0 del spec)
 * ─────────────────────────────────────────────────────────────────────────────────
 * Las 2 filas defectuosas (`clients.city = "[PENDIENTE]"` en SCS `e24ddff3` y Clara V
 * `122f3593`) **no las tecleó nadie**: las escribió el sistema, por el espejo del Brief
 * (`mirrorCityStateToClient`), +274 ms y +337 ms después de guardar el brief. Un
 * `<select>` en el alta **no habría impedido ninguna de las dos**. Por eso el seam se
 * consume desde los **write-paths** (R-34), y en el espejo va **dentro** de la función,
 * no en sus dos call-sites (H-4).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ BLOQUEA EN VEZ DE ADVERTIR (DT-03) — y qué es exactamente lo que bloquea
 * ─────────────────────────────────────────────────────────────────────────────────
 * El operador **no ve** esa escritura: ocurre en un `await` silencioso mientras él cree
 * estar guardando un brief. Y el costo del falso negativo no es cosmético: con
 * `city = "[PENDIENTE]"`, `gbp-slice/compliance.ts` (**el guard anti-fabricación de
 * F-098**) toma el marcador como **hecho must-have** y pasa a exigir que una descripción
 * **pública** lo contenga. Un dato falso en el home canónico corrompe el instrumento que
 * existe para detectar datos falsos.
 *
 * ⭐ **Se bloquea el VALOR, no al OPERADOR (R-31):** el patch pierde la clave y la acción
 * que lo originó —guardar borrador, aprobar el brief, dar de alta el cliente— **sigue**.
 * No se crea ningún estado nuevo de "generado pero no guardable" ⇒ R-02 intacta.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * EL CRITERIO: «el valor **ES** el marcador», nunca «lo contiene» (R-01)
 * ─────────────────────────────────────────────────────────────────────────────────
 * `notes` con prosa real que menciona un `[PENDIENTE]` embebido **no se bloquea**: eso
 * sería tratar como defecto una degradación honesta, que es exactamente lo que R-01
 * prohíbe. El espacio de falsos positivos del criterio elegido es **vacío por
 * construcción**: ninguna ciudad, ningún estado y ningún rubro se llama `[PENDIENTE]`.
 *
 * **H-3:** el literal del marcador **no se escribe acá**. Está definido UNA sola vez en
 * todo `src/lib` (`method-context/pending.ts`) y dos tests preexistentes lo exigen
 * (`f112-no-regression`, `f113-source-guards`). Este módulo **reusa** los predicados
 * exportados (R-29).
 *
 * Módulo puro: sin I/O, sin red, sin Supabase, sin React (`node --test`-able).
 */
import {
  isPendingMarker,
  detectMissingMarkers
} from '../method-context/pending.ts';

/**
 * ⭐ Las **columnas de captura** de `clients`: texto poblado por un humano o espejado
 * desde un formulario. Fuera de esta lista quedan las columnas de **estado** del sistema
 * (`status`, `tier`, `deliverable_token`, `tenant_id`, `created_by`, timestamps), que el
 * guard **no toca**: no son datos declarados por nadie y no pueden llevar un marcador.
 */
export const CAPTURE_COLUMNS: readonly string[] = [
  'business_name',
  'industry',
  'city',
  'state',
  'service_area_cities',
  'contact_first_name',
  'contact_last_name',
  'phone',
  'email',
  'disc_profile',
  'notes',
  'address_street',
  'zip_code',
  'website'
];

const CAPTURE_SET = new Set(CAPTURE_COLUMNS);

/** ¿Esta clave de un patch es una columna de **captura** de `clients`? */
export function isCaptureColumn(key: string): boolean {
  return CAPTURE_SET.has(key);
}

/**
 * ⭐ ¿El valor **ES** un marcador de pendiente? (R-28)
 *
 * Criterio deliberado: el marcador ocupa **todo** el valor. Un marcador embebido en
 * prosa devuelve `false` — R-01 prohíbe explícitamente el criterio «contiene algún
 * `[PENDIENTE]`», porque en la ranura completa de un artefacto generado el marcador es
 * degradación honesta legítima.
 *
 * Cubre también las variantes de otro idioma (`[PENDING]`) sin enumerarlas ni escribir
 * el literal (H-3): se apoya en el detector por patrón de F-118 y exige que el token
 * hallado sea **el valor entero**.
 */
export function isCapturePlaceholder(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const t = value.trim();
  if (t.length === 0) return false;
  if (isPendingMarker(t)) return true;
  const encontrados = detectMissingMarkers(t);
  return encontrados.length === 1 && encontrados[0] === t;
}

/** Lo que el guard devuelve: el patch **saneado** y las claves que se bloquearon. */
export interface CaptureGuardResult<T> {
  patch: Partial<T>;
  blocked: string[];
}

/**
 * ⭐ Quita del patch **sólo** las claves de **captura** cuyo valor **es** el marcador, y
 * las reporta para que la superficie avise (R-31).
 *
 * Invariantes:
 *   · no borra, no vacía y no sobrescribe nada más (R-04): las claves que pasan salen
 *     **idénticas**, y una clave bloqueada se **omite** — nunca se reemplaza por `''`,
 *     `null` ni un default, porque eso SÍ sería sobrescribir un valor del operador;
 *   · las claves que no son de captura pasan siempre (`status`, `tier`, `tenant_id`…);
 *   · es puro: no muta el objeto de entrada.
 */
export function stripPlaceholdersFromCapture<T extends Record<string, unknown>>(
  patch: T
): CaptureGuardResult<T> {
  const out: Record<string, unknown> = {};
  const blocked: string[] = [];
  for (const key of Object.keys(patch)) {
    if (isCaptureColumn(key) && isCapturePlaceholder(patch[key])) {
      blocked.push(key);
      continue;
    }
    out[key] = patch[key];
  }
  return { patch: out as Partial<T>, blocked };
}
