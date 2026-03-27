import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL =
  process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 503 }
      );
    }

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

    const body = await request.json();
    const { step, client_id, input_data, save = true } = body;

    if (!step || !client_id) {
      return NextResponse.json({ error: 'step and client_id are required' }, { status: 400 });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();

    if (clientError || !client) {
      return NextResponse.json({ error: `Client not found: ${client_id}` }, { status: 404 });
    }

    const clientTenantId = client.tenant_id as string;

    const { data: operator, error: opErr } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();

    if (opErr || !operator?.tenant_id) {
      return NextResponse.json(
        { error: 'Operator profile missing or has no tenant_id' },
        { status: 403 }
      );
    }

    if (operator.tenant_id !== clientTenantId) {
      return NextResponse.json(
        { error: 'Forbidden: client belongs to another organization' },
        { status: 403 }
      );
    }

    const promptSelect =
      'id, system_prompt, methodology, validation_rules';

    let prompt: {
      id: string;
      system_prompt: string;
      methodology: string | null;
      validation_rules: unknown;
    } | null = null;

    const { data: tenantPrompt, error: tpErr } = await supabase
      .from('prompt_versions')
      .select(promptSelect)
      .eq('step', step)
      .eq('active', true)
      .eq('tenant_id', clientTenantId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tpErr) {
      return NextResponse.json(
        { error: `Prompt lookup failed: ${tpErr.message}` },
        { status: 500 }
      );
    }
    if (tenantPrompt) {
      prompt = tenantPrompt;
    } else {
      const { data: globalPrompt, error: gpErr } = await supabase
        .from('prompt_versions')
        .select(promptSelect)
        .eq('step', step)
        .eq('active', true)
        .is('tenant_id', null)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (gpErr) {
        return NextResponse.json(
          { error: `Prompt lookup failed: ${gpErr.message}` },
          { status: 500 }
        );
      }
      prompt = globalPrompt;
    }

    if (!prompt) {
      return NextResponse.json(
        { error: `No active prompt found for step: ${step}` },
        { status: 404 }
      );
    }

    let contextChain = '';
    const needsBrief = ['buyer_persona', 'ofv', 'gbp_description', 'gbp_posts',
      'campaign_copy', 'website_home', 'website_service', 'website_location',
      'nurturing', 'social_content'].includes(step);
    const needsPersona = ['ofv', 'gbp_description', 'gbp_posts', 'campaign_copy',
      'website_home', 'website_service', 'website_location', 'nurturing', 'social_content'].includes(step);
    const needsOffer = ['gbp_description', 'gbp_posts', 'campaign_copy',
      'website_home', 'website_service', 'website_location', 'nurturing', 'social_content'].includes(step);

    if (needsBrief) {
      const { data: brief } = await supabase
        .from('briefs')
        .select('content, raw_text')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (brief) contextChain += `\n\n## BRIEF DEL NEGOCIO (APROBADO)\n${brief.raw_text || JSON.stringify(brief.content)}`;
    }

    if (needsPersona) {
      const { data: persona } = await supabase
        .from('buyer_personas')
        .select('content, raw_text')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (persona) contextChain += `\n\n## BUYER PERSONA (APROBADO)\n${persona.raw_text || JSON.stringify(persona.content)}`;
    }

    if (needsOffer) {
      const { data: offer } = await supabase
        .from('offers')
        .select('*')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (offer) contextChain += `\n\n## OFERTA DE VALOR (APROBADA)\nBig Promise: ${offer.big_promise}\nVehículo: ${offer.vehicle_name} — ${offer.vehicle_description}\nQuick Win: ${offer.quick_win}\nGarantía: ${offer.guarantee}`;
    }

    const userMessage = `
## DATOS DEL CLIENTE
Negocio: ${client.business_name}
Industria: ${client.industry}
Contacto: ${client.contact_first_name || ''} ${client.contact_last_name || ''}
Teléfono: ${client.phone || 'N/A'}
Email: ${client.email || 'N/A'}
Tier: ${client.tier || 'N/A'}
${contextChain}

## INPUT ADICIONAL DEL OPERADOR
${input_data ? JSON.stringify(input_data, null, 2) : 'Sin datos adicionales.'}

Genera el output en formato JSON + raw_text (markdown). Responde SOLO con JSON válido, sin backticks ni texto adicional.`;

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const claudeResponse = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: prompt.system_prompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    const responseText = claudeResponse.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; text: string }).text)
      .join('');

    let parsedContent: Record<string, unknown>;
    let rawText = responseText;
    try {
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedContent = JSON.parse(cleaned);
      rawText = (parsedContent.raw_text as string) || responseText;
    } catch {
      parsedContent = { generated_text: responseText };
      rawText = responseText;
    }

    let savedRecord: Record<string, unknown> | null = null;
    const tableMap: Record<string, string> = {
      brief: 'briefs',
      buyer_persona: 'buyer_personas',
      ofv: 'offers'
    };
    const outputSteps = ['gbp_description', 'gbp_posts', 'campaign_copy',
      'website_home', 'website_service', 'website_location', 'nurturing', 'social_content'];

    if (save) {
      if (tableMap[step]) {
        const table = tableMap[step];
        const insertData: Record<string, unknown> = {
          client_id,
          prompt_version_id: prompt.id,
          content: parsedContent,
          raw_text: rawText,
          status: 'draft',
          version: 1
        };

        if (step === 'ofv' && parsedContent) {
          const { data: latestPersona } = await supabase
            .from('buyer_personas').select('id').eq('client_id', client_id)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (latestPersona) insertData.persona_id = latestPersona.id;
          if (parsedContent.big_promise) insertData.big_promise = parsedContent.big_promise;
          if (parsedContent.vehicle_name) insertData.vehicle_name = parsedContent.vehicle_name;
          if (parsedContent.vehicle_description) insertData.vehicle_description = parsedContent.vehicle_description;
          if (parsedContent.quick_win) insertData.quick_win = parsedContent.quick_win;
          if (parsedContent.decision_frame) insertData.decision_frame = parsedContent.decision_frame;
          if (parsedContent.guarantee) insertData.guarantee = parsedContent.guarantee;
          if (parsedContent.urgency) insertData.urgency = parsedContent.urgency;
          if (parsedContent.social_proof) insertData.social_proof = parsedContent.social_proof;
          if (parsedContent.deliverables) insertData.deliverables = parsedContent.deliverables;
        }

        if (step === 'buyer_persona') {
          const { data: latestBrief } = await supabase
            .from('briefs').select('id').eq('client_id', client_id)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (latestBrief) insertData.brief_id = latestBrief.id;
        }

        const { data, error } = await supabase.from(table).insert(insertData).select().single();
        if (error) {
          return NextResponse.json(
            { success: false, error: error.message, code: error.code },
            { status: 422 }
          );
        }
        savedRecord = data;

      } else if (outputSteps.includes(step)) {
        const { data: latestOffer } = await supabase
          .from('offers').select('id').eq('client_id', client_id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        const { data, error } = await supabase.from('generated_outputs').insert({
          client_id,
          offer_id: latestOffer?.id || null,
          prompt_version_id: prompt.id,
          output_type: step,
          content: parsedContent,
          language: (parsedContent?.language as string) || 'es',
          status: 'draft',
          version: 1
        }).select().single();
        if (error) {
          return NextResponse.json(
            { success: false, error: error.message, code: error.code },
            { status: 422 }
          );
        }
        savedRecord = data;
      }

      if (save) {
        const persistedStep = Boolean(tableMap[step]) || outputSteps.includes(step);
        if (!persistedStep || savedRecord) {
          await supabase.from('activity_log').insert({
            tenant_id: clientTenantId,
            client_id,
            user_id: user.id,
            action: `${step}_generated`,
            entity_type: step,
            entity_id: savedRecord?.id != null ? String(savedRecord.id) : client_id,
            metadata: {
              prompt_version_id: prompt.id,
              methodology: prompt.methodology,
              model: CLAUDE_MODEL
            }
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      step,
      content: parsedContent,
      raw_text: rawText,
      saved: savedRecord ? { id: savedRecord.id, table: step } : null,
      prompt_version: prompt.id
    });

  } catch (error) {
    console.error('generate-content error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
