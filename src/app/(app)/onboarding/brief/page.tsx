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
  active: 'Activo'
};

export default function OnboardingBriefListPage() {
  const { tenantId } = useUser();
  const supabase = createClient();
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClients = async () => {
      let query = supabase
        .from('clients')
        .select('id, business_name, industry, status, tier, contact_first_name')
        .in('status', ['diagnosed', 'onboarding', 'negotiating', 'active'])
        .order('created_at', { ascending: false });

      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { data } = await query;
      setClients(data || []);
      setLoading(false);
    };
    fetchClients();
  }, [tenantId]);

  return (
    <PageContainer>
      <div className='space-y-6'>
        <div>
          <h1 className='text-2xl font-bold'>Brief & Persona</h1>
          <p className='text-muted-foreground text-sm mt-1'>
            Selecciona un cliente para generar su Brief, Buyer Persona y Oferta de Valor.
          </p>
        </div>

        {loading ? (
          <p className='text-muted-foreground'>Cargando clientes...</p>
        ) : clients.length === 0 ? (
          <Card>
            <CardContent className='py-10 text-center text-muted-foreground'>
              No hay clientes en onboarding aún.{' '}
              <Button variant='link' onClick={() => router.push('/diagnostic')}>
                Crear un diagnóstico
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className='grid gap-3'>
            {clients.map((client) => (
              <Card
                key={client.id}
                className='cursor-pointer hover:border-primary transition-colors'
                onClick={() => router.push(`/onboarding/brief/${client.id}`)}
              >
                <CardHeader className='pb-2'>
                  <div className='flex items-center justify-between'>
                    <CardTitle className='text-base'>{client.business_name}</CardTitle>
                    <div className='flex gap-2'>
                      <Badge variant='outline'>
                        {STATUS_LABEL[client.status] || client.status}
                      </Badge>
                      {client.tier && (
                        <Badge className='bg-primary/10 text-primary border-primary/20'>
                          {client.tier}
                        </Badge>
                      )}
                    </div>
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
