import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { NextResponse } from 'next/server';

/**
 * Links the signed-in auth user to public.users + tenant (internal ops bootstrap).
 * Requires SUPABASE_SERVICE_ROLE_KEY. Tenant: BOOTSTRAP_TENANT_ID or lookup by BOOTSTRAP_TENANT_SLUG (default c3).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          'Servidor sin SUPABASE_SERVICE_ROLE_KEY. Añádela en Vercel/.env para poder vincular el perfil.'
      },
      { status: 503 }
    );
  }

  const explicitTenant = process.env.BOOTSTRAP_TENANT_ID?.trim();
  let tenantId = explicitTenant;

  if (!tenantId) {
    const slug = (process.env.BOOTSTRAP_TENANT_SLUG ?? 'c3').trim();
    const { data: tenant, error: tenantError } = await admin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (tenantError) {
      return NextResponse.json({ error: tenantError.message }, { status: 500 });
    }
    if (!tenant?.id) {
      return NextResponse.json(
        {
          error: `No hay tenant con slug "${slug}". Crea uno en Supabase o define BOOTSTRAP_TENANT_ID con el UUID.`
        },
        { status: 422 }
      );
    }
    tenantId = tenant.id;
  }

  const { data: existing, error: existingError } = await admin
    .from('users')
    .select('id, tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existing?.tenant_id) {
    return NextResponse.json({
      ok: true,
      alreadyComplete: true,
      tenantId: existing.tenant_id
    });
  }

  const fullName =
    (typeof user.user_metadata?.full_name === 'string' &&
      user.user_metadata.full_name) ||
    user.email?.split('@')[0] ||
    null;

  const defaultRole =
    (process.env.BOOTSTRAP_DEFAULT_ROLE ?? 'admin').trim() || 'admin';

  if (existing) {
    const { error: updateError } = await admin
      .from('users')
      .update({ tenant_id: tenantId })
      .eq('id', user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await admin.from('users').insert({
      id: user.id,
      email: user.email ?? '',
      full_name: fullName,
      role: defaultRole,
      tenant_id: tenantId,
      avatar_url: null
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, tenantId });
}
