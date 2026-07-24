'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageContainer from '@/components/layout/page-container';
import ClientForm from '@/components/clients/ClientForm';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import ReadinessPanelBody from '@/components/readiness/readiness-panel-body';
import {
  CLIENT_STATUS_VALUES,
  STATUS_LABELS,
  STATUS_STEPS,
  isLinearStatus,
  statusLabel,
  statusStepIndex,
  persistClientStatus,
  type ClientStatusWriteClient
} from '@/lib/clients/client-status';
import {
  buildDeliverableSummary,
  type DeliverableSummary
} from '@/lib/clients/deliverable';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { ClientAssetHub } from './client-asset-hub';

// F-087 (R-09) — etiquetas legibles del lifecycle + origen del activo GBP (read-only).
const GBP_LIFECYCLE_LABELS: Record<string, string> = {
  pending: 'Pendiente (aún no creado/verificado)',
  created: 'Creado en Google (pendiente de verificar)',
  verified: 'Verificado',
  not_found: 'No existe'
};

const GBP_MODE_LABELS: Record<string, string> = {
  create: 'Creado desde cero',
  existing: 'Perfil preexistente'
};

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
  // F-092 (R-06/R-09) — timestamp de entrega set-once; leído vía select('*'), tolera que
  // la columna aún no exista (frontera F-074): `undefined`/`null` → "aún no entregado".
  delivered_at: string | null;
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenantId, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  // F-088 — UI de transición de estado (DT-03: dropdown + confirmación + write-path
  // manual client-side). `pendingStatus` = destino seleccionado a la espera de confirmar;
  // nada se persiste hasta que el operador confirma (R-09).
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  // F-087 (R-09) — reflejo READ-ONLY del estado del activo GBP en la ficha: origen
  // (`gbp_mode`) DISTINGUIDO del estado del lifecycle (`verification_status`). La ficha
  // consume el estado; NO lo edita (el editor vive en /gbp/[clientId], DT-02).
  const [gbpLifecycle, setGbpLifecycle] = useState<{
    gbpMode: string | null;
    verificationStatus: string | null;
    verifiedAt: string | null;
  } | null>(null);

  // F-092 (R-01/R-03) — filas vivas que alimentan el read-model del entregable. Se cargan
  // en el mismo `Promise.all` del fetch; el summary se computa en el render (agregación viva,
  // NO snapshot). `null` mientras carga.
  const [deliverableData, setDeliverableData] = useState<{
    gbpProfile: {
      gbp_url: string | null;
      place_id: string | null;
      verification_status: string | null;
      verified_at: string | null;
      content_status: string | null;
    } | null;
    hasApprovedPhotos: boolean;
    preview: { approved: boolean | null; approved_at: string | null } | null;
    gbpAsset: { status: string | null } | null;
  } | null>(null);

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
      { data: gbpAssetData }
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
        .select(
          'description, gbp_mode, verification_status, verified_at, gbp_url, place_id, content_status'
        )
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
        .select('id, approved, approved_at')
        .eq('client_id', id)
        .limit(1)
        .maybeSingle(),
      // F-092 (R-03 vi) — fila `client_assets` del canal GBP (estado del activo).
      supabase
        .from('client_assets')
        .select('status')
        .eq('client_id', id)
        .eq('asset_type', 'gbp')
        .limit(1)
        .maybeSingle()
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

    // F-087 (R-09) — reflejar el estado del activo GBP (origen + lifecycle) read-only.
    setGbpLifecycle(
      gbpData
        ? {
            gbpMode: gbpData.gbp_mode ?? null,
            verificationStatus: gbpData.verification_status ?? null,
            verifiedAt: gbpData.verified_at ?? null
          }
        : null
    );

    // F-092 (R-01/R-03) — filas vivas del entregable (agregación viva en el render).
    setDeliverableData({
      gbpProfile: gbpData
        ? {
            gbp_url: gbpData.gbp_url ?? null,
            place_id: gbpData.place_id ?? null,
            verification_status: gbpData.verification_status ?? null,
            verified_at: gbpData.verified_at ?? null,
            content_status: gbpData.content_status ?? null
          }
        : null,
      hasApprovedPhotos: !!photosData,
      preview: previewData
        ? {
            approved: previewData.approved ?? null,
            approved_at: previewData.approved_at ?? null
          }
        : null,
      gbpAsset: gbpAssetData ? { status: gbpAssetData.status ?? null } : null
    });

    setLoading(false);
  };

  useEffect(() => {
    if (!userLoading && tenantId) {
      fetchClient();
    }
  }, [tenantId, userLoading, id]);

  // F-088 — el operador selecciona un destino en el dropdown → abre el diálogo de
  // confirmación (R-09). Nada se persiste hasta confirmar; seleccionar el estado actual
  // es un no-op.
  const requestStatusChange = (target: string) => {
    if (!client || target === client.status) return;
    setPendingStatus(target);
    setConfirmOpen(true);
  };

  // F-088 — confirma la transición: persiste vía la seam `persistClientStatus`
  // (validación app-side del destino R-10 + error honesto R-11) y refresca la ficha
  // in-place (título/descr, timeline, badge) tras éxito (R-05, R-06, R-08).
  const confirmStatusChange = async () => {
    const target = pendingStatus;
    if (!client || !target || !tenantId) return;
    setSavingStatus(true);
    try {
      await persistClientStatus({
        supabase: supabase as unknown as ClientStatusWriteClient,
        clientId: client.id,
        tenantId,
        target,
        // F-092 (R-06/R-07) — set-once: pasar el delivered_at actual del cliente ya cargado;
        // el seam sólo escribe delivered_at al ENTRAR a `delivered` con este valor en NULL.
        currentDeliveredAt: client.delivered_at ?? null
      });
      setConfirmOpen(false);
      setPendingStatus(null);
      await fetchClient(); // refresh in-place tras la write confirmada (§6.1)
      toast.success(`Estado actualizado a "${statusLabel(target)}"`);
    } catch (err) {
      // R-11: surfacing honesto; el estado del cliente NO cambia (sin éxito silencioso).
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`No se pudo actualizar el estado: ${message}`);
    } finally {
      setSavingStatus(false);
    }
  };

  // F-088 — cancelar el diálogo deja el estado sin cambio (R-09).
  const cancelStatusChange = () => {
    setConfirmOpen(false);
    setPendingStatus(null);
  };

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

  // F-088 (R-13) — `statusStepIndex` devuelve -1 para estados NO-lineales
  // (`paused`/`churned`) o desconocidos. NO usamos ese -1 para pintar todo como futuro;
  // `linearStatus` decide si mostrar el carril lineal o el badge fuera-de-carril.
  const linearStatus = isLinearStatus(client.status);
  const currentStatusIndex = statusStepIndex(client.status);

  // F-092 (R-01/R-03/R-09) — read-model del entregable (agregación viva de los activos ya
  // cargados + delivered_at del cliente). Se computa en el render; nada se persiste.
  const deliverable: DeliverableSummary | null = deliverableData
    ? buildDeliverableSummary({
        deliveredAt: client.delivered_at ?? null,
        gbpProfile: deliverableData.gbpProfile,
        hasApprovedPhotos: deliverableData.hasApprovedPhotos,
        preview: deliverableData.preview,
        gbpAsset: deliverableData.gbpAsset
      })
    : null;

  return (
    <PageContainer
      pageTitle={client.business_name}
      pageDescription={`${client.industry?.replace(/_/g, ' ')} · ${statusLabel(client.status)}`}
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
        {/* Status Timeline + control de transición (F-088) */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between gap-2'>
            <CardTitle className='text-muted-foreground text-sm font-medium'>
              Progreso
            </CardTitle>
            {/* F-088 (R-07, DT-03) — dropdown de transición any-to-any: destinos = set
                completo de `client_status`. Al seleccionar dispara la confirmación
                (R-09); nada se persiste hasta confirmar. */}
            <div className='flex items-center gap-2'>
              <span className='text-muted-foreground text-xs'>Estado:</span>
              <Select value={client.status} onValueChange={requestStatusChange}>
                <SelectTrigger
                  className='h-8 w-[190px]'
                  aria-label='Estado del cliente'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {/* F-088 (R-13) — estado NO-lineal (`paused`/`churned`): badge explícito
                fuera-de-carril en vez de pintar la timeline como "antes del paso 1". */}
            {!linearStatus && (
              <div className='mb-3'>
                <Badge variant='secondary'>
                  Estado actual: {statusLabel(client.status)} — fuera del flujo
                  lineal
                </Badge>
              </div>
            )}
            {linearStatus ? (
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
            ) : (
              <p className='text-muted-foreground text-xs'>
                Este estado no forma parte del flujo lineal de progreso.
              </p>
            )}
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
            <TabsTrigger value='deliverable'>Entregable</TabsTrigger>
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
                      {statusLabel(client.status)}
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
              <CardContent className='space-y-4 py-8 text-center'>
                <p className='text-muted-foreground'>
                  Perfil de Google Business
                </p>
                {/* F-087 (R-09) — reflejo READ-ONLY del activo: origen (gbp_mode)
                    DISTINGUIDO del estado (lifecycle). Sólo lectura; la edición vive
                    en /gbp/[clientId]. */}
                <div className='mx-auto flex max-w-md flex-wrap items-center justify-center gap-2'>
                  <Badge variant='outline'>
                    Origen:{' '}
                    {gbpLifecycle?.gbpMode
                      ? (GBP_MODE_LABELS[gbpLifecycle.gbpMode] ??
                        gbpLifecycle.gbpMode)
                      : 'Sin registrar'}
                  </Badge>
                  <Badge variant='outline'>
                    Estado:{' '}
                    {gbpLifecycle?.verificationStatus
                      ? (GBP_LIFECYCLE_LABELS[
                          gbpLifecycle.verificationStatus
                        ] ?? gbpLifecycle.verificationStatus)
                      : 'Pendiente (aún no creado/verificado)'}
                  </Badge>
                  {gbpLifecycle?.verifiedAt && (
                    <Badge variant='outline'>
                      Verificado:{' '}
                      {new Date(gbpLifecycle.verifiedAt).toLocaleDateString(
                        'es-MX'
                      )}
                    </Badge>
                  )}
                </div>
                <Button asChild>
                  <Link href={`/gbp/${client.id}`}>Gestionar GBP</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='deliverable' className='mt-4'>
            {/* F-092 (R-02/R-03/R-04/R-09) — superficie de agregación VIVA read-only de lo
                entregado: los 6 campos (GBP link + verificación + contenido + fotos + preview
                + canal GBP) + indicador de honestidad de contenido + delivered_at. Deriva
                todo del estado vivo (sin snapshot); degrada honestamente lo pendiente. */}
            <Card className='max-w-3xl'>
              <CardHeader>
                <CardTitle className='text-base'>
                  Entregable del cliente
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                {/* delivered_at (R-09): fecha si presente, degradación honesta si NULL. */}
                <div className='flex items-center justify-between border-b pb-3'>
                  <span className='text-muted-foreground text-sm font-medium'>
                    Entregado
                  </span>
                  {deliverable?.deliveredAt ? (
                    <Badge className='border-green-200 bg-green-100 text-green-800'>
                      {new Date(deliverable.deliveredAt).toLocaleDateString(
                        'es-MX'
                      )}
                    </Badge>
                  ) : (
                    <Badge variant='secondary'>Aún no entregado</Badge>
                  )}
                </div>

                {deliverable ? (
                  <div className='space-y-3'>
                    {(
                      [
                        { key: 'gbpLink', title: 'GBP publicado' },
                        { key: 'verification', title: 'Verificación' },
                        { key: 'content', title: 'Contenido' },
                        { key: 'photos', title: 'Fotos' },
                        { key: 'preview', title: 'Preview' },
                        { key: 'gbpChannel', title: 'Canal GBP' }
                      ] as const
                    ).map(({ key, title }) => {
                      const field = deliverable[key];
                      return (
                        <div
                          key={key}
                          className='flex items-start justify-between gap-3'
                        >
                          <div className='min-w-0'>
                            <p className='text-sm font-medium'>{title}</p>
                            <p className='text-muted-foreground text-xs'>
                              {field.label}
                            </p>
                            {field.detail && (
                              <p className='text-muted-foreground mt-0.5 truncate text-xs'>
                                {field.detail}
                              </p>
                            )}
                          </div>
                          <Badge
                            variant={field.present ? 'default' : 'secondary'}
                          >
                            {field.present ? 'Entregado' : 'Pendiente'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className='text-muted-foreground text-sm'>
                    Cargando entregable…
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value='readiness' className='mt-4'>
            {/* F-086 (R-03) — Bloque completo de readiness (veredicto + blockers +
                evidencia + botón "Evaluar") vía el componente compartido
                `ReadinessPanelBody` (single source of truth con el panel). El badge
                standalone de F-085 queda subsumido por la card de Veredicto. */}
            <div className='max-w-3xl'>
              <ReadinessPanelBody clientId={client.id} />
              {/* Deep-link al panel standalone (no-regresión F-085, DT-2). */}
              <div className='mt-4'>
                <Button asChild variant='outline'>
                  <Link href={`/onboarding/readiness/${client.id}`}>
                    Abrir panel
                  </Link>
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value='presencia' className='mt-4'>
            <ClientAssetHub clientId={client.id} tenantId={tenantId!} />
          </TabsContent>
        </Tabs>
      </div>

      {/* F-088 — Diálogo de confirmación de transición de estado (R-09). Cancelar deja
          el estado sin cambio; Confirmar persiste vía la seam (R-05/R-11). */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open) cancelStatusChange();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar estado del cliente</DialogTitle>
            <DialogDescription>
              {pendingStatus && client
                ? `¿Cambiar el estado de "${statusLabel(client.status)}" a "${statusLabel(pendingStatus)}"?`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={cancelStatusChange}
              disabled={savingStatus}
            >
              Cancelar
            </Button>
            <Button onClick={confirmStatusChange} disabled={savingStatus}>
              {savingStatus ? 'Guardando…' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
