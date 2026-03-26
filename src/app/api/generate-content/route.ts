import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
});

// Map each step to its target table and insert fields
const STEP_CONFIG: Record<
  string,
  {
    table: string;
    contentField: string;
    extraFields?: Record<string, unknown>;
  }
> = {
  brief: {
    table: 'briefs',
    contentField: 'content'
  },
  buyer_persona: {
    table: 'buyer_personas',
    contentField: 'content'
  },
  offer: {
    table: 'offers',
    contentField: 'content'
  },
  gbp_description: {
    table: 'gbp_profiles',
    contentField: 'description'
  },
  gbp_post: {
    table: 'gbp_posts',
    contentField: 'content'
  }
};

export async function POST(request: NextRequest) {
  try {
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
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          }
        }
      }
    );

    // Verify auth
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile for tenant_id
    const { data: profile } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json(
        { error: 'User tenant not found' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { step, client_id, input_data } = body;

    if (!step || !client_id) {
      return NextResponse.json(
        { error: 'Missing required fields: step, client_id' },
        { status: 400 }
      );
    }

    // 1. Fetch active prompt for this step
    const { data: promptVersion, error: promptError } = await supabase
      .from('prompt_versions')
      .select('*')
      .eq('step', step)
      .eq('tenant_id', profile.tenant_id)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (promptError || !promptVersion) {
      // Fallback: try global prompts (no tenant filter)
      const { data: globalPrompt } = await supabase
        .from('prompt_versions')
        .select('*')
        .eq('step', step)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (!globalPrompt) {
        return NextResponse.json(
          { error: `No active prompt found for step: ${step}` },
          { status: 404 }
        );
      }

      // Use global prompt
      return await generateAndSave({
        supabase,
        prompt: globalPrompt,
        step,
        clientId: client_id,
        tenantId: profile.tenant_id,
        userId: user.id,
        inputData: input_data
      });
    }

    return await generateAndSave({
      supabase,
      prompt: promptVersion,
      step,
      clientId: client_id,
      tenantId: profile.tenant_id,
      userId: user.id,
      inputData: input_data
    });
  } catch (error) {
    console.error('generate-content error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

async function generateAndSave({
  supabase,
  prompt,
  step,
  clientId,
  tenantId,
  userId,
  inputData
}: {
  supabase: ReturnType<typeof createServerClient>;
  prompt: { template: string; system_prompt?: string; id: string };
  step: string;
  clientId: string;
  tenantId: string;
  userId: string;
  inputData: Record<string, unknown>;
}) {
  // 2. Build the user message by injecting input_data into prompt template
  let userMessage = prompt.template;

  // Replace {{key}} placeholders with input_data values
  if (inputData && typeof inputData === 'object') {
    for (const [key, value] of Object.entries(inputData)) {
      userMessage = userMessage.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        String(value ?? '')
      );
    }
  }

  // 3. Call Claude API
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage }
  ];

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system:
      prompt.system_prompt ||
      'You are a marketing expert specializing in local Hispanic home services businesses. Write in clear, professional Spanish unless instructed otherwise.',
    messages
  });

  const generatedContent =
    response.content[0].type === 'text' ? response.content[0].text : '';

  // 4. Save to generated_outputs (universal table for all generated content)
  const { data: savedOutput, error: saveError } = await supabase
    .from('generated_outputs')
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      prompt_version_id: prompt.id,
      output_type: step,
      content: generatedContent,
      status: 'draft',
      generated_by: userId,
      input_data: inputData,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens
    })
    .select()
    .single();

  if (saveError) {
    console.error('Error saving generated output:', saveError);
    // Still return the content even if save failed
    return NextResponse.json({
      content: generatedContent,
      saved: false,
      error: saveError.message
    });
  }

  // 5. Also update the specific table if applicable
  const stepConfig = STEP_CONFIG[step];
  if (stepConfig && stepConfig.table !== 'generated_outputs') {
    // For gbp_description: update the existing profile
    if (step === 'gbp_description') {
      await supabase
        .from('gbp_profiles')
        .update({ description: generatedContent })
        .eq('client_id', clientId)
        .eq('tenant_id', tenantId);
    }
    // For gbp_post: the post is already created by the GBP module; just update content
    else if (step === 'gbp_post' && inputData?.post_id) {
      await supabase
        .from('gbp_posts')
        .update({ content: generatedContent, status: 'draft' })
        .eq('id', inputData.post_id)
        .eq('tenant_id', tenantId);
    }
  }

  // 6. Log activity
  await supabase.from('activity_log').insert({
    tenant_id: tenantId,
    user_id: userId,
    client_id: clientId,
    action: `${step}_generated`,
    entity_type: 'generated_output',
    entity_id: savedOutput.id,
    metadata: {
      step,
      tokens_used: response.usage.input_tokens + response.usage.output_tokens,
      prompt_version_id: prompt.id
    }
  });

  return NextResponse.json({
    content: generatedContent,
    output_id: savedOutput.id,
    saved: true,
    tokens_used: response.usage.input_tokens + response.usage.output_tokens
  });
}
