'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import PageContainer from '@/components/layout/page-container';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
import { textFromGenerateContentResult } from '@/lib/generate-content-text';
import { generateContent } from '@/lib/edge-functions';
import {
  getCanonicalEditableText,
  getCanonicalStructuredContent
} from '@/lib/upstream-content-contract';
import { pickApprovedActive } from '@/lib/upstream-version-selection';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';

type ContentRecord = {
  id: string;
  content: unknown;
  raw_text?: string | null;
  status: string;
  created_at: string;
  tokens_used?: number | null;
};

function ActiveTruthHint({
  record,
  approvedRecord,
  label
}: {
  record: ContentRecord | null;
  approvedRecord?: ContentRecord | null;
  label: string;
}) {
  if (!record) return null;

  if (record.status === 'approved') {
    return (
      <p className='text-xs font-medium text-green-700'>
        {label} aprobado = verdad activa actual para este bloque.
      </p>
    );
  }

  if (approvedRecord) {
    return (
      <p className='text-amber-700 text-xs font-medium'>
        Hay una versión aprobada anterior de {label}. Esta vista muestra la
        versión más reciente de trabajo, no la verdad activa aprobada.
      </p>
    );
  }

  return (
    <p className='text-muted-foreground text-xs'>
      {label} en borrador = versión más reciente de trabajo, pero todavía no es
      verdad aprobada.
    </p>
  );
}

type OFVData = {
  big_promise?: string;
  vehicle_name?: string;
  vehicle_description?: string;
  quick_win?: string;
  guarantee?: string;
  [key: string]: string | undefined;
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return (
      <Badge className='border-green-200 bg-green-100 text-green-800'>
        Aprobado ✓
      </Badge>
    );
  }
  return <Badge variant='outline'>Borrador</Badge>;
}

function GeneratedAt({ date }: { date: string }) {
  return (
    <p className='text-muted-foreground text-xs'>
      Generado:{' '}
      {new Date(date).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}
    </p>
  );
}

function extractText(content: unknown, rawText?: string | null): string {
  return getCanonicalEditableText(content, rawText);
}

function parseOfvData(content: unknown): OFVData | null {
  return getCanonicalStructuredContent<OFVData>(content);
}

