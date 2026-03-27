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
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

// Tier calculation
function calculateTier(revenueRange: string): {
  tier: string;
  price: number;
  planName: string;
  billing: string;
  features: string[];
  scripts: string[];
} {
  switch (revenueRange) {
    case 'less_10k':
      return {
        tier: 'presencia_digital',
        price: 3300,
        planName: 'Presencia Digital — INICIAL',
        billing: 'pago único',
        features: [
          'Google Business Profile optimizado',
          'Fotos profesionales (básico)',
          'NAP consistente en directorios principales',
          'Setup inicial completo',
          'Entrega en 7-10 días hábiles'
        ],
        scripts: [
          '"Carlos, con $3,300 de inversión única, te ponemos en el mapa de Google completamente. Es la base que necesitas para que tus clientes te encuentren."',
          '"Este paquete es perfecto para donde estás ahora: construir tu presencia digital desde cero, sin compromisos mensuales."',
          '"Piénsalo así: si consigues un solo cliente extra al mes gracias a Google, recuperas la inversión en semanas."'
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
          'Reporte mensual de resultados'
        ],
        scripts: [
          '"Con $399 al mes, tendrás a alguien trabajando tu Google todos los días. ¿Cuánto vale para ti aparecer primero en tu zona?"',
          '"Tu negocio ya está generando entre $10K y $25K al mes — estás listo para crecer. Este plan te da la infraestructura digital que necesitas."',
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
      return {
        tier: 'presencia_digital',
        price: 3300,
        planName: 'Presencia Digital — INICIAL',
        billing: 'pago único',
        features: [],
        scripts: []
      };
  }
}

const INDUSTRIES = [
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'plumbing', label: 'Plomería' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'painting', label: 'Pintura' },
  { value: 'cleaning', label: 'Limpieza' },
  { value: 'fencing', label: 'Cercas' },
  { value: 'electrical', label: 'Electricidad' },
  { value: 'general_contractor', label: 'Contratista General' },
  { value: 'other', label: 'Otro' }
];

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
    disc_profile: '',
    notes: ''
  });

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

  useEffect(() => {
    if (!userLoading && tenantId) {
      supabase
        .from('clients')
        .select('id, business_name')
        .eq('tenant_id', tenantId)
        .order('business_name')
        .then(({ data }) => {
          if (data) setExistingClients(data);
        });
    }
  }, [tenantId, userLoading]);

  const tierResult = revenueRange ? calculateTier(revenueRange) : null;

  const handleSaveDiagnostic = async () => {
    if (!tenantId || !user) return;
    setSaving(true);

    try {
      let clientId = selectedClientId;

      // Create client if new
      if (clientMode === 'new') {
        const { data: newClient, error: clientError } = await supabase
          .from('clients')
          .insert({
            ...newClientData,
            tenant_id: tenantId,
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
          tenantId,
          userId: user.id,
          action: 'client_created',
          entityType: 'client',
          entityId: clientId,
          clientId,
          metadata: { business_name: newClientData.business_name }
        });
      }

      if (!clientId) throw new Error('No client selected');

      const tier = tierResult?.tier || 'presencia_digital';

      // Save diagnostic
      const diagnosticData: Record<string, unknown> = {
        tenant_id: tenantId,
        client_id: clientId,
        created_by: user.id,
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

      const { data: diagnostic, error: diagError } = await supabase
        .from('diagnostics')
        .insert(diagnosticData)
        .select()
        .single();

      if (diagError) {
        console.error('Diagnostic insert error:', JSON.stringify(diagError));
        throw new Error(`Error guardando diagnóstico: ${diagError.message} (code: ${diagError.code})`);
      }

      // Update client status and tier
      await supabase
        .from('clients')
        .update({ status: 'diagnosed', tier })
        .eq('id', clientId)
        .eq('tenant_id', tenantId);

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'diagnostic_completed',
        entityType: 'diagnostic',
        entityId: diagnostic.id,
        clientId,
        metadata: { tier, price: tierResult?.price }
      });

      setSavedDiagnosticId(diagnostic.id);
      toast.success('Diagnóstico guardado correctamente');
    } catch (error) {
      console.error('Error saving diagnostic:', error);
      const msg = error instanceof Error ? error.message : 'Error al guardar el diagnóstico';
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
      disc_profile: '',
      notes: ''
    });
    setGooglePresence('');
    setLicenseStatus('');
    setDigitalHealth('');
    setRevenueRange('');
    setTeamSize('');
    setExpectation('');
    setClientManagement('');
    setSavedDiagnosticId('');
    setClientMode('new');
  };

  const canProceed = () => {
    if (step === 1) {
      if (clientMode === 'existing') return !!selectedClientId;
      return !!newClientData.business_name && !!newClientData.industry;
    }
    if (step === 2) return !!googlePresence && !!licenseStatus && !!digitalHealth;
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
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6 max-w-3xl'>
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
          <span className='ml-2 text-sm text-muted-foreground'>
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
                      <RadioGroupItem value={opt.value} id={`gp_${opt.value}`} />
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
                <p className='text-xs text-muted-foreground'>
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
                <Label className='text-base font-medium'>Tamaño del equipo</Label>
                <RadioGroup
                  value={teamSize}
                  onValueChange={setTeamSize}
                  className='space-y-2'
                >
                  {[
                    { value: 'solo', label: 'Solo yo — Solopreneur' },
                    { value: '2_5', label: '2-5 personas — Equipo pequeño' },
                    { value: '6_plus', label: '6+ personas — Equipo establecido' }
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
                <Label className='text-base font-medium'>Expectativa del cliente</Label>
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
                    { value: 'unsure', label: 'No estoy seguro de qué necesito' }
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
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-muted-foreground'>
                      Plan Recomendado
                    </p>
                    <CardTitle className='text-xl text-primary'>
                      {tierResult.planName}
                    </CardTitle>
                  </div>
                  <div className='text-right'>
                    <p className='text-3xl font-bold text-primary'>
                      ${tierResult.price.toLocaleString()}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {tierResult.billing}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='pt-4'>
                <p className='text-sm font-medium mb-2'>¿Qué incluye?</p>
                <ul className='space-y-1'>
                  {tierResult.features.map((f, i) => (
                    <li key={i} className='flex items-center gap-2 text-sm'>
                      <span className='text-primary'>✓</span> {f}
                    </li>
                  ))}
                </ul>
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
                    className='rounded-lg bg-muted p-3 text-sm italic text-muted-foreground'
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
                    <Badge variant='default' className='text-sm py-2 px-3'>
                      ✓ Guardado
                    </Badge>
                  )}
                  <Button variant='outline' disabled>
                    📧 Enviar Resumen (próximamente)
                  </Button>
                  <Button
                    variant='outline'
                    onClick={() => router.push('/preview/generator')}
                  >
                    🔗 Generar Preview
                  </Button>
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
