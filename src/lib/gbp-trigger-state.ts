/**
 * F-067 — T-02/T-15 — Pure state logic for the GBP generation UI trigger.
 *
 * DOM-free and side-effect-free so it is unit-testable without a component runner
 * (repo convention: `node --test`). The page composes these into its state machine.
 *
 * Scope guard (R-12): this module mirrors the precondition semantics of the FROZEN
 * `src/lib/gbp-slice/precondition.ts` (isOfferNonEmpty / reasons) client-side; it does
 * NOT import or modify the frozen slice lib.
 */

// --- R-03: client-side precondition mirror (offer non-empty) -----------------

export type OfferRowLike = {
  big_promise?: string | null;
  content?: { big_promise?: unknown } | null;
};

/** Mirror of gbp-slice `isOfferNonEmpty` (R-01 reinforced / CL-027): a non-empty
 * `big_promise` in the flat column OR inside `content` jsonb counts as real content. */
export function offerRowNonEmpty(offer: OfferRowLike): boolean {
  const flat = typeof offer.big_promise === 'string' ? offer.big_promise : '';
  const nested =
    offer.content && typeof offer.content.big_promise === 'string'
      ? (offer.content.big_promise as string)
      : '';
  return flat.trim().length > 0 || nested.trim().length > 0;
}

export type PreconditionInput = {
  offerApprovedNonEmpty: boolean;
  brandboardApproved: boolean;
};

export type PreconditionState = {
  enabled: boolean;
  /** Motivo accionable a mostrar junto al candado 🔒 cuando `enabled === false`. */
  reason: string | null;
};

/**
 * R-03 — Derives the trigger's enabled state + block motive from the client's
 * approved-offer / approved-brandboard signals. OFV first (upstream in the method),
 * brandboard second, mirroring the server precondition order.
 */
export function derivePrecondition(
  input: PreconditionInput
): PreconditionState {
  if (!input.offerApprovedNonEmpty) {
    return {
      enabled: false,
      reason:
        'Falta una OFV aprobada con contenido. Aprueba la OFV del cliente antes de generar el perfil GBP.'
    };
  }
  if (!input.brandboardApproved) {
    return {
      enabled: false,
      reason: 'Falta aprobar el brandboard antes de generar el perfil GBP.'
    };
  }
  return { enabled: true, reason: null };
}

// --- R-06..R-10: map the route's HTTP response to a differentiated error ------

export type GbpErrorKind = 'blocked' | 'gen' | 'env' | 'auth' | 'generic';

export type GbpErrorInput = {
  status: number;
  blocked?: boolean;
  reason?: string | null;
};

export type GbpErrorMapped = { kind: GbpErrorKind; message: string };

/**
 * R-06..R-10 — Maps `(status, blocked, reason)` to a `(kind, message)` the UI shows.
 * `409 blocked` (R-06) is a business state (actionable, returns to idle), NOT a system
 * failure. See `design.md` §3 for the exact table.
 */
export function mapGbpError(input: GbpErrorInput): GbpErrorMapped {
  const { status, blocked, reason } = input;

  // R-06 — 409 precondition block, mapped by reason to an actionable message.
  if (status === 409 && blocked) {
    switch (reason) {
      case 'no_approved_offer':
        return {
          kind: 'blocked',
          message:
            'Este cliente no tiene una OFV aprobada. Aprueba la OFV antes de generar.'
        };
      case 'empty_offer':
        return {
          kind: 'blocked',
          message:
            'La OFV aprobada está vacía. Completa la oferta antes de generar.'
        };
      case 'no_approved_brandboard':
        return {
          kind: 'blocked',
          message: 'Falta aprobar el brandboard antes de generar el perfil GBP.'
        };
      default:
        return {
          kind: 'blocked',
          message:
            'No se cumplen las precondiciones para generar el perfil GBP.'
        };
    }
  }

  // R-07 — generation/validation malformed.
  if (status === 422) {
    return {
      kind: 'gen',
      message: 'No se pudo generar un perfil válido. Reintenta.'
    };
  }
  // R-08 — AI service not configured (environment condition, do not loop-retry).
  if (status === 503) {
    return {
      kind: 'env',
      message: 'El servicio de IA no está configurado. Avisa al administrador.'
    };
  }
  // R-09 — session / permission.
  if (status === 401) {
    return {
      kind: 'auth',
      message: 'Tu sesión expiró. Vuelve a iniciar sesión.'
    };
  }
  if (status === 403) {
    return { kind: 'auth', message: 'No tienes permiso sobre este cliente.' };
  }
  // R-10 — 400/404/500/anything unmapped: generic, include HTTP status.
  return {
    kind: 'generic',
    message: `Error ${status} al generar. Reintenta o reporta.`
  };
}

// --- R-15: tolerate >=1 gbp_profiles row (pick most recent, never throw) ------

