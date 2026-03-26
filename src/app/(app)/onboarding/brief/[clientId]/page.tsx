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
import { generateContent } from '@/lib/edge-functions';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';

type ContentRecord = {
  id: string;
  content: string;
  status: string;
  created_at: string;
  tokens_used?: number | null;
};

type OFVData = {
  big_promise?: string;
  vehicle_name?: string;
  quick_win?: string;
  guarantee?: string;
  [key: string]: string | undefined;
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved') {
    return (
      <Badge className='bg-green-100 text-green-800 border-green-200'>
        Aprobado ✓
      </Badge>
    );
  }
  return <Badge variant='outline'>Borrador</Badge>;
}

function GeneratedAt({ date }: { date: string }) {
  return (
    <p className='text-xs text-muted-foreground'>
      Generado: {new Date(date).toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}
    </p>
  );
}

export default function BriefPage() {
  const { clientId } = useParams<{ clientId: string }>();
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
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [approvingBrief, setApprovingBrief] = useState(false);

  // Persona state
  const [persona, setPersona] = useState<ContentRecord | null>(null);
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [approvingPersona, setApprovingPersona] = useState(false);

  // OFV state
  const [ofv, setOfv] = useState<ContentRecord | null>(null);
  const [ofvData, setOfvData] = useState<OFVData | null>(null);
  const [generatingOfv, setGeneratingOfv] = useState(false);
  const [approvingOfv, setApprovingOfv] = useState(false);

  useEffect(() => {
    if (!userLoading && tenantId && clientId) {
      loadData();
    }
  }, [tenantId, userLoading, clientId]);

  const loadData = async () => {
    // Load client
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, business_name, industry')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .single();
    if (clientData) setClient(clientData);

    // Load latest brief
    const { data: briefData } = await supabase
      .from('briefs')
      .select('id, content, status, created_at, tokens_used')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (briefData) setBrief(briefData);

    // Load latest persona
    const { data: personaData } = await supabase
      .from('buyer_personas')
      .select('id, content, status, created_at, tokens_used')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (personaData) setPersona(personaData);

    // Load latest offer/OFV
    const { data: ofvDbData } = await supabase
      .from('offers')
      .select('id, content, status, created_at, tokens_used')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ofvDbData) {
      setOfv(ofvDbData);
      if (ofvDbData.content) {
        try {
          const parsed = JSON.parse(ofvDbData.content);
          setOfvData(parsed);
        } catch {
          setOfvData({ raw: ofvDbData.content });
        }
      }
    }

    setLoading(false);
  };

  // BRIEF actions
  const handleGenerateBrief = async () => {
    if (!tenantId || !user) return;
    setGeneratingBrief(true);
    try {
      const result = await generateContent({ step: 'brief', clientId }) as {
        content?: string;
        tokens_used?: number;
        record_id?: string;
      };

      // Re-fetch latest brief from DB after generation
      const { data: newBrief } = await supabase
        .from('briefs')
        .select('id, content, status, created_at, tokens_used')
        .eq('client_id', clientId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newBrief) {
        setBrief(newBrief);
      } else if (result.content) {
        // Fallback: create a local record
        setBrief({
          id: result.record_id || 'temp',
          content: result.content,
          status: 'draft',
          created_at: new Date().toISOString(),
          tokens_used: result.tokens_used
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
      toast.error(`Error al generar el brief: ${error instanceof Error ? error.message : 'Error desconocido'}`);
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
        .eq('id', brief.id)
        .eq('tenant_id', tenantId);

      setBrief((prev) => prev ? { ...prev, status: 'approved' } : prev);

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
    if (!tenantId || !user) return;
    setGeneratingPersona(true);
    try {
      const result = await generateContent({ step: 'buyer_persona', clientId }) as {
        content?: string;
        tokens_used?: number;
        record_id?: string;
      };

      const { data: newPersona } = await supabase
        .from('buyer_personas')
        .select('id, content, status, created_at, tokens_used')
        .eq('client_id', clientId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newPersona) {
        setPersona(newPersona);
      } else if (result.content) {
        setPersona({
          id: result.record_id || 'temp',
          content: result.content,
          status: 'draft',
          created_at: new Date().toISOString(),
          tokens_used: result.tokens_used
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
      toast.error(`Error al generar la persona: ${error instanceof Error ? error.message : 'Error desconocido'}`);
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
        .eq('id', persona.id)
        .eq('tenant_id', tenantId);

      setPersona((prev) => prev ? { ...prev, status: 'approved' } : prev);

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
    if (!tenantId || !user) return;
    setGeneratingOfv(true);
    try {
      const result = await generateContent({ step: 'ofv', clientId }) as {
        content?: string;
        tokens_used?: number;
        record_id?: string;
      };

      const { data: newOfv } = await supabase
        .from('offers')
        .select('id, content, status, created_at, tokens_used')
        .eq('client_id', clientId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (newOfv) {
        setOfv(newOfv);
        if (newOfv.content) {
          try {
            setOfvData(JSON.parse(newOfv.content));
          } catch {
            setOfvData({ raw: newOfv.content });
          }
        }
      } else if (result.content) {
        setOfv({
          id: result.record_id || 'temp',
          content: result.content,
          status: 'draft',
          created_at: new Date().toISOString(),
          tokens_used: result.tokens_used
        });
        try {
          setOfvData(JSON.parse(result.content));
        } catch {
          setOfvData({ raw: result.content });
        }
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
      toast.error(`Error al generar el OFV: ${error instanceof Error ? error.message : 'Error desconocido'}`);
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
        .eq('id', ofv.id)
        .eq('tenant_id', tenantId);

      setOfv((prev) => prev ? { ...prev, status: 'approved' } : prev);

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

  const briefApproved = brief?.status === 'approved';
  const personaApproved = persona?.status === 'approved';

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
          <TabsContent value='brief' className='mt-4 space-y-4 max-w-3xl'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                <CardTitle className='text-base'>Brief del negocio</CardTitle>
                {brief && <StatusBadge status={brief.status} />}
              </CardHeader>
              <CardContent className='space-y-4'>
                {!brief ? (
                  <div className='text-center py-6'>
                    <p className='text-muted-foreground text-sm mb-4'>
                      Genera el brief inicial del negocio con IA basado en el diagnóstico
                    </p>
                    <Button
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
                    <div className='flex items-center gap-3 mb-2'>
                      <GeneratedAt date={brief.created_at} />
                      {brief.tokens_used && (
                        <p className='text-xs text-muted-foreground'>
                          {brief.tokens_used} tokens
                        </p>
                      )}
                    </div>
                    <Textarea
                      value={brief.content}
                      readOnly
                      rows={16}
                      className='font-mono text-xs bg-muted/30 resize-none'
                    />
                    <div className='flex gap-2 flex-wrap'>
                      {brief.status !== 'approved' && (
                        <Button
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
                      <p className='text-sm text-green-700 font-medium'>
                        ✅ Brief aprobado. Ahora puedes generar la Buyer Persona.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: BUYER PERSONA */}
          <TabsContent value='persona' className='mt-4 space-y-4 max-w-3xl'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                <CardTitle className='text-base'>Buyer Persona</CardTitle>
                {persona && <StatusBadge status={persona.status} />}
              </CardHeader>
              <CardContent className='space-y-4'>
                {!briefApproved ? (
                  <div className='text-center py-6'>
                    <p className='text-muted-foreground text-sm'>
                      🔒 Primero debes aprobar el Brief para generar la Buyer Persona
                    </p>
                  </div>
                ) : !persona ? (
                  <div className='text-center py-6'>
                    <p className='text-muted-foreground text-sm mb-4'>
                      Genera el perfil del cliente ideal con IA
                    </p>
                    <Button
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
                    <div className='flex items-center gap-3 mb-2'>
                      <GeneratedAt date={persona.created_at} />
                      {persona.tokens_used && (
                        <p className='text-xs text-muted-foreground'>
                          {persona.tokens_used} tokens
                        </p>
                      )}
                    </div>
                    <Textarea
                      value={persona.content}
                      readOnly
                      rows={16}
                      className='font-mono text-xs bg-muted/30 resize-none'
                    />
                    <div className='flex gap-2 flex-wrap'>
                      {persona.status !== 'approved' && (
                        <Button
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
                      <p className='text-sm text-green-700 font-medium'>
                        ✅ Buyer Persona aprobada. Ahora puedes generar el OFV.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: OFV */}
          <TabsContent value='ofv' className='mt-4 space-y-4 max-w-3xl'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0'>
                <CardTitle className='text-base'>Oferta de Valor (OFV)</CardTitle>
                {ofv && <StatusBadge status={ofv.status} />}
              </CardHeader>
              <CardContent className='space-y-4'>
                {!personaApproved ? (
                  <div className='text-center py-6'>
                    <p className='text-muted-foreground text-sm'>
                      🔒 Primero debes aprobar la Buyer Persona para generar el OFV
                    </p>
                  </div>
                ) : !ofv ? (
                  <div className='text-center py-6'>
                    <p className='text-muted-foreground text-sm mb-4'>
                      Genera la propuesta de valor única del negocio con IA
                    </p>
                    <Button
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
                    <div className='flex items-center gap-3 mb-2'>
                      <GeneratedAt date={ofv.created_at} />
                      {ofv.tokens_used && (
                        <p className='text-xs text-muted-foreground'>
                          {ofv.tokens_used} tokens
                        </p>
                      )}
                    </div>

                    {/* Structured OFV display */}
                    {ofvData && (ofvData.big_promise || ofvData.vehicle_name) ? (
                      <div className='grid gap-3'>
                        {ofvData.big_promise && (
                          <div className='rounded-lg border p-4 bg-primary/5'>
                            <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1'>
                              Gran Promesa
                            </p>
                            <p className='text-sm font-medium'>{ofvData.big_promise}</p>
                          </div>
                        )}
                        {ofvData.vehicle_name && (
                          <div className='rounded-lg border p-4'>
                            <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1'>
                              Nombre del Vehículo
                            </p>
                            <p className='text-sm'>{ofvData.vehicle_name}</p>
                          </div>
                        )}
                        {ofvData.quick_win && (
                          <div className='rounded-lg border p-4'>
                            <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1'>
                              Quick Win
                            </p>
                            <p className='text-sm'>{ofvData.quick_win}</p>
                          </div>
                        )}
                        {ofvData.guarantee && (
                          <div className='rounded-lg border p-4'>
                            <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1'>
                              Garantía
                            </p>
                            <p className='text-sm'>{ofvData.guarantee}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Textarea
                        value={ofv.content}
                        readOnly
                        rows={12}
                        className='font-mono text-xs bg-muted/30 resize-none'
                      />
                    )}

                    <div className='flex gap-2 flex-wrap'>
                      {ofv.status !== 'approved' && (
                        <Button
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
                      <p className='text-sm text-green-700 font-medium'>
                        ✅ OFV aprobado. El flujo de contenido está completo.
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
