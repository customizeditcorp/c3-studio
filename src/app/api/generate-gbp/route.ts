/**
 * F-066 — Slice vertical OFV→GBP→preview — orchestration route.
 *
 * Chain (R-01..R-12, R-14): precondition guard -> context reader (with degradation)
 * -> operational-state read -> GBP generation grounded in OFV+brandboard -> insert
 * `gbp_profiles` -> create `previews` (type='gbp') -> move `client_assets(gbp)` to
 * 'review'. CONSUMES the approved OFV; never repairs the offers pipeline (R-02).
 * NEVER builds/publishes to external systems (R-14).
 *
 * Mirrors the conventions of `src/app/api/generate-content/route.ts` (auth, tenant
 * isolation, OpenAI call, F-065 method grounding, activity_log).
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import {
  QUERY_BY_STEP,
  fetchRetrieveMethod,
  selectBudgetedSegments,
  buildMethodBlock,
  composeSystemContent,
  buildAppliedGrounding,
  buildUnappliedGrounding,
  type MethodGrounding
} from '@/lib/method-grounding';
import {
  checkPrecondition,
  readGbpContext,
  buildGbpSystemPrompt,
  buildGbpUserMessage,
  parseGbpJson,
  toGbpProfileRow,
  buildPreviewSnapshot,
  GbpDomainError,
  ASSET_STATUS_ON_PREVIEW,
  SLICE_ASSET_TYPE
} from '@/lib/gbp-slice';

const AI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o';
const GBP_GROUNDING_STEP = 'gbp_description'; // reuse the live grounded step (R-04)
const PREVIEW_TTL_DAYS = 7;

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

    const body = await request.json().catch(() => ({}));
    const client_id = body?.client_id as string | undefined;
    if (!client_id) {
      return NextResponse.json(
        { error: 'client_id is required' },
        { status: 400 }
      );
    }

    // --- Client + tenant isolation (mirror generate-content) ---
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

    // --- T-01: precondition guard (R-01/R-02/R-11). Read-only. ---
    const { data: offers } = await supabase
      .from('offers')
      .select(
        'id, client_id, status, big_promise, vehicle_name, vehicle_description, quick_win, guarantee, urgency, deliverables, social_proof, decision_frame, content'
      )
      .eq('client_id', client_id)
      .order('updated_at', { ascending: false });
    const { data: brandboards } = await supabase
      .from('brandboards')
      .select('id, client_id, status, logo_url, colors, typography, tone_voice')
      .eq('client_id', client_id)
      .order('updated_at', { ascending: false });

    const pre = checkPrecondition({
      offers: offers ?? [],
      brandboards: brandboards ?? []
    });
    if (!pre.ok) {
      // BLOCK: report to operator; produce nothing (R-01/R-11).
      return NextResponse.json(
        {
          success: false,
          blocked: true,
          reason: pre.reason,
          error: pre.message
        },
        { status: 409 }
      );
    }

    // --- T-02/T-03: context reader + operational state (R-03..R-08) ---
    const { data: photos } = await supabase
      .from('client_photos')
      .select(
        'id, gbp_category, alt_text, is_logo, is_cover, approved, storage_path'
      )
      .eq('client_id', client_id);

    // R-09: consume `client_plans.gbp_created` ONLY as an operational signal (never
    // commercial data; never write client_plans). Absent -> degrade to `pendiente`.
    const { data: planSignal } = await supabase
      .from('client_plans')
      .select('gbp_created')
      .eq('client_id', client_id)
      .maybeSingle();

    const ctx = readGbpContext({
      client,
      offer: pre.offer,
      brandboard: pre.brandboard,
      photos: photos ?? [],
      operationalSignal: planSignal
        ? { gbp_created: planSignal.gbp_created }
        : null
    });

    // --- F-065 method grounding: augment the system prompt (additive, degradable) ---
    const groundingRetrievedAt = new Date().toISOString();
    const groundingQuery = QUERY_BY_STEP[GBP_GROUNDING_STEP];
    const { data: promptRow } = await supabase
      .from('prompt_versions')
      .select('id, system_prompt, methodology')
      .eq('step', GBP_GROUNDING_STEP)
      .eq('active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    let methodBlock = '';
    let methodGrounding: MethodGrounding;
    const methodology = promptRow?.methodology ?? null;
    if (methodology == null) {
      methodGrounding = buildUnappliedGrounding({
        reason: 'no_methodology',
        methodology_family: null,
        step: GBP_GROUNDING_STEP,
        query: null,
        retrievedAtIso: groundingRetrievedAt
      });
    } else {
      const retrieved = await fetchRetrieveMethod({
        methodology_family: methodology,
        step: GBP_GROUNDING_STEP,
        query: groundingQuery
      });
      if (retrieved.ok) {
        const injected = selectBudgetedSegments(retrieved.segments);
        methodBlock = buildMethodBlock(retrieved.segments);
        methodGrounding = buildAppliedGrounding({
          segments: injected,
          methodology_family: methodology,
          step: GBP_GROUNDING_STEP,
          query: groundingQuery,
          retrievedAtIso: groundingRetrievedAt
        });
      } else {
        methodGrounding = buildUnappliedGrounding({
          reason: retrieved.reason,
          methodology_family: methodology,
          step: GBP_GROUNDING_STEP,
          query: groundingQuery,
          retrievedAtIso: groundingRetrievedAt
        });
      }
    }

    const systemContent = composeSystemContent(
      buildGbpSystemPrompt(promptRow?.system_prompt),
      methodBlock
    );
    const userMessage = buildGbpUserMessage(ctx);

    // --- T-04: generate (R-10) ---
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      max_tokens: 4096,
      response_format: { type: 'json_object' }, // R-06: the prompt mandates "SOLO JSON"; make it contractual (parser also strips fences defensively)
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userMessage }
      ]
    });
    const responseText = completion.choices[0]?.message?.content || '';

    // R-11: fail explicit BEFORE any write on malformed/incomplete output.
    let profileRow;
    try {
      const parsed = parseGbpJson(responseText);
      profileRow = toGbpProfileRow(client_id, parsed, ctx);
    } catch (e) {
      if (e instanceof GbpDomainError) {
        return NextResponse.json(
          { success: false, error: e.message },
          { status: 422 }
        );
      }
      throw e;
    }

    // --- Persist gbp_profiles (R-10) ---
    const { data: savedProfile, error: profileErr } = await supabase
      .from('gbp_profiles')
      .upsert(
        { ...profileRow, updated_at: new Date().toISOString() },
        { onConflict: 'client_id' }
      ) // R-08 (CL-033): idempotent regeneration; UNIQUE(client_id) -> update the single row instead of colliding (Postgres 23505)
      .select()
      .single();
    if (profileErr) {
      return NextResponse.json(
        { success: false, error: profileErr.message, code: profileErr.code },
        { status: 422 }
      );
    }

    // --- T-05: create preview (type='gbp', data=snapshot) (R-12) ---
    const token = randomUUID();
    const expiresAt = new Date(
      Date.now() + PREVIEW_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const snapshot = buildPreviewSnapshot(profileRow, ctx);
    const { data: savedPreview, error: previewErr } = await supabase
      .from('previews')
      .insert({
        client_id,
        type: 'gbp',
        token,
        data: { ...snapshot, _method_grounding: methodGrounding },
        expires_at: expiresAt,
        approved: false,
        created_by: user.id
      })
      .select()
      .single();
    if (previewErr) {
      return NextResponse.json(
        { success: false, error: previewErr.message, code: previewErr.code },
        { status: 422 }
      );
    }

    // --- T-06 (entrada): move the GBP asset to 'review' awaiting client review ---
    // R-14 scope: only asset_type='gbp' is ever touched.
    await supabase
      .from('client_assets')
      .update({
        status: ASSET_STATUS_ON_PREVIEW,
        updated_at: new Date().toISOString()
      })
      .eq('client_id', client_id)
      .eq('asset_type', SLICE_ASSET_TYPE);

    await supabase.from('activity_log').insert({
      tenant_id: clientTenantId,
      client_id,
      user_id: user.id,
      action: 'gbp_generated',
      entity_type: 'gbp_profile',
      entity_id: String(savedProfile.id),
      metadata: {
        offer_id: ctx.offer.offer_id,
        preview_token: token,
        method_grounding_applied: methodGrounding.applied,
        model: AI_MODEL
      }
    });

    return NextResponse.json({
      success: true,
      gbp_profile: { id: savedProfile.id },
      preview: { id: savedPreview.id, token, url: '/preview/' + token },
      asset_status: ASSET_STATUS_ON_PREVIEW,
      method_grounding: {
        applied: methodGrounding.applied,
        reason: methodGrounding.reason
      }
    });
  } catch (error) {
    console.error('generate-gbp error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
