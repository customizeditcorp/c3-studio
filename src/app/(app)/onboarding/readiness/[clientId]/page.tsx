'use client';

/**
 * F-078 — T-17 — Read-led readiness panel per-location (R-15, R-20).
 *
 * Shows the aggregated evidence + the unified verdict + blockers and lets the
 * operator TRIGGER an evaluation (append a `readiness_assessments` row). READ-LED:
 * it surfaces what the evidence says; it does NOT scrape nor repair evidence, and it
 * does NOT wire the Phase-E creation gate (that is a separate feature).
 *
 * F-086 — The verdict/blockers/evidence/"Evaluar" block was EXTRACTED into the
 * shared `ReadinessPanelBody` component (single source of truth, consumed here AND
 * in the client detail page). This page keeps its shell (PageContainer + title
 * `Readiness — <business_name>` + business_name fetch) and delegates the body.
 */
import PageContainer from '@/components/layout/page-container';
import ReadinessPanelBody from '@/components/readiness/readiness-panel-body';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function ReadinessPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { tenantId, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [client, setClient] = useState<{
    id: string;
    business_name: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userLoading && tenantId && clientId) {
      loadClient();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, userLoading, clientId]);

  const loadClient = async () => {
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, business_name')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .single();
    if (clientData) setClient(clientData);
    setLoading(false);
  };

  if (loading) {
    return (
      <PageContainer pageTitle='Readiness'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`Readiness — ${client?.business_name || clientId}`}
      pageDescription='Veredicto unificado de elegibilidad GBP (read-led)'
    >
      <div className='flex max-w-3xl flex-1 flex-col gap-4 p-4 md:px-6'>
        <ReadinessPanelBody clientId={clientId} />
      </div>
    </PageContainer>
  );
}
