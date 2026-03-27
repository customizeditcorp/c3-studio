'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PageContainer from '@/components/layout/page-container';
import { useUser } from '@/contexts/UserContext';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Client = {
  id: string;
  business_name: string;
  industry: string;
  status: string;
  tier: string | null;
  contact_first_name: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  diagnosed: 'Diagnosticado',
  onboarding: 'En Onboarding',
  negotiating: 'Negociando',
  active: 'Activo',
  lead: 'Lead'
};

interface OnboardingClientPickerProps {
  pageTitle: string;
  pageDescription: string;
  routePrefix: string;
  emptyHint?: string;
}

export default function OnboardingClientPicker({
  pageTitle,
  pageDescription,
  routePrefix,
  emptyHint = 'No hay clientes aún.'
}: OnboardingClientPickerProps) {
  const { tenantId, loading: userLoading } = useUser();
  const supabase = createClient();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading) return;

    if (!tenantId) {
      setClients([]);
      setLoading(false);
      return;
    }

    const fetchClients = async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, business_name, industry, status, tier, contact_first_name')
        .eq('tenant_id', tenantId)
        .in('status', ['diagnosed', 'onboarding', 'negotiating', 'active', 'lead'])
        .order('created_at', { ascending: false });
      setClients(data || []);
      setLoading(false);
    };

    void fetchClients();
  }, [tenantId, userLoading]);

  if (userLoading || loading) {
    return (
      <PageContainer pageTitle={pageTitle} pageDescription={pageDescription}>
        <p className='text-muted-foreground p-4'>Cargando clientes...</p>
      </PageContainer>
    );
  }

  if (!tenantId) {
    return (
      <PageContainer pageTitle={pageTitle} pageDescription={pageDescription}>
        <p className='text-muted-foreground p-4'>
          No se pudo resolver tu organización. Completa tu perfil de usuario o vuelve a iniciar sesión.
        </p>
      </PageContainer>
    );
  }

  return (
    <PageContainer pageTitle={pageTitle} pageDescription={pageDescription}>
      <div className='space-y-6 p-4 md:px-6'>
        {clients.length === 0 ? (
          <Card>
            <CardContent className='py-10 text-center text-muted-foreground'>
              {emptyHint}{' '}
              <Button variant='link' onClick={() => router.push('/diagnostic')}>
                Crear un diagnóstico
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className='grid gap-3 max-w-2xl'>
            {clients.map((client) => (
              <Card
                key={client.id}
                className='cursor-pointer hover:border-primary transition-colors'
                onClick={() => router.push(`${routePrefix}/${client.id}`)}
              >
                <CardHeader className='pb-2'>
                  <div className='flex items-center justify-between'>
                    <CardTitle className='text-base'>{client.business_name}</CardTitle>
                    <Badge variant='outline'>
                      {STATUS_LABEL[client.status] || client.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className='pt-0'>
                  <p className='text-sm text-muted-foreground capitalize'>
                    {client.industry} · {client.contact_first_name || 'Sin contacto'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
