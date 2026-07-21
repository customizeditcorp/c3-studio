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
import {
  NAP_CHECKLIST,
  napRiskFor,
  buildNapCheckPayload,
  parseNapCheckRow
} from '@/lib/onboarding/nap-check';

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
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (napData) {
      setNapCheckId(napData.id);
      // Reconciled to the real schema: rebuild checklist + notes from the row
      // (backward-compat with any legacy `check_items` array; R-19).
      const parsed = parseNapCheckRow(napData as Record<string, unknown>);
      setChecklist(parsed.checklist);
      setNotes(parsed.notes);
    }
    setLoading(false);
  };

  const passedCount = NAP_CHECKLIST.filter((item) => checklist[item.id]).length;
  const risk = napRiskFor(passedCount, NAP_CHECKLIST.length);

  const handleSave = async () => {
    if (!tenantId || !user) return;
    setSaving(true);

    // Reconciled to the REAL `nap_checks` schema (R-17): only real columns +
    // `risk_level` in the `nap_risk` enum. No `business_name`/`city`/`check_items`/
    // `items_total`/`completed_by` (those columns do not exist → 0-rows drift).
    const data = buildNapCheckPayload({
      clientId,
      checklist,
      notes,
      checkedBy: user.id
    });

    try {
      if (napCheckId) {
        await supabase
          .from('nap_checks')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', napCheckId);
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
      <div className='flex max-w-3xl flex-1 flex-col gap-4 p-4 md:px-6'>
        {/* Risk Badge */}
        <div className='flex items-center gap-3'>
          <Badge variant={risk.color} className='px-3 py-1 text-sm'>
            {risk.label}
          </Badge>
          <span className='text-muted-foreground text-sm'>
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
            <CardTitle className='text-base'>
              Verificar en fuentes externas
            </CardTitle>
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
            <CardTitle className='text-base'>
              Checklist de verificación NAP
            </CardTitle>
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
                    <p className='text-muted-foreground mt-0.5 text-xs'>
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
