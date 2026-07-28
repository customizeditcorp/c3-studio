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
 * **Sin DDL, sin escrituras:** este módulo sólo **lee**. La carga de ciudades faltantes
 * es un archivo versionado aparte (`supabase/seed/locations_ca.sql`, R-24/R-25) y se
 * ejecuta en el tramo LIVE gateado.
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
