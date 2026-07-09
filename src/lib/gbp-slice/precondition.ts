/**
 * F-066 — T-01 — Guard de precondición y frontera de consumo (R-01, R-02, R-11).
 *
 * Verifies, from ALREADY-FETCHED rows, that the client is eligible for the slice:
 *   - has an `offers` row in status `approved` AND with real content
 *     (`big_promise` non-empty, flat column OR content jsonb) — R-01 reinforced
 *     (CL-027: a status='approved' but EMPTY offer is a smoke artifact and does
 *     NOT satisfy the precondition);
 *   - has a `brandboards` row in status `approved`.
 *
 * This module is READ-ONLY and PURE: it never mutates, regenerates or repairs the
 * `offers` pipeline (R-02). If the precondition fails, the caller must BLOCK and
 * report to the operator without producing `gbp_profiles`/`previews` (R-01/R-11).
 */
import type { RawOfferRow, RawBrandboard } from './types.ts';

export type PreconditionReason =
  | 'no_approved_offer'
  | 'empty_offer'
  | 'no_approved_brandboard';

export type PreconditionResult =
  | { ok: true; offer: RawOfferRow; brandboard: RawBrandboard }
  | { ok: false; reason: PreconditionReason; message: string };

/** True when the offer carries real strategic content: a non-empty `big_promise`
 * in the flat column OR inside `content` jsonb (R-01 reinforced). */
export function isOfferNonEmpty(offer: RawOfferRow): boolean {
  const flat = typeof offer.big_promise === 'string' ? offer.big_promise : '';
  const nested =
    offer.content && typeof offer.content.big_promise === 'string'
      ? (offer.content.big_promise as string)
      : '';
  return flat.trim().length > 0 || nested.trim().length > 0;
}

/** Selects the first APPROVED offer with real content. Ordering is the caller's
 * responsibility (pass most-recent-first for deterministic pick). */
export function selectEligibleOffer(offers: RawOfferRow[]): RawOfferRow | null {
  const approved = offers.filter((o) => o.status === 'approved');
  return approved.find(isOfferNonEmpty) ?? null;
}

/**
 * Precondition gate (R-01/R-02/R-11). Consumes rows only; performs NO writes.
 * `offers` should be pre-filtered to a single client and ordered most-recent-first.
 */
export function checkPrecondition(input: {
  offers: RawOfferRow[];
  brandboards: RawBrandboard[];
}): PreconditionResult {
  const { offers, brandboards } = input;

  const approvedOffers = offers.filter((o) => o.status === 'approved');
  if (approvedOffers.length === 0) {
    return {
      ok: false,
      reason: 'no_approved_offer',
      message:
        'Precondición incumplida (R-01/R-02): el cliente no tiene una OFV en status `approved`. ' +
        'El slice CONSUME una OFV aprobada; no genera ni repara el pipeline de offers.'
    };
  }

  const eligible = approvedOffers.find(isOfferNonEmpty) ?? null;
  if (!eligible) {
    return {
      ok: false,
      reason: 'empty_offer',
      message:
        'Precondición incumplida (R-01 reforzado / CL-027): existe una OFV `approved` pero VACÍA ' +
        '(`big_promise` sin contenido). Una OFV aprobada pero vacía es un artefacto de smoke y NO ' +
        'satisface la precondición: el slice consume material real.'
    };
  }

  const approvedBrandboard =
    brandboards.find((b) => b.status === 'approved') ?? null;
  if (!approvedBrandboard) {
    return {
      ok: false,
      reason: 'no_approved_brandboard',
      message:
        'Precondición incumplida (R-01): el cliente no tiene un brandboard en status `approved` ' +
        '(mismo client_id). Sin brandboard aprobado el slice no produce el asset GBP.'
    };
  }

  return { ok: true, offer: eligible, brandboard: approvedBrandboard };
}
