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
// F-113 — operación ESPEJO de F-109 para `briefs`/`buyer_personas` (CL-099): ante
// empate de `version` (SCS Cleaning tiene 3 personas y 4 briefs approved, TODOS v1)
// la elección era ARBITRARIA y ganaba la fila hueca. El selector desempata por
// riqueza de `content` SIN borrar ninguna fila (el dedup es del operador, R-23).
import {
  pickCanonicalContentRow,
  type CanonicalContentRow
} from '@/lib/onboarding/select-canonical-row';
// F-119 — seam de versión (R-01..R-06). Cierra la mitad en ESCRITURA del defecto que
// F-113 §12.bis R-34 dejó declarado: el `INSERT` de este archivo nacía en el literal
// `version: 1` ⇒ cada regeneración post-aprobación creaba un empate nuevo. El máximo es
// por `(client_id, tabla)` sobre TODOS los `status` (R-05): aprobar es un flip in-place
// que conserva la versión, así que draft y approved comparten namespace.
import { nextVersion, type VersionedRow } from '@/lib/onboarding/next-version';
// F-121 (R-13/R-15/R-16) — declaración ÚNICA industria→etiqueta. La ruta era uno de los
// dos productores de "enum crudo como lenguaje" (`Industria: other`); el otro era el
// prefill de la pantalla de onboarding. El punto de uso está en el bloque
// `## DATOS DEL CLIENTE`, y su porqué completo vive ahí.
//
// ⚠️ **H-1 — no nombrar acá el identificador del user message:**
// `tests/generate-content/f110-context-alignment.test.ts:26` recorta el archivo hasta su
// PRIMERA aparición, y una mención en este encabezado movería el corte por delante del
// bloque OFV, dejando ese guard sin nada que inspeccionar. Lo verifica `f121-signal-
// pipeline-drift` T-05 (H-1).
import { toIndustryLabel } from '@/lib/clients/industry-label';
// F-121 (R-20/R-23) — guards deterministas del ensamblado del Brief. Backstop del
// prompt, en la secuencia probada prompt→guard de F-104→F-105 y F-114→F-118.
import {
  checkBriefAssembly,
  assemblyImprovesStrictly,
  buildAssemblyRetryDirective
} from '@/lib/onboarding/assembly-guard';
import { normalizeOffer } from '@/lib/gbp-slice/context';
import type { RawOfferRow } from '@/lib/gbp-slice/types';
// F-111 — seam puro del reparto del método (CL-094): expone el decision_frame que
// `normalizeOffer` no cubre y emite ambas secciones SOLO para los steps del reparto
// (default-deny). Framework-free, `node --test`-able, byte-identidad por conducta.
import {
  buildOfvMethodLines,
  normalizeDecisionFrame
} from '@/lib/offers/method-context';
// F-112 — operación ESPEJO de F-111 del lado de la persona (CL-094): extrae los 10
// campos canónicos de `buyer_personas` y los ANEXA etiquetados SOLO para el step `ofv`
// (default-deny). El blob `## BUYER PERSONA (APROBADO)` queda intacto (R-13).
// F-117 — segundo seam del MISMO módulo: el reparto núcleo→CANAL por step
// (`nurturing` = ARC5 objeciones · `social_content` = ARC7 dolor · `website_*` =
// dolor dominante + costos ocultos), también default-deny.
import {
  buildPersonaMethodBlock,
  buildPersonaDownstreamBlock,
  type RawPersonaRow
} from '@/lib/personas/method-context';
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
// F-118 — core PURO de no-fabricación en COPY PUBLICABLE (backstop content-side). Espejo
// ESTRUCTURAL de F-105 con la CALIBRACIÓN INVERTIDA: empate→flag, grounding ESTRECHO (sólo
// la rebanada promocional que F-111 inyecta) y el marcador de faltante como defecto que
// nunca pasa. La postura se explica entera en el módulo; acá vive sólo la orquestación.
import {
  resolveContentGrounding,
  checkContentNonFabrication,
  improvesStrictly,
  buildContentFabricationRetryDirective,
  type ContentFabricationSignal,
  type ContentNonFabricationResult,
  type FabricationTier
} from '@/lib/content/non-fabrication';
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
      // F-116 R-25 (DT-5) — DEFENSA MULTI-TENANT DELIBERADA, NO código olvidado.
      // Este fallback resuelve la fila global (`tenant_id IS NULL`) cuando el
      // tenant no tiene su propia versión del prompt. Hoy NO tiene filas: los 11
      // prompts viven bajo el tenant `__primary__` (F-101), así que la rama nunca
      // se toma en producción. Se CONSERVA a propósito: retirarla convertiría en
      // 404 lo que hoy degrada, y lo haría sobre el read-path COMPARTIDO por el
      // núcleo y el downstream. Si la Fase C/D decide que el producto es
      // mono-tenant, el retiro va ahí, aislado. (Deuda declarada, conventions §12.4.)
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
    // F-117 R-01/R-02/R-03 (CL-092) — `gbp_description` SALIÓ de esta lista.
    // `gbp_description` produce la descripción del **mismo perfil público de Google**
    // que `/api/generate-gbp`, y el operador decidió en CL-092 que el GBP se queda con
    // brief + OFV: la buyer persona NO entra. `generate-gbp` ya cumplía (0 referencias a
    // `buyer_personas`); este segundo camino al mismo asset la violaba en silencio.
    // El aislamiento es de ACCESO, no sólo de render: la consulta a `buyer_personas`
    // vive DENTRO de `if (needsPersona)`, así que para `gbp_description` no se emite el
    // bloque `## BUYER PERSONA (APROBADO)` **y tampoco se ejecuta la consulta**.
    // Anti-regresión: `tests/personas/f117-no-regression.test.ts` se pone rojo nombrando
    // CL-092 si alguien reintroduce el literal acá (o en la copia edge).
    const needsPersona = [
      'ofv',
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
      // F-113 R-10/R-15/R-16 — traer TODOS los candidatos `approved` (sin `limit(1)`)
      // y elegir el canónico con `pickCanonicalContentRow` (version desc → riqueza →
      // updated_at desc → id asc). Filtros `client_id`/`status` INTACTOS: cambia cómo
      // se desempata entre approved, nunca qué candidatos son elegibles. El `select`
      // es un SUPERSET del anterior (`content, raw_text` + `id, version, updated_at`),
      // porque el criterio de riqueza necesita inspeccionar `content`.
      const { data: briefRows } = await supabase
        .from('briefs')
        .select('id, version, updated_at, content, raw_text')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false });
      const brief = pickCanonicalContentRow(
        (briefRows ?? []) as (CanonicalContentRow & {
          raw_text?: string | null;
        })[]
      );
      if (brief)
        contextChain +=
          '\n\n## BRIEF DEL NEGOCIO (APROBADO)\n' +
          (brief.raw_text || JSON.stringify(brief.content));
    }
    if (needsPersona) {
      // F-113 R-11/R-14/R-15/R-16 — ídem `briefs`. La fila elegida alimenta TANTO el
      // blob `## BUYER PERSONA (APROBADO)` COMO `buildPersonaMethodBlock` (F-112):
      // **una sola fila, un solo criterio**. Éste es el read-path que dejó la §6.1 de
      // F-112 sin poder ser positiva (CL-098): el empate lo ganaba `e8e8c500`, la
      // persona sin campos canónicos, y el helper emitía `''` correctamente.
      const { data: personaRows } = await supabase
        .from('buyer_personas')
        .select('id, version, updated_at, content, raw_text')
        .eq('client_id', client_id)
        .eq('status', 'approved')
        .order('version', { ascending: false });
      const persona = pickCanonicalContentRow(
        (personaRows ?? []) as (CanonicalContentRow & RawPersonaRow)[]
      );
      if (persona) {
        contextChain +=
          '\n\n## BUYER PERSONA (APROBADO)\n' +
          (persona.raw_text || JSON.stringify(persona.content));
        // F-112 R-11/R-13 — COMPLEMENTA, no reemplaza: el blob de arriba queda
        // intacto y acá se ANEXA el bloque campo-a-campo, sólo para el step `ofv`.
        contextChain += buildPersonaMethodBlock({
          step,
          persona: persona as RawPersonaRow
        });
        // F-117 R-19 (Fase C / CL-102 mandato 2) — ANEXA el reparto núcleo→CANAL,
        // después del blob y después del bloque de F-112, sin reordenar ni reescribir
        // ninguna línea previa. Los dos bloques NUNCA coexisten: `ofv` no está en
        // `PERSONA_DOWNSTREAM_FIELDS_BY_STEP` y ningún step del reparto está en
        // `PERSONA_METHOD_STEPS` ⇒ el aporte de F-117 al step `ofv` es `''`, que es la
        // forma ESTRUCTURAL de su byte-identidad (R-21/R-22).
        contextChain += buildPersonaDownstreamBlock({
          step,
          persona: persona as RawPersonaRow
        });
      }
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
        // F-110 (R-01..R-04) — alinear el set de consumo content↔GBP: sumar
        // `deliverables`/`social_proof` al bloque OFV (formato idéntico a
        // buildGbpUserMessage: etiqueta + join(' | ')). Guardadas por length →
        // array vacío NO emite línea (R-04 degradación honesta) → caso vacío
        // byte-idéntico a pre-F-110 (R-06). No se cablean los campos reservados a
        // F-B/GATE-1 (R-08).
        if (o.deliverables.length)
          contextChain += '\nEntregables: ' + o.deliverables.join(' | ');
        if (o.social_proof.length)
          contextChain += '\nPrueba social: ' + o.social_proof.join(' | ');
        // F-111 (R-10/R-16, CL-094) — reparto del método: las secciones 4 y 7 de la
        // Oferta SmartLab llegan SOLO a los 5 steps que el canon indica. Seam puro
        // anexado (no reescribe nada de arriba): devuelve '' fuera del reparto y
        // cuando la OFV no aporta contenido ⇒ bloque byte-idéntico a post-F-110.
        contextChain += buildOfvMethodLines({
          step,
          offer: o,
          decisionFrame: normalizeDecisionFrame(offer as RawOfferRow)
        });
      }
    }
    // F-105 (R-05): `userMessageBase` = todo el user message MENOS el cierre de idioma, para
    // poder insertar la directiva de no-fabricación ANTES del idioma en el retry (mismo
    // invariante que F-098/F-099). El camino feliz es byte-idéntico (base + idioma al cierre).
    const userMessageBase =
      '## DATOS DEL CLIENTE\nNegocio: ' +
      client.business_name +
      // F-121 (R-13/R-15/R-16) — la industria pasa por la declaración ÚNICA
      // (`toIndustryLabel`) en vez de viajar CRUDA. Este `+ client.industry` era uno de
      // los dos puntos donde la APP fabricaba prosa con códigos: emitía
      // `Industria: other` y `Industria: portable_toilet_rental_service`, y el modelo,
      // correctamente, los leyó como sustantivos ("Top 3 en Google Maps para other",
      // brief `e1ad789c`; "para cleaning en la zona", brief `be43470f`). Un prompt no
      // puede des-fabricar un string que la app le entrega ya hecho.
      //
      // `null` = **sin industria declarada** ⇒ se emite la AUSENCIA explícita, no el
      // token y no un `N/A` mudo: el modelo tiene que poder marcarla [PENDIENTE], que es
      // la degradación honesta de F-104/F-106.
      //
      // ⚠️ Alcance real (H-5): `userMessageBase` es COMPARTIDO por los 11 steps, así que
      // esto los mejora a todos por construcción. Ningún test preexistente asserta esta
      // línea; el control de SCS es CONDUCTUAL, no byte-idéntico (R-37).
      '\nIndustria: ' +
      (toIndustryLabel(client.industry) ?? 'Sin industria declarada') +
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
    // --- F-121: guard determinista del ENSAMBLADO del Brief (backstop) ---
    // UBICACIÓN OBLIGADA (R-03 / H-2): DESPUÉS de `outputSteps` y ANTES de `if (save)`,
    // el mismo punto que eligió F-118. Dentro del tramo de F-105 (entre
    // `// --- F-105: guard` y `let savedRecord`) pondría rojo su source-guard, que
    // asserta EXACTAMENTE 1 re-call y CERO writes en ese tramo
    // (`f105-non-fabrication.test.ts:321`).
    //
    // Y **ANTES del marcador de bloque de F-118** — restricción que el spec no había
    // previsto y que se verificó acá: `f118-route-orchestration.test.ts:34` recorta el
    // tramo de F-118 desde ese marcador hasta el guardado y asserta **exactamente 1**
    // re-call ahí dentro. Ubicar este bloque DESPUÉS lo metía en esa rebanada y la ponía
    // roja por 2. Insertándolo antes, los tres tramos quedan disjuntos y **ningún guard
    // preexistente se toca** — preferible a re-anclar uno más.
    //
    // (Y por la misma razón este comentario NO escribe el literal de ese marcador: lo
    // haría aparecer antes del bloque real y volvería a romper la rebanada ajena. Mismo
    // modo de fallo que H-1.)
    //
    // Detecta los DOS defectos de ensamblado observados en producción el 2026-07-27:
    //   (a) TOKEN-CÓDIGOS usados como lenguaje — "Top 3 en Google Maps para other"
    //       (Clara V `e1ad789c`), "para cleaning en la zona" (SCS `be43470f`);
    //   (b) el MARCADOR incrustado DENTRO de una oración ya redactada (Clara V, 3 claves).
    //
    // ⚠️ **Lo que este guard NO es (R-01/R-02):** no mide "contiene algún marcador". Un
    // marcador que ocupa la RANURA COMPLETA de un campo es degradación honesta LEGÍTIMA
    // (F-104/F-106) y no dispara nada. El umbral de (b) es CONSERVADOR (DT-03): el Brief
    // es interno y se aprueba a mano, así que el falso positivo cuesta más que el falso
    // negativo. Y el contenido marcado **sigue siendo aprobable** por `assessApproval`
    // (R-24): esto corre en tiempo de GENERACIÓN, nunca de aprobación.
    //
    // Acotado al step `brief` (DT-08) y corre con save:true Y save:false. check →
    // retry-once dirigido (directiva ANTES del cierre de idioma F-081, MISMOS params) →
    // adopción SÓLO SI MEJORA ESTRICTAMENTE (DT-07) → warning TRANSITORIO, jamás
    // persistido y jamás bloqueante: `success` sigue siendo `true` (R-20). Un solo
    // re-call, sin loop. No toca el validador anti-AI, el method-grounding ni el retry
    // F-102, y es mutuamente excluyente con los branches de F-105 (`ofv`) y F-118 (los 8
    // steps de contenido) ⇒ la cota POR REQUEST sigue siendo 3.
    let assemblyWarning:
      | {
          rawCodes: { key: string; tokens: string[] }[];
          embeddedPlaceholders: string[];
          retried: boolean;
        }
      | undefined;
    if (step === 'brief') {
      let ag = checkBriefAssembly(parsedContent);
      let agRetried = false;
      if (!ag.ok) {
        agRetried = true;
        const directive = buildAssemblyRetryDirective(ag);
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
          const retryAg = checkBriefAssembly(retryResult.content);
          if (assemblyImprovesStrictly(ag, retryAg)) {
            // DT-07: adoptar SÓLO si el retry es usable Y mejora. Igual o peor, se
            // conserva la primera generación (no-regresión).
            parsedContent = retryResult.content;
            rawText = retryResult.rawText;
            ag = retryAg;
          }
        }
        // else: retry inválido/no-parseable → conservar el original (DT-07).
      }
      if (!ag.ok) {
        assemblyWarning = {
          rawCodes: ag.rawCodes,
          embeddedPlaceholders: ag.embeddedPlaceholders,
          retried: agRetried
        };
      }
    }
    // --- F-118: guard determinista de fabricación en COPY PUBLICABLE (backstop) ---
    // UBICACIÓN OBLIGADA (R-27/H-3): DESPUÉS de `outputSteps` y ANTES de `if (save)`.
    // Dentro del tramo de F-105 (entre `// --- F-105: guard` y `let savedRecord`) pondría
    // rojo su source-guard, que asserta EXACTAMENTE 1 re-call en ese tramo.
    //
    // Postura INVERTIDA respecto de F-105 (el detalle y su porqué, en el módulo):
    // empate→flag, grounding ESTRECHO (sólo las líneas `Urgencia:`/`Decision Frame:` que
    // F-111 inyecta — un digit-set global dejaría que un `15` de un teléfono groundee un
    // `15% discount`) y marcador de faltante = defecto que nunca pasa.
    //
    // Acotado a los 8 steps de contenido (R-21) y corre con save:true Y save:false.
    // check → retry-once dirigido (directiva ANTES del cierre de idioma F-081, MISMOS
    // params) → adopción SÓLO SI MEJORA ESTRICTAMENTE (R-23) → warning (R-25) + constancia
    // persistida sólo para residuo `commitment` (R-24). NUNCA bloquea: `success` sigue
    // siendo `true` y el contenido siempre se devuelve (R-03). Un solo re-call, sin loop
    // (R-26). No toca el validador anti-AI, el method-grounding ni el retry F-102.
    let fabricationResidue: ContentNonFabricationResult | null = null;
    let fabricationWarning:
      | {
          signals: ContentFabricationSignal[];
          tier: FabricationTier;
          retried: boolean;
        }
      | undefined;
    if (outputSteps.includes(step)) {
      const contentGrounding = resolveContentGrounding(contextChain);
      let cf = checkContentNonFabrication(
        parsedContent,
        contentGrounding,
        step
      );
      let cfRetried = false;
      if (!cf.ok) {
        // R-22: regenerar UNA sola vez con una directiva que enumera los tokens literales.
        cfRetried = true;
        const directive = buildContentFabricationRetryDirective(cf.signals);
        // H-4 — este es el CUARTO call-site del modelo en la ruta. La cota exacta que
        // `f102-constraints.test.ts` R-07 fija se SUBE conscientemente de 3 a 4 (mismo
        // movimiento que hizo F-105 al añadir el tercero): la cota existe para subirse con
        // justificación, no para sortearse. La cota POR REQUEST sigue siendo 3 (R-26): los
        // branches `ofv` (F-105) y de contenido (F-118) son mutuamente excluyentes por
        // `step`, así que nunca se suman.
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
          const retryCf = checkContentNonFabrication(
            retryResult.content,
            contentGrounding,
            step
          );
          if (improvesStrictly(cf, retryCf)) {
            // R-23: adoptar SÓLO si el retry queda limpio o baja de tier. Igual o peor,
            // se conserva la primera generación (no-regresión).
            parsedContent = retryResult.content;
            rawText = retryResult.rawText;
            cf = retryCf;
          }
        }
        // else: retry inválido/no-parseable → conservar el original (R-23).
      }
      if (!cf.ok && cf.tier !== null) {
        fabricationResidue = cf;
        fabricationWarning = {
          signals: cf.signals,
          tier: cf.tier,
          retried: cfRetried
        };
      }
    }
    if (save) {
      if (tableMap[step]) {
        const table = tableMap[step];
        // F-119 R-07/R-08 — `insertData` ya NO lleva `version`. Es el payload COMPARTIDO
        // por las dos ramas de escritura y ahí estaba el defecto latente (DT-04): la rama
        // `update` lo enviaba tal cual y **pisaba con `1` la versión de la fila viva**.
        // Ahora la `version` se añade SÓLO en la rama `insert` (desde el seam, más abajo);
        // el `UPDATE` conserva por construcción la que la fila ya tenía.
        const insertData: Record<string, unknown> = {
          client_id,
          prompt_version_id: prompt.id,
          content: parsedContent,
          status: 'draft'
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
          // F-113 R-12/R-14/R-15 — el desempate usa EL MISMO selector y LOS MISMOS
          // filtros que el punto de contexto de arriba, de modo que el `persona_id`
          // persistido apunte a la fila que REALMENTE alimentó el prompt. Divergir
          // produciría una procedencia falsa y silenciosa. `select` superset (`id` +
          // `version, updated_at, content`, necesarios para el criterio de riqueza).
          const { data: personaFkRows } = await supabase
            .from('buyer_personas')
            .select('id, version, updated_at, content')
            .eq('client_id', client_id)
            .eq('status', 'approved')
            .order('version', { ascending: false });
          let lp: { id: string } | null = pickCanonicalContentRow(
            (personaFkRows ?? []) as CanonicalContentRow[]
          );
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
          // F-113 R-13/R-14/R-15 — mismo selector y mismos filtros que el punto de
          // contexto ⇒ el `brief_id` persistido apunta al brief que alimentó el
          // prompt. `select` superset (`id` + `version, updated_at, content`).
          const { data: briefFkRows } = await supabase
            .from('briefs')
            .select('id, version, updated_at, content')
            .eq('client_id', client_id)
            .eq('status', 'approved')
            .order('version', { ascending: false });
          let lb: { id: string } | null = pickCanonicalContentRow(
            (briefFkRows ?? []) as CanonicalContentRow[]
          );
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
        // F-097 R-06/R-07/R-08 — regenerar = UPDATE del draft vivo (conserva `id`, y
        // desde F-119 R-07 también la `version` — antes el comentario lo AFIRMABA y el
        // código lo desmentía: enviaba `insertData` con `version: 1` dentro), no INSERT
        // acumulativo. Aislamiento por `client_id` (R-14; tenant ya verificado arriba).
        // A lo sumo 1 draft por (client_id, step). Si no hay draft vivo (o la última
        // está `approved`) → INSERT como antes (primera generación / regeneración
        // post-aprobación). `resolveWriteMode` y esta consulta quedan con la MISMA
        // semántica (F-119 R-16): última fila por `created_at`, cualquier `status`.
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
        // F-119 R-08/R-09 ⭐ — la `version` del INSERT sale del seam `nextVersion`
        // (`max(version) + 1` por `(client_id, tabla)`, TODOS los `status`) en lugar del
        // literal `1`. Éste era el ÚNICO call-site que producía empates (G-2): aprobar →
        // regenerar cae en `insert` y volvía a nacer en `v1`, empatado con la aprobada.
        // La consulta se emite por `.from(table)` — la VARIABLE del `tableMap`, NUNCA un
        // literal (R-09): `f113-source-guards` T-10 cuenta las sentencias
        // `.from('<tabla>')` y exige exactamente 1 fallback por tabla.
        // Sólo se consulta en la rama `insert`: el `UPDATE` no toca la `version`.
        // Límite declarado (R-41 / DT-06): dos escrituras CONCURRENTES pueden calcular el
        // mismo `max+1` ⇒ degrada al empate previo a F-119, que `pickCanonicalContentRow`
        // / `pickCanonicalOffer` resuelven determinísticamente. Cerrarlo exige DDL, fuera
        // de alcance. Por eso el tie-break NO se retira (R-14).
        // F-119 R-07 ⭐ — la clave `version` se añade al payload SÓLO dentro de esta rama.
        // En `mode === 'update'` NUNCA existe ⇒ el `.update(insertData)` de abajo no puede
        // pisar la versión de la fila viva. Sin esto, F-119 crearía el empate que viene a
        // cortar: un draft nacido en `v5` volvería a `v1` en la próxima regeneración, que es
        // el camino MÁS frecuente. (Ésta es la única asignación de `insertData.version` del
        // archivo, y está dentro del `if` — lo que la hace inspeccionable por source-guard.)
        if (mode.mode === 'insert') {
          const { data: versionRows } = await supabase
            .from(table)
            .select('version')
            .eq('client_id', client_id);
          insertData.version = nextVersion(
            (versionRows ?? []) as VersionedRow[]
          );
        }
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
        // F-118 R-24 — CONSTANCIA de auditoría, NO un gate. Clave ADITIVA en el `jsonb`
        // existente (mismo mecanismo que `_validation` de F-064 y `_method_grounding` de
        // F-065): SIN DDL, sin tocar `status` y sin alterar ninguna clave preexistente.
        // Sólo se adjunta cuando queda residuo de tier `commitment` — un descuento, cupo o
        // plazo sin respaldo COMPROMETE al negocio y el artefacto cuya publicación está en
        // juego sobrevive a la request, mientras que un warning transitorio no. El residuo
        // `publication_defect` NO se persiste (R-25): muere con la request, como en F-105.
        //
        // Divergencia DELIBERADA frente a F-105 R-08 (warning estrictamente transitorio),
        // justificada por F-117 R-30: `generated_outputs` está declarado como registro de
        // auditoría de generación, y un registro de auditoría que omite el flag miente por
        // omisión. NO tiene lector y NO debe construirse uno (F-117 R-32): es constancia,
        // no control.
        const guardedContent =
          fabricationResidue && fabricationResidue.tier === 'commitment'
            ? {
                ...groundedContent,
                _fabrication_guard: {
                  tier: fabricationResidue.tier,
                  signals: fabricationResidue.signals.map((s) => ({
                    kind: s.kind,
                    tier: s.tier,
                    value: s.value
                  })),
                  checked_at: new Date().toISOString()
                }
              }
            : groundedContent;
        // F-117 R-30 — QUÉ ES `generated_outputs` (declaración; ver
        // `docs/generated-outputs.md`, que dice lo mismo y un test ata a este
        // comentario):
        //
        //   `generated_outputs` es un **registro de auditoría/histórico de
        //   generación**: este write-path deja constancia de qué se generó, para qué
        //   cliente y con qué OFV asociada. **No tiene consumidor de lectura en el
        //   producto y no se planea uno.**
        //
        // Los artefactos con superficie viva tienen su propio home canónico (`briefs`,
        // `buyer_personas`, `offers`, `gbp_profiles`), y `gbp_description` está
        // EXCLUIDO de este registro desde F-089 (`shouldPersistGeneratedOutput`,
        // `src/lib/gbp-slice/content-status.ts`) porque su home es `gbp_profiles`.
        // El único read que existía se eliminó en F-089 R-07. No es una omisión
        // pendiente: es la naturaleza de la tabla. No construir un lector (R-32).
        const { data, error } = await supabase
          .from('generated_outputs')
          .insert({
            client_id,
            offer_id: offerId, // F-109 DT-06 — OFV approved canónica (fallback prev.)
            prompt_version_id: prompt.id,
            output_type: step,
            content: guardedContent,
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
      ...(nonFabWarning ? { social_proof_warning: nonFabWarning } : {}),
      // F-118 R-25 — warning de fabricación content-side para CUALQUIER residuo (ambos
      // tiers), spread-guarded: omitido en el camino feliz, no rompe consumidores y NO
      // bloquea `success: true`. La constancia persistida (R-24) es otra cosa y sólo
      // aplica al tier `commitment`.
      ...(fabricationWarning
        ? { fabrication_warning: fabricationWarning }
        : {}),
      // F-121 R-20 — warning TRANSITORIO del ensamblado del Brief. Spread-guarded:
      // omitido en el camino feliz, no rompe consumidores, **NUNCA se persiste** (no
      // entra en `insertData` ni en `content._*`) y **NUNCA bloquea**: `success` sigue
      // siendo `true` y el contenido siempre se devuelve.
      ...(assemblyWarning ? { assembly_warning: assemblyWarning } : {})
    });
  } catch (error) {
    console.error('generate-content error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
