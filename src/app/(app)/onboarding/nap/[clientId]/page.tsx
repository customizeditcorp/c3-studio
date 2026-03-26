'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageContainer from '@/components/layout/page-container';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

const NAP_CHECKLIST = [
  {
    id: 'name_consistent',
    label: 'Nombre del negocio consistente en todos los sitios',
    description: 'El nombre aparece igual en Google, Yelp, Facebook, etc.'
  },
  {
    id: 'address_consistent',
    label: 'Dirección consistente',
    description: 'Misma dirección formateada en todos los directorios'
  },
  {
    id: 'phone_consistent',
    label: 'Teléfono consistente',
    description: 'Mismo número de teléfono en todos los sitios'
  },
  {
    id: 'cslb_matches',
    label: 'Nombre en CSLB coincide con GBP',
    description: 'El nombre registrado en CSLB es el mismo del GBP'
  },
  {
    id: 'sos_matches',
    label: 'Nombre en CA SOS coincide con GBP',
    description: 'El nombre registrado en SOS coincide'
  },
  {
    id: 'no_duplicates',
    label: 'Sin perfiles duplicados',
    description: 'No hay duplicados en Google Business Profile'
  }
];

function getRiskLevel(passed: number, total: number) {
  if (passed === total)
    return { level: 'low', label: 'Bajo Riesgo', color: 'default' as const };
  if (passed === 0)
    return {
      level: 'high',
      label: 'Alto Riesgo',
      color: 'destructive' as const
    };
  return {
    level: 'medium',
    label: 'Riesgo Medio',
    color: 'secondary' as const
  };
}

export default function NAPPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [client, setClient] = useState<{
    id: string;
    business_name: string;
    phone?: string;
  } | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState('');
  const [napCheckId, setNapCheckId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userLoading && tenantId && clientId) {
      loadData();
    }
  }, [tenantId, userLoading, clientId]);

  const loadData = async () => {
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, business_name, phone')
      .eq('id', clientId)
      .eq('tenant_id', tenantId)
      .single();

    if (clientData) {
      setClient(clientData);
      setBusinessName(clientData.business_name);
    }

    const { data: napData } = await supabase
      .from('nap_checks')
      .select('*')
      .eq('client_id', clientId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (napData) {
      setNapCheckId(napData.id);
      setCity(napData.city || '');
      setNotes(napData.notes || '');
      if (napData.check_items) {
        const items: Record<string, boolean> = {};
        (napData.check_items as string[]).forEach((item: string) => {
          items[item] = true;
        });
        setChecklist(items);
      }
    }
    setLoading(false);
  };

  const passedCount = NAP_CHECKLIST.filter(
    (item) => checklist[item.id]
  ).length;
  const risk = getRiskLevel(passedCount, NAP_CHECKLIST.length);

  const handleSave = async () => {
    if (!tenantId || !user) return;
    setSaving(true);

    const passedItems = Object.entries(checklist)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const data = {
      tenant_id: tenantId,
      client_id: clientId,
      business_name: businessName,
      city,
      check_items: passedItems,
      items_passed: passedCount,
      items_total: NAP_CHECKLIST.length,
      risk_level: risk.level,
      notes,
      completed_by: user.id
    };

    try {
      if (napCheckId) {
        await supabase
          .from('nap_checks')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', napCheckId)
          .eq('tenant_id', tenantId);
      } else {
        const { data: newCheck } = await supabase
          .from('nap_checks')
          .insert(data)
          .select()
          .single();
        if (newCheck) setNapCheckId(newCheck.id);
      }

      await logActivity({
        tenantId,
        userId: user.id,
        action: 'nap_check_completed',
        entityType: 'nap_check',
        entityId: napCheckId || clientId,
        clientId,
        metadata: { risk_level: risk.level, items_passed: passedCount }
      });

      toast.success('Verificación NAP guardada');
    } catch (error) {
      console.error('Error saving NAP check:', error);
      toast.error('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageContainer pageTitle='Verificación NAP'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  const googleSearchUrl = `https://google.com/search?q=${encodeURIComponent(`${businessName} ${city}`)}`;
  const cslbUrl =
    'https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx';
  const sosUrl = 'https://bizfileonline.sos.ca.gov/search/business';

  return (
    <PageContainer
      pageTitle={`NAP — ${client?.business_name || clientId}`}
      pageDescription='Verificación de consistencia de Name, Address & Phone'
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6 max-w-3xl'>
        {/* Risk Badge */}
        <div className='flex items-center gap-3'>
          <Badge variant={risk.color} className='text-sm px-3 py-1'>
            {risk.label}
          </Badge>
          <span className='text-sm text-muted-foreground'>
            {passedCount} / {NAP_CHECKLIST.length} ítems verificados
          </span>
        </div>

        {/* Business Info */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Información del negocio</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>Nombre del negocio</Label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder='Anderson Roofing'
              />
            </div>
            <div className='space-y-2'>
              <Label>Ciudad</Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder='Santa Maria, CA'
              />
            </div>
          </CardContent>
        </Card>

        {/* External Search Buttons */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Verificar en fuentes externas</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => window.open(googleSearchUrl, '_blank')}
            >
              🔍 Google
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => window.open(cslbUrl, '_blank')}
            >
              🛡️ CSLB
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => window.open(sosUrl, '_blank')}
            >
              🏛️ CA SOS
            </Button>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Checklist de verificación NAP</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              {NAP_CHECKLIST.map((item) => (
                <div
                  key={item.id}
                  className='flex items-start gap-3 rounded-lg border p-3'
                >
                  <Checkbox
                    id={item.id}
                    checked={!!checklist[item.id]}
                    onCheckedChange={(checked) =>
                      setChecklist((prev) => ({
                        ...prev,
                        [item.id]: !!checked
                      }))
                    }
                    className='mt-0.5'
                  />
                  <div className='flex-1'>
                    <Label
                      htmlFor={item.id}
                      className='cursor-pointer font-medium'
                    >
                      {item.label}
                    </Label>
                    <p className='text-xs text-muted-foreground mt-0.5'>
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Notas</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder='Observaciones sobre el estado NAP del cliente...'
              rows={3}
            />
          </CardContent>
        </Card>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Verificación NAP'}
        </Button>
      </div>
    </PageContainer>
  );
}
