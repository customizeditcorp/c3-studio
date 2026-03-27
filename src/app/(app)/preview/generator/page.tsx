'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';

type Client = {
  id: string;
  business_name: string;
};

type Preview = {
  id: string;
  token: string;
  client_id: string;
  preview_type: string;
  expires_at: string;
  approved: boolean;
  created_at: string;
};

export default function PreviewGeneratorPage() {
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [previewType, setPreviewType] = useState('gbp');
  const [generatedPreviews, setGeneratedPreviews] = useState<Preview[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!userLoading && tenantId) {
      loadData();
    }
  }, [tenantId, userLoading]);

  const loadData = async () => {
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, business_name')
      .eq('tenant_id', tenantId)
      .order('business_name');
    if (clientsData) setClients(clientsData);

    const clientIds = clientsData?.map((c) => c.id) ?? [];
    let previewsData: Preview[] = [];
    if (clientIds.length > 0) {
      const { data } = await supabase
        .from('previews')
        .select('*')
        .in('client_id', clientIds)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) previewsData = data;
    }
    setGeneratedPreviews(previewsData);

    setLoading(false);
  };

  const generatePreview = async () => {
    if (!tenantId || !user || !selectedClientId) {
      toast.error('Selecciona un cliente');
      return;
    }

    setGenerating(true);
    try {
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

      const { data: preview, error } = await supabase
        .from('previews')
        .insert({
          client_id: selectedClientId,
          token,
          preview_type: previewType,
          expires_at: expiresAt.toISOString(),
          approved: false,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'preview_created',
        entityType: 'preview',
        entityId: preview.id,
        clientId: selectedClientId,
        metadata: { preview_type: previewType, token }
      });

      setGeneratedPreviews((prev) => [preview, ...prev]);
      toast.success('Preview generado');
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Error al generar el preview');
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (token: string, previewId: string) => {
    const url = `${window.location.origin}/preview/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedId(previewId);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success('Link copiado al portapapeles');
  };

  if (loading) {
    return (
      <PageContainer pageTitle='Generador de Previews'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle='Generador de Previews'
      pageDescription='Genera links de preview para compartir con clientes'
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6 max-w-3xl'>
        {/* Generator */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Nuevo Preview</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label>Cliente</Label>
              <Select
                value={selectedClientId}
                onValueChange={setSelectedClientId}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Seleccionar cliente...' />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label>Tipo de preview</Label>
              <Select value={previewType} onValueChange={setPreviewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='gbp'>GBP Profile</SelectItem>
                  <SelectItem value='website'>Website</SelectItem>
                  <SelectItem value='combined'>Combinado (GBP + Website)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={generatePreview}
              disabled={generating || !selectedClientId}
              className='w-full'
            >
              {generating ? 'Generando...' : '🔗 Generar Preview Link'}
            </Button>
          </CardContent>
        </Card>

        {/* Recent Previews */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Previews recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {generatedPreviews.length === 0 ? (
              <p className='text-sm text-muted-foreground py-4 text-center'>
                No hay previews generados todavía
              </p>
            ) : (
              <div className='space-y-3'>
                {generatedPreviews.map((preview) => {
                  const client = clients.find(
                    (c) => c.id === preview.client_id
                  );
                  const isExpired = new Date(preview.expires_at) < new Date();
                  return (
                    <div
                      key={preview.id}
                      className='flex items-center justify-between rounded-lg border p-3'
                    >
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm font-medium truncate'>
                          {client?.business_name || 'Cliente desconocido'}
                        </p>
                        <div className='flex items-center gap-2 mt-1'>
                          <Badge
                            variant={
                              preview.approved ? 'default' : 'secondary'
                            }
                            className='text-xs'
                          >
                            {preview.approved ? '✓ Aprobado' : 'Pendiente'}
                          </Badge>
                          <span className='text-xs text-muted-foreground capitalize'>
                            {preview.preview_type}
                          </span>
                          {isExpired && (
                            <Badge
                              variant='destructive'
                              className='text-xs'
                            >
                              Expirado
                            </Badge>
                          )}
                        </div>
                        <p className='text-xs text-muted-foreground mt-0.5'>
                          Expira:{' '}
                          {new Date(preview.expires_at).toLocaleDateString(
                            'es-MX'
                          )}
                        </p>
                      </div>
                      <div className='flex gap-2 ml-3'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => copyLink(preview.token, preview.id)}
                          disabled={isExpired}
                        >
                          {copiedId === preview.id ? '✓ Copiado' : 'Copiar link'}
                        </Button>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() =>
                            window.open(`/preview/${preview.token}`, '_blank')
                          }
                          disabled={isExpired}
                        >
                          Ver
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
