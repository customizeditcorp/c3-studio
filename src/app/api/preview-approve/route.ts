import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Public preview approval (no end-user Supabase session).
 * Requires SUPABASE_SERVICE_ROLE_KEY server-side.
 */
export async function POST(request: NextRequest) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !url) {
      return NextResponse.json(
        { error: 'Preview approval is not configured (SUPABASE_SERVICE_ROLE_KEY)' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const token = body?.token as string | undefined;
    const feedback = (body?.feedback as string | undefined) ?? '';

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: preview, error: prevErr } = await admin
      .from('previews')
      .select('id, client_id, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (prevErr || !preview) {
      return NextResponse.json({ error: 'Preview not found' }, { status: 404 });
    }

    if (new Date(preview.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Preview link has expired' }, { status: 410 });
    }

    const { data: clientRow } = await admin
      .from('clients')
      .select('tenant_id')
      .eq('id', preview.client_id)
      .maybeSingle();

    const tenantId = clientRow?.tenant_id as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ error: 'Client tenant missing' }, { status: 500 });
    }

    const now = new Date().toISOString();

    const { error: upPrev } = await admin
      .from('previews')
      .update({ approved: true, feedback, approved_at: now })
      .eq('id', preview.id);

    if (upPrev) {
      return NextResponse.json({ error: upPrev.message }, { status: 422 });
    }

    await admin
      .from('clients')
      .update({ status: 'onboarding' })
      .eq('id', preview.client_id);

    await admin.from('activity_log').insert({
      tenant_id: tenantId,
      client_id: preview.client_id,
      action: 'preview_approved',
      entity_type: 'preview',
      entity_id: preview.id,
      metadata: { feedback: feedback || null }
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('preview-approve error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
