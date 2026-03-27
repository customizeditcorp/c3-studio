import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          }
        }
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { photo_id, client_id } = await request.json();
    if (!photo_id || !client_id) {
      return NextResponse.json({ error: 'photo_id and client_id required' }, { status: 400 });
    }

    const { data: photo } = await supabase.from('client_photos').select('*').eq('id', photo_id).single();
    if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 });

    const { data: client } = await supabase.from('clients').select('business_name, industry').eq('id', client_id).single();

    // Get signed URL
    const { data: signedUrlData } = await supabase.storage.from('client-photos').createSignedUrl(photo.storage_path, 300);
    if (!signedUrlData?.signedUrl) {
      return NextResponse.json({ error: 'Could not get photo URL' }, { status: 500 });
    }

    // Download and convert to base64
    const imgResponse = await fetch(signedUrlData.signedUrl);
    const imgBuffer = await imgResponse.arrayBuffer();
    const base64 = Buffer.from(imgBuffer).toString('base64');
    const mediaType = (photo.mime_type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `Generate SEO-optimized alt text for this image.
Context: Business: ${client?.business_name || 'Unknown'}, Industry: ${client?.industry || 'home services'}, GBP Category: ${photo.gbp_category || 'work'}, Location: Central Coast, California.
Rules: Max 125 characters. Include business type and location naturally. Describe what is VISIBLE. Use homeowner search keywords. English only. No quotes. No "alt text:" prefix.
Respond with ONLY the alt text.`
          }
        ]
      }]
    });

    const altText = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text.trim() : '';

    await supabase.from('client_photos').update({ alt_text_auto: altText }).eq('id', photo_id);
    await supabase.from('activity_log').insert({ client_id, action: 'alt_text_generated', entity_type: 'photo', entity_id: photo_id, metadata: { alt_text: altText } });

    return NextResponse.json({ success: true, alt_text: altText, photo_id });

  } catch (error) {
    console.error('generate-alt-text error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
