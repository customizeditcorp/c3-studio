/**
 * F-096 — Lógica PURA compartida del `GbpKnowledgePanel` (T-01, T-02, T-03).
 *
 * Separación presentación (TSX) ↔ lógica pura (mappers): el componente
 * `src/components/gbp/gbp-knowledge-panel.tsx` SOLO pinta `GbpKnowledgePanelData`;
 * toda la decisión de "qué dato real mostrar / qué omitir" vive aquí, en funciones puras
 * y deterministas (`node --test`-ables, patrón `deliverable-public.ts`/`content-status.ts`).
 *
 * Contrato de honestidad ESTRUCTURAL (el corazón del diseño §1):
 *  - `formatGbpHoursLine` reduce el jsonb `hours` a una línea ESTÁTICA; NUNCA usa reloj ni
 *    computa "abierto ahora" (R-08). Vacío/no-objeto → `null` → fila omitida.
 *  - `buildDeliveredPanelData` fija `rating: null` SIEMPRE: el view-model del entregable
 *    (`PublicDeliverableView`, seam puro de F-093) no tiene rating → no hay nada que
 *    fabricar (R-05). Ubicación/teléfono/horario salen del activo REAL o se omiten (R-06/R-07).
 *  - `buildSalesPanelData` espeja el origen real del preview (`gbpProfile?.x ?? client?.x`),
 *    aplicando `nonEmpty` a cada campo → mismas omisiones honestas, `rating: null`.
 *
 * El tipo `GbpKnowledgePanelData` se declara aquí y se importa desde el componente y desde
 * ambas vistas → un solo contrato.
 */
// Import SOLO de tipo (erased en runtime → sin ciclo de valor con deliverable-public.ts,
// que a su vez importa `formatGbpHoursLine` como valor). Extensión `.ts` explícita:
// precedente `deliverable-public.ts` → `content-status.ts`.
import type { PublicDeliverableView } from '../clients/deliverable-public.ts';

/* ------------------------------------------------------------------------- *
 * Contrato de datos del panel (un solo source-of-truth de la forma)
 * ------------------------------------------------------------------------- */

export type GbpKnowledgePanelVariant = 'sales' | 'delivered';

/** Una foto client-safe del panel (solo url + alt). */
export interface GbpKnowledgePanelPhoto {
  url: string;
  alt: string | null;
}

/**
 * Rating REAL del activo. Hoy SIEMPRE `null` en ambos builders: `gbp_profiles` no tiene
 * columna de rating (R-05). El tipo existe para que el componente pinte un rating **solo si
 * alguna vez hubiera fuente real**; nunca se fabrica.
 */
export interface GbpKnowledgePanelRating {
  value: string;
  count: string | null;
}

/** Props data-driven del panel. Cada campo `null` → su fila se OMITE (omisión honesta). */
export interface GbpKnowledgePanelData {
  businessName: string | null;
  category: string | null;
  location: string | null;
  phone: string | null;
  hours: string | null;
  website: string | null;
  photos: GbpKnowledgePanelPhoto[];
  /** Hoy SIEMPRE `null` (R-05). El componente pinta rating solo si `!== null`. */
  rating: GbpKnowledgePanelRating | null;
}

/* ------------------------------------------------------------------------- *
 * Helpers puros
 * ------------------------------------------------------------------------- */

/** Normaliza un string a no-vacío-trim o `null` (mirror de `deliverable-public.ts`). */
function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** Industria cruda (`home_services`) → etiqueta legible (`home services`) o `null`. */
function formatIndustry(value: string | null | undefined): string | null {
  const s = nonEmpty(value);
  return s ? s.replace(/_/g, ' ') : null;
}

/** Orden canónico de la semana + etiquetas ES (para agrupar tramos contiguos). */
const DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
] as const;

const DAY_LABELS: Record<(typeof DAY_ORDER)[number], string> = {
  monday: 'Lun',
  tuesday: 'Mar',
  wednesday: 'Mié',
  thursday: 'Jue',
  friday: 'Vie',
  saturday: 'Sáb',
  sunday: 'Dom'
};

/**
 * DT-04 / R-08 — Reduce el jsonb `gbp_profiles.hours` (días→string, p. ej.
 * `{ monday: "8:00 AM - 6:00 PM", ..., sunday: "Cerrado" }`) a UNA línea estática honesta,
 * agrupando días contiguos que comparten el mismo valor:
 *   `Lun–Vie 8:00 AM - 6:00 PM · Sáb–Dom Cerrado`
 *
 * DETERMINISTA: no lee reloj (`Date.now()`), no calcula "abierto/cerrado ahora". No-objeto,
 * array o sin días válidos → `null` (fila omitida). Defensivo: nunca lanza.
 */
