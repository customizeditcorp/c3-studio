import { createClient } from '@/lib/supabase/client';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body: Record<string, unknown>
): Promise<T> {
  const supabase = createClient();

  // getSession() returns the cached session; if null, try refreshing
  let { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    session = refreshed.session;
  }

  if (!session?.access_token) {
    throw new Error('No hay sesión activa. Por favor recarga la página e inicia sesión de nuevo.');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Error ${response.status} en función ${functionName}`);
  }

  return response.json();
}

export async function generateContent(params: {
  step: string;
  clientId: string;
  inputData?: Record<string, unknown>;
}) {
  return callEdgeFunction('generate-content', {
    step: params.step,
    client_id: params.clientId,
    input_data: params.inputData
  });
}

export async function generateAltText(params: {
  photoId: string;
  clientId: string;
}) {
  return callEdgeFunction('generate-alt-text', {
    photo_id: params.photoId,
    client_id: params.clientId
  });
}
