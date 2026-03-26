'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageContainer from '@/components/layout/page-container';
import ClientForm from '@/components/clients/ClientForm';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icons } from '@/components/icons';

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  diagnosed: 'Diagnosticado',
  negotiating: 'Negociando',
  onboarding: 'Onboarding',
  active: 'Activo',
  churned: 'Perdido'
};

const STATUS_STEPS = [
  'lead',
  'diagnosed',
  'negotiating',
  'onboarding',
  'active'
];

type Client = {
  id: string;
  business_name: string;
  industry: string;
  contact_first_name: string;
  contact_last_name: string;
  phone: string;
  email: string;
  disc_profile: string;
  notes: string;
  status: string;
  tier: string | null;
  created_at: string;
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const fetchClient = async () => {
    if (!tenantId || !id) return;
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (!error && data) {
      setClient(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!userLoading && tenantId) {
      fetchClient();
    }
  }, [tenantId, userLoading, id]);

  if (loading) {
    return (
      <PageContainer pageTitle='Cliente'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  if (!client) {
    return (
      <PageContainer pageTitle='Cliente no encontrado'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cliente no encontrado.</p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => router.push('/clients')}
          >
            Volver a Clientes
          </Button>
        </div>
      </PageContainer>
    );
  }

  const currentStatusIndex = STATUS_STEPS.indexOf(client.status);

  return (
    <PageContainer
      pageTitle={client.business_name}
      pageDescription={`${client.industry?.replace(/_/g, ' ')} · ${STATUS_LABELS[client.status] || client.status}`}
      pageHeaderAction={
        <div className='flex gap-2'>
          <Button variant='outline' onClick={() => setEditOpen(true)}>
            <Icons.edit className='mr-2 h-4 w-4' />
            Editar
          </Button>
          <Button asChild>
            <Link href={`/diagnostic?clientId=${client.id}`}>
              Nuevo Diagnóstico
            </Link>
          </Button>
        </div>
      }
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6'>
        {/* Status Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className='text-sm font-medium text-muted-foreground'>
              Progreso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex items-center gap-2 overflow-x-auto'>
              {STATUS_STEPS.map((step, index) => (
                <div key={step} className='flex items-center gap-2'>
                  <div
                    className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${
                      index < currentStatusIndex
                        ? 'bg-primary/20 text-primary'
                        : index === currentStatusIndex
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {index < currentStatusIndex && '✓ '}
                    {STATUS_LABELS[step]}
                  </div>
                  {index < STATUS_STEPS.length - 1 && (
                    <div
                      className={`h-px w-8 ${index < currentStatusIndex ? 'bg-primary' : 'bg-border'}`}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue='overview'>
          <TabsList>
            <TabsTrigger value='overview'>Resumen</TabsTrigger>
            <TabsTrigger value='diagnostic'>Diagnóstico</TabsTrigger>
            <TabsTrigger value='credentials'>Credenciales</TabsTrigger>
            <TabsTrigger value='nap'>NAP</TabsTrigger>
            <TabsTrigger value='photos'>Fotos</TabsTrigger>
            <TabsTrigger value='gbp'>GBP</TabsTrigger>
          </TabsList>

          <TabsContent value='overview' className='mt-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    Información del negocio
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div>
                    <p className='text-xs font-medium text-muted-foreground'>
                      Nombre del negocio
                    </p>
                    <p className='text-sm'>{client.business_name}</p>
                  </div>
                  <div>
                    <p className='text-xs font-medium text-muted-foreground'>
                      Industria
                    </p>
                    <p className='text-sm capitalize'>
                      {client.industry?.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs font-medium text-muted-foreground'>
                      Estado
                    </p>
                    <Badge variant='default'>
                      {STATUS_LABELS[client.status] || client.status}
                    </Badge>
                  </div>
                  {client.tier && (
                    <div>
                      <p className='text-xs font-medium text-muted-foreground'>
                        Tier
                      </p>
                      <p className='text-sm capitalize'>
                        {client.tier.replace(/_/g, ' ')}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>Contacto</CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div>
                    <p className='text-xs font-medium text-muted-foreground'>
                      Nombre
                    </p>
                    <p className='text-sm'>
                      {[client.contact_first_name, client.contact_last_name]
                        .filter(Boolean)
                        .join(' ') || '—'}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs font-medium text-muted-foreground'>
                      Teléfono
                    </p>
                    <p className='text-sm'>{client.phone || '—'}</p>
                  </div>
                  <div>
                    <p className='text-xs font-medium text-muted-foreground'>
                      Email
                    </p>
                    <p className='text-sm'>{client.email || '—'}</p>
                  </div>
                  <div>
                    <p className='text-xs font-medium text-muted-foreground'>
                      Perfil DISC
                    </p>
                    <p className='text-sm'>{client.disc_profile || '—'}</p>
                  </div>
                </CardContent>
              </Card>

              {client.notes && (
                <Card className='sm:col-span-2'>
                  <CardHeader>
                    <CardTitle className='text-base'>Notas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className='text-sm whitespace-pre-wrap'>{client.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value='diagnostic' className='mt-4'>
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-muted-foreground mb-4'>
                  Diagnósticos del cliente
                </p>
                <Button asChild>
                  <Link href={`/diagnostic?clientId=${client.id}`}>
                    Nuevo Diagnóstico
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='credentials' className='mt-4'>
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-muted-foreground mb-4'>
                  Credenciales del cliente
                </p>
                <Button asChild>
                  <Link
                    href={`/onboarding/credentials/${client.id}`}
                  >
                    Gestionar Credenciales
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='nap' className='mt-4'>
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-muted-foreground mb-4'>
                  Verificación NAP
                </p>
                <Button asChild>
                  <Link href={`/onboarding/nap/${client.id}`}>
                    Verificar NAP
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='photos' className='mt-4'>
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-muted-foreground mb-4'>
                  Fotos del cliente
                </p>
                <Button asChild>
                  <Link href={`/photos/${client.id}`}>Gestionar Fotos</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='gbp' className='mt-4'>
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-muted-foreground mb-4'>
                  Perfil de Google Business
                </p>
                <Button asChild>
                  <Link href={`/gbp/${client.id}`}>Gestionar GBP</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
          <ClientForm
            initialData={client}
            onSuccess={() => {
              setEditOpen(false);
              fetchClient();
            }}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
