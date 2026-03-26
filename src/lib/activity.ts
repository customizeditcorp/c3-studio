import { createClient } from '@/lib/supabase/client';

export async function logActivity(params: {
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  clientId?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createClient();
  await supabase.from('activity_log').insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    client_id: params.clientId || null,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata: params.metadata || null
  });
}
