'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PageContainer from '@/components/layout/page-container';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Metrics = {
  totalClients: number;
  activeClients: number;
  pendingOnboardings: number;
  diagnosticsThisMonth: number;
  clientsByStatus: Record<string, number>;
};

type ApprovedPreview = {
  id: string;
  client_id: string;
  approved_at: string | null;
  clients: { business_name: string } | null;
};

type ActivityEntry = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  client_id: string | null;
  metadata: Record<string, unknown> | null;
};

const ACTION_LABELS: Record<string, string> = {
  client_created: '👤 Nuevo cliente creado',
  client_updated: '✏️ Cliente actualizado',
  diagnostic_completed: '📋 Diagnóstico completado',
  diagnostic_started: '🔍 Diagnóstico iniciado',
  nap_check_completed: '✅ Verificación NAP',
  credentials_updated: '🔑 Credenciales actualizadas',
  photo_uploaded: '📷 Foto subida',
  photo_approved: '✅ Foto aprobada',
  preview_created: '🔗 Preview generado',
  preview_approved: '✅ Preview aprobado',
  gbp_profile_updated: '🏢 Perfil GBP actualizado',
  gbp_post_created: '📝 Post GBP creado'
};

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  diagnosed: 'Diagnosticado',
  negotiating: 'Negociando',
  onboarding: 'Onboarding',
  active: 'Activo',
  churned: 'Perdido'
};

export default function C3Dashboard() {
  const { tenantId, profile, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [metrics, setMetrics] = useState<Metrics>({
    totalClients: 0,
    activeClients: 0,
    pendingOnboardings: 0,
    diagnosticsThisMonth: 0,
    clientsByStatus: {}
  });
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [approvedPreviews, setApprovedPreviews] = useState<ApprovedPreview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userLoading && tenantId) {
      loadDashboard();
    }
  }, [tenantId, userLoading]);

  const loadDashboard = async () => {
    // Clients by status
    const { data: clients } = await supabase
      .from('clients')
      .select('status')
      .eq('tenant_id', tenantId);

    const clientsByStatus: Record<string, number> = {};
    let totalClients = 0;
    let activeClients = 0;
    let pendingOnboardings = 0;

    clients?.forEach((c) => {
      clientsByStatus[c.status] = (clientsByStatus[c.status] || 0) + 1;
      totalClients++;
      if (c.status === 'active') activeClients++;
      if (c.status === 'onboarding') pendingOnboardings++;
    });

    // Diagnostics this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: diagCount } = await supabase
      .from('diagnostics')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gte('created_at', startOfMonth.toISOString());

    // Activity log (last 10)
    const { data: activity } = await supabase
      .from('activity_log')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10);

    setMetrics({
      totalClients,
      activeClients,
      pendingOnboardings,
      diagnosticsThisMonth: diagCount || 0,
      clientsByStatus
    });

    setActivityLog(activity || []);

    // Recently approved previews (last 7 days)
    const { data: approvedPreviewsData } = await supabase
      .from('previews')
      .select('id, client_id, approved_at, clients(business_name)')
      .eq('approved', true)
      .gte('approved_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('approved_at', { ascending: false })
      .limit(5);

    setApprovedPreviews((approvedPreviewsData as unknown as ApprovedPreview[]) || []);
    setLoading(false);
  };

  const firstName = profile?.full_name?.split(' ')[0] || 'Carlos';

  return (
    <PageContainer
      pageTitle='Dashboard'
      pageDescription={`Buenos días, ${firstName} 👋`}
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6'>
        {/* Metric Cards */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Total Clientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold'>
                {loading ? '—' : metrics.totalClients}
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                en todos los estados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Clientes Activos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold text-primary'>
                {loading ? '—' : metrics.activeClients}
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                facturando actualmente
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Diagnósticos (mes)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold'>
                {loading ? '—' : metrics.diagnosticsThisMonth}
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                este mes
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-2'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                En Onboarding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className='text-3xl font-bold text-secondary-foreground'>
                {loading ? '—' : metrics.pendingOnboardings}
              </p>
              <p className='text-xs text-muted-foreground mt-1'>
                pendientes de completar
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Approved Previews Alert */}
        {!loading && approvedPreviews.length > 0 && (
          <Card className='border-green-300 bg-green-50'>
            <CardHeader className='pb-2'>
              <CardTitle className='text-base text-green-800'>
                ✅ {approvedPreviews.length} preview{approvedPreviews.length > 1 ? 's' : ''} aprobado{approvedPreviews.length > 1 ? 's' : ''} esta semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className='space-y-1'>
                {approvedPreviews.map((p) => (
                  <li key={p.id} className='flex items-center justify-between text-sm'>
                    <span className='font-medium text-green-900'>{p.clients?.business_name || 'Cliente'}</span>
                    <span className='text-xs text-green-600'>
                      {p.approved_at
                        ? new Date(p.approved_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className='grid gap-4 lg:grid-cols-2'>
          {/* Clients by Status */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Clientes por estado</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className='text-muted-foreground text-sm'>Cargando...</p>
              ) : (
                <div className='space-y-2'>
                  {Object.entries(STATUS_LABELS).map(([status, label]) => {
                    const count = metrics.clientsByStatus[status] || 0;
                    if (
                      count === 0 &&
                      status !== 'lead' &&
                      status !== 'active'
                    )
                      return null;
                    return (
                      <div
                        key={status}
                        className='flex items-center justify-between'
                      >
                        <span className='text-sm'>{label}</span>
                        <Badge
                          variant={
                            status === 'active'
                              ? 'default'
                              : status === 'churned'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {count}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Actividad reciente</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className='text-muted-foreground text-sm'>Cargando...</p>
              ) : activityLog.length === 0 ? (
                <p className='text-muted-foreground text-sm'>
                  No hay actividad todavía
                </p>
              ) : (
                <div className='space-y-2'>
                  {activityLog.map((entry) => (
                    <div key={entry.id} className='flex items-start gap-2'>
                      <div className='flex-1'>
                        <p className='text-sm'>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {new Date(entry.created_at).toLocaleString('es-MX', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex flex-wrap gap-2'>
              <Button asChild>
                <Link href='/diagnostic'>📋 Nuevo Diagnóstico</Link>
              </Button>
              <Button variant='outline' asChild>
                <Link href='/clients'>👤 Ver Clientes</Link>
              </Button>
              <Button variant='outline' asChild>
                <Link href='/clients?status=onboarding'>
                  🔄 Ver Onboardings Pendientes
                </Link>
              </Button>
              <Button variant='outline' asChild>
                <Link href='/preview/generator'>🔗 Generar Preview</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
