'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import PageContainer from '@/components/layout/page-container';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
import { generateContent } from '@/lib/edge-functions';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BriefFields {
  business_name: string;
  industry: string;
  city: string;
  state: string;
  service_area: string;
  years_experience: string;
  licenses: string;
  website: string;
  team_size: string;
  main_problem: string;
  pain_1: string;
  pain_2: string;
  pain_3: string;
  digital_presence: string;
  marketing_investment: string;
  demo_age: string;
  demo_occupation: string;
  demo_income: string;
  demo_language: string;
  psychographics: string;
  search_behavior: string;
  differentiators: string;
  guarantees: string;
  success_cases: string;
  goal_90: string;
  goal_12m: string;
  budget: string;
  urgency: string;
}

interface PersonaFields {
  name_age: string;
  location_language: string;
  profession: string;
  education: string;
  lifestyle: string;
  values: string;
  social_media: string;
  search_method: string;
  tech_comfort: string;
  personal_goal: string;
  professional_goal: string;
  provider_values: string;
  revenue_target: string;
  expansion: string;
  main_pain: string;
  secondary_pains: string;
  hidden_costs: string;
  emotional_impact: string;
  action_trigger: string;
  dream_result: string;
  past_attempts: string;
  why_failed: string;
  provider_frustrations: string;
  awareness_level: string;
  objection_price: string;
  objection_trust: string;
  objection_time: string;
  fears: string;
  if_nothing: string;
  if_competitor: string;
  if_c3: string;
}

interface OFVFields {
  big_promise: string;
  vehicle_name: string;
  vehicle_steps: string;
  quick_win: string;
  option_a: string;
  option_b: string;
  option_c: string;
  deliverables: string;
  guarantee: string;
  urgency_scarcity: string;
  social_proof: string;
}

interface ContentRecord {
  id: string;
  content: Record<string, unknown> | string;
  status: string;
  created_at: string;
}

interface DiagnosticData {
  google_presence: string | null;
  digital_health: string | null;
  revenue_range: string | null;
  team_size: string | null;
  license_status: string | null;
  expectation: string | null;
  recommended_tier: string | null;
}

interface LocationRef {
  city: string;
  county: string;
  zip_codes: string[];
  region: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved')
    return <Badge className="bg-green-100 text-green-800 border-green-200">Aprobado</Badge>;
  return <Badge variant="outline">Borrador</Badge>;
}

