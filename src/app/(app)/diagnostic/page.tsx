'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageContainer from '@/components/layout/page-container';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
// F-121 R-14/DT-05 — la tabla industria→etiqueta se declara UNA sola vez
// (`src/lib/clients/industry-label.ts`). Esta era la copia 2 de 2.
import { INDUSTRIES } from '@/lib/clients/industry-label';
// F-122 R-09/R-10/R-11/R-13 (Slice A) — «Otro» deja de ser un sumidero: exige el rubro
// libre y lo resuelve a `industry` ANTES del insert con spread (H-6).
import {
  validateFreeIndustry,
  resolveIndustryForPersist
} from '@/lib/clients/industry-input';
// F-122 R-28/R-33 (Slice C) — el marcador no es un dato de captura.
import {
  isCapturePlaceholder,
  stripPlaceholdersFromCapture
} from '@/lib/clients/capture-guard';
// F-122 R-21/R-22/R-23 (Slice B) — la ciudad se elige del catálogo, en las DOS
// superficies: el `<input>` libre del alta era la puerta que aceptaba cualquier string.
import { CitySelect } from '@/components/clients/CitySelect';
import {
  canonicalizeCity,
  fetchLocations,
  type LocationRef
} from '@/lib/clients/locations';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

// Tier calculation
// Tier calculation — rule: if client lacks digital presence → ALWAYS Presencia Digital first,
// regardless of revenue. Monthly plans only if presence is already established.
function needsPresenciaDigital(
  googlePresence: string,
  digitalHealth: string
): boolean {
  const noGbp = googlePresence === 'no_gbp';
  const nothingDigital = digitalHealth === 'nothing';
  const lostAccess = digitalHealth === 'lost_access';
  const inconsistent = digitalHealth === 'inconsistent';
  return noGbp || nothingDigital || lostAccess || inconsistent;
}

const PRESENCIA_DIGITAL = {
  tier: 'presencia_digital',
  price: 3300,
  priceInstallment: 1100, // 3 x $1,100
  priceDiscount: 2970, // $3,300 - 10%
  planName: 'Presencia Digital — 90 días',
  billing: '3 pagos de $1,100 · o pago único $3,135',
  features: [
    'Google Business Profile creado y optimizado',
    'Fotos profesionales (sesión básica)',
    'NAP consistente en directorios principales',
    'Setup inicial completo',
    'Entrega en 7-10 días hábiles',
    'Opción de continuar con plan mensual al terminar'
  ],
  scripts: [
    '"¿Prefieres arrancar con los 3 pagos de $1,100 o aprovechar el 10% de descuento con pago único de $2,970?"',
    '"Son menos de $37 al día por 90 días. Y todo queda tuyo para siempre."',
    '"Si consigues un solo trabajo extra al mes gracias a Google, recuperas la inversión en semanas."'
  ]
};

