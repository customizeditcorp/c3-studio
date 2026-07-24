'use client';

import { useState, useEffect } from 'react';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ClientAsset, AssetType, AssetStatus } from '@/types/c3-domain';

interface ClientAssetHubProps {
  clientId: string;
  tenantId: string;
}

const ASSET_TYPES: AssetType[] = ['gbp', 'website', 'seo', 'geo', 'social'];

// Canales sin wiring todavía: nunca avanzan de estado. Se muestran como
// 'Próximamente' en vez de arrastrar el badge de status crudo ('Pendiente'),
// que haría pasar por trackeado-pero-estancado algo que aún no existe (F-094).
const COMING_SOON_ASSET_TYPES: AssetType[] = ['seo', 'geo', 'social'];

const ASSET_META: Record<AssetType, { label: string; description: string }> = {
  gbp: {
    label: 'Google Business Profile',
    description: 'Perfil en Google Maps y búsqueda local'
  },
  website: {
    label: 'Sitio Web',
    description: 'Presencia web propietaria del negocio'
  },
  seo: {
    label: 'Estrategia SEO',
    description: 'Posicionamiento en motores de búsqueda'
  },
  geo: {
    label: 'GEO',
    description: 'Visibilidad en motores generativos (ChatGPT, Perplexity)'
  },
  social: {
    label: 'Redes Sociales',
    description: 'Gestión de presencia en redes'
  }
};

const STATUS_META: Record<
  AssetStatus,
  {
    label: string;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
  }
> = {
  locked: { label: 'Bloqueado', variant: 'secondary' },
  pending: { label: 'Pendiente', variant: 'outline' },
  in_progress: { label: 'En proceso', variant: 'default' },
  review: { label: 'En revisión', variant: 'default' },
  approved: { label: 'Aprobado', variant: 'default' },
  live: { label: 'Activo', variant: 'default' }
};

export function ClientAssetHub({ clientId, tenantId }: ClientAssetHubProps) {
  const supabase = createSupabaseClient();
  const [assets, setAssets] = useState<ClientAsset[]>([]);
  const [brandboardApproved, setBrandboardApproved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function loadAssets() {
    setLoading(true);

    const [{ data: existingAssets }, { data: brandboardData }] =
      await Promise.all([
        supabase
          .from('client_assets')
          .select('*')
          .eq('client_id', clientId)
          .order('asset_type'),
        supabase
          .from('brandboards')
          .select('id')
          .eq('client_id', clientId)
          .eq('status', 'approved')
          .limit(1)
          .maybeSingle()
      ]);

    const isBrandboardApproved = !!brandboardData;
    setBrandboardApproved(isBrandboardApproved);

    if (!existingAssets || existingAssets.length === 0) {
      const initialStatus = isBrandboardApproved ? 'pending' : 'locked';
      const rows = ASSET_TYPES.map((type) => ({
        client_id: clientId,
        tenant_id: tenantId,
        asset_type: type,
        status: initialStatus,
        metadata: {}
      }));

      await supabase.from('client_assets').upsert(rows, {
        onConflict: 'client_id,asset_type',
        ignoreDuplicates: true
      });

      const { data: seeded } = await supabase
        .from('client_assets')
        .select('*')
        .eq('client_id', clientId)
        .order('asset_type');

      setAssets((seeded as ClientAsset[]) ?? []);
      setLoading(false);
      return;
    }

    if (
      isBrandboardApproved &&
      existingAssets.some((a) => a.status === 'locked')
    ) {
      await supabase
        .from('client_assets')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('client_id', clientId)
        .eq('status', 'locked');

      const { data: updated } = await supabase
        .from('client_assets')
        .select('*')
        .eq('client_id', clientId)
        .order('asset_type');

      setAssets((updated as ClientAsset[]) ?? []);
      setLoading(false);
      return;
    }

    setAssets((existingAssets as ClientAsset[]) ?? []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className='py-8 text-center'>
        <p className='text-muted-foreground text-sm'>
          Cargando presencia digital...
        </p>
      </div>
    );
  }

  return (
    <div>
      {!brandboardApproved && (
        <Alert className='mb-4'>
          <AlertDescription>
            Aprueba el Brandboard del cliente para desbloquear los assets de
            presencia digital.
          </AlertDescription>
        </Alert>
      )}

      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
        {ASSET_TYPES.map((type) => {
          const asset = assets.find((a) => a.asset_type === type);
          const meta = ASSET_META[type];
          const status = asset?.status ?? 'locked';
          const statusMeta = STATUS_META[status];
          const isComingSoon = COMING_SOON_ASSET_TYPES.includes(type);

          return (
            <Card
              key={type}
              className={
                status === 'locked' || isComingSoon ? 'opacity-60' : ''
              }
            >
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between'>
                  <CardTitle className='text-sm font-medium'>
                    {meta.label}
                  </CardTitle>
                  {isComingSoon ? (
                    <Badge variant='secondary'>Próximamente</Badge>
                  ) : (
                    <Badge variant={statusMeta.variant}>
                      {statusMeta.label}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className='text-muted-foreground text-xs'>
                  {meta.description}
                </p>
                {isComingSoon ? (
                  <p className='text-muted-foreground mt-2 text-xs'>
                    No disponible aún
                  </p>
                ) : (
                  status === 'locked' && (
                    <p className='text-muted-foreground mt-2 text-xs'>
                      🔒 Requiere brandboard aprobado
                    </p>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
