/**
 * F-092 — Read-model del "Entregable del cliente" (Frente 2, Opción C). Seam PURA +
 * framework-free (patrón `client-status.ts` de F-088 / `gbp-asset.ts` de F-087 /
 * `content-status.ts` de F-089): la pestaña `Entregable` de la ficha
 * (`clients/[id]/page.tsx`) y los unit tests ejercitan el MISMO code-path (lección §6.1:
 * testear el path real, no una re-implementación).
 *
 * `buildDeliverableSummary` AGREGA los activos VIVOS ya cargados por la ficha (perfil GBP,
 * fotos aprobadas, preview, canal `client_assets`, `delivered_at`) en un read-model
 * read-only (D1: agregación viva, NO snapshot inmutable). No persiste nada; se computa en
 * el render a partir de las filas existentes.
 *
 * Honestidad (R-04/R-05): la superficie deriva TODO del estado vivo. El contenido se marca
 * aprobado SÓLO si `content_status==='approved'` (si fue editado/regenerado desde la
 * entrega, F-089 lo repuso a `draft` → la superficie lo dice honestamente, sin snapshot).
 * Los activos faltantes/no-aprobados se reflejan como pendientes, sin falso positivo.
 */
// Import relativo con extensión `.ts` (precedente `gbp-slice/prompt.ts` → `content-language.ts`):
// reusa el vocabulario de F-089 en un único source-of-truth y carga bajo `node --test`.
import { GBP_CONTENT_STATUS_APPROVED } from '../gbp-slice/content-status.ts';

/** Un activo del entregable: si está "entregado" (present) + label legible + detalle. */
export interface DeliverableField {
  /** `true` si el activo está entregado (presente/aprobado/live); `false` = pendiente. */
  present: boolean;
  /** Etiqueta legible del estado del activo (display honesto). */
  label: string;
  /** Detalle de apoyo (URL, fecha, estado crudo) o `null` si no aplica. */
  detail: string | null;
}

/** Los 6 campos de R-03 + `delivered_at` + el flag de honestidad de contenido. */
export interface DeliverableSummary {
  /** (i) GBP live link (`gbp_url`) con `place_id` si existe. */
  gbpLink: DeliverableField;
  /** (ii) Verificación del activo (`verification_status` + `verified_at`, F-087). */
  verification: DeliverableField;
  /** (iii) Contenido aprobado (`content_status`, F-089) — honestidad de re-draft R-04. */
  content: DeliverableField;
  /** (iv) Fotos aprobadas (`client_photos.approved=true`). */
  photos: DeliverableField;
  /** (v) Preview aprobado (`previews.approved=true` + `approved_at`). */
  preview: DeliverableField;
  /** (vi) Estado del canal GBP (`client_assets` fila `gbp`, `status`). */
  gbpChannel: DeliverableField;
  /** Cuándo se entregó (`clients.delivered_at`), o `null` si aún no entregado (R-09). */
  deliveredAt: string | null;
  /** Derivado de `content_status` vivo: `true` sólo si `approved` (R-04). */
  contentApproved: boolean;
}

/** Mensajes canónicos del indicador de honestidad de contenido (R-04). */
export const CONTENT_APPROVED_LABEL = 'Contenido aprobado';
export const CONTENT_STALE_LABEL =
  'Contenido editado desde la aprobación · requiere re-aprobación';

/** Etiquetas legibles del lifecycle de verificación F-087 (R-03 ii). */
const VERIFICATION_LABELS: Record<string, string> = {
  pending: 'Pendiente (aún no creado/verificado)',
  created: 'Creado en Google (pendiente de verificar)',
  verified: 'Verificado',
  not_found: 'No existe'
};

/** Estados del canal GBP (`client_assets.status`) que cuentan como entregado (R-03 vi/R-05). */
const DELIVERED_ASSET_STATUSES = new Set(['approved', 'live']);

