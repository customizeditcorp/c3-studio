/**
 * Content generation helpers.
 * Uses the Next.js API route (/api/generate-content) which handles
 * Supabase auth via cookies and calls Claude API server-side.
 * This avoids Supabase Edge Function auth complexity.
 */

export async function generateContent(params: {
  step: string;
  clientId: string;
  inputData?: Record<string, unknown>;
  save?: boolean;
}): Promise<{
  success: boolean;
  step: string;
  content: Record<string, unknown>;
  raw_text: string;
  saved?: { id: string; table: string } | null;
}> {
  const response = await fetch('/api/generate-content', {
    method: 'POST',
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
    throw new Error(error.error || `Error ${response.status} generando ${params.step}`);
  }

  return response.json();
}

export async function generateAltText(params: {
  photoId: string;
  clientId: string;
}): Promise<{ success: boolean; alt_text: string; photo_id: string }> {
  const response = await fetch('/api/generate-alt-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_id: params.photoId, client_id: params.clientId })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Error ${response.status} generando alt text`);
  }

  return response.json();
}
