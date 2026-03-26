// supabase/functions/generate-content/index.ts
// C3 Studio — Content Generation Engine
// Reads prompt from prompt_versions, calls Claude API, saves result

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
    const { step, client_id, input_data, save = true } = await req.json()

    // Validate required fields
    if (!step || !client_id) {
      return new Response(
        JSON.stringify({ error: 'step and client_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Init Supabase client with user's auth
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Get active prompt for this step
    const { data: prompt, error: promptError } = await supabase
      .from('prompt_versions')
      .select('id, system_prompt, methodology, validation_rules')
      .eq('step', step)
      .eq('active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (promptError || !prompt) {
      return new Response(
        JSON.stringify({ error: `No active prompt found for step: ${step}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Get client data for context
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single()

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: `Client not found: ${client_id}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Gather previous outputs for context chain
    // brief → persona needs brief
    // ofv → needs brief + persona
    // gbp/website/copy → needs brief + persona + ofv
    let contextChain = ''

    if (['buyer_persona', 'ofv', 'gbp_description', 'gbp_posts', 'campaign_copy',
         'website_home', 'website_service', 'website_location', 'nurturing', 'social_content'].includes(step)) {
      const { data: brief } = await supabase
        .from('briefs')
        .select('content, raw_text')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (brief) {
        contextChain += `\n\n## BRIEF DEL NEGOCIO (APROBADO)\n${brief.raw_text || JSON.stringify(brief.content)}`
      }
    }

    if (['ofv', 'gbp_description', 'gbp_posts', 'campaign_copy',
         'website_home', 'website_service', 'website_location', 'nurturing', 'social_content'].includes(step)) {
      const { data: persona } = await supabase
        .from('buyer_personas')
        .select('content, raw_text')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (persona) {
        contextChain += `\n\n## BUYER PERSONA (APROBADO)\n${persona.raw_text || JSON.stringify(persona.content)}`
      }
    }

    if (['gbp_description', 'gbp_posts', 'campaign_copy',
         'website_home', 'website_service', 'website_location', 'nurturing', 'social_content'].includes(step)) {
      const { data: offer } = await supabase
        .from('offers')
        .select('*')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false })
        .limit(1)
        .single()

      if (offer) {
        contextChain += `\n\n## OFERTA DE VALOR (APROBADA)\nBig Promise: ${offer.big_promise}\nVehículo: ${offer.vehicle_name} — ${offer.vehicle_description}\nQuick Win: ${offer.quick_win}\nGarantía: ${offer.guarantee}`
      }
    }

    // 4. Build user message
    const userMessage = `
## DATOS DEL CLIENTE
Negocio: ${client.business_name}
Industria: ${client.industry}
Contacto: ${client.contact_first_name} ${client.contact_last_name || ''}
Teléfono: ${client.phone || 'N/A'}
Email: ${client.email || 'N/A'}
Tier: ${client.tier || 'N/A'}
${contextChain}

## INPUT ADICIONAL DEL OPERADOR
${input_data ? JSON.stringify(input_data, null, 2) : 'Sin datos adicionales.'}

Genera el output en formato JSON + raw_text (markdown). Responde SOLO con JSON válido, sin backticks ni texto adicional.`

    // 5. Call Claude API
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: prompt.system_prompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!claudeResponse.ok) {
      const errorBody = await claudeResponse.text()
      return new Response(
        JSON.stringify({ error: `Claude API error: ${claudeResponse.status}`, details: errorBody }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const claudeData = await claudeResponse.json()
    const responseText = claudeData.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('')

    // 6. Parse response
    let parsedContent: any
    let rawText = responseText

    try {
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      parsedContent = JSON.parse(cleaned)
      rawText = parsedContent.raw_text || responseText
    } catch {
      parsedContent = { generated_text: responseText }
      rawText = responseText
    }

    // 7. Save to appropriate table
    let savedRecord = null

    if (save) {
      const tableMap: Record<string, string> = {
        'brief': 'briefs',
        'buyer_persona': 'buyer_personas',
        'ofv': 'offers',
      }

      const outputSteps = [
        'gbp_description', 'gbp_posts', 'campaign_copy',
        'website_home', 'website_service', 'website_location',
        'nurturing', 'social_content'
      ]

      if (tableMap[step]) {
        const table = tableMap[step]
        const insertData: any = {
          client_id,
          prompt_version_id: prompt.id,
          content: parsedContent,
          raw_text: rawText,
          status: 'draft',
          version: 1,
        }

        if (step === 'ofv' && parsedContent) {
          const { data: latestPersona } = await supabase
            .from('buyer_personas')
            .select('id')
            .eq('client_id', client_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (latestPersona) insertData.persona_id = latestPersona.id
          if (parsedContent.big_promise) insertData.big_promise = parsedContent.big_promise
          if (parsedContent.vehicle_name) insertData.vehicle_name = parsedContent.vehicle_name
          if (parsedContent.vehicle_description) insertData.vehicle_description = parsedContent.vehicle_description
          if (parsedContent.quick_win) insertData.quick_win = parsedContent.quick_win
          if (parsedContent.decision_frame) insertData.decision_frame = parsedContent.decision_frame
          if (parsedContent.guarantee) insertData.guarantee = parsedContent.guarantee
          if (parsedContent.urgency) insertData.urgency = parsedContent.urgency
          if (parsedContent.social_proof) insertData.social_proof = parsedContent.social_proof
          if (parsedContent.deliverables) insertData.deliverables = parsedContent.deliverables
        }

        if (step === 'buyer_persona') {
          const { data: latestBrief } = await supabase
            .from('briefs')
            .select('id')
            .eq('client_id', client_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (latestBrief) insertData.brief_id = latestBrief.id
        }

        const { data, error } = await supabase
          .from(table)
          .insert(insertData)
          .select()
          .single()

        if (error) {
          console.error(`Error saving to ${table}:`, error)
        } else {
          savedRecord = data
        }

      } else if (outputSteps.includes(step)) {
        const { data: latestOffer } = await supabase
          .from('offers')
          .select('id')
          .eq('client_id', client_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        const { data, error } = await supabase
          .from('generated_outputs')
          .insert({
            client_id,
            offer_id: latestOffer?.id || null,
            prompt_version_id: prompt.id,
            output_type: step,
            content: parsedContent,
            language: parsedContent?.language || 'en',
            status: 'draft',
            version: 1,
          })
          .select()
          .single()

        if (error) {
          console.error('Error saving to generated_outputs:', error)
        } else {
          savedRecord = data
        }
      }

      // 8. Log activity
      await supabase
        .from('activity_log')
        .insert({
          tenant_id: client.tenant_id,
          client_id,
          action: `${step}_generated`,
          entity_type: step,
          entity_id: savedRecord?.id,
          metadata: {
            prompt_version_id: prompt.id,
            methodology: prompt.methodology,
            model: 'claude-sonnet-4-20250514',
          },
        })
    }

    return new Response(
      JSON.stringify({
        success: true,
        step,
        content: parsedContent,
        raw_text: rawText,
        saved: savedRecord ? { id: savedRecord.id, table: step } : null,
        prompt_version: prompt.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Generate content error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
