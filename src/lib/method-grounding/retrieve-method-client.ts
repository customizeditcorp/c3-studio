/**
 * Method grounding (F-065) — `retrieve-method` client with timeout + total
 * degradation (R-01/R-07/R-08).
 *
 * POSTs to `process.env.RETRIEVE_METHOD_URL` with header `x-aeos-method-key:
 * process.env.RETRIEVE_METHOD_KEY` and body { methodology_family, step, query,
 * top_k }. Bounded by an AbortController (TIMEOUT_MS). Returns a discriminated
 * result; EVERY branch (timeout/network/4xx/5xx/malformed/empty/not-configured)
 * maps to `{ ok:false, reason }` — no exception ever escapes (design §6).
 *
 * Secrets are read exclusively from `process.env` (R-20); no literals.
 */
import type { MethodSegment, RetrieveResult } from './types.ts';

/** Request `top_k` — contract default; the function already prioritizes tier 1. */
export const TOP_K = 5;

/** AbortController timeout (~2-3s range fixed by the operator; design §6). */
export const TIMEOUT_MS = 2500;

export interface RetrieveParams {
  methodology_family: string;
  step: string;
  query: string;
}

export interface RetrieveOptions {
  /** Override the timeout (defaults to TIMEOUT_MS). For tests. */
  timeoutMs?: number;
  /** Override the fetch implementation (defaults to global fetch). For tests. */
  fetchImpl?: typeof fetch;
  /** Override env resolution (defaults to process.env). For tests. */
  env?: { url?: string; key?: string };
}

/**
 * Invoke `retrieve-method`, mapping all failures to `{ ok:false, reason }`.
 * Never throws.
 */
export async function fetchRetrieveMethod(
  params: RetrieveParams,
  options: RetrieveOptions = {}
): Promise<RetrieveResult> {
  const url = options.env ? options.env.url : process.env.RETRIEVE_METHOD_URL;
  const key = options.env ? options.env.key : process.env.RETRIEVE_METHOD_KEY;

  if (!url || !key) {
    return { ok: false, reason: 'not_configured' };
  }

  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-aeos-method-key': key
      },
      body: JSON.stringify({
        methodology_family: params.methodology_family,
        step: params.step,
        query: params.query,
        top_k: TOP_K
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const status = res.status;
      if (status >= 400 && status < 500)
        return { ok: false, reason: 'http_4xx' };
      return { ok: false, reason: 'http_5xx' };
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { ok: false, reason: 'malformed' };
    }

    const segments = (data as { segments?: unknown } | null)?.segments;
    if (!Array.isArray(segments)) return { ok: false, reason: 'malformed' };
    if (segments.length === 0) return { ok: false, reason: 'empty' };

    return { ok: true, segments: segments as MethodSegment[] };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, reason: 'timeout' };
    }
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