function FieldDot({ type }: { type: 'auto' | 'manual' | 'ai' | 'diag' }) {
  const colors = { auto: 'bg-green-500', manual: 'bg-amber-500', ai: 'bg-blue-500', diag: 'bg-purple-500' };
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${colors[type]}`} />;
}

function SuggestButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-blue-600 hover:text-blue-800 mt-1 flex items-center gap-1"
    >
      <Icons.sparkles className="w-3 h-3" />
      {label}
    </button>
  );
}

function BlockCard({
  title,
  badge,
  children
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {badge && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            {badge}
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  dot,
  children,
  hint
}: {
  label: string;
  dot: 'auto' | 'manual' | 'ai' | 'diag';
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
        <FieldDot type={dot} />
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

const emptyBrief: BriefFields = {
  business_name: '', industry: '', city: '', state: 'CA', service_area: '',
  years_experience: '', licenses: '', website: '', team_size: '',
  main_problem: '', pain_1: '', pain_2: '', pain_3: '',
  digital_presence: '', marketing_investment: '',
  demo_age: '', demo_occupation: '', demo_income: '', demo_language: '',
  psychographics: '', search_behavior: '',
  differentiators: '', guarantees: '', success_cases: '',
  goal_90: '', goal_12m: '', budget: '', urgency: ''
};

const emptyPersona: PersonaFields = {
  name_age: '', location_language: '', profession: '', education: '',
  lifestyle: '', values: '', social_media: '', search_method: '',
  tech_comfort: '', personal_goal: '', professional_goal: '',
  provider_values: '', revenue_target: '', expansion: '',
  main_pain: '', secondary_pains: '', hidden_costs: '', emotional_impact: '',
  action_trigger: '', dream_result: '', past_attempts: '',
  why_failed: '', provider_frustrations: '', awareness_level: '',
  objection_price: '', objection_trust: '', objection_time: '', fears: '',
  if_nothing: '', if_competitor: '', if_c3: ''
};

const emptyOFV: OFVFields = {
  big_promise: '', vehicle_name: '', vehicle_steps: '', quick_win: '',
  option_a: '', option_b: '', option_c: '',
  deliverables: '', guarantee: '', urgency_scarcity: '', social_proof: ''
};

function parseContentToFields<T extends Record<string, string>>(
  content: Record<string, unknown> | string | null,
  defaults: T
): T {
  if (!content) return { ...defaults };
  const obj = typeof content === 'string' ? (() => { try { return JSON.parse(content); } catch { return {}; } })() : content;
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const val = obj[key];
    if (typeof val === 'string') (result as Record<string, string>)[key] = val;
  }
  return result;
}

function fieldsToContent<T extends Record<string, string>>(fields: T): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v) content[k] = v;
  }
  content.raw_text = Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return content;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function BriefPage() {
  const params = useParams<{ clientId: string | string[] }>();
  const clientId = typeof params.clientId === 'string' ? params.clientId : params.clientId?.[0];
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [client, setClient] = useState<Record<string, unknown> | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [locations, setLocations] = useState<LocationRef[]>([]);
  const [loading, setLoading] = useState(true);

  // Brief
  const [briefRecord, setBriefRecord] = useState<ContentRecord | null>(null);
  const [briefFields, setBriefFields] = useState<BriefFields>({ ...emptyBrief });
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [approvingBrief, setApprovingBrief] = useState(false);

  // Persona
  const [personaRecord, setPersonaRecord] = useState<ContentRecord | null>(null);
  const [personaFields, setPersonaFields] = useState<PersonaFields>({ ...emptyPersona });
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [approvingPersona, setApprovingPersona] = useState(false);

  // OFV
  const [ofvRecord, setOfvRecord] = useState<ContentRecord | null>(null);
  const [ofvFields, setOfvFields] = useState<OFVFields>({ ...emptyOFV });
  const [generatingOfv, setGeneratingOfv] = useState(false);
  const [approvingOfv, setApprovingOfv] = useState(false);

  useEffect(() => {
    if (!userLoading && tenantId && clientId) void loadData();
  }, [tenantId, userLoading, clientId]);

  const loadData = async () => {
    // Client
    const { data: c } = await supabase.from('clients').select('*').eq('id', clientId).single();
    if (c) setClient(c);

    // Diagnostic
    const { data: d } = await supabase
      .from('diagnostics')
      .select('google_presence, digital_health, revenue_range, team_size, license_status, expectation, recommended_tier')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (d) setDiagnostic(d as DiagnosticData);

    // Locations (California)
    const { data: locs } = await supabase
      .from('locations_reference')
      .select('city, county, zip_codes, region')
      .eq('state', 'CA')
      .order('region')
      .order('city');
    if (locs) setLocations(locs as LocationRef[]);

    // Brief
    const { data: b } = await supabase
      .from('briefs')
      .select('id, content, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (b) {
      setBriefRecord(b as ContentRecord);
      const parsed = parseContentToFields(b.content as Record<string, unknown>, emptyBrief);
      // Pre-fill from client data if fields are empty
      if (c) {
        if (!parsed.business_name) parsed.business_name = (c.business_name as string) || '';
        if (!parsed.industry) parsed.industry = (c.industry as string) || '';
        if (!parsed.city) parsed.city = (c.city as string) || '';
        if (!parsed.state) parsed.state = (c.state as string) || 'CA';
        if (!parsed.service_area && c.service_area_cities) parsed.service_area = Array.isArray(c.service_area_cities) ? (c.service_area_cities as string[]).join(', ') : '';
      }
      if (d) {
        if (!parsed.team_size) parsed.team_size = (d as DiagnosticData).team_size || '';
        if (!parsed.digital_presence) parsed.digital_presence = `GBP: ${(d as DiagnosticData).google_presence || 'N/A'}, Salud digital: ${(d as DiagnosticData).digital_health || 'N/A'}`;
      }
      setBriefFields(parsed);
    } else if (c) {
      // No brief yet — pre-fill from client + diagnostic
      setBriefFields({
        ...emptyBrief,
        business_name: (c.business_name as string) || '',
        industry: (c.industry as string) || '',
        city: (c.city as string) || '',
        state: (c.state as string) || 'CA',
        service_area: c.service_area_cities ? (Array.isArray(c.service_area_cities) ? (c.service_area_cities as string[]).join(', ') : '') : '',
        team_size: d ? (d as DiagnosticData).team_size || '' : '',
        digital_presence: d ? `GBP: ${(d as DiagnosticData).google_presence || 'N/A'}, Salud: ${(d as DiagnosticData).digital_health || 'N/A'}` : '',
      });
    }

    // Persona
    const { data: p } = await supabase
      .from('buyer_personas')
      .select('id, content, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (p) {
      setPersonaRecord(p as ContentRecord);
      setPersonaFields(parseContentToFields(p.content as Record<string, unknown>, emptyPersona));
    }

    // OFV
    const { data: o } = await supabase
      .from('offers')
      .select('id, content, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (o) {
      setOfvRecord(o as ContentRecord);
      setOfvFields(parseContentToFields(o.content as Record<string, unknown>, emptyOFV));
    }

    setLoading(false);
  };

  /* ---- Brief helpers ---- */
  const updateBrief = (key: keyof BriefFields, val: string) =>
    setBriefFields((prev) => ({ ...prev, [key]: val }));

  const handleGenerateBrief = async () => {
    if (!clientId || !user?.id || !tenantId) { toast.error('Faltan datos'); return; }
    setGeneratingBrief(true);
    try {
      const result = await generateContent({
        step: 'brief',
        clientId,
        inputData: { structured_fields: briefFields }
      });
      // Re-fetch
      const { data: newB } = await supabase
        .from('briefs')
        .select('id, content, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newB) {
        setBriefRecord(newB as ContentRecord);
        const parsed = parseContentToFields(newB.content as Record<string, unknown>, emptyBrief);
        // Keep manually entered values if AI returned empty
        for (const k of Object.keys(briefFields) as (keyof BriefFields)[]) {
          if (!parsed[k] && briefFields[k]) parsed[k] = briefFields[k];
        }
        setBriefFields(parsed);
      }
      toast.success('Brief generado con GPT-4o');
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : 'desconocido'}`);
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleApproveBrief = async () => {
    if (!briefRecord || !tenantId || !user) return;
    setApprovingBrief(true);
    try {
      await supabase
        .from('briefs')
        .update({ status: 'approved', content: fieldsToContent(briefFields) })
        .eq('id', briefRecord.id);
      setBriefRecord((prev) => prev ? { ...prev, status: 'approved' } : prev);
      await logActivity({ tenantId, userId: user.id, action: 'brief_approved', entityType: 'brief', entityId: briefRecord.id, clientId });
      toast.success('Brief aprobado');
    } catch { toast.error('Error al aprobar'); }
    finally { setApprovingBrief(false); }
  };

  /* ---- Persona helpers ---- */
  const updatePersona = (key: keyof PersonaFields, val: string) =>
    setPersonaFields((prev) => ({ ...prev, [key]: val }));

  const handleGeneratePersona = async () => {
    if (!clientId || !user?.id || !tenantId) { toast.error('Faltan datos'); return; }
    setGeneratingPersona(true);
    try {
      await generateContent({ step: 'buyer_persona', clientId, inputData: { structured_fields: personaFields } });
      const { data: newP } = await supabase
        .from('buyer_personas')
        .select('id, content, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newP) {
        setPersonaRecord(newP as ContentRecord);
        setPersonaFields(parseContentToFields(newP.content as Record<string, unknown>, emptyPersona));
      }
      toast.success('Buyer Persona generada');
    } catch (e) { toast.error(`Error: ${e instanceof Error ? e.message : 'desconocido'}`); }
    finally { setGeneratingPersona(false); }
  };

  const handleApprovePersona = async () => {
    if (!personaRecord || !tenantId || !user) return;
    setApprovingPersona(true);
    try {
      await supabase.from('buyer_personas').update({ status: 'approved', content: fieldsToContent(personaFields) }).eq('id', personaRecord.id);
      setPersonaRecord((prev) => prev ? { ...prev, status: 'approved' } : prev);
      await logActivity({ tenantId, userId: user.id, action: 'persona_approved', entityType: 'buyer_persona', entityId: personaRecord.id, clientId });
      toast.success('Buyer Persona aprobada');
    } catch { toast.error('Error al aprobar'); }
    finally { setApprovingPersona(false); }
  };

  /* ---- OFV helpers ---- */
  const updateOFV = (key: keyof OFVFields, val: string) =>
    setOfvFields((prev) => ({ ...prev, [key]: val }));

  const handleGenerateOFV = async () => {
    if (!clientId || !user?.id || !tenantId) { toast.error('Faltan datos'); return; }
    setGeneratingOfv(true);
    try {
      await generateContent({ step: 'ofv', clientId, inputData: { structured_fields: ofvFields } });
      const { data: newO } = await supabase
        .from('offers')
        .select('id, content, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newO) {
        setOfvRecord(newO as ContentRecord);
        setOfvFields(parseContentToFields(newO.content as Record<string, unknown>, emptyOFV));
      }
      toast.success('OFV generado');
    } catch (e) { toast.error(`Error: ${e instanceof Error ? e.message : 'desconocido'}`); }
    finally { setGeneratingOfv(false); }
  };

  const handleApproveOFV = async () => {
    if (!ofvRecord || !tenantId || !user) return;
    setApprovingOfv(true);
    try {
      await supabase.from('offers').update({ status: 'approved', content: fieldsToContent(ofvFields) }).eq('id', ofvRecord.id);
      setOfvRecord((prev) => prev ? { ...prev, status: 'approved' } : prev);
      await logActivity({ tenantId, userId: user.id, action: 'offer_approved', entityType: 'offer', entityId: ofvRecord.id, clientId });
      toast.success('OFV aprobado');
    } catch { toast.error('Error al aprobar'); }
    finally { setApprovingOfv(false); }
  };

  const briefApproved = briefRecord?.status === 'approved';
  const personaApproved = personaRecord?.status === 'approved';

  if (loading) {
    return (
      <PageContainer pageTitle="Brief & Persona">
        <div className="p-4"><p className="text-muted-foreground">Cargando...</p></div>
      </PageContainer>
    );
  }

  const clientName = (client?.business_name as string) || clientId;
  const ind = (client?.industry as string) || '';

  return (
    <PageContainer
      pageTitle={`Onboarding — ${clientName}`}
      pageDescription={`${ind.replace(/_/g, ' ')} · Brief, Persona y OFV`}
    >
      <div className="flex flex-1 flex-col gap-4 p-4 md:px-6">
        <div className="flex gap-2 text-xs text-muted-foreground mb-1">
          <span className="flex items-center gap-1"><FieldDot type="auto" /> Del cliente</span>
          <span className="flex items-center gap-1"><FieldDot type="diag" /> Del diagnóstico</span>
          <span className="flex items-center gap-1"><FieldDot type="ai" /> AI sugiere</span>
          <span className="flex items-center gap-1"><FieldDot type="manual" /> Carlos completa</span>
        </div>

        <Tabs defaultValue="brief">
          <TabsList>
            <TabsTrigger value="brief">Brief</TabsTrigger>
            <TabsTrigger value="persona" disabled={!briefApproved}>
              {!briefApproved && '🔒 '}Buyer Persona
            </TabsTrigger>
            <TabsTrigger value="ofv" disabled={!personaApproved}>
              {!personaApproved && '🔒 '}OFV
            </TabsTrigger>
          </TabsList>

          {/* ============ TAB 1: BRIEF ============ */}
          <TabsContent value="brief" className="mt-4 space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Brief del negocio</h3>
              {briefRecord && <StatusBadge status={briefRecord.status} />}
            </div>

            {/* Block 1 */}
            <BlockCard title="Bloque 1 — Información del negocio" badge="70% auto">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre del negocio" dot="auto">
                  <Input value={briefFields.business_name} onChange={(e) => updateBrief('business_name', e.target.value)} />
                </Field>
                <Field label="Industria" dot="auto">
                  <Input value={briefFields.industry} readOnly className="bg-muted/30" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Ciudad" dot="manual">
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={briefFields.city}
                    onChange={(e) => updateBrief('city', e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    {locations.map((loc) => (
                      <option key={loc.city} value={loc.city}>{loc.city} ({loc.county})</option>
                    ))}
                  </select>
                </Field>
                <Field label="Estado" dot="auto">
                  <Input value={briefFields.state} readOnly className="bg-muted/30" />
                </Field>
                <Field label="Área de servicio" dot="manual" hint="Ciudades separadas por coma">
                  <Input
                    value={briefFields.service_area}
                    onChange={(e) => updateBrief('service_area', e.target.value)}
                    placeholder="Santa Maria, SLO, SB..."
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Años de experiencia" dot="manual">
                  <Input type="number" value={briefFields.years_experience} onChange={(e) => updateBrief('years_experience', e.target.value)} placeholder="Ej: 10" />
                </Field>
                <Field label="Licencias / certificaciones" dot="manual">
                  <Input value={briefFields.licenses} onChange={(e) => updateBrief('licenses', e.target.value)} placeholder="CSLB#, seguros, permisos" />
                </Field>
                <Field label="Tamaño del equipo" dot="diag">
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={briefFields.team_size}
                    onChange={(e) => updateBrief('team_size', e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="solo">Solo</option>
                    <option value="2_5">2-5</option>
                    <option value="6_10">6-10</option>
                    <option value="11_plus">11+</option>
                  </select>
                </Field>
              </div>
              <Field label="Sitio web actual" dot="manual" hint="Dejar vacío si no tiene">
                <Input type="url" value={briefFields.website} onChange={(e) => updateBrief('website', e.target.value)} placeholder="https://..." />
              </Field>
            </BlockCard>

            {/* Block 2 */}
            <BlockCard title="Bloque 2 — Situación actual" badge="80% AI sugiere">
              <Field label="Presencia digital actual" dot="diag">
                <Input value={briefFields.digital_presence} readOnly className="bg-muted/30" />
              </Field>
              <Field label="Problema principal" dot="ai">
                <Input value={briefFields.main_problem} onChange={(e) => updateBrief('main_problem', e.target.value)} placeholder="Ej: Sin presencia digital" />
                <SuggestButton label="Sugerir problema" onClick={() => updateBrief('main_problem', `Sin presencia digital — los clientes no pueden encontrar ${briefFields.business_name || 'el negocio'} en Google para ${ind.replace(/_/g, ' ')} en ${briefFields.city || 'la zona'}`)} />
              </Field>
              <Field label="Dolores específicos (máx 3)" dot="ai">
                <Input value={briefFields.pain_1} onChange={(e) => updateBrief('pain_1', e.target.value)} placeholder="1. " className="mb-1.5" />
                <Input value={briefFields.pain_2} onChange={(e) => updateBrief('pain_2', e.target.value)} placeholder="2. " className="mb-1.5" />
                <Input value={briefFields.pain_3} onChange={(e) => updateBrief('pain_3', e.target.value)} placeholder="3. " />
                <SuggestButton label="Sugerir dolores basado en industria" onClick={() => {
                  updateBrief('pain_1', 'Depende 100% del boca a boca — sin pipeline digital de leads');
                  updateBrief('pain_2', 'Competidores con GBP verificado le roban clientes que buscan en Google');
                  updateBrief('pain_3', 'No puede cotizar rápido porque no tiene formulario ni landing');
                }} />
              </Field>
              <Field label="Inversión actual en marketing" dot="ai">
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={briefFields.marketing_investment}
                  onChange={(e) => updateBrief('marketing_investment', e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  <option value="$0">$0 — no invierte</option>
                  <option value="<$200">Menos de $200/mes</option>
                  <option value="$200-$500">$200-$500/mes</option>
                  <option value="$500-$1000">$500-$1,000/mes</option>
                  <option value=">$1000">Más de $1,000/mes</option>
                </select>
              </Field>
            </BlockCard>

            {/* Block 3 */}
            <BlockCard title="Bloque 3 — Cliente ideal" badge="90% AI sugiere">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Edad" dot="ai">
                  <Input value={briefFields.demo_age} onChange={(e) => updateBrief('demo_age', e.target.value)} placeholder="Ej: 35-55" />
                </Field>
                <Field label="Ocupación" dot="ai">
                  <Input value={briefFields.demo_occupation} onChange={(e) => updateBrief('demo_occupation', e.target.value)} placeholder="Ej: contractor, event planner" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Ingresos" dot="ai">
                  <Input value={briefFields.demo_income} onChange={(e) => updateBrief('demo_income', e.target.value)} placeholder="Ej: $50K-$150K" />
                </Field>
                <Field label="Idioma" dot="ai">
                  <Input value={briefFields.demo_language} onChange={(e) => updateBrief('demo_language', e.target.value)} placeholder="Ej: bilingual" />
                </Field>
              </div>
              <SuggestButton label="Sugerir demografía para la industria" onClick={() => {
                updateBrief('demo_age', '35-55');
                updateBrief('demo_occupation', 'General contractor, event planner, property manager');
                updateBrief('demo_income', '$60K-$200K (B2B) / $40K-$80K (residential)');
                updateBrief('demo_language', 'English + Spanish (bilingual market)');
              }} />
              <Field label="Psicografía (valores, miedos, aspiraciones)" dot="ai">
                <Textarea value={briefFields.psychographics} onChange={(e) => updateBrief('psychographics', e.target.value)} rows={2} placeholder="Qué valora, qué le da miedo, a qué aspira..." />
                <SuggestButton label="Sugerir psicografía" onClick={() => updateBrief('psychographics', 'Valora: confiabilidad, puntualidad, limpieza. Miedo: unidades sucias que afecten reputación. Aspiración: proveedor invisible — cero quejas de usuarios.')} />
              </Field>
              <Field label="Comportamiento de búsqueda" dot="ai">
                <Textarea value={briefFields.search_behavior} onChange={(e) => updateBrief('search_behavior', e.target.value)} rows={2} placeholder="Dónde busca servicios, cómo decide..." />
                <SuggestButton label="Sugerir comportamiento" onClick={() => updateBrief('search_behavior', `Busca en Google: ${ind.replace(/_/g, ' ')} near me, ${ind.replace(/_/g, ' ')} rental ${briefFields.city}. Decide por: disponibilidad rápida + precio + reviews.`)} />
              </Field>
            </BlockCard>

            {/* Block 4 */}
            <BlockCard title="Bloque 4 — Diferenciadores" badge="Carlos completa">
              <Field label="Qué hace diferente vs competencia" dot="manual">
                <Textarea value={briefFields.differentiators} onChange={(e) => updateBrief('differentiators', e.target.value)} rows={2} placeholder="Ej: servicio bilingüe, entrega same-day, mantenimiento incluido..." />
              </Field>
              <Field label="Garantías" dot="manual">
                <Input value={briefFields.guarantees} onChange={(e) => updateBrief('guarantees', e.target.value)} placeholder="Ej: entrega en 24hrs o gratis" />
              </Field>
              <Field label="Casos de éxito o métricas" dot="manual">
                <Input value={briefFields.success_cases} onChange={(e) => updateBrief('success_cases', e.target.value)} placeholder="Ej: 200+ eventos servidos, 10 años sin queja" />
              </Field>
            </BlockCard>

            {/* Block 5 */}
            <BlockCard title="Bloque 5 — Objetivos" badge="AI sugiere">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Meta a 90 días" dot="ai">
                  <Input value={briefFields.goal_90} onChange={(e) => updateBrief('goal_90', e.target.value)} placeholder="Ej: GBP verificado + 5 reseñas" />
                  <SuggestButton label="Sugerir meta" onClick={() => updateBrief('goal_90', 'GBP verificado y optimizado + website live + 5 reseñas de Google')} />
                </Field>
                <Field label="Meta a 12 meses" dot="ai">
                  <Input value={briefFields.goal_12m} onChange={(e) => updateBrief('goal_12m', e.target.value)} placeholder="Ej: top 3 en Maps" />
                  <SuggestButton label="Sugerir meta" onClick={() => updateBrief('goal_12m', `Top 3 en Google Maps para ${ind.replace(/_/g, ' ')} en ${briefFields.city || 'su zona'} + 15-20 leads/mes`)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Inversión esperada" dot="ai" hint="Basado en tier recomendado">
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={briefFields.budget}
                    onChange={(e) => updateBrief('budget', e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="$99/mes">$99/mes (mantenimiento básico)</option>
                    <option value="$275/mes">$275/mes (Presencia Digital)</option>
                    <option value="$500+/mes">$500+/mes (growth)</option>
                  </select>
                </Field>
                <Field label="Urgencia" dot="ai">
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={briefFields.urgency}
                    onChange={(e) => updateBrief('urgency', e.target.value)}
                  >
                    <option value="">Seleccionar...</option>
                    <option value="baja">Baja — explorando opciones</option>
                    <option value="media">Media — quiere empezar pronto</option>
                    <option value="alta">Alta — necesita presencia YA</option>
                    <option value="critica">Crítica — perdiendo clientes ahora</option>
                  </select>
                </Field>
              </div>
            </BlockCard>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleGenerateBrief} disabled={generatingBrief}>
                {generatingBrief ? <><Icons.spinner className="mr-2 h-4 w-4 animate-spin" />Generando...</> : '✨ Generar Brief con AI'}
              </Button>
              {briefRecord && briefRecord.status !== 'approved' && (
                <Button onClick={handleApproveBrief} disabled={approvingBrief} className="bg-green-600 hover:bg-green-700">
                  {approvingBrief ? <><Icons.spinner className="mr-2 h-4 w-4 animate-spin" />Aprobando...</> : '✓ Aprobar Brief'}
                </Button>
              )}
              {briefApproved && <p className="text-sm text-green-700 font-medium self-center">✅ Brief aprobado. Buyer Persona desbloqueada.</p>}
            </div>
          </TabsContent>

          {/* ============ TAB 2: BUYER PERSONA ============ */}
          <TabsContent value="persona" className="mt-4 space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Buyer Persona (12 bloques)</h3>
              {personaRecord && <StatusBadge status={personaRecord.status} />}
            </div>

            {!briefApproved ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">🔒 Primero aprueba el Brief</CardContent></Card>
            ) : (
              <>
                <BlockCard title="1. Datos demográficos" badge="AI sugiere">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nombre ficticio y edad" dot="ai"><Input value={personaFields.name_age} onChange={(e) => updatePersona('name_age', e.target.value)} placeholder='Ej: "Rafael", 42 años' /></Field>
                    <Field label="Ubicación e idioma" dot="ai"><Input value={personaFields.location_language} onChange={(e) => updatePersona('location_language', e.target.value)} placeholder="Ej: Santa Maria, CA — bilingüe" /></Field>
                  </div>
                </BlockCard>

                <BlockCard title="2. Profesión y educación">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Profesión / tipo de negocio" dot="ai"><Input value={personaFields.profession} onChange={(e) => updatePersona('profession', e.target.value)} placeholder="Ej: Dueño de negocio de sanitation" /></Field>
                    <Field label="Educación" dot="ai"><Input value={personaFields.education} onChange={(e) => updatePersona('education', e.target.value)} placeholder="Ej: High school, certificaciones técnicas" /></Field>
                  </div>
                </BlockCard>

                <BlockCard title="3-4. Estilo de vida y comportamiento digital">
                  <Field label="Estilo de vida y valores" dot="ai"><Textarea value={personaFields.lifestyle} onChange={(e) => updatePersona('lifestyle', e.target.value)} rows={2} placeholder="Rutina, valores familiares, nivel socioeconómico..." /></Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Redes sociales" dot="ai"><Input value={personaFields.social_media} onChange={(e) => updatePersona('social_media', e.target.value)} placeholder="Facebook, WhatsApp..." /></Field>
                    <Field label="Cómo busca proveedores" dot="ai"><Input value={personaFields.search_method} onChange={(e) => updatePersona('search_method', e.target.value)} placeholder="Google, referidos..." /></Field>
                    <Field label="Nivel tech" dot="ai"><Input value={personaFields.tech_comfort} onChange={(e) => updatePersona('tech_comfort', e.target.value)} placeholder="Bajo / Medio / Alto" /></Field>
                  </div>
                </BlockCard>

                <BlockCard title="5-6. Metas y objetivos">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Meta personal" dot="ai"><Input value={personaFields.personal_goal} onChange={(e) => updatePersona('personal_goal', e.target.value)} placeholder="Ej: estabilidad financiera para familia" /></Field>
                    <Field label="Meta profesional" dot="ai"><Input value={personaFields.professional_goal} onChange={(e) => updatePersona('professional_goal', e.target.value)} placeholder="Ej: duplicar clientes en 1 año" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Facturación objetivo" dot="ai"><Input value={personaFields.revenue_target} onChange={(e) => updatePersona('revenue_target', e.target.value)} placeholder="Ej: $25K-$50K/mes" /></Field>
                    <Field label="Qué valora en un proveedor" dot="manual"><Input value={personaFields.provider_values} onChange={(e) => updatePersona('provider_values', e.target.value)} placeholder="Ej: transparencia, resultados medibles" /></Field>
                  </div>
                </BlockCard>

                <BlockCard title="7-8. Dolores y motivaciones" badge="Clave para ARC7">
                  <Field label="Dolor principal (el que lo mantiene despierto)" dot="ai"><Input value={personaFields.main_pain} onChange={(e) => updatePersona('main_pain', e.target.value)} placeholder="Ej: no aparece en Google, pierde clientes" /></Field>
                  <Field label="Dolores secundarios" dot="ai"><Textarea value={personaFields.secondary_pains} onChange={(e) => updatePersona('secondary_pains', e.target.value)} rows={2} placeholder="3-5 dolores separados por línea" /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Costos ocultos de no resolver" dot="ai"><Input value={personaFields.hidden_costs} onChange={(e) => updatePersona('hidden_costs', e.target.value)} placeholder="Ej: $5K-$10K/mes en leads perdidos" /></Field>
                    <Field label="Qué lo impulsa a actuar" dot="ai"><Input value={personaFields.action_trigger} onChange={(e) => updatePersona('action_trigger', e.target.value)} placeholder="Ej: ver competidor rankeando arriba" /></Field>
                  </div>
                </BlockCard>

                <BlockCard title="9-10. Frustraciones y nivel de conciencia">
                  <Field label="Qué intentó antes" dot="manual"><Input value={personaFields.past_attempts} onChange={(e) => updatePersona('past_attempts', e.target.value)} placeholder="Ej: Yelp ads, un primo que le hizo el sitio..." /></Field>
                  <Field label="Por qué falló" dot="manual"><Input value={personaFields.why_failed} onChange={(e) => updatePersona('why_failed', e.target.value)} placeholder="Ej: no era especialista en local SEO" /></Field>
                  <Field label="Nivel de conciencia" dot="ai">
                    <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={personaFields.awareness_level} onChange={(e) => updatePersona('awareness_level', e.target.value)}>
                      <option value="">Seleccionar...</option>
                      <option value="inconsciente">Inconsciente del problema</option>
                      <option value="consciente">Consciente del problema</option>
                      <option value="buscando">Buscando solución</option>
                      <option value="comparando">Comparando opciones</option>
                      <option value="listo">Listo para comprar</option>
                    </select>
                  </Field>
                </BlockCard>

                <BlockCard title="11-12. Barreras y escenarios" badge="Clave para ARC5-6">
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Objeción: precio" dot="ai"><Input value={personaFields.objection_price} onChange={(e) => updatePersona('objection_price', e.target.value)} placeholder="Ej: es mucho para empezar" /></Field>
                    <Field label="Objeción: confianza" dot="ai"><Input value={personaFields.objection_trust} onChange={(e) => updatePersona('objection_trust', e.target.value)} placeholder="Ej: ya me estafaron antes" /></Field>
                    <Field label="Objeción: tiempo" dot="ai"><Input value={personaFields.objection_time} onChange={(e) => updatePersona('objection_time', e.target.value)} placeholder="Ej: no tengo tiempo" /></Field>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Si no hace nada" dot="ai"><Textarea value={personaFields.if_nothing} onChange={(e) => updatePersona('if_nothing', e.target.value)} rows={2} placeholder="Status quo..." /></Field>
                    <Field label="Si elige competencia" dot="ai"><Textarea value={personaFields.if_competitor} onChange={(e) => updatePersona('if_competitor', e.target.value)} rows={2} placeholder="Qué pasa..." /></Field>
                    <Field label="Si elige C3" dot="ai"><Textarea value={personaFields.if_c3} onChange={(e) => updatePersona('if_c3', e.target.value)} rows={2} placeholder="Resultado ideal..." /></Field>
                  </div>
                </BlockCard>

                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleGeneratePersona} disabled={generatingPersona}>
                    {generatingPersona ? <><Icons.spinner className="mr-2 h-4 w-4 animate-spin" />Generando...</> : '✨ Generar Buyer Persona con AI'}
                  </Button>
                  {personaRecord && personaRecord.status !== 'approved' && (
                    <Button onClick={handleApprovePersona} disabled={approvingPersona} className="bg-green-600 hover:bg-green-700">
                      {approvingPersona ? 'Aprobando...' : '✓ Aprobar Persona'}
                    </Button>
                  )}
                  {personaApproved && <p className="text-sm text-green-700 font-medium self-center">✅ Persona aprobada. OFV desbloqueado.</p>}
                </div>
              </>
            )}
          </TabsContent>

          {/* ============ TAB 3: OFV ============ */}
          <TabsContent value="ofv" className="mt-4 space-y-4 max-w-3xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Oferta de Valor (OFV)</h3>
              {ofvRecord && <StatusBadge status={ofvRecord.status} />}
            </div>

            {!personaApproved ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">🔒 Primero aprueba la Buyer Persona</CardContent></Card>
            ) : (
              <>
                <BlockCard title="1. Big Promise" badge="Ecuación Hormozi">
                  <Field label="[Resultado] + [Plazo] + [Vehículo] + [Objeción anulada]" dot="ai">
                    <Textarea value={ofvFields.big_promise} onChange={(e) => updateOFV('big_promise', e.target.value)} rows={2} placeholder='Ej: "Presencia digital completa en 90 días con el Sistema VIP™ — sin frenar tu operación"' />
                  </Field>
                </BlockCard>

                <BlockCard title="2. Vehículo Único (Método Branded™)">
                  <Field label="Nombre del método (con ™)" dot="ai">
                    <Input value={ofvFields.vehicle_name} onChange={(e) => updateOFV('vehicle_name', e.target.value)} placeholder='Ej: Sistema VIP™ (Verificación + Identidad + Presencia)' />
                  </Field>
                  <Field label="3-5 pasos del método" dot="ai">
                    <Textarea value={ofvFields.vehicle_steps} onChange={(e) => updateOFV('vehicle_steps', e.target.value)} rows={3} placeholder="1. Verificación GBP&#10;2. Identidad digital&#10;3. Presencia web + SEO" />
                  </Field>
                </BlockCard>

                <BlockCard title="3. Quick Win" badge="Primeros 7-14 días">
                  <Field label="Entregable inicial medible" dot="ai">
                    <Input value={ofvFields.quick_win} onChange={(e) => updateOFV('quick_win', e.target.value)} placeholder='Ej: "GBP activo en 7 días. Primera reseña antes del día 15."' />
                  </Field>
                </BlockCard>

                <BlockCard title="4. Decision Frame" badge="Principio de Tres">
                  <div className="grid grid-cols-3 gap-3">
                    <Field label="Opción A (entrada)" dot="ai"><Textarea value={ofvFields.option_a} onChange={(e) => updateOFV('option_a', e.target.value)} rows={3} placeholder="Paquete base..." /></Field>
                    <Field label="Opción B (recomendado)" dot="ai"><Textarea value={ofvFields.option_b} onChange={(e) => updateOFV('option_b', e.target.value)} rows={3} placeholder="Paquete recomendado..." /></Field>
                    <Field label="Opción C (status quo)" dot="ai"><Textarea value={ofvFields.option_c} onChange={(e) => updateOFV('option_c', e.target.value)} rows={3} placeholder="Consecuencias de no actuar..." /></Field>
                  </div>
                </BlockCard>

                <BlockCard title="5. Entregables específicos">
                  <Field label="Lista de qué recibe el cliente" dot="ai">
                    <Textarea value={ofvFields.deliverables} onChange={(e) => updateOFV('deliverables', e.target.value)} rows={4} placeholder="- GBP verificado y optimizado&#10;- Website con SEO local&#10;- 3 meses de posts GBP&#10;- Fotos profesionales con alt-text" />
                  </Field>
                </BlockCard>

                <BlockCard title="6-7. Garantía y urgencia">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Garantía / Risk Reversal" dot="manual">
                      <Textarea value={ofvFields.guarantee} onChange={(e) => updateOFV('guarantee', e.target.value)} rows={2} placeholder="Real y verificable..." />
                    </Field>
                    <Field label="Urgencia / Escasez (ÉTICA)" dot="ai" hint="No fabricar escasez falsa">
                      <Textarea value={ofvFields.urgency_scarcity} onChange={(e) => updateOFV('urgency_scarcity', e.target.value)} rows={2} placeholder="Cupos limitados, bono con fecha..." />
                    </Field>
                  </div>
                </BlockCard>

                <BlockCard title="8. Social Proof">
                  <Field label="Testimonios con métricas antes/después" dot="manual">
                    <Textarea value={ofvFields.social_proof} onChange={(e) => updateOFV('social_proof', e.target.value)} rows={3} placeholder="Nombre del cliente, industria, resultado..." />
                  </Field>
                </BlockCard>

                <div className="flex gap-2 flex-wrap">
                  <Button onClick={handleGenerateOFV} disabled={generatingOfv}>
                    {generatingOfv ? <><Icons.spinner className="mr-2 h-4 w-4 animate-spin" />Generando...</> : '✨ Generar OFV con AI'}
                  </Button>
                  {ofvRecord && ofvRecord.status !== 'approved' && (
                    <Button onClick={handleApproveOFV} disabled={approvingOfv} className="bg-green-600 hover:bg-green-700">
                      {approvingOfv ? 'Aprobando...' : '✓ Aprobar OFV'}
                    </Button>
                  )}
                  {ofvRecord?.status === 'approved' && <p className="text-sm text-green-700 font-medium self-center">✅ OFV aprobado. Pipeline de contenido desbloqueado.</p>}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
