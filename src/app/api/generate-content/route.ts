import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  ANTI_AI_RULES,
  validate,
  extractOffersFields,
  extractGeneratedOutputFields,
  attachValidation
} from '@/lib/anti-ai/validator';
import {
  QUERY_BY_STEP,
  fetchRetrieveMethod,
  selectBudgetedSegments,
  buildMethodBlock,
  composeSystemContent,
  attachMethodGrounding,
  buildAppliedGrounding,
  buildUnappliedGrounding,
  type MethodGrounding,
  type Step
} from '@/lib/method-grounding';
import {
  buildLanguageDirective,
  normalizeContentLanguage
} from '@/lib/content-language';
// F-089 R-03 — el home de `gbp_description` es `gbp_profiles` (lo escribe `generate-gbp`);
// este write-path NO debe duplicar esa fila en `generated_outputs`.
import { shouldPersistGeneratedOutput } from '@/lib/gbp-slice/content-status';
const AI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY is not configured' },
        { status: 503 }
      );
    }
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          }
        }
      }
    );
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const { step, client_id, input_data, save = true } = body;
    if (!step || !client_id) {
      return NextResponse.json(
        { error: 'step and client_id are required' },
        { status: 400 }
      );
    }
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', client_id)
      .single();
    if (clientError || !client) {
      return NextResponse.json(
        { error: 'Client not found: ' + client_id },
        { status: 404 }
      );
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
    const promptSelect = 'id, system_prompt, methodology';
    let prompt: {
      id: string;
      system_prompt: string;
      methodology: string | null;
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
        { error: 'Prompt lookup failed: ' + tpErr.message },
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
          { error: 'Prompt lookup failed: ' + gpErr.message },
          { status: 500 }
        );
      }
      prompt = globalPrompt;
    }
    if (!prompt) {
      return NextResponse.json(
        { error: 'No active prompt found for step: ' + step },
        { status: 404 }
      );
    }
    // F-065: method grounding (Fase 2). Retrieve canonical C3 method live and
    // AUGMENT the static system_prompt. Aumentativo, no-bloqueante, degradable:
    // any failure (guard, timeout, network, http, malformed, empty) -> empty
    // block + applied=false, generation proceeds with the static prompt (R-08).
    // Runs BEFORE building `messages` so the system message can be augmented
    // (R-12). Never aborts/gates/changes status (R-13).
    const groundingRetrievedAt = new Date().toISOString();
    const groundingQuery = QUERY_BY_STEP[step as Step];
    let methodBlock = '';
    let methodGrounding: MethodGrounding;
    if (prompt.methodology == null) {
      methodGrounding = buildUnappliedGrounding({
        reason: 'no_methodology',
        methodology_family: null,
        step,
        query: null,
        retrievedAtIso: groundingRetrievedAt
      });
    } else if (!groundingQuery) {
      methodGrounding = buildUnappliedGrounding({
        reason: 'unknown_step',
        methodology_family: prompt.methodology,
        step,
        query: null,
        retrievedAtIso: groundingRetrievedAt
      });
    } else {
      const retrieved = await fetchRetrieveMethod({
        methodology_family: prompt.methodology,
        step,
        query: groundingQuery
      });
      if (retrieved.ok) {
        const injected = selectBudgetedSegments(retrieved.segments);
        methodBlock = buildMethodBlock(retrieved.segments);
        methodGrounding = buildAppliedGrounding({
          segments: injected,
          methodology_family: prompt.methodology,
          step,
          query: groundingQuery,
          retrievedAtIso: groundingRetrievedAt
        });
      } else {
        methodGrounding = buildUnappliedGrounding({
          reason: retrieved.reason,
          methodology_family: prompt.methodology,
          step,
          query: groundingQuery,
          retrievedAtIso: groundingRetrievedAt
        });
      }
    }
    let contextChain = '';
    const needsBrief = [
      'buyer_persona',
      'ofv',
      'gbp_description',
      'gbp_posts',
      'campaign_copy',
      'website_home',
      'website_service',
      'website_location',
      'nurturing',
      'social_content'
    ].includes(step);
    const needsPersona = [
      'ofv',
      'gbp_description',
      'gbp_posts',
      'campaign_copy',
      'website_home',
      'website_service',
      'website_location',
      'nurturing',
      'social_content'
    ].includes(step);
    const needsOffer = [
      'gbp_description',
      'gbp_posts',
      'campaign_copy',
      'website_home',
      'website_service',
      'website_location',
      'nurturing',
      'social_content'
    ].includes(step);
    if (needsBrief) {
      const { data: brief } = await supabase
        .from('briefs')
        .select('content, raw_text')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (brief)
        contextChain +=
          '\n\n## BRIEF DEL NEGOCIO (APROBADO)\n' +
          (brief.raw_text || JSON.stringify(brief.content));
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
      if (persona)
        contextChain +=
          '\n\n## BUYER PERSONA (APROBADO)\n' +
          (persona.raw_text || JSON.stringify(persona.content));
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
      if (offer)
        contextChain +=
          '\n\n## OFERTA DE VALOR (APROBADA)\nBig Promise: ' +
          offer.big_promise +
          '\nVehiculo: ' +
          offer.vehicle_name +
          ' — ' +
          offer.vehicle_description +
          '\nQuick Win: ' +
          offer.quick_win +
          '\nGarantia: ' +
          offer.guarantee;
    }
    const userMessage =
      '## DATOS DEL CLIENTE\nNegocio: ' +
      client.business_name +
      '\nIndustria: ' +
      client.industry +
      '\nContacto: ' +
      (client.contact_first_name || '') +
      ' ' +
      (client.contact_last_name || '') +
      '\nTelefono: ' +
      (client.phone || 'N/A') +
      '\nEmail: ' +
      (client.email || 'N/A') +
      '\nTier: ' +
      (client.tier || 'N/A') +
      contextChain +
      '\n\n## INPUT ADICIONAL DEL OPERADOR\n' +
      (input_data
        ? JSON.stringify(input_data, null, 2)
        : 'Sin datos adicionales.') +
      '\n\nGenera el output en formato JSON + raw_text (markdown). Responde SOLO con JSON valido, sin backticks ni texto adicional.' +
      // F-081 (R-04/R-06): directiva imperativa de idioma al CIERRE del user message
      // (recency para gpt-4o) driven por client.content_language. Sobrescribe el idioma
      // redaccional de los prompt_versions sin reescribirlos (precedente alt-text:101).
      buildLanguageDirective(client.content_language as string | null);
    // F-065: augment the static system_prompt with the method block (R-04/R-14).
    // Empty block -> systemContent === prompt.system_prompt (static intact).
    const systemContent = composeSystemContent(
      prompt.system_prompt,
      methodBlock
    );
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userMessage }
      ]
    });
    const responseText = completion.choices[0]?.message?.content || '';
    let parsedContent: Record<string, unknown>;
    let rawText = responseText;
    try {
      const cleaned = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
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
    const outputSteps = [
      'gbp_description',
      'gbp_posts',
      'campaign_copy',
      'website_home',
      'website_service',
      'website_location',
      'nurturing',
      'social_content'
    ];
    if (save) {
      if (tableMap[step]) {
        const table = tableMap[step];
        const insertData: Record<string, unknown> = {
          client_id,
          prompt_version_id: prompt.id,
          content: parsedContent,
          status: 'draft',
          version: 1
        };
        // La tabla `offers` no tiene columna `raw_text` (el raw persiste en
        // `content.raw_text`); solo `briefs`/`buyer_personas` la poseen.
        if (table !== 'offers') {
          insertData.raw_text = rawText;
        }
        if (step === 'ofv' && parsedContent) {
          const { data: lp } = await supabase
            .from('buyer_personas')
            .select('id')
            .eq('client_id', client_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!lp) {
            return NextResponse.json(
              {
                success: false,
                error: 'OFV requiere una buyer persona para el cliente'
              },
              { status: 422 }
            );
          }
          insertData.persona_id = lp.id;
          for (const k of [
            'big_promise',
            'vehicle_name',
            'vehicle_description',
            'quick_win',
            'decision_frame',
            'guarantee',
            'urgency',
            'social_proof',
            'deliverables'
          ]) {
            if (parsedContent[k]) insertData[k] = parsedContent[k];
          }
          // F-064: anti-AI validation (detective, non-blocking). Extract the
          // offers-shape fields and append `content._validation`. is_valid=false
          // does NOT abort, change status, or gate anything (R-14/R-15/R-16).
          const offerFields = extractOffersFields({
            ...parsedContent,
            content: parsedContent
          });
          const offerValidation = validate(offerFields, ANTI_AI_RULES, {
            outputType: 'ofv'
          });
          insertData.content = attachValidation(
            parsedContent,
            offerValidation,
            new Date().toISOString()
          );
        }
        if (step === 'buyer_persona') {
          const { data: lb } = await supabase
            .from('briefs')
            .select('id')
            .eq('client_id', client_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lb) insertData.brief_id = lb.id;
        }
        // F-065: append `content._method_grounding` (additive) AFTER F-064's
        // attachValidation (where it ran) and BEFORE the insert (R-10/R-11/R-12).
        // Non-blocking: does not alter status or gate persistence (R-13).
        insertData.content = attachMethodGrounding(
          insertData.content as Record<string, unknown>,
          methodGrounding
        );
        const { data, error } = await supabase
          .from(table)
          .insert(insertData)
          .select()
          .single();
        if (error) {
          return NextResponse.json(
            { success: false, error: error.message, code: error.code },
            { status: 422 }
          );
        }
        savedRecord = data;
      } else if (
        outputSteps.includes(step) &&
        shouldPersistGeneratedOutput(step)
      ) {
        // F-089 R-03 — `gbp_description` cae acá (outputSteps.includes) pero
        // `shouldPersistGeneratedOutput` lo excluye: NO se crea la fila duplicada en
        // `generated_outputs` (home = `gbp_profiles`, escrito por `generate-gbp`).
        // `savedRecord` queda undefined → `saved: null` y sin activity_log de duplicado.
        const { data: lo } = await supabase
          .from('offers')
          .select('id')
          .eq('client_id', client_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        // F-064: anti-AI validation (detective, non-blocking). Extract the
        // generated_outputs-shape fields (content string leaves) and append
        // `content._validation`. is_valid=false does NOT abort/gate (R-14/R-15/R-16).
        const outputFields = extractGeneratedOutputFields({
          content: parsedContent,
          output_type: step
        });
        const outputValidation = validate(outputFields, ANTI_AI_RULES, {
          outputType: step
        });
        const validatedContent = attachValidation(
          parsedContent,
          outputValidation,
          new Date().toISOString()
        );
        // F-065: append `content._method_grounding` (additive) AFTER
        // attachValidation and BEFORE the insert (R-10/R-11/R-12). Non-blocking.
        const groundedContent = attachMethodGrounding(
          validatedContent,
          methodGrounding
        );
        const { data, error } = await supabase
          .from('generated_outputs')
          .insert({
            client_id,
            offer_id: lo?.id || null,
            prompt_version_id: prompt.id,
            output_type: step,
            content: groundedContent,
            // F-081 (R-07): el tag refleja el idioma del CLIENTE (fuente de verdad),
            // no el parsedContent.language cosmético que emite el modelo. Fallback 'es'.
            language: normalizeContentLanguage(
              client.content_language as string | null
            ),
            status: 'draft',
            version: 1
          })
          .select()
          .single();
        if (error) {
          return NextResponse.json(
            { success: false, error: error.message, code: error.code },
            { status: 422 }
          );
        }
        savedRecord = data;
      }
      const persistedStep =
        Boolean(tableMap[step]) || outputSteps.includes(step);
      if (!persistedStep || savedRecord) {
        await supabase.from('activity_log').insert({
          tenant_id: clientTenantId,
          client_id,
          user_id: user.id,
          action: step + '_generated',
          entity_type: step,
          entity_id:
            savedRecord?.id != null ? String(savedRecord.id) : client_id,
          metadata: {
            prompt_version_id: prompt.id,
            methodology: prompt.methodology,
            model: AI_MODEL
          }
        });
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
