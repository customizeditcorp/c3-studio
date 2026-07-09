import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/** Public: submit feedback / request changes on a preview (service role). */
export async function POST(request: NextRequest) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !url) {
      return NextResponse.json(
        {
          error:
            'Preview feedback is not configured (SUPABASE_SERVICE_ROLE_KEY)'
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const token = body?.token as string | undefined;
    const feedback = (body?.feedback as string | undefined) ?? '';

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }
    if (!feedback.trim()) {
      return NextResponse.json(
        { error: 'feedback is required' },
        { status: 400 }
      );
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: preview, error: prevErr } = await admin
      .from('previews')
      .select('id, client_id, expires_at, type')
      .eq('token', token)
      .maybeSingle();

    if (prevErr || !preview) {
      return NextResponse.json({ error: 'Preview not found' }, { status: 404 });
    }

    if (new Date(preview.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Preview link has expired' },
        { status: 410 }
      );
    }

    // NOTE (F-066): `previews` has no `feedback_at` column in the live schema; writing
    // it made this update fail (422), breaking the reject path. Persist `feedback` only.
    const { error: upErr } = await admin
      .from('previews')
      .update({
        approved: false,
        feedback
      })
      .eq('id', preview.id);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 422 });
    }

    // F-066 R-13: on GBP change request (rejected, with feedback), keep the presence
    // asset in 'review' awaiting regeneration. Scope-limited to asset_type='gbp' (R-14).
    if (preview.type === 'gbp') {
      await admin
        .from('client_assets')
        .update({ status: 'review', updated_at: new Date().toISOString() })
        .eq('client_id', preview.client_id)
        .eq('asset_type', 'gbp');
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('preview-feedback error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