/** Inputs del read-model: filas VIVAS ya cargadas por la ficha (D1, no snapshot). */
export interface DeliverableInputs {
  /** `clients.delivered_at` del cliente (nullable). */
  deliveredAt: string | null;
  /** Fila `gbp_profiles` del cliente (subset relevante) o `null` si no existe. */
  gbpProfile: {
    gbp_url?: string | null;
    place_id?: string | null;
    verification_status?: string | null;
    verified_at?: string | null;
    content_status?: string | null;
  } | null;
  /** `true` si hay ≥1 foto aprobada (`client_photos.approved=true`). */
  hasApprovedPhotos: boolean;
  /** Fila `previews` del cliente (subset) o `null` si no hay preview. */
  preview: {
    approved?: boolean | null;
    approved_at?: string | null;
  } | null;
  /** Fila `client_assets` `asset_type='gbp'` (subset) o `null`. */
  gbpAsset: {
    status?: string | null;
  } | null;
}

/** Normaliza un string a no-vacío-trim o `null`. */
function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * R-01/R-03/R-04/R-05/R-09 — Agrega los activos vivos en un `DeliverableSummary`
 * read-only. Puro y determinista; sin efectos secundarios ni acceso a red/DOM.
 */
export function buildDeliverableSummary(
  inputs: DeliverableInputs
): DeliverableSummary {
  const profile = inputs.gbpProfile;

  // (i) GBP live link — entregado si hay `gbp_url` no-vacío (R-03 i, R-05).
  const gbpUrl = nonEmpty(profile?.gbp_url);
  const placeId = nonEmpty(profile?.place_id);
  const gbpLink: DeliverableField = {
    present: gbpUrl !== null,
    label: gbpUrl !== null ? 'GBP publicado' : 'Sin enlace GBP',
    detail: gbpUrl
      ? placeId
        ? `${gbpUrl} · place_id: ${placeId}`
        : gbpUrl
      : null
  };

  // (ii) Verificación del activo (F-087) — entregado sólo si `verified` (R-03 ii, R-05).
  const verStatus = nonEmpty(profile?.verification_status);
  const verifiedAt = nonEmpty(profile?.verified_at);
  const verification: DeliverableField = {
    present: verStatus === 'verified',
    label: verStatus
      ? (VERIFICATION_LABELS[verStatus] ?? verStatus)
      : 'Pendiente (aún no creado/verificado)',
    detail: verifiedAt
  };

  // (iii) Contenido aprobado (F-089) — honestidad de re-draft (R-04): `approved` → aprobado;
  // cualquier otro/`draft` → editado desde la aprobación, requiere re-aprobación.
  const contentApproved =
    nonEmpty(profile?.content_status) === GBP_CONTENT_STATUS_APPROVED;
  const content: DeliverableField = {
    present: contentApproved,
    label: contentApproved ? CONTENT_APPROVED_LABEL : CONTENT_STALE_LABEL,
    detail: nonEmpty(profile?.content_status)
  };

  // (iv) Fotos aprobadas (R-03 iv, R-05).
  const photos: DeliverableField = {
    present: inputs.hasApprovedPhotos,
    label: inputs.hasApprovedPhotos ? 'Fotos aprobadas' : 'Sin fotos aprobadas',
    detail: null
  };

  // (v) Preview aprobado (R-03 v, R-05).
  const previewApproved = inputs.preview?.approved === true;
  const previewApprovedAt = nonEmpty(inputs.preview?.approved_at);
  const preview: DeliverableField = {
    present: previewApproved,
    label: previewApproved ? 'Preview aprobado' : 'Preview no aprobado',
    detail: previewApprovedAt
  };

  // (vi) Estado del canal GBP (`client_assets`) — entregado si `approved`/`live` (R-03 vi, R-05).
  const assetStatus = nonEmpty(inputs.gbpAsset?.status);
  const gbpChannel: DeliverableField = {
    present: assetStatus !== null && DELIVERED_ASSET_STATUSES.has(assetStatus),
    label: assetStatus ?? 'Sin canal GBP',
    detail: assetStatus
  };

  return {
    gbpLink,
    verification,
    content,
    photos,
    preview,
    gbpChannel,
    deliveredAt: nonEmpty(inputs.deliveredAt),
    contentApproved
  };
}
