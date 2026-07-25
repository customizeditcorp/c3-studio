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
// F-097 — regenerar = UPDATE del draft vivo (no INSERT acumulativo) en el
// path compartido del tableMap (brief/buyer_persona/ofv).
import { resolveWriteMode } from '@/lib/briefs/write-path';
// F-107 — single-source de la OFV: proyector puro de columnas (byte-equivalente
// al bucle inline previo, R-09) reusado por route + UI. `normalizeOffer` da el
// read-fallback content-first en el needsOffer de generate-content (R-07/R-08).
import { buildOfvWritePayload } from '@/lib/offers/write-path';
// F-109 — (d) tie-break determinista del consumo de offers approved: la OFV real
// gana sobre la vacía-shadow (JD Valley, 2 approved v1) SIN borrar ninguna fila.
import {
  pickCanonicalOffer,
  type CanonicalOfferRow
} from '@/lib/offers/select-canonical';
import { normalizeOffer } from '@/lib/gbp-slice/context';
import type { RawOfferRow } from '@/lib/gbp-slice/types';
// F-102 — seams puros: temperature controlada + parse con señal de usabilidad (`ok`)
// para orquestar el retry-once. La orquestación vive acá (la ruta), los seams son
// framework-free (`node --test`-ables).
import { resolveContentTemperature } from '@/lib/generate-content/generation-params';
import { parseGeneratedContent } from '@/lib/generate-content/parse';
// F-105 — core PURO de no-fabricación de prueba social (backstop determinista, inverso de
// F-098). Framework-free; la orquestación (check→retry-once→warning transitorio) vive acá,
// acotada al branch `ofv` y a la clave `social_proof`.
import {
  resolveSocialProofGrounding,
  checkOfvNonFabrication,
  buildNonFabricationRetryDirective,
  type FabricationSignal
} from '@/lib/ofv/non-fabrication';
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
      // F-109 R-11 — traer TODOS los approved candidatos (sin `limit(1)`) y elegir
      // la canónica con `pickCanonicalOffer` (version desc → contenido-no-vacío →
      // updated_at desc → id): la OFV real gana a la vacía-shadow, sin borrar nada.
      const { data: offerRows } = await supabase
        .from('offers')
        .select('*')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false });
      const offer = pickCanonicalOffer(
        (offerRows ?? []) as (RawOfferRow & CanonicalOfferRow)[]
      );
      if (offer) {
        // F-107 R-07/R-08 — read-fallback content-first: `normalizeOffer` hace
        // pickString(plana, content) → una edición almacenada en `content` deja
        // de ser ignorada (antes leía SOLO las planas, sin fallback).
        const o = normalizeOffer(offer as RawOfferRow);
        contextChain +=
          '\n\n## OFERTA DE VALOR (APROBADA)\nBig Promise: ' +
          o.big_promise +
          '\nVehiculo: ' +
          o.vehicle_name +
          ' — ' +
          o.vehicle_description +
          '\nQuick Win: ' +
          o.quick_win +
          '\nGarantia: ' +
          o.guarantee;
      }
    }
    // F-105 (R-05): `userMessageBase` = todo el user message MENOS el cierre de idioma, para
    // poder insertar la directiva de no-fabricación ANTES del idioma en el retry (mismo
    // invariante que F-098/F-099). El camino feliz es byte-idéntico (base + idioma al cierre).
    const userMessageBase =
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
      '\n\nGenera el output en formato JSON + raw_text (markdown). Responde SOLO con JSON valido, sin backticks ni texto adicional.';
    // F-081 (R-04/R-06): directiva imperativa de idioma al CIERRE del user message
    // (recency para gpt-4o) driven por client.content_language. Sobrescribe el idioma
    // redaccional de los prompt_versions sin reescribirlos (precedente alt-text:101).
    const languageDirective = buildLanguageDirective(client.content_language);
    const userMessage = userMessageBase + languageDirective;
    // F-065: augment the static system_prompt with the method block (R-04/R-14).
    // Empty block -> systemContent === prompt.system_prompt (static intact).
    const systemContent = composeSystemContent(
      prompt.system_prompt,
      methodBlock
    );
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // F-102 R-01/R-03/R-04 — call factorizado para reusarlo en el retry con params
    // IDÉNTICOS: temperature baja controlada (env-overridable, fallback robusto) en vez
    // del default 1.0 del proveedor, y `response_format: json_object` (el keyword `json`
    // ya vive en el user message → requisito de la API satisfecho, R-05).
    const callParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
      {
        model: AI_MODEL,
        max_tokens: 4096,
        temperature: resolveContentTemperature(
          process.env.OPENAI_CONTENT_TEMPERATURE
        ),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userMessage }
        ]
      };
    // F-102 R-06/R-07/R-08/R-09 — parse con seam puro (señal `ok`) + retry-once dirigido
    // a fallo estructural (vacío o JSON no parseable). Re-call con los MISMOS params, máx 1;
    // si el retry es usable se adopta, si no se conserva la 1ª generación (no-regresión).
    const first = await openai.chat.completions.create(callParams);
    const firstText = first.choices[0]?.message?.content || '';
    let result = parseGeneratedContent(firstText);
    let retried = false;
    if (!result.ok) {
      retried = true;
      const retry = await openai.chat.completions.create(callParams);
      const retryText = retry.choices[0]?.message?.content || '';
      const retryResult = parseGeneratedContent(retryText);
      if (retryResult.ok) result = retryResult;
      // else: conservar `result` (la 1ª generación) — no-regresión (R-08/R-09).
    }
    // F-105 (R-06): `let` — el retry de no-fabricación puede adoptar el output regenerado.
    let parsedContent: Record<string, unknown> = result.content;
    let rawText = result.rawText;
    // F-102 R-10 — warning TRANSITORIO (solo en la respuesta HTTP, NUNCA persistido).
    // La `reason` se deriva del PRIMER texto (lo que originó el retry). En camino feliz
    // `result.ok` es true → sin warning (R-11).
    const generationWarning = result.ok
      ? undefined
      : {
          reason: (firstText.trim().length === 0
            ? 'empty_response'
            : 'unparseable_json') as 'empty_response' | 'unparseable_json',
          retried
        };
    // --- F-105: guard determinista de no-fabricación de prueba social (backstop) ---
    // Espejo INVERSO de F-098: detecta hechos NUMÉRICOS fabricados (sin grounding present-
    // only en el contexto) en `social_proof`. Acotado al step `ofv` y a esa clave (R-11);
    // corre con save:true y save:false. Conservador/bajo-FP: [PENDIENTE]/vacío/prosa-sin-
    // números = honesto (R-01). Si detecta fabricación → retry-once dirigido (directiva ANTES
    // del cierre de idioma F-081, MISMOS params) → adopta solo si el retry es usable Y ya no
    // fabrica, si no conserva el original (R-05/R-06). Warning TRANSITORIO (nunca persistido,
    // no bloquea, R-07/R-08). NO toca el validador anti-AI/method-grounding/retry F-102 ni
    // otros steps (R-12): todo el efecto queda en `parsedContent`/`rawText` + este warning.
    let nonFabWarning:
      | { fabricated: FabricationSignal[]; retried: boolean }
      | undefined;
    if (step === 'ofv') {
      const grounding = resolveSocialProofGrounding(contextChain); // present-only (l.242-291)
      let nf = checkOfvNonFabrication(parsedContent['social_proof'], grounding);
      let nfRetried = false;
      if (!nf.ok) {
        // R-03: fabricación sin grounding → REGENERAR UNA sola vez con los MISMOS params.
        nfRetried = true;
        const directive = buildNonFabricationRetryDirective(nf.fabricated);
        // R-05: directiva ANTES del cierre de idioma (F-081 permanece como último bloque).
        const retryCompletion = await openai.chat.completions.create({
          ...callParams,
          messages: [
            { role: 'system', content: systemContent },
            {
              role: 'user',
              content: userMessageBase + '\n\n' + directive + languageDirective
            }
          ]
        });
        const retryText = retryCompletion.choices[0]?.message?.content || '';
        const retryResult = parseGeneratedContent(retryText);
        if (retryResult.ok) {
          const retryNf = checkOfvNonFabrication(
            retryResult.content['social_proof'],
            grounding
          );
          if (retryNf.ok) {
            // R-06: adoptar SOLO si el retry es usable Y ya no fabrica (mejora).
            parsedContent = retryResult.content;
            rawText = retryResult.rawText;
            nf = retryNf;
          }
          // else: el retry sigue fabricando → conservar el original (R-06).
        }
        // else: retry inválido/no-parseable → conservar el original (R-06).
      }
      // R-08: warning TRANSITORIO (solo en la respuesta HTTP, NUNCA persistido).
      nonFabWarning = nf.ok
        ? undefined
        : { fabricated: nf.fabricated, retried: nfRetried };
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
          // F-109 R-08 — preferir la buyer_persona `approved` del cliente para el
          // FK-linking; solo si no existe ninguna approved, fallback (DT-04) a la
          // última cualquier-status (preserva comportamiento previo = no-regresión).
          let { data: lp } = await supabase
            .from('buyer_personas')
            .select('id')
            .eq('client_id', client_id)
            .eq('status', 'approved')
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!lp) {
            ({ data: lp } = await supabase
              .from('buyer_personas')
              .select('id')
              .eq('client_id', client_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle());
          }
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
          // F-107 R-06/R-09 — proyección de columnas vía el helper puro
          // (byte-equivalente al bucle inline previo). `insertData.content` se
          // sigue armando FUERA del helper con attachValidation/attachMethodGrounding
          // (R-10, más abajo). persona_id/422/resolveWriteMode intactos (R-11).
          Object.assign(
            insertData,
            buildOfvWritePayload(parsedContent).columns
          );
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
          // F-109 R-09 — preferir el brief `approved` del cliente; fallback (DT-04)
          // a la última cualquier-status. Sin approved ni fallback → brief_id no se
          // setea (preserva el no-set previo, sin 422 aquí).
          let { data: lb } = await supabase
            .from('briefs')
            .select('id')
            .eq('client_id', client_id)
            .eq('status', 'approved')
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!lb) {
            ({ data: lb } = await supabase
              .from('briefs')
              .select('id')
              .eq('client_id', client_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle());
          }
          if (lb) insertData.brief_id = lb.id;
        }
        // F-065: append `content._method_grounding` (additive) AFTER F-064's
        // attachValidation (where it ran) and BEFORE the insert (R-10/R-11/R-12).
        // Non-blocking: does not alter status or gate persistence (R-13).
        insertData.content = attachMethodGrounding(
          insertData.content as Record<string, unknown>,
          methodGrounding
        );
        // F-097 R-06/R-07/R-08 — regenerar = UPDATE del draft vivo (conserva
        // `id`/`version`), no INSERT acumulativo. Aislamiento por `client_id`
        // (R-14; tenant ya verificado arriba). A lo sumo 1 draft por
        // (client_id, step). Si no hay draft vivo (o la última está `approved`)
        // → INSERT como antes (primera generación / regeneración post-aprobación).
        const { data: latest } = await supabase
          .from(table)
          .select('id, status')
          .eq('client_id', client_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const mode = resolveWriteMode(
          latest as { id: string; status: string } | null
        );
        const { data, error } =
          mode.mode === 'update'
            ? await supabase
                .from(table)
                .update(insertData)
                .eq('id', mode.id)
                .select()
                .single()
            : await supabase.from(table).insert(insertData).select().single();
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
        // F-109 DT-06 — mismo shadow-risk que el consumo: preferir la OFV approved
        // canónica (tie-break `pickCanonicalOffer`) para el `offer_id` de
        // generated_outputs; solo si no hay approved, fallback a la última
        // cualquier-status (preserva comportamiento previo = no-regresión).
        const { data: approvedOffers } = await supabase
          .from('offers')
          .select('id, version, content, big_promise, updated_at')
          .eq('client_id', client_id)
          .eq('status', 'approved')
          .order('version', { ascending: false });
        let offerId: string | null =
          pickCanonicalOffer((approvedOffers ?? []) as CanonicalOfferRow[])
            ?.id ?? null;
        if (!offerId) {
          const { data: lo } = await supabase
            .from('offers')
            .select('id')
            .eq('client_id', client_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          offerId = (lo?.id as string | undefined) ?? null;
        }
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
            offer_id: offerId, // F-109 DT-06 — OFV approved canónica (fallback prev.)
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
            model: AI_MODEL,
            // F-102 R-14 — observabilidad log-only (metadata es JSON existente, NO columna
            // nueva). Análogo a compliance_ok/compliance_retried de F-098.
            generation_ok: result.ok,
            generation_retried: retried
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
      prompt_version: prompt.id,
      // F-102 R-10/R-11 — campo opcional: omitido en camino feliz (no rompe consumidores).
      ...(generationWarning ? { generation_warning: generationWarning } : {}),
      // F-105 R-08 — warning TRANSITORIO de no-fabricación (junto a generation_warning);
      // omitido en camino feliz, NUNCA persistido (no entra en insertData/content._*).
      ...(nonFabWarning ? { social_proof_warning: nonFabWarning } : {})
    });
  } catch (error) {
    console.error('generate-content error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
