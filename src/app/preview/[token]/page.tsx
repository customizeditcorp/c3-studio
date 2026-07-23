import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import PreviewPublicView from './preview-public-view';

export default async function PreviewPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  // Fetch preview by token (no auth required)
  const { data: preview, error } = await supabase
    .from('previews')
    .select(
      `
      *,
      clients (
        id,
        business_name,
        industry,
        phone,
        email
      )
    `
    )
    .eq('token', token)
    .single();

  if (error || !preview) {
    notFound();
  }

  // Check if expired
  const isExpired = new Date(preview.expires_at) < new Date();

  // Fetch GBP profile
  const { data: gbpProfile } = await supabase
    .from('gbp_profiles')
    .select('*')
    .eq('client_id', preview.client_id)
    .single();

  // Fetch approved photos
  const { data: photos } = await supabase
    .from('client_photos')
    .select('*')
    .eq('client_id', preview.client_id)
    .eq('approved', true)
    .limit(10);

  // F-089 R-07 — se eliminó el read doblemente muerto de `generated_outputs`
  // (status='approved' que nadie seteaba). El preview deriva contenido Y aprobación
  // de `gbp_profiles` (fetch arriba, incluye `content_status`); el gating vive en
  // `preview-public-view.tsx` vía `resolveApprovedGbpDescription`.

  // Fetch latest approved offer (OFV)
  const { data: latestOffer } = await supabase
    .from('offers')
    .select('id, content, status, created_at')
    .eq('client_id', preview.client_id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <PreviewPublicView
      preview={preview}
      gbpProfile={gbpProfile}
      photos={photos || []}
      isExpired={isExpired}
      token={token}
      latestOffer={latestOffer || null}
    />
  );
}
