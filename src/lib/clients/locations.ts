/**
 * F-122 (R-21/R-22/R-23) — **Declaración ÚNICA del catálogo de ciudades.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE
 * ─────────────────────────────────────────────────────────────────────────────────
 * El mismo dato —la ciudad del cliente— tenía **dos superficies con reglas distintas**:
 *
 *   · el Brief usaba un `<select>` alimentado por `locations_reference` (57 filas);
 *   · el **alta** usaba un `<input>` de texto libre, sin validar nada.
 *
 * Es la misma clase de fallo que DT-05 de F-121 cerró para la industria, en otro dato:
 * mientras haya más de un criterio sobre un dato, uno de ellos va a aceptar basura.
 * Este módulo declara **una sola vez** la tabla, la proyección, el filtro, el orden y la
 * forma de la opción; las dos superficies la consumen a través de `<CitySelect>`.
 *
 * ⚠️ **Una sola consulta en todo el repo** (R-22): `fetchLocations` es el único sitio
 * que menciona `locations_reference`. Dos consultas equivalentes-pero-separadas serían
 * la misma deriva silenciosa con otro nombre.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⭐ ENMIENDA 2026-07-28 (DT-04 reemplazado · R-21 enmendado · R-47/R-48)
 * ─────────────────────────────────────────────────────────────────────────────────
 * **El catálogo es AYUDA, no cerradura.** El defecto que el Slice B cerró era *"dos
 * superficies con dos criterios sobre el mismo dato"*, **no** *"el alta acepta cualquier
 * string"*. El texto libre **dentro de una superficie única** no reabre ese defecto: la
 * unificación se conserva, la cerradura se levanta.
 *
 * Lo que sostiene la decisión, verificado y no supuesto: `county`/`zip_codes` se usan
 * **sólo para la etiqueta visible** (`locationOptionLabel`); **lo que se persiste es el
 * string de la ciudad**, y ningún consumidor downstream necesita el condado ⇒ una ciudad
 * escrita a mano es funcionalmente equivalente a una elegida.
 *
 * El precio declarado es el **riesgo de tipeo**, y se paga con `canonicalizeCity`
 * (R-47): el texto normalizado que coincide con el catálogo se persiste en **la forma
 * canónica**. **Residuo NO cubierto y aceptado a ojos abiertos:** dos ciudades
 * genuinamente ausentes del catálogo tipeadas distinto no tienen contra qué compararse.
 *
 * **Sin DDL, sin escrituras (R-48):** este módulo sólo **lee**, y la captura **nunca**
 * escribe en `locations_reference` — convertir un tipeo en un alta de catálogo
 * reintroduciría por la puerta de atrás la escritura a producción que R-24 retiró.
 * La carga (`supabase/seed/locations_ca.sql`) se **eliminó** con R-24; se recupera con
 * `git show 86fae28:supabase/seed/locations_ca.sql` si alguna vez se reabre.
 *
 * Framework-free y sin dependencia del cliente concreto de Supabase: recibe el cliente
 * por parámetro (inyección), de modo que el seam es `node --test`-able con un doble.
 */

/** Una fila del catálogo, en la proyección declarada abajo. */
export interface LocationRef {
  city: string;
  county: string;
  zip_codes?: unknown;
  region?: string | null;
}

/** ⭐ La tabla. Único sitio del repo que la nombra (R-22). */
export const LOCATIONS_TABLE = 'locations_reference';
/** ⭐ La proyección declarada (idéntica a la que el Brief usaba en `page.tsx:581`). */
export const LOCATIONS_PROJECTION = 'city, county, zip_codes, region';
/** ⭐ El filtro declarado. El catálogo es de California. */
export const LOCATIONS_STATE = 'CA';
/**
 * ⭐ El orden declarado: `region`, luego `city`. Se preserva EXACTAMENTE el del Brief:
 * cambiarlo movería opciones de lugar en una pantalla que el operador ya conoce.
 *
 * **Residual declarado (no silenciado):** la consulta original **no filtra `active`**, y
 * esta tampoco. Las 57 filas de hoy tienen `active = true`, así que el filtro sería un
 * no-op que además cambiaría el conjunto si mañana alguien desactiva una — decisión de
 * producto, no de esta feature.
 */