export function formatGbpHoursLine(hours: unknown): string | null {
  if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return null;
  const map = hours as Record<string, unknown>;

  const present: { idx: number; value: string }[] = [];
  DAY_ORDER.forEach((day, idx) => {
    const raw = map[day];
    if (typeof raw === 'string' && raw.trim().length > 0) {
      present.push({ idx, value: raw.trim() });
    }
  });
  if (present.length === 0) return null;

  // Agrupar tramos contiguos (mismo valor + días adyacentes en el orden canónico).
  const groups: { startIdx: number; endIdx: number; value: string }[] = [];
  for (const p of present) {
    const last = groups[groups.length - 1];
    if (last && last.value === p.value && p.idx === last.endIdx + 1) {
      last.endIdx = p.idx;
    } else {
      groups.push({ startIdx: p.idx, endIdx: p.idx, value: p.value });
    }
  }

  return groups
    .map((g) => {
      const label =
        g.startIdx === g.endIdx
          ? DAY_LABELS[DAY_ORDER[g.startIdx]]
          : `${DAY_LABELS[DAY_ORDER[g.startIdx]]}–${DAY_LABELS[DAY_ORDER[g.endIdx]]}`;
      return `${label} ${g.value}`;
    })
    .join(' · ');
}

/* ------------------------------------------------------------------------- *
 * Builders (uno por origen; un solo componente los pinta)
 * ------------------------------------------------------------------------- */

/** Datos aditivos (categoría/horario) que el seam del entregable expone (F-096 T-06). */
export interface DeliveredPanelExtra {
  category: string | null;
  hours: string | null;
}

/**
 * T-02 / R-05, R-06, R-07 — Builder del ENTREGABLE (factual). Mapea el view-model client-safe
 * de F-093 (`PublicDeliverableView`) → `GbpKnowledgePanelData`. La honestidad es ESTRUCTURAL:
 * la fuente no contiene rating → `rating: null` fijo, imposible de fabricar. Ubicación/
 * teléfono salen del NAP real (ya `null` si ausentes en el seam → fila omitida). Categoría/
 * horario vienen del seam extendido (`extra`).
 */
export function buildDeliveredPanelData(
  view: PublicDeliverableView,
  extra: DeliveredPanelExtra
): GbpKnowledgePanelData {
  return {
    businessName: view.businessName,
    category: extra.category,
    location: view.nap.address,
    phone: view.nap.phone,
    hours: extra.hours,
    website: view.gbpUrl ?? view.nap.website,
    photos: view.photos.map((p) => ({ url: p.url, alt: p.alt })),
    // R-05 — el entregable NO tiene fuente de rating: nunca lo fabrica (doble candado con
    // el `variant='delivered'` del componente, que además ignoraría cualquier rating).
    rating: null
  };
}

/** Filas crudas que alimentan el panel de VENTA (subset consumido; mirror del preview). */
export interface SalesPanelInput {
  gbpProfile:
    | {
        business_name?: string | null;
        primary_category?: string | null;
        phone?: string | null;
        website_url?: string | null;
        address?: string | null;
        hours?: unknown;
      }
    | null
    | undefined;
  client:
    | {
        business_name?: string | null;
        industry?: string | null;
        phone?: string | null;
      }
    | null
    | undefined;
  photos: {
    public_url?: string | null;
    alt_text_final?: string | null;
    alt_text_auto?: string | null;
  }[];
}

/**
 * T-03 / R-02, R-06, R-07, R-08 — Builder del PREVIEW (venta). Espeja el origen actual del
 * panel hardcodeado (`gbpProfile?.x ?? client?.x`) pero SIN literales: ubicación/teléfono/
 * horario/categoría salen del activo REAL (o se omiten). `rating: null` → el componente pinta
 * el placeholder ilustrativo "Nuevo negocio" bajo `variant='sales'` (sin fabricar `5.0`, DT-02).
 */
export function buildSalesPanelData(
  input: SalesPanelInput
): GbpKnowledgePanelData {
  const g = input.gbpProfile;
  const c = input.client;
  return {
    businessName: nonEmpty(g?.business_name) ?? nonEmpty(c?.business_name),
    category: nonEmpty(g?.primary_category) ?? formatIndustry(c?.industry),
    location: nonEmpty(g?.address), // DT-03: ubicación honesta = gbp_profiles.address
    phone: nonEmpty(g?.phone) ?? nonEmpty(c?.phone),
    hours: formatGbpHoursLine(g?.hours),
    website: nonEmpty(g?.website_url),
    photos: (input.photos ?? [])
      .map((p) => ({
        url: nonEmpty(p.public_url),
        alt: nonEmpty(p.alt_text_final) ?? nonEmpty(p.alt_text_auto)
      }))
      .filter((p): p is GbpKnowledgePanelPhoto => p.url !== null),
    rating: null
  };
}