export default function BriefPage() {
  const params = useParams<{ clientId: string | string[] }>();
  const clientId =
    typeof params.clientId === 'string'
      ? params.clientId
      : params.clientId?.[0];
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [client, setClient] = useState<{
    id: string;
    business_name: string;
    industry: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  // Brief state
  const [brief, setBrief] = useState<ContentRecord | null>(null);
  const [approvedBrief, setApprovedBrief] = useState<ContentRecord | null>(null);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [approvingBrief, setApprovingBrief] = useState(false);

  // Persona state
  const [persona, setPersona] = useState<ContentRecord | null>(null);
  const [approvedPersona, setApprovedPersona] = useState<ContentRecord | null>(null);
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [approvingPersona, setApprovingPersona] = useState(false);

  // OFV state
  const [ofv, setOfv] = useState<ContentRecord | null>(null);
  const [approvedOfv, setApprovedOfv] = useState<ContentRecord | null>(null);
  const [ofvData, setOfvData] = useState<OFVData | null>(null);
  const [generatingOfv, setGeneratingOfv] = useState(false);
  const [approvingOfv, setApprovingOfv] = useState(false);

  // Editable text state for each content type
  const [briefText, setBriefText] = useState('');
  const [personaText, setPersonaText] = useState('');
  const [ofvText, setOfvText] = useState('');

  useEffect(() => {
    if (!userLoading && tenantId && clientId) {
      void loadData();
    }
  }, [tenantId, userLoading, clientId]);

  useEffect(() => {
    if (brief) setBriefText(extractText(brief.content, brief.raw_text));
  }, [brief]);

  useEffect(() => {
    if (persona) setPersonaText(extractText(persona.content, persona.raw_text));
  }, [persona]);

  useEffect(() => {
    if (ofv) setOfvText(extractText(ofv.content, ofv.raw_text));
  }, [ofv]);

  const loadData = async () => {
    // Load client
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, business_name, industry')
      .eq('id', clientId)
      .single();
    if (clientData) setClient(clientData);

    // Load latest + approved brief
    const { data: briefData } = await supabase
      .from('briefs')
      .select('id, content, raw_text, status, created_at, tokens_used')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (briefData) setBrief(briefData);

    const { data: approvedBriefData } = await supabase
      .from('briefs')
      .select('id, content, raw_text, status, created_at, tokens_used')
      .eq('client_id', clientId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setApprovedBrief(approvedBriefData ?? null);

    // Load latest + approved persona
    const { data: personaData } = await supabase
      .from('buyer_personas')
      .select('id, content, raw_text, status, created_at, tokens_used')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (personaData) setPersona(personaData);

    const { data: approvedPersonaData } = await supabase
      .from('buyer_personas')
      .select('id, content, raw_text, status, created_at, tokens_used')
      .eq('client_id', clientId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setApprovedPersona(approvedPersonaData ?? null);

    // Load latest + approved offer/OFV
    const { data: ofvDbData } = await supabase
      .from('offers')
      .select('id, content, raw_text, status, created_at, tokens_used')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ofvDbData) {
      setOfv(ofvDbData);
      setOfvData(parseOfvData(ofvDbData.content));
    }

    const { data: approvedOfvData } = await supabase
      .from('offers')
      .select('id, content, raw_text, status, created_at, tokens_used')
      .eq('client_id', clientId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setApprovedOfv(approvedOfvData ?? null);

    setLoading(false);
  };

  // BRIEF actions
  const handleGenerateBrief = async () => {
    if (!clientId) {
      toast.error('No se encontró el cliente en la URL');
      return;
    }
    if (!user?.id) {
      toast.error('Inicia sesión para generar el brief');
      return;
    }
    if (!tenantId) {
      toast.error(
        'No hay organización asociada a tu perfil. No se puede generar el brief.'
      );
      return;
    }
    setGeneratingBrief(true);
    try {
      const result = await generateContent({
        step: 'brief',
        clientId,
        inputData: briefText ? { previous_version: briefText } : undefined
      });
      const fallbackText = textFromGenerateContentResult(result);
      const fallbackId = result.saved?.id ? String(result.saved.id) : 'temp';

      // Re-fetch latest brief from DB after generation
      const { data: newBrief } = await supabase
        .from('briefs')
        .select('id, content, raw_text, status, created_at, tokens_used')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newBrief) {
        setBrief(newBrief);
      } else if (fallbackText) {
        setBrief({
          id: fallbackId,
          content: fallbackText,
          raw_text: fallbackText,
          status: 'draft',
          created_at: new Date().toISOString(),
          tokens_used: undefined
        });
      }

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'brief_generated',
        entityType: 'brief',
        entityId: clientId,
        clientId,
        metadata: { step: 'brief' }
      });

      toast.success('Brief generado correctamente');
    } catch (error) {
      console.error('Error generating brief:', error);
      toast.error(
        `Error al generar el brief: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleApproveBrief = async () => {
    if (!tenantId || !user || !brief) return;
    setApprovingBrief(true);
    try {
      await supabase
        .from('briefs')
        .update({ status: 'approved' })
        .eq('id', brief.id);

      setBrief((prev) => (prev ? { ...prev, status: 'approved' } : prev));

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'brief_approved',
        entityType: 'brief',
        entityId: brief.id,
        clientId,
        metadata: {}
      });

      toast.success('Brief aprobado');
    } catch (error) {
      console.error('Error approving brief:', error);
      toast.error('Error al aprobar el brief');
    } finally {
      setApprovingBrief(false);
    }
  };

  // PERSONA actions
  const handleGeneratePersona = async () => {
    if (!clientId) {
      toast.error('No se encontró el cliente en la URL');
      return;
    }
    if (!user?.id) {
      toast.error('Inicia sesión para continuar');
      return;
    }
    if (!tenantId) {
      toast.error('No hay organización asociada a tu perfil.');
      return;
    }
    setGeneratingPersona(true);
    try {
      const result = await generateContent({
        step: 'buyer_persona',
        clientId,
        inputData: personaText ? { previous_version: personaText } : undefined
      });
      const fallbackText = textFromGenerateContentResult(result);
      const fallbackId = result.saved?.id ? String(result.saved.id) : 'temp';

      const { data: newPersona } = await supabase
        .from('buyer_personas')
        .select('id, content, status, created_at, tokens_used')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newPersona) {
        setPersona(newPersona);
      } else if (fallbackText) {
        setPersona({
          id: fallbackId,
          content: fallbackText,
          status: 'draft',
          created_at: new Date().toISOString(),
          tokens_used: undefined
        });
      }

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'persona_generated',
        entityType: 'buyer_persona',
        entityId: clientId,
        clientId,
        metadata: { step: 'buyer_persona' }
      });

      toast.success('Buyer Persona generada');
    } catch (error) {
      console.error('Error generating persona:', error);
      toast.error(
        `Error al generar la persona: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    } finally {
      setGeneratingPersona(false);
    }
  };

  const handleApprovePersona = async () => {
    if (!tenantId || !user || !persona) return;
    setApprovingPersona(true);
    try {
      await supabase
        .from('buyer_personas')
        .update({ status: 'approved' })
        .eq('id', persona.id);

      setPersona((prev) => (prev ? { ...prev, status: 'approved' } : prev));

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'persona_approved',
        entityType: 'buyer_persona',
        entityId: persona.id,
        clientId,
        metadata: {}
      });

      toast.success('Buyer Persona aprobada');
    } catch (error) {
      console.error('Error approving persona:', error);
      toast.error('Error al aprobar la persona');
    } finally {
      setApprovingPersona(false);
    }
  };

  // OFV actions
  const handleGenerateOfv = async () => {
    if (!clientId) {
      toast.error('No se encontró el cliente en la URL');
      return;
    }
    if (!user?.id) {
      toast.error('Inicia sesión para continuar');
      return;
    }
    if (!tenantId) {
      toast.error('No hay organización asociada a tu perfil.');
      return;
    }
    setGeneratingOfv(true);
    try {
      const result = await generateContent({
        step: 'ofv',
        clientId,
        inputData: ofvText ? { previous_version: ofvText } : undefined
      });
      const fallbackText = textFromGenerateContentResult(result);
      const fallbackId = result.saved?.id ? String(result.saved.id) : 'temp';
      const contentObj =
        result.content && typeof result.content === 'object'
          ? result.content
          : null;

      const { data: newOfv } = await supabase
        .from('offers')
        .select('id, content, raw_text, status, created_at, tokens_used')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newOfv) {
        setOfv(newOfv);
        setOfvData(parseOfvData(newOfv.content));
      } else if (fallbackText || contentObj) {
        const fallbackContent = contentObj ?? fallbackText;
        setOfv({
          id: fallbackId,
          content: fallbackContent,
          raw_text: fallbackText || null,
          status: 'draft',
          created_at: new Date().toISOString(),
          tokens_used: undefined
        });
        setOfvData(parseOfvData(fallbackContent));
      }

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'offer_generated',
        entityType: 'offer',
        entityId: clientId,
        clientId,
        metadata: { step: 'ofv' }
      });

      toast.success('OFV generado');
    } catch (error) {
      console.error('Error generating OFV:', error);
      toast.error(
        `Error al generar el OFV: ${error instanceof Error ? error.message : 'Error desconocido'}`
      );
    } finally {
      setGeneratingOfv(false);
    }
  };

  const handleApproveOfv = async () => {
    if (!tenantId || !user || !ofv) return;
    setApprovingOfv(true);
    try {
      await supabase
        .from('offers')
        .update({ status: 'approved' })
        .eq('id', ofv.id);

      setOfv((prev) => (prev ? { ...prev, status: 'approved' } : prev));

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'offer_approved',
        entityType: 'offer',
        entityId: ofv.id,
        clientId,
        metadata: {}
      });

      toast.success('OFV aprobado');
    } catch (error) {
      console.error('Error approving OFV:', error);
      toast.error('Error al aprobar el OFV');
    } finally {
      setApprovingOfv(false);
    }
  };

  const activeBrief = pickApprovedActive(approvedBrief, brief);
  const activePersona = pickApprovedActive(approvedPersona, persona);
  const activeOfv = pickApprovedActive(approvedOfv, ofv);

  const briefApproved = Boolean(activeBrief?.status === 'approved');
  const personaApproved = Boolean(activePersona?.status === 'approved');

  if (loading) {
    return (
      <PageContainer pageTitle='Brief & Persona'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`Brief & Persona — ${client?.business_name || clientId}`}
      pageDescription={`${client?.industry?.replace(/_/g, ' ') || ''} · Generación de contenido con IA`}
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6'>
        <Tabs defaultValue='brief'>
          <TabsList>
            <TabsTrigger value='brief'>Brief</TabsTrigger>
            <TabsTrigger value='persona' disabled={!briefApproved}>
              {!briefApproved && '🔒 '}Buyer Persona
            </TabsTrigger>
            <TabsTrigger value='ofv' disabled={!personaApproved}>
              {!personaApproved && '🔒 '}OFV
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: BRIEF */}
          <TabsContent value='brief' className='mt-4 max-w-3xl space-y-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                <CardTitle className='text-base'>Brief del negocio</CardTitle>
                {brief && <StatusBadge status={brief.status} />}
              </CardHeader>
              <CardContent className='space-y-4'>
                {!brief ? (
                  <div className='py-6 text-center'>
                    <p className='text-muted-foreground mb-4 text-sm'>
                      Genera el brief inicial del negocio con IA basado en el
                      diagnóstico
                    </p>
                    <Button
                      type='button'
                      onClick={handleGenerateBrief}
                      disabled={generatingBrief}
                    >
                      {generatingBrief ? (
                        <>
                          <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                          Generando brief con IA...
                        </>
                      ) : (
                        '✨ Generar Brief'
                      )}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className='mb-2 flex items-center gap-3'>
                      <GeneratedAt date={brief.created_at} />
                      {brief.tokens_used && (
                        <p className='text-muted-foreground text-xs'>
                          {brief.tokens_used} tokens
                        </p>
                      )}
                    </div>
                    <ActiveTruthHint
                      record={brief}
                      approvedRecord={approvedBrief}
                      label='Brief'
                    />
                    <Textarea
                      value={briefText}
                      onChange={(e) => setBriefText(e.target.value)}
                      rows={24}
                      className='bg-muted/30 resize-none font-mono text-xs'
                    />
                    <div className='flex flex-wrap gap-2'>
                      {brief.status !== 'approved' && (
                        <Button
                          type='button'
                          onClick={handleApproveBrief}
                          disabled={approvingBrief}
                          className='bg-green-600 hover:bg-green-700'
                        >
                          {approvingBrief ? (
                            <>
                              <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                              Aprobando...
                            </>
                          ) : (
                            '✓ Aprobar Brief'
                          )}
                        </Button>
                      )}
                      <Button
                        type='button'
                        variant='outline'
                        onClick={handleGenerateBrief}
                        disabled={generatingBrief}
                      >
                        {generatingBrief ? (
                          <>
                            <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                            Regenerando...
                          </>
                        ) : (
                          '🔄 Regenerar'
                        )}
                      </Button>
                    </div>
                    {brief.status === 'approved' && (
                      <p className='text-sm font-medium text-green-700'>
                        ✅ Brief aprobado. Ahora puedes generar la Buyer
                        Persona.
                      </p>
                    )}
                    {brief.status !== 'approved' && approvedBrief && (
                      <p className='text-xs font-medium text-amber-700'>
                        Hay un Brief aprobado anterior que sigue actuando como
                        verdad activa.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: BUYER PERSONA */}
          <TabsContent value='persona' className='mt-4 max-w-3xl space-y-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                <CardTitle className='text-base'>Buyer Persona</CardTitle>
                {persona && <StatusBadge status={persona.status} />}
              </CardHeader>
              <CardContent className='space-y-4'>
                {!briefApproved ? (
                  <div className='py-6 text-center'>
                    <p className='text-muted-foreground text-sm'>
                      🔒 Primero debes aprobar el Brief para generar la Buyer
                      Persona
                    </p>
                  </div>
                ) : !persona ? (
                  <div className='py-6 text-center'>
                    <p className='text-muted-foreground mb-4 text-sm'>
                      Genera el perfil del cliente ideal con IA
                    </p>
                    <Button
                      type='button'
                      onClick={handleGeneratePersona}
                      disabled={generatingPersona}
                    >
                      {generatingPersona ? (
                        <>
                          <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                          Generando buyer persona con IA...
                        </>
                      ) : (
                        '✨ Generar Buyer Persona'
                      )}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className='mb-2 flex items-center gap-3'>
                      <GeneratedAt date={persona.created_at} />
                      {persona.tokens_used && (
                        <p className='text-muted-foreground text-xs'>
                          {persona.tokens_used} tokens
                        </p>
                      )}
                    </div>
                    <ActiveTruthHint
                      record={persona}
                      approvedRecord={approvedPersona}
                      label='Buyer Persona'
                    />
                    <Textarea
                      value={personaText}
                      onChange={(e) => setPersonaText(e.target.value)}
                      rows={24}
                      className='bg-muted/30 resize-none font-mono text-xs'
                    />
                    <div className='flex flex-wrap gap-2'>
                      {persona.status !== 'approved' && (
                        <Button
                          type='button'
                          onClick={handleApprovePersona}
                          disabled={approvingPersona}
                          className='bg-green-600 hover:bg-green-700'
                        >
                          {approvingPersona ? (
                            <>
                              <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                              Aprobando...
                            </>
                          ) : (
                            '✓ Aprobar Buyer Persona'
                          )}
                        </Button>
                      )}
                      <Button
                        type='button'
                        variant='outline'
                        onClick={handleGeneratePersona}
                        disabled={generatingPersona}
                      >
                        {generatingPersona ? (
                          <>
                            <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                            Regenerando...
                          </>
                        ) : (
                          '🔄 Regenerar'
                        )}
                      </Button>
                    </div>
                    {persona.status === 'approved' && (
                      <p className='text-sm font-medium text-green-700'>
                        ✅ Buyer Persona aprobada. Ahora puedes generar el OFV.
                      </p>
                    )}
                    {persona.status !== 'approved' && approvedPersona && (
                      <p className='text-xs font-medium text-amber-700'>
                        Hay una Buyer Persona aprobada anterior que sigue
                        actuando como verdad activa.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: OFV */}
          <TabsContent value='ofv' className='mt-4 max-w-3xl space-y-4'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                <CardTitle className='text-base'>
                  Oferta de Valor (OFV)
                </CardTitle>
                {ofv && <StatusBadge status={ofv.status} />}
              </CardHeader>
              <CardContent className='space-y-4'>
                {!personaApproved ? (
                  <div className='py-6 text-center'>
                    <p className='text-muted-foreground text-sm'>
                      🔒 Primero debes aprobar la Buyer Persona para generar el
                      OFV
                    </p>
                  </div>
                ) : !ofv ? (
                  <div className='py-6 text-center'>
                    <p className='text-muted-foreground mb-4 text-sm'>
                      Genera la propuesta de valor única del negocio con IA
                    </p>
                    <Button
                      type='button'
                      onClick={handleGenerateOfv}
                      disabled={generatingOfv}
                    >
                      {generatingOfv ? (
                        <>
                          <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                          Generando OFV con IA...
                        </>
                      ) : (
                        '✨ Generar OFV'
                      )}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className='mb-2 flex items-center gap-3'>
                      <GeneratedAt date={ofv.created_at} />
                      {ofv.tokens_used && (
                        <p className='text-muted-foreground text-xs'>
                          {ofv.tokens_used} tokens
                        </p>
                      )}
                    </div>
                    <ActiveTruthHint
                      record={ofv}
                      approvedRecord={approvedOfv}
                      label='OFV'
                    />

                    {/* Structured OFV display */}
                    {ofvData &&
                    (ofvData.big_promise || ofvData.vehicle_name) ? (
                      <div className='grid gap-3'>
                        {ofvData.big_promise && (
                          <div className='bg-primary/5 rounded-lg border p-4'>
                            <p className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
                              Gran Promesa
                            </p>
                            <p className='text-sm font-medium'>
                              {ofvData.big_promise}
                            </p>
                          </div>
                        )}
                        {ofvData.vehicle_name && (
                          <div className='rounded-lg border p-4'>
                            <p className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
                              Nombre del Vehículo
                            </p>
                            <p className='text-sm'>{ofvData.vehicle_name}</p>
                          </div>
                        )}
                        {ofvData.quick_win && (
                          <div className='rounded-lg border p-4'>
                            <p className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
                              Quick Win
                            </p>
                            <p className='text-sm'>{ofvData.quick_win}</p>
                          </div>
                        )}
                        {ofvData.guarantee && (
                          <div className='rounded-lg border p-4'>
                            <p className='text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase'>
                              Garantía
                            </p>
                            <p className='text-sm'>{ofvData.guarantee}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Textarea
                        value={ofvText}
                        onChange={(e) => setOfvText(e.target.value)}
                        rows={20}
                        className='bg-muted/30 resize-none font-mono text-xs'
                      />
                    )}

                    <div className='flex flex-wrap gap-2'>
                      {ofv.status !== 'approved' && (
                        <Button
                          type='button'
                          onClick={handleApproveOfv}
                          disabled={approvingOfv}
                          className='bg-green-600 hover:bg-green-700'
                        >
                          {approvingOfv ? (
                            <>
                              <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                              Aprobando...
                            </>
                          ) : (
                            '✓ Aprobar OFV'
                          )}
                        </Button>
                      )}
                      <Button
                        type='button'
                        variant='outline'
                        onClick={handleGenerateOfv}
                        disabled={generatingOfv}
                      >
                        {generatingOfv ? (
                          <>
                            <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                            Regenerando...
                          </>
                        ) : (
                          '🔄 Regenerar'
                        )}
                      </Button>
                    </div>
                    {ofv.status === 'approved' && (
                      <p className='text-sm font-medium text-green-700'>
                        ✅ OFV aprobado. El flujo de contenido está completo.
                      </p>
                    )}
                    {ofv.status !== 'approved' && approvedOfv && (
                      <p className='text-xs font-medium text-amber-700'>
                        Hay un OFV aprobado anterior que sigue actuando como
                        verdad activa.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
