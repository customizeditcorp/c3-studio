'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import PageContainer from '@/components/layout/page-container';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import ClientForm from '@/components/clients/ClientForm';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  diagnosed: 'Diagnosticado',
  negotiating: 'Negociando',
  onboarding: 'Onboarding',
  active: 'Activo',
  churned: 'Perdido'
};

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  lead: 'secondary',
  diagnosed: 'outline',
  negotiating: 'outline',
  onboarding: 'default',
  active: 'default',
  churned: 'destructive'
};

type Client = {
  id: string;
  business_name: string;
  industry: string;
  contact_first_name: string;
  phone: string;
  status: string;
  tier: string | null;
  created_at: string;
};

export default function ClientsPage() {
  const { tenantId, loading: userLoading } = useUser();
  const supabase = useMemo(() => createSupabaseClient(), []);
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);

  const fetchClients = useCallback(
    async (cancelled: { current: boolean }) => {
      if (!tenantId) {
        if (!cancelled.current) {
          setClients([]);
          setLoading(false);
        }
        return;
      }
      if (!cancelled.current) setLoading(true);
      try {
        let query = supabase
          .from('clients')
          .select(
            'id, business_name, industry, contact_first_name, phone, status, tier, created_at'
          )
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false });

        if (statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;
        if (cancelled.current) return;
        if (error) {
          console.error('Error fetching clients:', error);
          toast.error('Error al cargar clientes');
        }
        if (data) setClients(data);
      } catch (err) {
        if (!cancelled.current) {
          console.error('Error fetching clients:', err);
          toast.error('Error al cargar clientes');
        }
      } finally {
        if (!cancelled.current) setLoading(false);
      }
    },
    [supabase, tenantId, statusFilter]
  );

  useEffect(() => {
    if (userLoading) return;
    const cancelled = { current: false };
    void fetchClients(cancelled);
    return () => {
      cancelled.current = true;
    };
  }, [userLoading, fetchClients]);

  const filteredClients = clients.filter(
    (c) =>
      !search ||
      c.business_name.toLowerCase().includes(search.toLowerCase()) ||
      c.contact_first_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageContainer
      pageTitle='Clientes'
      pageDescription='Gestiona todos los clientes de C3 Local Marketing'
      pageHeaderAction={
        <Button
          disabled={userLoading || !tenantId}
          title={
            !tenantId && !userLoading
              ? 'Asigna tenant_id a tu usuario en Supabase para crear clientes'
              : undefined
          }
          onClick={() => {
            if (!tenantId) {
              return;
            }
            setShowNewClientDialog(true);
          }}
        >
          <Icons.add className='mr-2 h-4 w-4' />
          Nuevo Cliente
        </Button>
      }
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6'>
        {!userLoading && !tenantId ? (
          <p className='text-destructive text-sm'>
            No hay organización asociada a tu perfil. No se listan clientes
            hasta que un administrador complete tu usuario en la base de datos.
          </p>
        ) : null}
        {/* Filters */}
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <Input
            placeholder='Buscar por nombre...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='max-w-xs'
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className='w-[180px]'>
              <SelectValue placeholder='Filtrar por estado' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>Todos</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Negocio</TableHead>
                <TableHead>Industria</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className='py-8 text-center'>
                    <span className='text-muted-foreground'>Cargando...</span>
                  </TableCell>
                </TableRow>
              ) : filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className='py-8 text-center'>
                    <span className='text-muted-foreground'>
                      No se encontraron clientes
                    </span>
                  </TableCell>
                </TableRow>
              ) : (
                filteredClients.map((client) => (
                  <TableRow
                    key={client.id}
                    className='hover:bg-muted/50 cursor-pointer'
                    onClick={() => router.push(`/clients/${client.id}`)}
                  >
                    <TableCell className='font-medium'>
                      {client.business_name}
                    </TableCell>
                    <TableCell className='capitalize'>
                      {client.industry?.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>{client.contact_first_name || '—'}</TableCell>
                    <TableCell>{client.phone || '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANTS[client.status] || 'secondary'}
                      >
                        {STATUS_LABELS[client.status] || client.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className='text-muted-foreground text-sm capitalize'>
                        {client.tier?.replace(/_/g, ' ') || '—'}
                      </span>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {new Date(client.created_at).toLocaleDateString('es-MX')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* New Client Dialog */}
      <Dialog open={showNewClientDialog} onOpenChange={setShowNewClientDialog}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Nuevo Cliente</DialogTitle>
          </DialogHeader>
          <ClientForm
            onSuccess={(clientId) => {
              setShowNewClientDialog(false);
              void fetchClients({ current: false });
              router.push(`/clients/${clientId}`);
            }}
            onCancel={() => setShowNewClientDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
