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
import {
  getLatestReadiness,
  createSupabaseReadinessStore
} from '@/lib/gbp-slice/readiness-repo';
import type { EligibilityVerdict } from '@/types/c3-domain';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icons } from '@/components/icons';
import { ClientAssetHub } from './client-asset-hub';

// F-085 (R-03/R-04) — Réplica local del mapa veredicto→{label,color} de
// `onboarding/readiness/[clientId]/page.tsx` (L34-42), extendida con el estado
// sin-assessment (`sin_evaluacion`). No se exporta ni refactoriza el original
// para no ampliar el blast radius (design §1).
const VERDICT_META: Record<
  EligibilityVerdict | 'sin_evaluacion',
  { label: string; color: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  elegible: { label: 'Elegible', color: 'default' },
  bloqueado: { label: 'Bloqueado', color: 'destructive' },
  necesita_fix: { label: 'Necesita corrección', color: 'secondary' },
  datos_insuficientes: { label: 'Datos insuficientes', color: 'outline' },
  sin_evaluacion: { label: 'Sin evaluación', color: 'outline' }
};

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
  // F-085 (R-06) — último veredicto de readiness del cliente en contexto.
  const [readinessVerdict, setReadinessVerdict] =
    useState<EligibilityVerdict | null>(null);

  type ProgressState = {
    hasDiagnostic: boolean;
    hasCredentials: boolean;
    hasNap: boolean;
    briefApproved: boolean;
    personaApproved: boolean;
    ofvApproved: boolean;
    hasGbpDescription: boolean;
    hasApprovedPhotos: boolean;
    previewSent: boolean;
  };

  const [progress, setProgress] = useState<ProgressState>({
    hasDiagnostic: false,
    hasCredentials: false,
    hasNap: false,
    briefApproved: false,
    personaApproved: false,
    ofvApproved: false,
    hasGbpDescription: false,
    hasApprovedPhotos: false,
    previewSent: false
  });

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

    // Fetch progress checklist data in parallel
    const [
      { data: diagnosticData },
      { data: credentialsData },
      { data: napData },
      { data: briefData },
      { data: personaData },
      { data: ofvData },
      { data: gbpData },
      { data: photosData },
      { data: previewData },
      readinessVerdictResult
    ] = await Promise.all([
      supabase
        .from('diagnostics')
        .select('id')
        .eq('client_id', id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('credentials')
        .select('id')
        .eq('client_id', id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('nap_checks')
        .select('id')
        .eq('client_id', id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('briefs')
        .select('status')
        .eq('client_id', id)
        .eq('status', 'approved')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('buyer_personas')
        .select('status')
        .eq('client_id', id)
        .eq('status', 'approved')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('offers')
        .select('status')
        .eq('client_id', id)
        .eq('status', 'approved')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('gbp_profiles')
        .select('description')
        .eq('client_id', id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('client_photos')
        .select('id')
        .eq('client_id', id)
        .eq('approved', true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('previews')
        .select('id')
        .eq('client_id', id)
        .limit(1)
        .maybeSingle(),
      // F-085 (R-06/R-08) — último veredicto de readiness, por el mismo camino
      // client-side que el resto de la ficha. Degradación honesta: ante error
      // (p. ej. tabla ausente / respuesta de error) → null, sin romper el render,
      // replicando el try/catch del panel (readiness/[clientId]/page.tsx L77-80).
      (async (): Promise<EligibilityVerdict | null> => {
        try {
          const store = createSupabaseReadinessStore(supabase);
          const row = await getLatestReadiness(store, id);
          return row?.verdict ?? null;
        } catch (error) {
          console.error('Error loading readiness verdict:', error);
          return null;
        }
      })()
    ]);

    setProgress({
      hasDiagnostic: !!diagnosticData,
      hasCredentials: !!credentialsData,
      hasNap: !!napData,
      briefApproved: !!briefData,
      personaApproved: !!personaData,
      ofvApproved: !!ofvData,
      hasGbpDescription: !!gbpData?.description,
      hasApprovedPhotos: !!photosData,
      previewSent: !!previewData
    });

    // F-085 (R-06/R-07) — veredicto resuelto para el clientId en contexto.
    setReadinessVerdict(readinessVerdictResult);

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
            <CardTitle className='text-muted-foreground text-sm font-medium'>
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
          <TabsList className='h-auto flex-wrap'>
            <TabsTrigger value='overview'>Resumen</TabsTrigger>
            <TabsTrigger value='diagnostic'>Diagnóstico</TabsTrigger>
            <TabsTrigger value='credentials'>Credenciales</TabsTrigger>
            <TabsTrigger value='nap'>NAP</TabsTrigger>
            <TabsTrigger value='brief'>Brief & Persona</TabsTrigger>
            <TabsTrigger value='photos'>Fotos</TabsTrigger>
            <TabsTrigger value='gbp'>GBP</TabsTrigger>
            <TabsTrigger value='readiness'>Readiness</TabsTrigger>
            <TabsTrigger value='presencia'>Presencia Digital</TabsTrigger>
          </TabsList>

          <TabsContent value='overview' className='mt-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              {/* Progress Checklist */}
              <Card className='sm:col-span-2'>
                <CardHeader>
                  <CardTitle className='text-base'>
                    Progreso del cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='grid gap-2 sm:grid-cols-2'>
                    {[
                      {
                        label: 'Diagnóstico completado',
                        done: progress.hasDiagnostic
                      },
                      {
                        label: 'Credenciales verificadas',
                        done: progress.hasCredentials
                      },
                      { label: 'NAP verificado', done: progress.hasNap },
                      { label: 'Brief aprobado', done: progress.briefApproved },
                      {
                        label: 'Buyer Persona aprobada',
                        done: progress.personaApproved
                      },
                      { label: 'OFV aprobado', done: progress.ofvApproved },
                      {
                        label: 'GBP description generada',
                        done: progress.hasGbpDescription
                      },
                      {
                        label: 'Fotos subidas y aprobadas',
                        done: progress.hasApprovedPhotos
                      },
                      { label: 'Preview enviado', done: progress.previewSent }
                    ].map((item) => (
                      <div key={item.label} className='flex items-center gap-2'>
                        <span
                          className={`text-sm ${item.done ? 'text-green-600' : 'text-muted-foreground'}`}
                        >
                          {item.done ? '✅' : '⬜'} {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className='text-muted-foreground mt-3 text-xs'>
                    {Object.values(progress).filter(Boolean).length} /{' '}
                    {Object.values(progress).length} completados
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className='text-base'>
                    Información del negocio
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-3'>
                  <div>
                    <p className='text-muted-foreground text-xs font-medium'>
                      Nombre del negocio
                    </p>
                    <p className='text-sm'>{client.business_name}</p>
                  </div>
                  <div>
                    <p className='text-muted-foreground text-xs font-medium'>
                      Industria
                    </p>
                    <p className='text-sm capitalize'>
                      {client.industry?.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div>
                    <p className='text-muted-foreground text-xs font-medium'>
                      Estado
                    </p>
                    <Badge variant='default'>
                      {STATUS_LABELS[client.status] || client.status}
                    </Badge>
                  </div>
                  {client.tier && (
                    <div>
                      <p className='text-muted-foreground text-xs font-medium'>
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
                    <p className='text-muted-foreground text-xs font-medium'>
                      Nombre
                    </p>
                    <p className='text-sm'>
                      {[client.contact_first_name, client.contact_last_name]
                        .filter(Boolean)
                        .join(' ') || '—'}
                    </p>
                  </div>
                  <div>
                    <p className='text-muted-foreground text-xs font-medium'>
                      Teléfono
                    </p>
                    <p className='text-sm'>{client.phone || '—'}</p>
                  </div>
                  <div>
                    <p className='text-muted-foreground text-xs font-medium'>
                      Email
                    </p>
                    <p className='text-sm'>{client.email || '—'}</p>
                  </div>
                  <div>
                    <p className='text-muted-foreground text-xs font-medium'>
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
                    <p className='text-sm whitespace-pre-wrap'>
                      {client.notes}
                    </p>
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
                  <Link href={`/onboarding/credentials/${client.id}`}>
                    Gestionar Credenciales
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='nap' className='mt-4'>
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-muted-foreground mb-4'>Verificación NAP</p>
                <Button asChild>
                  <Link href={`/onboarding/nap/${client.id}`}>
                    Verificar NAP
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='brief' className='mt-4'>
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-muted-foreground mb-2'>
                  Generación de contenido con IA
                </p>
                <p className='text-muted-foreground mb-4 text-sm'>
                  Brief · Buyer Persona · Oferta de Valor
                </p>
                <div className='flex flex-wrap justify-center gap-2'>
                  {progress.briefApproved && (
                    <Badge className='border-green-200 bg-green-100 text-green-800'>
                      Brief ✓
                    </Badge>
                  )}
                  {progress.personaApproved && (
                    <Badge className='border-green-200 bg-green-100 text-green-800'>
                      Persona ✓
                    </Badge>
                  )}
                  {progress.ofvApproved && (
                    <Badge className='border-green-200 bg-green-100 text-green-800'>
                      OFV ✓
                    </Badge>
                  )}
                </div>
                <Button asChild className='mt-4'>
                  <Link href={`/onboarding/brief/${client.id}`}>
                    Abrir Brief & Persona
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='photos' className='mt-4'>
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-muted-foreground mb-4'>Fotos del cliente</p>
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

          <TabsContent value='readiness' className='mt-4'>
            <Card>
              <CardContent className='py-8 text-center'>
                <p className='text-muted-foreground mb-4'>
                  Readiness de elegibilidad GBP
                </p>
                {/* F-085 (R-03/R-04/R-05) — Badge de solo-lectura con el último
                    veredicto. NO navega (sin asChild/onClick/href); solo el botón
                    de abajo abre el panel (DT-3). `null` → "Sin evaluación". */}
                <div className='mb-4 flex justify-center'>
                  <Badge
                    variant={
                      VERDICT_META[readinessVerdict ?? 'sin_evaluacion'].color
                    }
                    className='px-3 py-1 text-sm'
                  >
                    {VERDICT_META[readinessVerdict ?? 'sin_evaluacion'].label}
                  </Badge>
                </div>
                <Button asChild>
                  <Link href={`/onboarding/readiness/${client.id}`}>
                    Ver Readiness
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='presencia' className='mt-4'>
            <ClientAssetHub clientId={client.id} tenantId={tenantId!} />
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
