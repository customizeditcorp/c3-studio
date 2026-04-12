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
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(
      (typeof error.error === 'string' ? error.error : null) ||
        `Error ${response.status} generando ${params.step}`
    );
  }

  return response.json();
}

export async function generateAltText(params: {
  photoId: string;
  clientId: string;
}): Promise<{ success: boolean; alt_text: string; photo_id: string }> {
  const response = await fetch('/api/generate-alt-text', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_id: params.photoId, client_id: params.clientId })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Error ${response.status} generando alt text`);
  }

  return response.json();
}