function calculateTier(
  revenueRange: string,
  googlePresence: string,
  digitalHealth: string
): {
  tier: string;
  price: number;
  planName: string;
  billing: string;
  features: string[];
  scripts: string[];
  priceInstallment?: number;
  priceDiscount?: number;
} {
  // Rule #1: No digital presence → always Presencia Digital first
  if (needsPresenciaDigital(googlePresence, digitalHealth)) {
    return PRESENCIA_DIGITAL;
  }

  // Rule #2: Has GBP but not ranking, or ranking but no calls →
  // offer monthly plan based on revenue, but note setup may still be needed
  const needsSetup = googlePresence === 'has_gbp_not_ranking';

  switch (revenueRange) {
    case 'less_10k':
      // Low revenue + some presence → Presencia Digital is still the right entry
      return {
        ...PRESENCIA_DIGITAL,
        scripts: [
          '"Con el presupuesto que manejas ahora, lo más inteligente es hacer el setup correcto primero. $3,300 una sola vez y tienes tu base lista."',
          '"Una vez que tu GBP esté generando llamadas, activamos el plan mensual. Pero primero asegurémonos de que tienes algo que mantener."',
          '"Muchos negocios en tu etapa cometen el error de pagar mensual sin tener la base. Nosotros lo hacemos al revés: base sólida primero."'
        ]
      };

    case '10k_25k':
      return {
        tier: 'cimientos',
        price: 399,
        planName: 'Cimientos — $399/mes',
        billing: 'mensual',
        features: [
          'GBP management mensual',
          'Publicaciones semanales en Google',
          'Respuesta a reseñas',
          'Monitoreo de rankings',
          'Reporte mensual de resultados',
          needsSetup
            ? 'Setup/corrección de GBP incluido (primer mes)'
            : 'Optimización continua'
        ].filter(Boolean),
        scripts: [
          '"Con $399 al mes, tendrás a alguien trabajando tu Google todos los días. ¿Cuánto vale para ti aparecer primero en tu zona?"',
          '"Tu negocio ya genera entre $10K y $25K al mes — estás listo para crecer. Este plan te da la infraestructura digital que necesitas."',
          '"Son $13 al día. Menos de lo que gastas en gasolina. Y tu competencia ya lo está haciendo."'
        ]
      };

    case '25k_60k':
      return {
        tier: 'expansion',
        price: 599,
        planName: 'Expansión Total — $599/mes',
        billing: 'mensual',
        features: [
          'Todo lo de Cimientos',
          'Gestión de reseñas proactiva',
          'Optimización de categorías GBP',
          'Análisis de competidores mensual',
          'Estrategia de expansión de zona',
          'Soporte prioritario'
        ],
        scripts: [
          '"Con más de $25K al mes, ya eres un jugador serio. La pregunta es: ¿quieres ser el #1 en tu zona o seguir peleando por el #3?"',
          '"Este plan está diseñado para negocios como el tuyo que ya tienen demanda y necesitan sistematizar su crecimiento digital."',
          '"$599 al mes para un negocio que factura $25K+ es menos del 2.4% de tu ingreso. Con los resultados que generamos, se paga solo."'
        ]
      };

    case 'more_60k':
      return {
        tier: 'dominio',
        price: 899,
        planName: 'Dominio Estratégico — desde $899/mes',
        billing: 'mensual',
        features: [
          'Estrategia digital completa',
          'Multi-location management',
          'Integración con CRM/GHL',
          'Contenido premium mensual',
          'BrightLocal full suite',
          'Consultor dedicado',
          'Reportes ejecutivos'
        ],
        scripts: [
          '"Más de $60K al mes significa que ya tienes un negocio real. El siguiente nivel es la dominancia total de tu mercado local."',
          '"Con este plan, no solo gestionamos tu Google — construimos tu marca digital completa en toda tu zona de servicio."',
          '"Los líderes del mercado invierten en su presencia digital. ¿Quieres seguir siendo líder o dejarle el espacio a tu competencia?"'
        ]
      };

    default:
      return PRESENCIA_DIGITAL;
  }
}

const DISC_PROFILES = [
  { value: 'D', label: 'D — Dominante' },
  { value: 'I', label: 'I — Influyente' },
  { value: 'S', label: 'S — Estable' },
  { value: 'C', label: 'C — Concienzudo' }
];

type ExistingClient = {
  id: string;
  business_name: string;
};

