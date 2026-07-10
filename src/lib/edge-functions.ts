import type {
  GenerateContentParams,
  GenerateContentResponse
} from '@/types/generate-content';

/**
 * Content generation helpers.
 * Uses the Next.js API route (/api/generate-content) which handles
 * Supabase auth via cookies and calls Claude API server-side.
 * This avoids Supabase Edge Function auth complexity.
 */

export async function generateContent(
  params: GenerateContentParams
): Promise<GenerateContentResponse> {
  const response = await fetch('/api/generate-content', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      step: params.step,
      client_id: params.clientId,
      input_data: params.inputData,
      save: params.save ?? true
    })
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(
      (typeof error.error === 'string' ? error.error : null) ||
        `Error ${response.status} generando ${params.step}`
    );
  }

  return response.json();
}

/**
 * F-067 — T-01 (R-01) — Helper for the GBP slice route `/api/generate-gbp`
 * (delivered by F-066, frozen — this helper only CONSUMES it, never modifies it).
 *
 * Unlike `generateContent`, this does NOT `throw` on every non-2xx: a `409 blocked`
 * is a business state the UI must map (R-06), not a system error. So it returns a
 * discriminated result that preserves the HTTP `status` plus `blocked`/`reason`/`error`
 * from the body, letting the caller differentiate responses (R-01).
 */
export type GenerateGbpSuccess = {
  success: true;
  gbp_profile: { id: string };
  preview: { id: string; token: string; url: string };
  asset_status: string;
  method_grounding: { applied: boolean; reason: string | null };
};

export type GenerateGbpResult =
  | { ok: true; data: GenerateGbpSuccess }
  | {
      ok: false;
      status: number;
      blocked: boolean;
      reason: string | null;
      message: string;
    };

export async function generateGbp(
  clientId: string
): Promise<GenerateGbpResult> {
  const response = await fetch('/api/generate-gbp', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId })
  });

  const body = await response.json().catch(() => ({}));

  if (response.ok) {
    return { ok: true, data: body as GenerateGbpSuccess };
  }

  return {
    ok: false,
    status: response.status,
    blocked: body?.blocked === true,
    reason: typeof body?.reason === 'string' ? body.reason : null,
    message:
      (typeof body?.error === 'string' && body.error) ||
      `Error ${response.status}`
  };
}

export async function generateAltText(params: {
  photoId: string;
  clientId: string;
}): Promise<{ success: boolean; alt_text: string; photo_id: string }> {
  const response = await fetch('/api/generate-alt-text', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      photo_id: params.photoId,
      client_id: params.clientId
    })
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new Error(
      error.error || `Error ${response.status} generando alt text`
    );
  }

  return response.json();
}