export const LOCATIONS_ORDER: readonly string[] = ['region', 'city'];

/** La forma de la opción, compartida por las dos superficies: `Ciudad (Condado)`. */
export function locationOptionLabel(loc: LocationRef): string {
  return loc.county ? `${loc.city} (${loc.county})` : loc.city;
}

/**
 * ¿Este valor de `city` pertenece al catálogo? Comparación por texto exacto tras `trim`
 * (es como se persiste y como se compara en el `<select>`).
 *
 * `''`/`null` ⇒ `true`: "sin ciudad" **no** es "fuera de catálogo"; es ausencia, y
 * señalarla como valor inválido sería inventar un defecto (R-23 habla del valor que el
 * cliente **tiene**).
 */
export function isCityInCatalog(
  city: string | null | undefined,
  locations: readonly LocationRef[]
): boolean {
  const v = typeof city === 'string' ? city.trim() : '';
  if (v.length === 0) return true;
  for (let i = 0; i < locations.length; i++) {
    if (locations[i].city === v) return true;
  }
  return false;
}

/**
 * ⭐ R-47 — **La clave de comparación de una ciudad.** Normaliza para COMPARAR, nunca
 * para persistir: `trim`, minúsculas, sin acentos (NFD + descarte de diacríticos) y
 * espacios colapsados.
 *
 * `Santa María`, `  SANTA MARIA  ` y `santa maria` producen la MISMA clave. Es la misma
 * jugada que `industry-input.ts` hace con el rubro libre (R-12/R-13) sobre el otro dato:
 * **texto libre con la colisión cerrada**.
 */
export function normalizeCityKey(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * ⭐ R-47/R-48 — **El seam que decide QUÉ string se persiste en `clients.city`.**
 *
 * · Si el texto escrito, normalizado, coincide con una ciudad del catálogo ⇒ se devuelve
 *   **la forma canónica del catálogo** (`santa maria` ⇒ `Santa Maria`). Sin esto, la
 *   enmienda cambiaría un problema de cobertura por uno de **integridad**, que es peor
 *   porque es silencioso.
 * · Si no coincide con ninguna ⇒ se devuelve **verbatim, sólo `trim`** (R-48). No se
 *   capitaliza, no se corrige, no se inventa una forma que nadie declaró — y **no se da
 *   de alta en `locations_reference`**: el catálogo es curado, la captura es del cliente.
 *
 * La colisión se cierra **en el seam, no en el componente**: el componente presenta, este
 * módulo decide. Puro, sin I/O, `node --test`-able.
 */
export function canonicalizeCity(
  raw: string | null | undefined,
  locations: readonly LocationRef[]
): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v.length === 0) return '';
  const key = normalizeCityKey(v);
  for (let i = 0; i < locations.length; i++) {
    if (normalizeCityKey(locations[i].city) === key) return locations[i].city;
  }
  return v;
}

/**
 * El mínimo que `fetchLocations` necesita del cliente de Supabase (inyectable).
 *
 * Deliberadamente **estructural y laxo**: tipar aquí la cadena real de `supabase-js`
 * hace que TypeScript intente instanciar sus genéricos recursivos y falle con
 * `TS2589 (Type instantiation is excessively deep)`. Lo que importa del contrato —la
 * tabla, la proyección, el filtro y el orden— está declarado arriba como constantes,
 * y el source-guard de R-22 lo mide sobre el repo, no sobre este tipo.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LocationsQueryClient = { from: (table: string) => any };

/**
 * ⭐ **La única consulta a `locations_reference` de todo el repo** (R-22).
 *
 * Devuelve `[]` ante ausencia de datos: una pantalla sin catálogo se degrada a "no hay
 * opciones", nunca a "cualquier string vale" — que era justamente el defecto.
 */
export async function fetchLocations(
  client: LocationsQueryClient
): Promise<LocationRef[]> {
  const { data } = await client
    .from(LOCATIONS_TABLE)
    .select(LOCATIONS_PROJECTION)
    .eq('state', LOCATIONS_STATE)
    .order(LOCATIONS_ORDER[0])
    .order(LOCATIONS_ORDER[1]);
  return Array.isArray(data) ? (data as LocationRef[]) : [];
}
