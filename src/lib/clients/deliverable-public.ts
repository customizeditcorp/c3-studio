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
 * (a2) F-100 — Snapshot inmutable del entregable (envelope + builder + reader)
 *      R-03, R-04, R-08, R-09, R-10.
 *
 * El snapshot congela el view-model client-safe AL MOMENTO DE LA ENTREGA. Se construye
 * EXCLUSIVAMENTE vía `buildDeliverableSnapshot` → `buildPublicDeliverableView` (arriba) →
 * hereda POR CONSTRUCCIÓN las garantías de honestidad de F-093 (place_id NUNCA, `verified`
 * boolean derivado, descripción SOLO si `content_status==='approved'`): capturar su output
 * es un snapshot honesto sin lógica de sanitización nueva (R-03). Se guarda el VIEW ya
 * construido (no los inputs crudos): el read NO re-ejecuta `buildPublicDeliverableView` sobre
 * el snapshot → el snapshot ES la vista congelada, y una regla de honestidad que cambie en el
 * futuro NO re-deriva un snapshot ya escrito (R-04/R-10).
 * ------------------------------------------------------------------------- */

/**
 * Versión del formato del envelope del snapshot (DT-01). Permite evolucionar la forma sin
 * romper snapshots ya escritos: el reader sirve el `view` sólo si `version` es CONOCIDA
 * (`=== SNAPSHOT_VERSION`); cualquier otra versión → fallback a live (R-09).
 */
export const SNAPSHOT_VERSION = 1;

/**
 * Envelope de forward-compat del snapshot del entregable (DT-01). `view` es el
 * `PublicDeliverableView` EXACTO que consume el componente `DeliverablePublicView` (misma
 * forma en el camino snapshot y en el camino live, R-10). `captured_at` registra CUÁNDO se
 * congeló (independiente de `delivered_at`, aunque coincidan en la 1ª entrega).
 */
export interface DeliverableSnapshotEnvelope {
  version: number;
  captured_at: string;
  view: PublicDeliverableView;
}

/**
 * R-03/R-04 — Construye el envelope del snapshot envolviendo el view-model client-safe de
 * `buildPublicDeliverableView(inputs)` (única fuente de honestidad F-093). Puro/determinista:
 * `now` es inyectable para tests. NO carga datos ni accede a red/DOM — el caller le pasa los
 * activos vivos ya cargados (seam de write puro, DT-02).
 */
export function buildDeliverableSnapshot(
  inputs: PublicDeliverableInputs,
  now: () => string = () => new Date().toISOString()
): DeliverableSnapshotEnvelope {
  return {
    version: SNAPSHOT_VERSION,
    captured_at: now(),
    view: buildPublicDeliverableView(inputs)
  };
}

/**
 * Type guard: `value` es un `DeliverableSnapshotEnvelope` de versión CONOCIDA y forma válida.
 * Un envelope null / de versión desconocida / con forma inválida NO califica → el reader cae a
 * live (R-09). Chequea sólo lo estructural mínimo: `version === SNAPSHOT_VERSION` y `view` es
 * un objeto (la forma exacta del view se congeló en el momento de la escritura, no se re-valida
 * campo a campo — se sirve tal cual, R-10).
 */
function isKnownSnapshotEnvelope(
  value: unknown
): value is DeliverableSnapshotEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const env = value as { version?: unknown; view?: unknown };
  return (
    env.version === SNAPSHOT_VERSION &&
    typeof env.view === 'object' &&
    env.view !== null
  );
}

/**
 * R-08/R-09/R-10 — Read snapshot-first CON fallback a live. Si `snapshot` es un envelope
 * VÁLIDO de versión conocida, devuelve `snapshot.view` TAL CUAL (congelado; NO recomputa desde
 * `liveInputs` aunque difieran). En cualquier otro caso —`null` (cliente legacy sin snapshot),
 * versión desconocida, o forma inválida— devuelve `buildPublicDeliverableView(liveInputs)`
 * (comportamiento F-093 actual: degradación honesta, sin romper la ruta). El componente
 * consume el MISMO `PublicDeliverableView` en ambos caminos (R-10).
 */
export function resolveDeliverableView(input: {
  snapshot: unknown;
  liveInputs: PublicDeliverableInputs;
}): PublicDeliverableView {
  if (isKnownSnapshotEnvelope(input.snapshot)) {
    return input.snapshot.view;
  }
  return buildPublicDeliverableView(input.liveInputs);
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
