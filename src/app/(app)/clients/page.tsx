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
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const supabase = createSupabaseClient();
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showNewClientDialog, setShowNewClientDialog] = useState(false);

  const fetchClients = async () => {
    if (!tenantId) return;
    setLoading(true);
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
    if (!error && data) {
      setClients(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!userLoading && tenantId) {
      fetchClients();
    }
  }, [tenantId, userLoading, statusFilter]);

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
        <Button onClick={() => setShowNewClientDialog(true)}>
          <Icons.add className='mr-2 h-4 w-4' />
          Nuevo Cliente
        </Button>
      }
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6'>
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
                    className='cursor-pointer hover:bg-muted/50'
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
                        variant={
                          STATUS_VARIANTS[client.status] || 'secondary'
                        }
                      >
                        {STATUS_LABELS[client.status] || client.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className='capitalize text-sm text-muted-foreground'>
                        {client.tier?.replace(/_/g, ' ') || '—'}
                      </span>
                    </TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
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
      <Dialog
        open={showNewClientDialog}
        onOpenChange={setShowNewClientDialog}
      >
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Nuevo Cliente</DialogTitle>
          </DialogHeader>
          <ClientForm
            onSuccess={(clientId) => {
              setShowNewClientDialog(false);
              fetchClients();
              router.push(`/clients/${clientId}`);
            }}
            onCancel={() => setShowNewClientDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
