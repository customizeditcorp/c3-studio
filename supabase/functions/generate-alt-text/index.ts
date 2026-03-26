// supabase/functions/generate-alt-text/index.ts
// C3 Studio — Photo Alt Text Generator (Claude Vision)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { photo_id, client_id } = await req.json()

    if (!photo_id || !client_id) {
      return new Response(
        JSON.stringify({ error: 'photo_id and client_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get photo record
    const { data: photo, error: photoError } = await supabase
      .from('client_photos')
      .select('*')
      .eq('id', photo_id)
      .single()

    if (photoError || !photo) {
      return new Response(
        JSON.stringify({ error: 'Photo not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get client info for context
    const { data: client } = await supabase
      .from('clients')
      .select('business_name, industry, tenant_id')
      .eq('id', client_id)
      .single()

    // Get signed URL for the photo
    const { data: signedUrl } = await supabase.storage
      .from('client-photos')
      .createSignedUrl(photo.storage_path, 300) // 5 min

    if (!signedUrl?.signedUrl) {
      return new Response(
        JSON.stringify({ error: 'Could not get photo URL' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Download image and convert to base64
    const imageResponse = await fetch(signedUrl.signedUrl)
    const imageBuffer = await imageResponse.arrayBuffer()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)))

    // Call Claude Vision
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: photo.mime_type || 'image/jpeg',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Generate an SEO-optimized alt text for this image.

Context:
- Business: ${client?.business_name || 'Unknown'}
- Industry: ${client?.industry || 'home services'}
- GBP Category: ${photo.gbp_category}
- Location: Central Coast, California

Rules:
- Max 125 characters
- Include business type and location naturally
- Describe what is VISIBLE in the image
- Use keywords a homeowner would search for
- English only
- NO quotes around the text
- NO "alt text:" prefix

Respond with ONLY the alt text, nothing else.`
            }
          ]
        }],
      }),
    })

    const claudeData = await claudeResponse.json()
    const altText = claudeData.content?.[0]?.text?.trim() || ''

    // Update photo record with auto-generated alt text
    await supabase
      .from('client_photos')
      .update({ alt_text_auto: altText })
      .eq('id', photo_id)

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        tenant_id: client?.tenant_id,
        client_id,
        action: 'alt_text_generated',
        entity_type: 'photo',
        entity_id: photo_id,
        metadata: { alt_text: altText, gbp_category: photo.gbp_category },
      })

    return new Response(
      JSON.stringify({ success: true, alt_text: altText, photo_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
