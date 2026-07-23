'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageContainer from '@/components/layout/page-container';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
import {
  textFromGenerateContentResult,
  gbpDescriptionFromResult
} from '@/lib/generate-content-text';
import {
  generateContent,
  generateGbp,
  type GenerateGbpSuccess
} from '@/lib/edge-functions';
import {
  derivePrecondition,
  mapGbpError,
  needsRegenerateConfirm,
  offerRowNonEmpty,
  parseServiceArea,
  selectLatestGbpProfile,
  serializeServiceArea,
  type PreconditionState
} from '@/lib/gbp-trigger-state';
// F-084 — guards de write-path del draft GBP (sanitizer + zip + límite corto).
import {
  guardGbpDescription,
  clampShortDescription,
  validateAddressZip,
  SHORT_DESCRIPTION_MAX
} from '@/lib/gbp-slice/profile-edit';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';

const GBP_ATTRIBUTES = [
  { id: 'spanish', label: 'Se habla español' },
  { id: 'wheelchair', label: 'Accesible en silla de ruedas' },
  { id: 'veteran', label: 'Negocio propiedad de veterano' },
  { id: 'women_owned', label: 'Negocio propiedad de mujer' },
  { id: 'minority_owned', label: 'Negocio propiedad de minoría' },
  { id: 'insured', label: 'Asegurado y licenciado' },
  { id: 'free_estimate', label: 'Estimados gratuitos' },
  { id: 'emergency', label: 'Servicio de emergencia' }
];

const DAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo'
];
const DAYS_EN = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
];

type GbpPost = {
  id: string;
  content: string;
  cta_type: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
};