/**
 * R-15 — Selects the most-recent `gbp_profiles` row from an array, tolerating 0, 1
 * or N rows without throwing (replaces the brittle `.single()`). The page also
 * orders `created_at desc, limit 1` server-side; this pure selector is the null-safe
 * pick and the unit-tested proof of the "≥1 fila no rompe" behavior (T-16).
 */
export function selectLatestGbpProfile<
  T extends { created_at?: string | null }
>(rows: T[] | null | undefined): T | null {
  if (!rows || rows.length === 0) return null;
  if (rows.length === 1) return rows[0];
  return [...rows].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    return tb - ta;
  })[0];
}

// --- F-068 CL-035: decide whether the anti-dup confirmation is needed ---------

/** Asset states that mean the slice already produced output for this client.
 * Kept identical to the previous inline `EXISTING_ASSET_STATES` in the page. */
export const EXISTING_ASSET_STATES = ['review', 'approved', 'live'];

export type NeedsRegenerateConfirmInput = {
  gbpProfileId: string | null;
  gbpAssetStatus: string | null;
  existingAssetStates?: string[];
};

/**
 * F-068 R-01/R-05/R-06 — Replicates the exact boolean algebra the page used inline
 * for the anti-dup guard (`!!gbpProfileId || existingAssetStates.includes(status)`).
 * Extracting it makes the anti-dup semantics of F-067 R-11 unit-testable and proves
 * they are preserved when the `window.confirm` is swapped for the in-app modal.
 *
 * `true`  → a profile/preview already exists → the page must open the confirm modal
 *           BEFORE calling the route (never a second AI call without confirmation).
 * `false` → first generation → the page fires directly (no modal).
 */
export function needsRegenerateConfirm(
  input: NeedsRegenerateConfirmInput
): boolean {
  const states = input.existingAssetStates ?? EXISTING_ASSET_STATES;
  return !!input.gbpProfileId || states.includes(input.gbpAssetStatus ?? '');
}

// --- F-068 CL-036: null-safe parse + round-trip serialize of service_area -----

/** Editable sub-fields the GBP page binds to two `<Input>`s. `cities` is the
 * comma-separated string form of the jsonb `cities: string[]`. */
export type ServiceAreaFields = { notes: string; cities: string };

/**
 * F-068 R-07/R-08/R-10 — Null-safe parse of `gbp_profiles.service_area` (jsonb,
 * `Record<string, unknown> | null`) into the two editable sub-fields. NEVER throws
 * and NEVER yields `[object Object]`:
 *   - object `{notes?, cities?}` → notes = String(notes ?? ''); cities = cities[].join(', ')
 *   - array (legacy `string[]`)  → notes = '';                  cities = arr.join(', ')
 *   - string (legacy)            → notes = '';                  cities = raw
 *   - null / undefined / other   → notes = '';                  cities = ''
 */
export function parseServiceArea(raw: unknown): ServiceAreaFields {
  const empty: ServiceAreaFields = { notes: '', cities: '' };

  if (raw == null) return empty;

  // Array legacy: string[] (or coercible) -> cities.
  if (Array.isArray(raw)) {
    return {
      notes: '',
      cities: raw
        .map((c) => (typeof c === 'string' ? c : String(c)))
        .map((c) => c.trim())
        .filter(Boolean)
        .join(', ')
    };
  }

  // String legacy: whole value is the cities text.
  if (typeof raw === 'string') {
    return { notes: '', cities: raw };
  }

  // Canonical object shape {notes, cities}. Guard each sub-field independently so
  // an unknown/partial object degrades safely instead of throwing.
  if (typeof raw === 'object') {
    const obj = raw as { notes?: unknown; cities?: unknown };
    const notes = typeof obj.notes === 'string' ? obj.notes : '';
    let cities = '';
    if (Array.isArray(obj.cities)) {
      cities = obj.cities
        .map((c) => (typeof c === 'string' ? c : String(c)))
        .map((c) => c.trim())
        .filter(Boolean)
        .join(', ');
    } else if (typeof obj.cities === 'string') {
      cities = obj.cities;
    }
    return { notes, cities };
  }

  // number/boolean/anything else -> safe empty (no [object Object], no throw).
  return empty;
}

/**
 * F-068 R-09/R-10 — Re-serializes the two editable sub-fields back to the canonical
 * jsonb shape `{notes: string, cities: string[]}`, guaranteeing a safe round-trip
 * with `parseServiceArea`. Never applies `String(value)` nor blind `JSON.stringify`,
 * and never degrades the object to a flat `string[]`.
 *   - cities → split(',').map(trim).filter(Boolean)
 *   - notes  → trim
 *   - both empty → `null` (column is nullable; avoids storing an empty-object husk)
 */
export function serializeServiceArea(
  notes: string,
  cities: string
): { notes: string; cities: string[] } | null {
  const notesTrim = (notes ?? '').trim();
  const cityList = (cities ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  if (notesTrim === '' && cityList.length === 0) return null;
  return { notes: notesTrim, cities: cityList };
}
