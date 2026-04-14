import PageContainer from '@/components/layout/page-container';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';

interface ClientSummary {
  id: string;
  business_name: string;
  client_code?: string | null;
}

export default function PhotosIndexPage() {
  const { tenantId, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userLoading && tenantId) {
      void loadClients();
    }
  }, [tenantId, userLoading]);

  const loadClients = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('clients')
      .select('id, business_name, client_code')
      .eq('tenant_id', tenantId)
      .order('business_name');

    if (error) {
      toast.error('Error cargando clientes para Fotos');
      setClients([]);
    } else {
      setClients(data || []);
    }
    setLoading(false);
  };

  const filtered = clients.filter((client) => {
    const target = client.business_name.toLowerCase();
    return target.includes(filter.trim().toLowerCase());
  });

  return (
    <PageContainer
      pageTitle='Fotos — elegir cliente'
      pageDescription='Selecciona un cliente para administrar / revisar sus fotos'
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6 max-w-4xl'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Clientes</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <Input
              placeholder='Buscar cliente...'
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />

            {loading ? (
              <p className='text-sm text-muted-foreground'>Cargando...</p>
            ) : filtered.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No hay clientes para mostrar.
              </p>
            ) : (
              <div className='space-y-2'>
                {filtered.map((client) => (
                  <div
                    key={client.id}
                    className='flex items-center justify-between rounded-lg border p-3'
                  >
                    <div>
                      <p className='font-medium'>{client.business_name}</p>
                      {client.client_code && (
                        <p className='text-xs text-muted-foreground'>
                          Código: {client.client_code}
                        </p>
                      )}
                    </div>
                    <Button asChild size='sm'>
                      <Link href={`/photos/${client.id}`}>
                        Ver fotos
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
