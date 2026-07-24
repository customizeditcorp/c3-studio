/**
 * F-093 — Seam PURO client-facing del entregable (R-03, R-04, R-05, R-08, R-09, R-10, R-11,
 * R-12, R-13). Frente 2, Opción C · 2º incremento.
 *
 * Este módulo es el **único source-of-truth de "qué ve el CLIENTE"** en la página pública
 * `/deliverable/[token]`. Es DELIBERADAMENTE separado de `buildDeliverableSummary`
 * (`deliverable.ts`, F-092, operador-facing): ese read-model expone labels INTERNOS
 * (`VERIFICATION_LABELS` "Creado en Google (pendiente de verificar)", `CONTENT_STALE_LABEL`
 * "requiere re-aprobación", el par Pendiente/Entregado, `place_id`, estado crudo del canal).
 * Reusarlo para la vista pública FILTRARÍA esos labels al cliente — exactamente lo que R-13
 * prohíbe. La separación es la garantía ESTRUCTURAL de honestidad: lo que el cliente ve pasa
 * por un seam que, POR CONSTRUCCIÓN, no conoce los labels internos.
 *
 * Framework-free + puro (patrón `deliverable.ts`/`gbp-asset.ts`/`content-status.ts`): la
 * página `deliverable/[token]/page.tsx`, la vista y los unit tests ejercitan el MISMO
 * code-path (lección §6.1: testear el path real, no una re-implementación).
 */
// Import relativo con extensión `.ts` (precedente `deliverable.ts` → `content-status.ts`):
// reusa el gating de la descripción aprobada de F-089 en un único source-of-truth.
import { resolveApprovedGbpDescription } from '../gbp-slice/content-status.ts';
// F-096 (R-11) — línea de horario estática honesta (sin "abierto ahora"). Import de VALOR;
// `knowledge-panel.ts` importa `PublicDeliverableView` SOLO como tipo (erased) → sin ciclo.
import { formatGbpHoursLine } from '../gbp-slice/knowledge-panel.ts';

/** Valor de `verification_status` que autoriza el badge "publicado y verificado" (R-10). */
export const VERIFIED_STATUS = 'verified';

/** Normaliza un string a no-vacío-trim o `null`. */
function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/* ------------------------------------------------------------------------- *
 * (a) buildPublicDeliverableView — view-model CLIENT-SAFE (R-09..R-13)
 * ------------------------------------------------------------------------- */

/** Una foto aprobada, en forma CLIENT-SAFE (sin metadata interna). */
export interface PublicDeliverablePhoto {
  id: string;
  url: string;
  alt: string | null;
}

/** Filas VIVAS que alimentan la vista pública (subset relevante; el loader las carga). */
export interface PublicDeliverableInputs {
  /** `clients.delivered_at` (nullable). Gate de "entregado" (R-08). */
  deliveredAt: string | null;
  /**
   * Fila `gbp_profiles` del cliente (subset). `place_id` se recibe pero NUNCA se expone
   * (R-09/R-13): se omite del view-model a propósito.
   */
  gbpProfile: {
    gbp_url?: string | null;
    place_id?: string | null; // recibido, NUNCA surfaceado (R-13)
    verification_status?: string | null; // → boolean `verified`, nunca el label crudo
    content_status?: string | null; // → gating de la descripción (F-089)
    description?: string | null;
    business_name?: string | null;
    phone?: string | null;
    website_url?: string | null;
    address?: string | null;
    // F-096 (R-11) — aditivo: categoría + horario (ya llegan por `select('*')`; solo se
    // tipa lo consumido). NO se agrega rating (R-05): `gbp_profiles` no lo tiene.
    primary_category?: string | null;
    hours?: unknown;
  } | null;
  /** Fila `clients` (subset) — fallback de NAP cuando el perfil GBP no lo trae. */
  client: {
    business_name?: string | null;
    phone?: string | null;
  } | null;
  /** Fotos ya filtradas a `approved=true` por el loader (`client_photos`). */
  photos: {
    id: string;
    public_url?: string | null;
    alt_text_final?: string | null;
    alt_text_auto?: string | null;
  }[];
}

/**
 * View-model CLIENT-SAFE del entregable. SOLO campos que el cliente puede ver; ningún label
 * interno, ningún `place_id`, ningún estado crudo del lifecycle. Booleans (no strings) para
 * las decisiones de display → la vista sólo pinta lo que este seam expone.
 */
export interface PublicDeliverableView {
  /** Nombre del negocio (perfil GBP → fallback cliente). */
  businessName: string | null;
  /** GBP live link (`gbp_url`) — CTA "ver tu perfil en Google", SIN `place_id` (R-09). */
  gbpUrl: string | null;
  /** `true` SOLO si `verification_status==='verified'` → badge "publicado y verificado" (R-10). */
  verified: boolean;
  /** Descripción aprobada (F-089) o `null` si no aprobada/vacía → sección omitida (R-11). */
  description: string | null;
  /** Bloque NAP del negocio (parte de "esto es lo que armamos", NO el CTA). */
  nap: {
    phone: string | null;
    website: string | null;
    address: string | null;
  };
  /** Fotos aprobadas en forma client-safe; `[]` → galería omitida honestamente (R-12). */
  photos: PublicDeliverablePhoto[];
  /** "en línea desde {deliveredAt}" (R-09). */
  deliveredAt: string | null;
  /** F-096 (R-11) — categoría real (`primary_category`) o `null` → fila omitida. Aditivo. */
  category: string | null;
  /** F-096 (R-11) — línea de horario estática honesta o `null` → fila omitida. Aditivo. */
  hours: string | null;
}