export default function GBPPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [client, setClient] = useState<{
    id: string;
    business_name: string;
  } | null>(null);
  const [gbpProfileId, setGbpProfileId] = useState<string | null>(null);
  const [posts, setPosts] = useState<GbpPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [primaryCategory, setPrimaryCategory] = useState('');
  const [description, setDescription] = useState('');
  // F-084 R-01 — short_description editable (antes: nunca cargado ni guardado).
  const [shortDescription, setShortDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [address, setAddress] = useState('');
  const [attributes, setAttributes] = useState<string[]>([]);
  const [hours, setHours] = useState<Record<string, string>>({});
  // F-068 CL-036 — service_area jsonb {notes, cities} split into two editable inputs.
  const [serviceAreaNotes, setServiceAreaNotes] = useState('');
  const [serviceAreaCities, setServiceAreaCities] = useState('');

  // Post form state
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostCta, setNewPostCta] = useState('call');
  const [savingPost, setSavingPost] = useState(false);

  // AI generation state
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [generatingPost, setGeneratingPost] = useState(false);
  const [postTopic, setPostTopic] = useState('');

  // F-067 — GBP slice generation trigger state
  const [precondition, setPrecondition] = useState<PreconditionState>({
    enabled: false,
    reason: null
  });
  const [gbpAssetStatus, setGbpAssetStatus] = useState<string | null>(null);
  const [generatingGbp, setGeneratingGbp] = useState(false);
  const [gbpGenResult, setGbpGenResult] = useState<GenerateGbpSuccess | null>(
    null
  );
  // F-068 CL-035 — controls the in-app anti-dup confirmation modal (replaces the native confirm() dialog).
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!userLoading && tenantId && clientId) {
      loadData();
    }
  }, [tenantId, userLoading, clientId]);

  const loadData = async () => {
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, business_name, phone')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .single();

    if (clientData) {
      setClient(clientData);
      setBusinessName(clientData.business_name);
      setPhone(clientData.phone || '');
    }

    // R-15 (T-15) — tolerate ≥1 gbp_profiles row: take the most recent instead of
    // `.single()` (which throws on >1). Root cause (route insert-vs-upsert) is
    // deferred F-066 debt; this only makes the page robust.
    const { data: gbpRows } = await supabase
      .from('gbp_profiles')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1);
    const gbpData = selectLatestGbpProfile(gbpRows);

    if (gbpData) {
      setGbpProfileId(gbpData.id);
      setBusinessName(gbpData.business_name || clientData?.business_name || '');
      setPrimaryCategory(gbpData.primary_category || '');
      setDescription(gbpData.description || '');
      // F-084 R-01 — cargar short_description existente en el campo editable.
      setShortDescription(gbpData.short_description || '');
      setPhone(gbpData.phone || clientData?.phone || '');
      setWebsiteUrl(gbpData.website_url || '');
      setAddress(gbpData.address || '');
      setAttributes(gbpData.attributes || []);
      setHours(gbpData.hours || {});
      // F-068 CL-036 — null-safe parse of jsonb {notes, cities} into two sub-fields
      // (object/array/string/null/unknown all handled; never renders [object Object]).
      const sa = parseServiceArea(gbpData.service_area);
      setServiceAreaNotes(sa.notes);
      setServiceAreaCities(sa.cities);
    }

    const { data: postsData } = await supabase
      .from('gbp_posts')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (postsData) setPosts(postsData);

    // F-067 T-03 (R-03) — read approved OFV (non-empty) + approved brandboard to
    // derive the trigger's enabled state, mirroring clients/[id]/page.tsx:134-151.
    const [{ data: approvedOffers }, { data: approvedBrandboard }] =
      await Promise.all([
        supabase
          .from('offers')
          .select('big_promise, content')
          .eq('client_id', clientId)
          .eq('status', 'approved'),
        supabase
          .from('brandboards')
          .select('id')
          .eq('client_id', clientId)
          .eq('status', 'approved')
          .limit(1)
          .maybeSingle()
      ]);

    const offerApprovedNonEmpty = (approvedOffers ?? []).some(offerRowNonEmpty);
    setPrecondition(
      derivePrecondition({
        offerApprovedNonEmpty,
        brandboardApproved: !!approvedBrandboard
      })
    );

    // R-11 — read the gbp asset status to know if a confirmation is needed on regenerate.
    const { data: gbpAsset } = await supabase
      .from('client_assets')
      .select('status')
      .eq('client_id', clientId)
      .eq('asset_type', 'gbp')
      .limit(1)
      .maybeSingle();
    setGbpAssetStatus(gbpAsset?.status ?? null);

    setLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!tenantId || !user) return;

    // F-084 R-04/R-05 — sanear la descripción anti-blob ANTES de persistir; si
    // tras el saneo sigue pareciendo blob, bloquear la escritura (no persistir).
    const descGuard = guardGbpDescription(description);
    if (!descGuard.ok) {
      toast.error(descGuard.message ?? 'Descripción inválida');
      return;
    }

    // F-084 R-09/R-10 — validar el zip del address (US 5 dígitos, opcional +4)
    // antes de persistir; address vacío es válido (SAB).
    const zipCheck = validateAddressZip(address);
    if (!zipCheck.valid) {
      toast.error(zipCheck.message ?? 'Dirección inválida');
      return;
    }

    setSaving(true);

    const data = {
      client_id: clientId,
      business_name: businessName,
      primary_category: primaryCategory,
      // F-084 R-04 — persistir SIEMPRE el valor saneado (nunca el blob crudo).
      description: descGuard.value,
      // F-084 R-02/R-03 — short_description ahora se persiste desde la edición,
      // recortado al límite del campo corto (antes: el payload lo omitía).
      short_description: clampShortDescription(shortDescription),
      phone,
      website_url: websiteUrl,
      address,
      attributes,
      hours,
      // F-068 CL-036 — round-trip back to jsonb {notes, cities:string[]} (or null if
      // both sub-fields empty); never a flat string[], never blind String/JSON.stringify.
      service_area: serializeServiceArea(serviceAreaNotes, serviceAreaCities),
      updated_at: new Date().toISOString()
    };

    try {
      if (gbpProfileId) {
        await supabase.from('gbp_profiles').update(data).eq('id', gbpProfileId);
      } else {
        const { data: newProfile } = await supabase
          .from('gbp_profiles')
          .insert(data)
          .select()
          .single();
        if (newProfile) setGbpProfileId(newProfile.id);
      }

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'gbp_profile_updated',
        entityType: 'gbp_profile',
        entityId: gbpProfileId || clientId,
        clientId,
        metadata: { business_name: businessName }
      });

      toast.success('Perfil GBP guardado');
    } catch (error) {
      console.error('Error saving GBP profile:', error);
      toast.error('Error al guardar el perfil GBP');
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePost = async () => {
    if (!tenantId || !user || !newPostContent.trim()) {
      toast.error('Escribe el contenido del post');
      return;
    }
    setSavingPost(true);

    try {
      const { data: post } = await supabase
        .from('gbp_posts')
        .insert({
          client_id: clientId,
          content: newPostContent,
          cta_type: newPostCta,
          status: 'draft',
          created_by: user.id
        })
        .select()
        .single();

      if (post) {
        setPosts((prev) => [post, ...prev]);
        setNewPostContent('');
        await logActivity({
          tenantId,
          userId: user.id,
          action: 'gbp_post_created',
          entityType: 'gbp_post',
          entityId: post.id,
          clientId,
          metadata: { status: 'draft' }
        });
        toast.success('Post creado');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Error al crear el post');
    } finally {
      setSavingPost(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!tenantId || !user) return;
    setGeneratingDescription(true);
    try {
      const result = await generateContent({
        step: 'gbp_description',
        clientId
      });

      const generatedText = gbpDescriptionFromResult(result);
      if (generatedText) {
        setDescription(generatedText.slice(0, 750));
        toast.success('Descripción generada. Edítala si lo deseas y guarda.');
      } else {
        toast.error('No se recibió contenido del servidor');
      }
    } catch (error) {
      console.error('Error generating description:', error);
      toast.error(
        `Error al generar la descripción: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleGeneratePost = async () => {
    if (!tenantId || !user) return;
    setGeneratingPost(true);
    try {
      const result = await generateContent({
        step: 'gbp_posts',
        clientId,
        inputData: { post_topic: postTopic || undefined }
      });

      const generatedText = textFromGenerateContentResult(result);
      if (generatedText) {
        setNewPostContent(generatedText);
        toast.success('Post generado. Edítalo si lo deseas.');
      } else {
        toast.error('No se recibió contenido del servidor');
      }
    } catch (error) {
      console.error('Error generating post:', error);
      toast.error(
        `Error al generar el post: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    } finally {
      setGeneratingPost(false);
    }
  };

  // F-067 T-05/T-06/T-07 — trigger the GBP slice generation and drive the state machine.
  // F-068 CL-035 — click intent only: guard + decide whether to confirm (modal) or fire.
  const handleGenerateGbp = () => {
    // Guard: only fire when precondition met and not already in flight (F-067 R-04).
    if (!precondition.enabled || generatingGbp) return;

    // F-068 R-01/R-05 — if a profile/preview already exists, open the in-app modal
    // and return WITHOUT calling the route (preserves the anti-dup semantics of
    // F-067 R-11; replaces the blocking, non-automatable native confirm() of CL-035).
    if (needsRegenerateConfirm({ gbpProfileId, gbpAssetStatus })) {
      setConfirmOpen(true);
      return;
    }

    // F-068 R-05 — first generation (no profile/asset): fire directly, no modal.
    runGenerateGbp();
  };

  // F-068 CL-035 — the real effect: exactly one route call + the state machine.
  // This is the previous `handleGenerateGbp` try/finally body, unchanged in behavior.
  const runGenerateGbp = async () => {
    setGeneratingGbp(true); // loading: button disabled + spinner, blocks double submit (R-04).
    setGbpGenResult(null);
    try {
      const result = await generateGbp(clientId); // exactly one call (R-04).

      if (result.ok) {
        // R-05 — success: expose profile id, preview confirmation + link to /preview/[token].
        setGbpGenResult(result.data);
        toast.success('Perfil GBP generado. Revisa el preview.');
        await loadData(); // refresh so the new profile/asset status reflects immediately.
      } else {
        // R-06..R-10 — differentiated error by HTTP code / reason.
        const mapped = mapGbpError({
          status: result.status,
          blocked: result.blocked,
          reason: result.reason
        });
        toast.error(mapped.message);
        // `blocked` and every mapped error simply return the button to idle.
      }
    } catch (error) {
      console.error('Error generating GBP profile:', error);
      toast.error('Error de red al generar el perfil GBP. Reintenta.');
    } finally {
      setGeneratingGbp(false);
    }
  };

  const toggleAttribute = (attrId: string) => {
    setAttributes((prev) =>
      prev.includes(attrId)
        ? prev.filter((a) => a !== attrId)
        : [...prev, attrId]
    );
  };

  if (loading) {
    return (
      <PageContainer pageTitle='GBP Profile'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`GBP — ${client?.business_name || clientId}`}
      pageDescription='Google Business Profile y publicaciones'
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6'>
        <Tabs defaultValue='profile'>
          <TabsList>
            <TabsTrigger value='profile'>Perfil GBP</TabsTrigger>
            <TabsTrigger value='posts'>
              Publicaciones ({posts.length})
            </TabsTrigger>
          </TabsList>

          {/* GBP Profile Tab */}
          <TabsContent value='profile' className='mt-4 max-w-3xl space-y-4'>
            {/* F-067 — GBP slice generation trigger (single control, R-02) */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  Generar perfil GBP con IA
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <p className='text-muted-foreground text-sm'>
                  Genera un perfil GBP completo a partir de la OFV aprobada y el
                  brandboard del cliente. Crea un preview para revisión.
                </p>
                <Button
                  type='button'
                  onClick={handleGenerateGbp}
                  disabled={!precondition.enabled || generatingGbp}
                >
                  {generatingGbp ? (
                    <>
                      <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                      Generando...
                    </>
                  ) : (
                    '✨ Generar perfil GBP con IA'
                  )}
                </Button>

                {/* R-03 — disabled + specific block motive (🔒) */}
                {!precondition.enabled && precondition.reason && (
                  <p className='text-muted-foreground text-xs'>
                    🔒 {precondition.reason}
                  </p>
                )}

                {/* R-05 — success state: profile id + preview confirmation + link */}
                {gbpGenResult && (
                  <div className='rounded-md border border-green-200 bg-green-50 p-3 text-sm dark:border-green-900 dark:bg-green-950'>
                    <p className='font-medium text-green-800 dark:text-green-300'>
                      Perfil GBP generado
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                      Perfil: {gbpGenResult.gbp_profile.id} · Preview creado
                      correctamente.
                    </p>
                    <a
                      href={gbpGenResult.preview.url}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='mt-2 inline-block text-sm font-medium text-green-700 underline dark:text-green-400'
                    >
                      Abrir preview →
                    </a>
                  </div>
                )}

                {/* F-068 CL-035 — in-app anti-dup confirmation (replaces the native confirm() dialog).
                    Non-blocking + automatable: state controlled by `confirmOpen`. */}
                <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Ya existe un perfil GBP
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Ya existe un perfil GBP (o preview) para este cliente.
                        Generar de nuevo creará una versión nueva y consumirá
                        una llamada de IA. ¿Continuar?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      {/* Cancel / Escape / overlay -> close, NEVER call the route (R-03). */}
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      {/* Confirm -> close + exactly one route call (R-02). */}
                      <AlertDialogAction
                        onClick={() => {
                          setConfirmOpen(false);
                          runGenerateGbp();
                        }}
                      >
                        Continuar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  Información principal
                </CardTitle>
              </CardHeader>
              <CardContent className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2 sm:col-span-2'>
                  <Label>Nombre del negocio</Label>
                  <Input
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Categoría principal</Label>
                  <Input
                    value={primaryCategory}
                    onChange={(e) => setPrimaryCategory(e.target.value)}
                    placeholder='Roofing Contractor'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Teléfono</Label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder='(805) 555-1234'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Sitio web</Label>
                  <Input
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder='https://example.com'
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Dirección</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder='123 Main St, Santa Maria, CA 93458'
                  />
                </div>
                <div className='space-y-2 sm:col-span-2'>
                  <div className='flex items-center justify-between'>
                    <Label>
                      Descripción{' '}
                      <span className='text-muted-foreground text-xs'>
                        ({description.length}/750)
                      </span>
                    </Label>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={handleGenerateDescription}
                      disabled={generatingDescription}
                      className='h-7 text-xs'
                    >
                      {generatingDescription ? (
                        <>
                          <Icons.spinner className='mr-1 h-3 w-3 animate-spin' />
                          Generando...
                        </>
                      ) : (
                        '✨ Generar descripción con IA'
                      )}
                    </Button>
                  </div>
                  <Textarea
                    value={description}
                    onChange={(e) =>
                      setDescription(e.target.value.slice(0, 750))
                    }
                    placeholder='Descripción del negocio para Google...'
                    rows={4}
                  />
                </div>
                {/* F-084 R-01/R-02/R-03 — short_description editable + persistido */}
                <div className='space-y-2 sm:col-span-2'>
                  <Label>
                    Descripción corta{' '}
                    <span className='text-muted-foreground text-xs'>
                      ({shortDescription.length}/{SHORT_DESCRIPTION_MAX})
                    </span>
                  </Label>
                  <Textarea
                    value={shortDescription}
                    onChange={(e) =>
                      setShortDescription(
                        e.target.value.slice(0, SHORT_DESCRIPTION_MAX)
                      )
                    }
                    placeholder='Resumen corto del negocio (una o dos frases)...'
                    rows={2}
                  />
                </div>
                {/* F-068 CL-036 — service_area jsonb {notes, cities} as two inputs */}
                <div className='space-y-2 sm:col-span-2'>
                  <Label>Área de servicio — nota</Label>
                  <Input
                    value={serviceAreaNotes}
                    onChange={(e) => setServiceAreaNotes(e.target.value)}
                    placeholder='Costa Central, CA'
                  />
                </div>
                <div className='space-y-2 sm:col-span-2'>
                  <Label>
                    Área de servicio — ciudades (separadas por coma)
                  </Label>
                  <Input
                    value={serviceAreaCities}
                    onChange={(e) => setServiceAreaCities(e.target.value)}
                    placeholder='Santa Maria, Lompoc, Orcutt, Guadalupe'
                  />
                </div>
              </CardContent>
            </Card>

            {/* Hours */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Horario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {DAYS.map((day, i) => (
                    <div key={day} className='flex items-center gap-3'>
                      <span className='w-24 text-sm font-medium'>{day}</span>
                      <Input
                        className='h-8 flex-1 text-sm'
                        value={hours[DAYS_EN[i]] || ''}
                        onChange={(e) =>
                          setHours((prev) => ({
                            ...prev,
                            [DAYS_EN[i]]: e.target.value
                          }))
                        }
                        placeholder='8:00 AM - 6:00 PM (o "Cerrado")'
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Attributes */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  Atributos del negocio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='grid gap-3 sm:grid-cols-2'>
                  {GBP_ATTRIBUTES.map((attr) => (
                    <div key={attr.id} className='flex items-center gap-2'>
                      <Checkbox
                        id={`attr_${attr.id}`}
                        checked={attributes.includes(attr.id)}
                        onCheckedChange={() => toggleAttribute(attr.id)}
                      />
                      <Label
                        htmlFor={`attr_${attr.id}`}
                        className='cursor-pointer text-sm font-normal'
                      >
                        {attr.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Perfil GBP'}
            </Button>
          </TabsContent>

          {/* Posts Tab */}
          <TabsContent value='posts' className='mt-4 max-w-3xl space-y-4'>
            {/* Create Post */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Nueva publicación</CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {/* AI Post Generator */}
                <div className='flex gap-2'>
                  <Input
                    value={postTopic}
                    onChange={(e) => setPostTopic(e.target.value)}
                    placeholder='Tema del post (ej: promo verano, trabajo completado...)'
                    className='h-8 flex-1 text-sm'
                  />
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={handleGeneratePost}
                    disabled={generatingPost}
                    className='h-8 text-xs whitespace-nowrap'
                  >
                    {generatingPost ? (
                      <>
                        <Icons.spinner className='mr-1 h-3 w-3 animate-spin' />
                        Generando...
                      </>
                    ) : (
                      '✨ Generar post'
                    )}
                  </Button>
                </div>
                <Textarea
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                  placeholder='Escribe el contenido de la publicación de Google...'
                  rows={4}
                />
                <div className='flex items-center gap-3'>
                  <div className='space-y-1'>
                    <Label className='text-xs'>CTA</Label>
                    <Select value={newPostCta} onValueChange={setNewPostCta}>
                      <SelectTrigger className='h-8 w-40 text-sm'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='call'>Llamar</SelectItem>
                        <SelectItem value='book'>Reservar</SelectItem>
                        <SelectItem value='learn_more'>Más info</SelectItem>
                        <SelectItem value='order'>Pedir</SelectItem>
                        <SelectItem value='shop'>Comprar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handleCreatePost}
                    disabled={savingPost || !newPostContent.trim()}
                    className='mt-4'
                  >
                    {savingPost ? 'Creando...' : 'Crear Post'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Posts List */}
            {posts.length === 0 ? (
              <div className='py-8 text-center'>
                <p className='text-muted-foreground'>
                  No hay publicaciones todavía
                </p>
              </div>
            ) : (
              <div className='space-y-3'>
                {posts.map((post) => (
                  <Card key={post.id}>
                    <CardContent className='pt-4'>
                      <div className='flex items-start justify-between gap-3'>
                        <p className='flex-1 text-sm'>{post.content}</p>
                        <div className='flex flex-col items-end gap-1'>
                          <Badge
                            variant={
                              post.status === 'published'
                                ? 'default'
                                : post.status === 'approved'
                                  ? 'secondary'
                                  : 'outline'
                            }
                            className='text-xs'
                          >
                            {post.status === 'published'
                              ? 'Publicado'
                              : post.status === 'approved'
                                ? 'Aprobado'
                                : 'Borrador'}
                          </Badge>
                          <span className='text-muted-foreground text-xs'>
                            CTA: {post.cta_type}
                          </span>
                        </div>
                      </div>
                      <p className='text-muted-foreground mt-2 text-xs'>
                        {new Date(post.created_at).toLocaleDateString('es-MX')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
