'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageContainer from '@/components/layout/page-container';
import { Progress } from '@/components/ui/progress';
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
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

const CHECKLIST_ITEMS = [
  {
    id: 'google_account',
    label: 'Google Account (Gmail)',
    required: true,
    description: 'Cuenta Google del negocio'
  },
  {
    id: 'gbp_access',
    label: 'Acceso a Google Business Profile',
    required: true,
    description: 'Acceso al GBP del negocio'
  },
  {
    id: 'cslb_license',
    label: 'Licencia CSLB',
    required: false,
    description: 'Número de licencia CSLB de California'
  },
  {
    id: 'city_license',
    label: 'Licencia de la ciudad',
    required: false,
    description: 'Licencia municipal del negocio'
  },
  {
    id: 'sos_registration',
    label: 'Registro CA SOS',
    required: false,
    description: 'Registro con el Secretario de Estado de California'
  },
  {
    id: 'website_access',
    label: 'Acceso al sitio web',
    required: false,
    description: 'Credenciales del sitio web / hosting'
  },
  {
    id: 'social_media',
    label: 'Redes Sociales',
    required: false,
    description: 'Facebook, Instagram, etc.'
  },
  {
    id: 'domain_access',
    label: 'Acceso al dominio',
    required: false,
    description: 'GoDaddy, Namecheap, Cloudflare, etc.'
  }
];

export default function CredentialsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [client, setClient] = useState<{
    id: string;
    business_name: string;
  } | null>(null);
  const [entityType, setEntityType] = useState('self_employment');
  const [legalName, setLegalName] = useState('');
  const [dbaNumber, setDbaNumber] = useState('');
  const [cslbNumber, setCslbNumber] = useState('');
  const [cityLicense, setCityLicense] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userLoading && tenantId && clientId) {
      loadData();
    }
  }, [tenantId, userLoading, clientId]);

  const loadData = async () => {
    // Load client
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, business_name')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .single();
    if (clientData) setClient(clientData);

    // Load existing credentials
    const { data: credData } = await supabase
      .from('credentials')
      .select('*')
      .eq('client_id', clientId)
      .single();

    if (credData) {
      setCredentialId(credData.id);
      setEntityType(credData.entity_type || 'self_employment');
      setLegalName(credData.legal_name || '');
      setDbaNumber(credData.dba_number || '');
      setCslbNumber(credData.cslb_number || '');
      setCityLicense(credData.city_license || '');
      // Parse checklist from items_completed
      if (credData.items_completed) {
        const items: Record<string, boolean> = {};
        (credData.items_completed as string[]).forEach((item: string) => {
          items[item] = true;
        });
        setChecklist(items);
      }
    }
    setLoading(false);
  };

  const completedCount = CHECKLIST_ITEMS.filter(
    (item) => checklist[item.id]
  ).length;
  const missingRequired = CHECKLIST_ITEMS.filter(
    (item) => item.required && !checklist[item.id]
  );

  const handleToggle = async (itemId: string, checked: boolean) => {
    const newChecklist = { ...checklist, [itemId]: checked };
    setChecklist(newChecklist);
    await autoSave(newChecklist);
  };

  const autoSave = async (newChecklist: Record<string, boolean>) => {
    if (!tenantId || !user) return;

    const completedItems = Object.entries(newChecklist)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const data = {
      client_id: clientId,
      entity_type: entityType,
      legal_name: legalName,
      dba_number: dbaNumber,
      cslb_number: cslbNumber,
      city_license: cityLicense,
      items_completed: completedItems,
      items_total: CHECKLIST_ITEMS.length,
      updated_at: new Date().toISOString()
    };

    try {
      if (credentialId) {
        await supabase
          .from('credentials')
          .update(data)
          .eq('id', credentialId);
      } else {
        const { data: newCred } = await supabase
          .from('credentials')
          .insert(data)
          .select()
          .single();
        if (newCred) setCredentialId(newCred.id);
      }

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'credentials_updated',
        entityType: 'credential',
        entityId: credentialId || clientId,
        clientId,
        metadata: { items_completed: completedItems.length }
      });
    } catch (error) {
      console.error('Error auto-saving credentials:', error);
    }
  };

  const handleSave = async () => {
    if (!tenantId || !user) return;
    await autoSave(checklist);
    toast.success('Credenciales guardadas');
  };

  if (loading) {
    return (
      <PageContainer pageTitle='Credenciales'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      pageTitle={`Credenciales — ${client?.business_name || clientId}`}
      pageDescription='Checklist de credenciales para onboarding'
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6 max-w-3xl'>
        {/* Progress */}
        <Card>
          <CardContent className='pt-4'>
            <div className='flex items-center justify-between mb-2'>
              <span className='text-sm font-medium'>
                {completedCount} / {CHECKLIST_ITEMS.length} completado
              </span>
              <Badge
                variant={
                  completedCount === CHECKLIST_ITEMS.length
                    ? 'default'
                    : 'secondary'
                }
              >
                {Math.round((completedCount / CHECKLIST_ITEMS.length) * 100)}%
              </Badge>
            </div>
            <Progress
              value={(completedCount / CHECKLIST_ITEMS.length) * 100}
              className='h-2'
            />
          </CardContent>
        </Card>

        {missingRequired.length > 0 && (
          <Alert variant='destructive'>
            <AlertDescription>
              Faltan ítems requeridos:{' '}
              {missingRequired.map((i) => i.label).join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Entity Type */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Tipo de entidad</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label>Tipo de entidad legal</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='self_employment'>
                    Self Employment
                  </SelectItem>
                  <SelectItem value='llc'>LLC</SelectItem>
                  <SelectItem value='s_corp'>S-Corp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label>Nombre legal del negocio</Label>
                <Input
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder='Anderson Roofing LLC'
                />
              </div>
              {(entityType === 'llc' || entityType === 's_corp') && (
                <div className='space-y-2'>
                  <Label>Número DBA</Label>
                  <Input
                    value={dbaNumber}
                    onChange={(e) => setDbaNumber(e.target.value)}
                    placeholder='DBA-123456'
                  />
                </div>
              )}
              <div className='space-y-2'>
                <Label>Número CSLB</Label>
                <Input
                  value={cslbNumber}
                  onChange={(e) => setCslbNumber(e.target.value)}
                  placeholder='1012345'
                />
              </div>
              <div className='space-y-2'>
                <Label>Licencia de la ciudad</Label>
                <Input
                  value={cityLicense}
                  onChange={(e) => setCityLicense(e.target.value)}
                  placeholder='BL-2024-001'
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Checklist de credenciales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              {CHECKLIST_ITEMS.map((item) => (
                <div
                  key={item.id}
                  className='flex items-start gap-3 rounded-lg border p-3'
                >
                  <Checkbox
                    id={item.id}
                    checked={!!checklist[item.id]}
                    onCheckedChange={(checked) =>
                      handleToggle(item.id, !!checked)
                    }
                    className='mt-0.5'
                  />
                  <div className='flex-1'>
                    <div className='flex items-center gap-2'>
                      <Label
                        htmlFor={item.id}
                        className='cursor-pointer font-medium'
                      >
                        {item.label}
                      </Label>
                      {item.required && (
                        <Badge variant='destructive' className='text-xs'>
                          Requerido
                        </Badge>
                      )}
                    </div>
                    <p className='text-xs text-muted-foreground mt-0.5'>
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button onClick={handleSave}>Guardar Credenciales</Button>
      </div>
    </PageContainer>
  );
}