/**
 * R-09..R-13 — Construye el view-model client-safe con la lógica de OMISIÓN HONESTA (D2) ya
 * resuelta: badge verificado SOLO si `verification_status==='verified'`; descripción SOLO si
 * `resolveApprovedGbpDescription` retorna no-null; GBP link SIN `place_id`; NAP; fotos
 * aprobadas; `deliveredAt`. NUNCA emite un label interno ni el `place_id` (R-13). Puro y
 * determinista; sin efectos secundarios ni acceso a red/DOM.
 */
export function buildPublicDeliverableView(
  inputs: PublicDeliverableInputs
): PublicDeliverableView {
  const profile = inputs.gbpProfile;

  const businessName =
    nonEmpty(profile?.business_name) ?? nonEmpty(inputs.client?.business_name);

  // GBP live link — SOLO la url; `place_id` se descarta explícitamente (R-09/R-13).
  const gbpUrl = nonEmpty(profile?.gbp_url);

  // Badge verificado — boolean derivado; el status crudo (`created`/`pending`/`not_found`)
  // NUNCA llega al view-model (R-10/R-13).
  const verified = nonEmpty(profile?.verification_status) === VERIFIED_STATUS;

  // Descripción — SOLO si `content_status==='approved'` y no-vacía (reusa el gating F-089).
  // Cualquier otro caso → `null` → la vista omite la sección sin filtrar contenido no
  // aprobado (R-11).
  const description = resolveApprovedGbpDescription(profile);

  // NAP del negocio (perfil GBP → fallback cliente).
  const nap = {
    phone: nonEmpty(profile?.phone) ?? nonEmpty(inputs.client?.phone),
    website: nonEmpty(profile?.website_url),
    address: nonEmpty(profile?.address)
  };

  // Fotos aprobadas → forma client-safe (solo id/url/alt); `[]` si ninguna (R-12).
  const photos: PublicDeliverablePhoto[] = (inputs.photos ?? [])
    .map((p) => ({
      id: p.id,
      url: nonEmpty(p.public_url),
      alt: nonEmpty(p.alt_text_final) ?? nonEmpty(p.alt_text_auto)
    }))
    .filter((p): p is PublicDeliverablePhoto => p.url !== null);

  // F-096 (R-11) — extensión ADITIVA: categoría + horario honestos. NO se agrega rating (R-05).
  // Los campos existentes conservan su semántica EXACTA (place_id descartado, verified boolean,
  // description gateada) → sin regresión de honestidad F-093 (R-12).
  const category = nonEmpty(profile?.primary_category);
  const hours = formatGbpHoursLine(profile?.hours);

  return {
    businessName,
    gbpUrl,
    verified,
    description,
    nap,
    photos,
    deliveredAt: nonEmpty(inputs.deliveredAt),
    category,
    hours
  };
}

/* ------------------------------------------------------------------------- *
 * (b) isPublicDeliverable — gate de "entregado" (R-08)
 * ------------------------------------------------------------------------- */

/**
 * R-08 — La página del entregable es pública SOLO si el cliente tiene `delivered_at` seteado
 * (el link no debería existir antes de la entrega; `delivered_at` es set-once no-limpiable de
 * F-092). `false` → la ruta responde `notFound()` sin presentar "en línea desde …" con fecha
 * ausente.
 */
export function isPublicDeliverable(input: {
  deliveredAt: string | null | undefined;
}): boolean {
  return nonEmpty(input.deliveredAt) !== null;
}

/* ------------------------------------------------------------------------- *
 * (c) resolveDeliverableLinkAction — generate / copy / regenerate (R-03, R-04, R-05)
 * ------------------------------------------------------------------------- */

export type DeliverableLinkAction = 'generate' | 'copy' | 'regenerate';

export interface DeliverableLinkResult {
  /** El token a usar/persistir para construir `${origin}/deliverable/${token}`. */
  token: string;
  /** `true` si el token es NUEVO y debe persistirse en `clients.deliverable_token`. */
  shouldPersist: boolean;
}

/**
 * R-03/R-04/R-05 — Decide el token efectivo y si hay que persistirlo, según la acción del
 * operador. Puro: la generación del uuid es inyectable (`genToken`) para tests deterministas;
 * por defecto usa `crypto.randomUUID` (inadivinable). El call-site persiste sólo si
 * `shouldPersist` (evita reescrituras idempotentes — R-04).
 *
 * - `generate` (R-03): sin token previo → uuid nuevo + `shouldPersist=true`. Con token previo
 *   → idempotente (mismo token, `shouldPersist=false`): NO sobreescribe un link vivo.
 * - `copy` (R-04): con token previo → mismo token, `shouldPersist=false` (link estable). Sin
 *   token previo (defensivo) → genera uno + persiste (equivale a `generate`).
 * - `regenerate` (R-05): SIEMPRE uuid nuevo DISTINTO del previo + `shouldPersist=true`
 *   (rotación = único mecanismo de revocación dado que el token es permanente, DT-02).
 */
export function resolveDeliverableLinkAction(input: {
  currentToken: string | null | undefined;
  action: DeliverableLinkAction;
  genToken?: () => string;
}): DeliverableLinkResult {
  const gen = input.genToken ?? (() => crypto.randomUUID());
  const current = nonEmpty(input.currentToken ?? null);

  if (input.action === 'regenerate') {
    // Rotación: nuevo token garantizado DISTINTO del previo (invalida el anterior — R-05).
    let next = gen();
    while (current !== null && next === current) next = gen();
    return { token: next, shouldPersist: true };
  }

  if (input.action === 'copy') {
    if (current !== null) return { token: current, shouldPersist: false }; // estable (R-04)
    return { token: gen(), shouldPersist: true }; // defensivo: no había token → genera
  }

  // action === 'generate' (R-03)
  if (current !== null) return { token: current, shouldPersist: false }; // idempotente
  return { token: gen(), shouldPersist: true };
}