export default function DiagnosticPage() {
  const searchParams = useSearchParams();
  const preselectedClientId = searchParams.get('clientId');
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [existingClients, setExistingClients] = useState<ExistingClient[]>([]);
  const [clientMode, setClientMode] = useState<'existing' | 'new'>(
    preselectedClientId ? 'existing' : 'new'
  );
  const [saving, setSaving] = useState(false);

  // Step 1 - Client info
  const [selectedClientId, setSelectedClientId] = useState(
    preselectedClientId || ''
  );
  const [newClientData, setNewClientData] = useState({
    business_name: '',
    industry: '',
    contact_first_name: '',
    phone: '',
    email: '',
    // F-084 R-06 — city/state capturados en el alta y persistidos a `clients`
    // (home canónico, DT-1). Antes: nunca capturados → quedaban NULL.
    city: '',
    state: 'CA',
    disc_profile: '',
    notes: ''
  });
  // ⭐ F-122 H-6 — el rubro libre vive FUERA de `newClientData` a propósito: el insert
  // hace `{...newClientData}` con spread, así que una clave nueva del estado local
  // entraría a `clients` automáticamente. Se resuelve a `industry` antes del write.
  const [industryOther, setIndustryOther] = useState('');
  // F-122 R-21/R-22 — catálogo de ciudades, desde la declaración única compartida.
  const [locations, setLocations] = useState<LocationRef[]>([]);

  // Step 2 - Digital presence
  const [googlePresence, setGooglePresence] = useState('');
  const [licenseStatus, setLicenseStatus] = useState('');
  const [digitalHealth, setDigitalHealth] = useState('');

  // Step 3 - Business profile
  const [revenueRange, setRevenueRange] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [expectation, setExpectation] = useState('');
  const [clientManagement, setClientManagement] = useState('');

  // Step 4 - Result
  const [savedDiagnosticId, setSavedDiagnosticId] = useState('');
  const [savedClientId, setSavedClientId] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [generatingPreview, setGeneratingPreview] = useState(false);

  useEffect(() => {
    if (!tenantId || userLoading) return;

    supabase
      .from('clients')
      .select('id, business_name')
      .eq('tenant_id', tenantId)
      .order('business_name')
      .then(({ data, error }) => {
        if (error) {
          console.error('Error loading clients for diagnostic:', error);
          return;
        }
        if (!data || data.length === 0) {
          console.warn('Diagnostic clients query returned empty set', {
            tenantId
          });
          setExistingClients([]);
          return;
        }
        setExistingClients(data);
      });
  }, [tenantId, userLoading, supabase]);

  // F-122 R-21/R-22 — el catálogo de ciudades sale de la MISMA declaración que consume
  // el Brief (`src/lib/clients/locations.ts`): misma tabla, mismos filtros, mismo orden,
  // misma forma de opción. Dos consultas equivalentes-pero-separadas reproducirían la
  // clase de fallo que DT-05 de F-121 eliminó, en otro dato.
  useEffect(() => {
    let vivo = true;
    fetchLocations(supabase)
      .then((rows) => {
        if (vivo) setLocations(rows);
      })
      .catch((e) => console.error('Error loading city catalog:', e));
    return () => {
      vivo = false;
    };
  }, [supabase]);

  // Calculate tier using all signals: revenue + google presence + digital health
  const tierResult =
    revenueRange && googlePresence && digitalHealth
      ? calculateTier(revenueRange, googlePresence, digitalHealth)
      : revenueRange
        ? calculateTier(revenueRange, googlePresence || '', digitalHealth || '')
        : null;

  const handleSaveDiagnostic = async () => {
    setSaving(true);

    try {
      // Get fresh auth user to ensure created_by is correct
      const {
        data: { user: authUser },
        error: authError
      } = await supabase.auth.getUser();
      if (authError || !authUser) throw new Error('Usuario no autenticado');

      let resolvedTenantId = tenantId;
      if (!resolvedTenantId) {
        const { data: profileRow } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', authUser.id)
          .maybeSingle();

        resolvedTenantId = (profileRow?.tenant_id as string | null) || null;
      }

      if (!resolvedTenantId) {
        const { data: tenantRow } = await supabase
          .from('tenants')
          .select('id')
          .limit(1)
          .maybeSingle();
        resolvedTenantId = (tenantRow?.id as string | null) || null;
      }

      if (!resolvedTenantId) {
        throw new Error(
          'No hay organización asociada. Completa tu perfil de usuario.'
        );
      }

      let clientId = selectedClientId;

      // Create client if new
      if (clientMode === 'new') {
        // ⭐ F-122 H-6/R-07/R-11 — el rubro se resuelve a `industry` ANTES del insert:
        // el spread llevaría cualquier clave nueva del estado local a la tabla, y `other`
        // NUNCA se persiste (R-07). Si no hay valor resoluble, el guardado no procede
        // (R-10) — `canProceed()` ya lo impide, esto es el cierre del write-path.
        const resolvedIndustry = resolveIndustryForPersist(
          newClientData.industry,
          industryOther
        );
        if (!resolvedIndustry) {
          throw new Error(
            'Elegí una industria — con «Otro», escribí el rubro del negocio.'
          );
        }
        // ⭐ F-122 R-47 (ENMIENDA 2026-07-28) — la ciudad ESCRITA que coincide con el
        // catálogo se persiste en su FORMA CANÓNICA (`santa maria` ⇒ `Santa Maria`). La
        // colisión se cierra en el seam (`canonicalizeCity`), no en el componente. Una
        // ciudad genuinamente ausente se persiste VERBATIM (trim) y **no** se da de alta
        // en `locations_reference` (R-48).
        // F-122 R-28/R-34 — el patch de captura pasa por el guard: el marcador no puede
        // llegar a `clients` por ningún write-path. Se bloquea el VALOR, no al OPERADOR.
        const { patch: newClientDataSafe, blocked } =
          stripPlaceholdersFromCapture({
            ...newClientData,
            city: canonicalizeCity(newClientData.city, locations),
            industry: resolvedIndustry
          });
        if (blocked.length > 0) {
          toast.warning(
            `No se guardó en el cliente: ${blocked.join(', ')} (marcador de pendiente)`
          );
        }
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            ...newClientDataSafe,
            tenant_id: resolvedTenantId,
            status: 'lead'
          })
          .select()
          .single();

        if (clientError) {
          console.error('Client insert error:', JSON.stringify(clientError));
          throw new Error(`Error creando cliente: ${clientError.message}`);
        }
        clientId = newClient.id;

        await logActivity({
          tenantId: resolvedTenantId,
          userId: authUser.id,
          action: 'client_created',
          entityType: 'client',
          entityId: clientId,
          clientId,
          metadata: { business_name: newClientData.business_name }
        });
      }

      if (!clientId) throw new Error('Selecciona o crea un cliente primero');

      const tier = tierResult?.tier || 'presencia_digital';

      // Save diagnostic — NOTE: diagnostics table has no tenant_id column
      const diagnosticData: Record<string, unknown> = {
        client_id: clientId,
        created_by: authUser.id,
        google_presence: googlePresence,
        license_status: licenseStatus,
        digital_health: digitalHealth,
        revenue_range: revenueRange,
        team_size: teamSize,
        expectation,
        client_management: clientManagement,
        recommended_tier: tier,
        recommended_price: tierResult?.price
      };

      console.log('Inserting diagnostic:', JSON.stringify(diagnosticData));

      const { data: diagnostic, error: diagError } = await supabase
        .from('diagnostics')
        .insert(diagnosticData)
        .select()
        .single();

      if (diagError) {
        console.error('Diagnostic insert error:', JSON.stringify(diagError));
        throw new Error(`${diagError.message} (code: ${diagError.code})`);
      }

      // Update client status and tier
      await supabase
        .from('clients')
        .update({ status: 'diagnosed', tier })
        .eq('id', clientId)
        .eq('tenant_id', resolvedTenantId);

      await logActivity({
        tenantId: resolvedTenantId,
        userId: authUser.id,
        action: 'diagnostic_completed',
        entityType: 'diagnostic',
        entityId: diagnostic.id,
        clientId,
        metadata: { tier, price: tierResult?.price }
      });

      setSavedDiagnosticId(diagnostic.id);
      setSavedClientId(clientId);
      toast.success('Diagnóstico guardado correctamente');
    } catch (error) {
      console.error('Error saving diagnostic:', error);
      const msg =
        error instanceof Error
          ? error.message
          : 'Error al guardar el diagnóstico';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedClientId('');
    setNewClientData({
      business_name: '',
      industry: '',
      contact_first_name: '',
      phone: '',
      email: '',
      city: '',
      state: 'CA',
      disc_profile: '',
      notes: ''
    });
    setIndustryOther('');
    setGooglePresence('');
    setLicenseStatus('');
    setDigitalHealth('');
    setRevenueRange('');
    setTeamSize('');
    setExpectation('');
    setClientManagement('');
    setSavedDiagnosticId('');
    setSavedClientId('');
    setPreviewUrl('');
    setClientMode('new');
  };

  const handleGeneratePreview = async () => {
    if (!savedClientId || !savedDiagnosticId) return;
    setGeneratingPreview(true);
    try {
      const {
        data: { user: authUser }
      } = await supabase.auth.getUser();
      if (!authUser) throw new Error('No autenticado');

      // Generate unique token
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      // Build preview metadata from current tier result
      const previewMeta = {
        diagnostic_id: savedDiagnosticId,
        tier: tierResult?.tier,
        plan_name: tierResult?.planName,
        price: tierResult?.price,
        price_installment: tierResult?.priceInstallment,
        price_discount: tierResult?.priceDiscount,
        billing: tierResult?.billing,
        features: tierResult?.features,
        scripts: tierResult?.scripts,
        google_presence: googlePresence,
        digital_health: digitalHealth,
        revenue_range: revenueRange
      };

      const { error } = await supabase.from('previews').insert({
        client_id: savedClientId,
        token,
        type: 'combined',
        expires_at: expiresAt.toISOString(),
        // F-091 R-02/R-06 — `metadata` NO es columna de `previews` (42703) y `data` (jsonb)
        // es NOT NULL. Reubicamos previewMeta dentro de `data.metadata` (home correcto,
        // sin DDL); el view lee la tarjeta de plan desde `preview.data?.metadata`.
        data: {
          kind: 'combined',
          source: 'diagnostic',
          client_id: savedClientId,
          generated_at: new Date().toISOString(),
          metadata: previewMeta
        },
        created_by: authUser.id
      });

      if (error) throw new Error(error.message);

      const url = `${window.location.origin}/preview/${token}`;
      setPreviewUrl(url);
      toast.success('Preview generado — link listo para compartir');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Error generando preview'
      );
    } finally {
      setGeneratingPreview(false);
    }
  };

  /**
   * ⭐⭐⭐ F-122 R-33 **ENDURECIDO POR LA ENMIENDA 2026-07-28** — ninguna columna de
   * captura acepta el marcador **tecleado**, **`city` INCLUIDA**.
   *
   * ⚠️ **Por qué esto NO se enumera a mano (R-40).** La versión anterior listaba 7
   * campos —`business_name`, `state`, `contact_first_name`, `phone`, `email`, `notes`,
   * `industryOther`— y **`city` no estaba**, porque bajo el spec original R-21 la había
   * cerrado a un `<select>`. R-21 enmendado la **reabre** como entrada libre ⇒ la
   * enumeración se volvió un **agujero**. Enumerar a mano es exactamente cómo se perdió.
   *
   * Ahora el conjunto **se DERIVA**: `stripPlaceholdersFromCapture` recorre las claves
   * del estado y bloquea las que son columnas de captura (`CAPTURE_COLUMNS`). Un campo
   * de captura nuevo en `newClientData` queda cubierto **por construcción**, sin que
   * nadie tenga que acordarse de agregarlo acá.
   *
   * `industryOther` va aparte porque **vive fuera del estado a propósito** (H-6): se
   * resuelve a `industry` antes del write. Es entrada libre y R-33 lo alcanza igual —
   * abrir una puerta mientras se cierra otra sería el defecto de F-122 sobre sí misma.
   *
   * **Nota de capas (no se fusionan):** el guard de write-path (R-28/R-32) bloquearía el
   * valor igual, **pero en silencio para quien lo tecleó**. R-33 es la capa que se lo
   * dice en el formulario. Defensa en profundidad, propósitos distintos.
   */
  const capturaConMarcador = (): boolean =>
    stripPlaceholdersFromCapture(newClientData).blocked.length > 0 ||
    isCapturePlaceholder(industryOther);

  const canProceed = () => {
    if (step === 1) {
      if (clientMode === 'existing') return !!selectedClientId;
      // F-122 R-10 — con «Otro», el rubro libre es OBLIGATORIO y válido. Sin esto,
      // R-09 es un campo opcional que nadie llena y Clara V vuelve a pasar.
      return (
        !!newClientData.business_name &&
        !!newClientData.industry &&
        resolveIndustryForPersist(newClientData.industry, industryOther) !==
          null &&
        !capturaConMarcador()
      );
    }
    if (step === 2)
      return !!googlePresence && !!licenseStatus && !!digitalHealth;
    if (step === 3)
      return (
        !!revenueRange && !!teamSize && !!expectation && !!clientManagement
      );
    return true;
  };

  return (
    <PageContainer
      pageTitle='Diagnóstico'
      pageDescription='Herramienta de diagnóstico para llamadas de ventas'
    >
      <div className='flex max-w-3xl flex-1 flex-col gap-4 p-4 md:px-6'>
        {/* Progress */}
        <div className='flex items-center gap-2'>
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className='flex items-center gap-2'>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  s === step
                    ? 'bg-primary text-primary-foreground'
                    : s < step
                      ? 'bg-primary/30 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {s < step ? '✓' : s}
              </div>
              {s < 4 && (
                <div
                  className={`h-px w-12 ${s < step ? 'bg-primary' : 'bg-border'}`}
                />
              )}
            </div>
          ))}
          <span className='text-muted-foreground ml-2 text-sm'>
            {step === 1
              ? 'Info del Negocio'
              : step === 2
                ? 'Presencia Digital'
                : step === 3
                  ? 'Perfil del Negocio'
                  : 'Resultado'}
          </span>
        </div>

        {/* Step 1: Client Info */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Paso 1 — Info del Negocio</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='flex gap-2'>
                <Button
                  variant={clientMode === 'existing' ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setClientMode('existing')}
                >
                  Cliente existente
                </Button>
                <Button
                  variant={clientMode === 'new' ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setClientMode('new')}
                >
                  Nuevo cliente
                </Button>
              </div>

              {clientMode === 'existing' ? (
                <div className='space-y-2'>
                  <Label>Seleccionar cliente</Label>
                  <Select
                    value={selectedClientId}
                    onValueChange={setSelectedClientId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Seleccionar cliente...' />
                    </SelectTrigger>
                    <SelectContent>
                      {existingClients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.business_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='space-y-2 sm:col-span-2'>
                    <Label>
                      Nombre del negocio{' '}
                      <span className='text-destructive'>*</span>
                    </Label>
                    <Input
                      value={newClientData.business_name}
                      onChange={(e) =>
                        setNewClientData((p) => ({
                          ...p,
                          business_name: e.target.value
                        }))
                      }
                      placeholder='Anderson Roofing'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>
                      Industria <span className='text-destructive'>*</span>
                    </Label>
                    <Select
                      value={newClientData.industry}
                      onValueChange={(v) =>
                        setNewClientData((p) => ({ ...p, industry: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Seleccionar...' />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRIES.map((i) => (
                          <SelectItem key={i.value} value={i.value}>
                            {i.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {/* F-122 R-09/R-10 — «Otro» EXIGE el rubro real. `other` significa
                        «ninguna categoría aplica» (F-121 R-15) y no se persiste (R-07). */}
                    {newClientData.industry === 'other' && (
                      <div className='space-y-1'>
                        <Label>
                          ¿Cuál es el rubro?{' '}
                          <span className='text-destructive'>*</span>
                        </Label>
                        <Input
                          value={industryOther}
                          onChange={(e) => setIndustryOther(e.target.value)}
                          placeholder='Decoración de interiores'
                        />
                        {industryOther.trim().length > 0 &&
                          !validateFreeIndustry(industryOther).ok && (
                            <p className='text-destructive text-xs'>
                              {validateFreeIndustry(industryOther).reason ===
                              'collision'
                                ? 'Esa categoría ya existe en la lista: elegila arriba.'
                                : 'Escribí el rubro real del negocio.'}
                            </p>
                          )}
                      </div>
                    )}
                  </div>
                  <div className='space-y-2'>
                    <Label>Nombre del dueño</Label>
                    <Input
                      value={newClientData.contact_first_name}
                      onChange={(e) =>
                        setNewClientData((p) => ({
                          ...p,
                          contact_first_name: e.target.value
                        }))
                      }
                      placeholder='Carlos'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>Teléfono</Label>
                    <Input
                      value={newClientData.phone}
                      onChange={(e) =>
                        setNewClientData((p) => ({
                          ...p,
                          phone: e.target.value
                        }))
                      }
                      placeholder='(805) 555-1234'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>Email</Label>
                    <Input
                      type='email'
                      value={newClientData.email}
                      onChange={(e) =>
                        setNewClientData((p) => ({
                          ...p,
                          email: e.target.value
                        }))
                      }
                      placeholder='carlos@example.com'
                    />
                  </div>
                  {/* F-084 R-06 — city/state → persisten a clients (home canónico) */}
                  {/* ⤫ F-122 R-21 — el `<input>` libre de ciudad se reemplaza por el
                      selector COMPARTIDO con el Brief. Agregar ciudades sin unificar no
                      alcanzaba: esta era la puerta que aceptaba cualquier string. */}
                  <div className='space-y-2'>
                    <Label>Ciudad</Label>
                    <CitySelect
                      value={newClientData.city}
                      locations={locations}
                      onChange={(e) =>
                        setNewClientData((p) => ({
                          ...p,
                          city: e.target.value
                        }))
                      }
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>Estado</Label>
                    <Input
                      value={newClientData.state}
                      onChange={(e) =>
                        setNewClientData((p) => ({
                          ...p,
                          state: e.target.value
                        }))
                      }
                      placeholder='CA'
                    />
                  </div>
                  <div className='space-y-2'>
                    <Label>Perfil DISC</Label>
                    <Select
                      value={newClientData.disc_profile}
                      onValueChange={(v) =>
                        setNewClientData((p) => ({ ...p, disc_profile: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder='Seleccionar...' />
                      </SelectTrigger>
                      <SelectContent>
                        {DISC_PROFILES.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-2 sm:col-span-2'>
                    <Label>Notas</Label>
                    <Textarea
                      value={newClientData.notes}
                      onChange={(e) =>
                        setNewClientData((p) => ({
                          ...p,
                          notes: e.target.value
                        }))
                      }
                      placeholder='Notas de la llamada...'
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Digital Presence */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Paso 2 — Presencia Digital</CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <div className='space-y-3'>
                <Label className='text-base font-medium'>
                  ¿Cómo está su Google Business Profile?
                </Label>
                <RadioGroup
                  value={googlePresence}
                  onValueChange={setGooglePresence}
                  className='space-y-2'
                >
                  {[
                    {
                      value: 'no_gbp',
                      label: 'No tengo Google Business Profile'
                    },
                    {
                      value: 'has_gbp_not_ranking',
                      label: 'Tengo pero no aparezco en búsquedas'
                    },
                    {
                      value: 'ranking_no_calls',
                      label: 'Aparezco pero no genera llamadas'
                    },
                    {
                      value: 'generating_leads',
                      label: 'Ya genero leads, quiero dominar mi zona'
                    }
                  ].map((opt) => (
                    <div key={opt.value} className='flex items-center gap-3'>
                      <RadioGroupItem
                        value={opt.value}
                        id={`gp_${opt.value}`}
                      />
                      <Label
                        htmlFor={`gp_${opt.value}`}
                        className='cursor-pointer font-normal'
                      >
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className='space-y-3'>
                <Label className='text-base font-medium'>
                  Estado de licencia
                </Label>
                <RadioGroup
                  value={licenseStatus}
                  onValueChange={setLicenseStatus}
                  className='space-y-2'
                >
                  {[
                    {
                      value: 'new_license',
                      label: 'Licencia nueva (menos de 1 año)'
                    },
                    {
                      value: 'established',
                      label: 'Licencia establecida (1+ años)'
                    },
                    {
                      value: 'recent_change',
                      label: 'Cambio reciente de dirección o nombre'
                    }
                  ].map((opt) => (
                    <div key={opt.value} className='flex items-center gap-3'>
                      <RadioGroupItem
                        value={opt.value}
                        id={`ls_${opt.value}`}
                      />
                      <Label
                        htmlFor={`ls_${opt.value}`}
                        className='cursor-pointer font-normal'
                      >
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className='space-y-3'>
                <Label className='text-base font-medium'>
                  ¿Cómo está su presencia digital en general?
                </Label>
                <RadioGroup
                  value={digitalHealth}
                  onValueChange={setDigitalHealth}
                  className='space-y-2'
                >
                  {[
                    {
                      value: 'nothing',
                      label: 'No tengo nada digital'
                    },
                    {
                      value: 'have_access',
                      label: 'Tengo todo y tengo acceso'
                    },
                    {
                      value: 'lost_access',
                      label: 'Perdí acceso a mis cuentas'
                    },
                    {
                      value: 'inconsistent',
                      label: 'Mi info aparece diferente en varios sitios'
                    }
                  ].map((opt) => (
                    <div key={opt.value} className='flex items-center gap-3'>
                      <RadioGroupItem
                        value={opt.value}
                        id={`dh_${opt.value}`}
                      />
                      <Label
                        htmlFor={`dh_${opt.value}`}
                        className='cursor-pointer font-normal'
                      >
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Business Profile */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Paso 3 — Perfil del Negocio</CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              <div className='space-y-3'>
                <Label className='text-base font-medium'>
                  ¿Cuánto factura su negocio mensualmente?
                </Label>
                <p className='text-muted-foreground text-xs'>
                  (Esto determina el plan recomendado)
                </p>
                <RadioGroup
                  value={revenueRange}
                  onValueChange={setRevenueRange}
                  className='space-y-2'
                >
                  {[
                    {
                      value: 'less_10k',
                      label: 'Menos de $10,000/mes → Fase inicial'
                    },
                    {
                      value: '10k_25k',
                      label: '$10,000 - $25,000/mes → Negocio estable'
                    },
                    {
                      value: '25k_60k',
                      label: '$25,000 - $60,000/mes → En crecimiento'
                    },
                    {
                      value: 'more_60k',
                      label: 'Más de $60,000/mes → Líder local'
                    }
                  ].map((opt) => (
                    <div key={opt.value} className='flex items-center gap-3'>
                      <RadioGroupItem
                        value={opt.value}
                        id={`rv_${opt.value}`}
                      />
                      <Label
                        htmlFor={`rv_${opt.value}`}
                        className='cursor-pointer font-normal'
                      >
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className='space-y-3'>
                <Label className='text-base font-medium'>
                  Tamaño del equipo
                </Label>
                <RadioGroup
                  value={teamSize}
                  onValueChange={setTeamSize}
                  className='space-y-2'
                >
                  {[
                    { value: 'solo', label: 'Solo yo — Solopreneur' },
                    { value: '2_5', label: '2-5 personas — Equipo pequeño' },
                    {
                      value: '6_plus',
                      label: '6+ personas — Equipo establecido'
                    }
                  ].map((opt) => (
                    <div key={opt.value} className='flex items-center gap-3'>
                      <RadioGroupItem
                        value={opt.value}
                        id={`ts_${opt.value}`}
                      />
                      <Label
                        htmlFor={`ts_${opt.value}`}
                        className='cursor-pointer font-normal'
                      >
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className='space-y-3'>
                <Label className='text-base font-medium'>
                  Expectativa del cliente
                </Label>
                <RadioGroup
                  value={expectation}
                  onValueChange={setExpectation}
                  className='space-y-2'
                >
                  {[
                    { value: 'urgent', label: 'Necesito clientes YA' },
                    { value: 'process', label: 'Entiendo que es un proceso' },
                    {
                      value: 'long_term',
                      label: 'Quiero construir algo a largo plazo'
                    },
                    {
                      value: 'unsure',
                      label: 'No estoy seguro de qué necesito'
                    }
                  ].map((opt) => (
                    <div key={opt.value} className='flex items-center gap-3'>
                      <RadioGroupItem
                        value={opt.value}
                        id={`ex_${opt.value}`}
                      />
                      <Label
                        htmlFor={`ex_${opt.value}`}
                        className='cursor-pointer font-normal'
                      >
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className='space-y-3'>
                <Label className='text-base font-medium'>
                  ¿Cómo gestiona sus clientes actualmente?
                </Label>
                <RadioGroup
                  value={clientManagement}
                  onValueChange={setClientManagement}
                  className='space-y-2'
                >
                  {[
                    { value: 'paper', label: 'Papel / libreta / nada' },
                    {
                      value: 'apps',
                      label: 'Apps sueltas (Excel, WhatsApp, etc.)'
                    },
                    { value: 'crm', label: 'Ya uso un CRM' }
                  ].map((opt) => (
                    <div key={opt.value} className='flex items-center gap-3'>
                      <RadioGroupItem
                        value={opt.value}
                        id={`cm_${opt.value}`}
                      />
                      <Label
                        htmlFor={`cm_${opt.value}`}
                        className='cursor-pointer font-normal'
                      >
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Result */}
        {step === 4 && tierResult && (
          <div className='space-y-4'>
            {/* Recommended Plan */}
            <Card className='border-primary'>
              <CardHeader className='bg-primary/10 rounded-t-lg'>
                <p className='text-muted-foreground text-sm font-medium'>
                  Plan Recomendado
                </p>
                <CardTitle className='text-primary text-xl'>
                  {tierResult.planName}
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4 pt-4'>
                {/* Dual pricing for Presencia Digital */}
                {tierResult.tier === 'presencia_digital' &&
                'priceInstallment' in tierResult ? (
                  <div className='grid grid-cols-2 gap-3'>
                    {/* Option A — highlighted (decoy target) */}
                    <div className='border-primary bg-primary/5 flex flex-col gap-1 rounded-xl border-2 p-4 text-center'>
                      <p className='text-primary text-xs font-semibold tracking-wide uppercase'>
                        Opción A
                      </p>
                      <p className='text-primary text-2xl font-bold'>
                        3 × $1,100
                      </p>
                      <p className='text-muted-foreground text-xs'>
                        pagos mensuales
                      </p>
                      <p className='mt-1 text-sm font-medium'>Total $3,300</p>
                    </div>
                    {/* Option B — discount */}
                    <div className='border-muted bg-muted/30 relative flex flex-col gap-1 rounded-xl border p-4 text-center'>
                      <span className='absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-bold text-white'>
                        10% descuento
                      </span>
                      <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                        Opción B
                      </p>
                      <p className='text-2xl font-bold'>$3,135</p>
                      <p className='text-muted-foreground text-xs'>
                        pago único
                      </p>
                      <p className='mt-1 text-sm font-medium text-green-600'>
                        Ahorras $330
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className='py-2 text-center'>
                    <p className='text-primary text-3xl font-bold'>
                      ${tierResult.price.toLocaleString()}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {tierResult.billing}
                    </p>
                  </div>
                )}

                <div>
                  <p className='mb-2 text-sm font-medium'>¿Qué incluye?</p>
                  <ul className='space-y-1'>
                    {tierResult.features.map((f, i) => (
                      <li key={i} className='flex items-center gap-2 text-sm'>
                        <span className='text-primary'>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Closing Scripts */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>
                  Scripts de Cierre 🎯
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                {tierResult.scripts.map((script, i) => (
                  <div
                    key={i}
                    className='bg-muted text-muted-foreground rounded-lg p-3 text-sm italic'
                  >
                    {script}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Acciones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='flex flex-wrap gap-2'>
                  {!savedDiagnosticId ? (
                    <Button onClick={handleSaveDiagnostic} disabled={saving}>
                      {saving ? 'Guardando...' : '✅ Guardar Lead'}
                    </Button>
                  ) : (
                    <Badge variant='default' className='px-3 py-2 text-sm'>
                      ✓ Guardado
                    </Badge>
                  )}
                  <Button variant='outline' disabled>
                    📧 Enviar Resumen (próximamente)
                  </Button>
                  {!previewUrl ? (
                    <Button
                      variant='outline'
                      onClick={handleGeneratePreview}
                      disabled={generatingPreview}
                    >
                      {generatingPreview
                        ? '⏳ Generando...'
                        : '🔗 Generar Preview'}
                    </Button>
                  ) : (
                    <div className='flex w-full flex-col gap-2'>
                      <div className='flex gap-2'>
                        <Button
                          variant='default'
                          className='flex-1'
                          onClick={() => window.open(previewUrl, '_blank')}
                        >
                          👁️ Ver Preview
                        </Button>
                        <Button
                          variant='outline'
                          onClick={() => {
                            navigator.clipboard.writeText(previewUrl);
                            toast.success('Link copiado');
                          }}
                        >
                          📋 Copiar
                        </Button>
                        <Button
                          variant='outline'
                          className='border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                          onClick={() =>
                            window.open(
                              `https://wa.me/?text=${encodeURIComponent('Hola, aquí está tu preview personalizado: ' + previewUrl)}`,
                              '_blank'
                            )
                          }
                        >
                          WhatsApp
                        </Button>
                      </div>
                      <p className='text-muted-foreground truncate text-xs'>
                        {previewUrl}
                      </p>
                    </div>
                  )}
                  <Button variant='outline' disabled>
                    💳 Enviar Pago (próximamente)
                  </Button>
                  <Button variant='outline' disabled>
                    📄 Enviar Contrato (próximamente)
                  </Button>
                  <Button variant='ghost' onClick={resetWizard}>
                    🔄 Nuevo Diagnóstico
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className='flex justify-between'>
          <Button
            variant='outline'
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            Anterior
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
            >
              Siguiente
            </Button>
          ) : null}
        </div>
      </div>
    </PageContainer>
  );
}
