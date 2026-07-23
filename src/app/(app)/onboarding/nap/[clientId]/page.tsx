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
  handleNapSave,
  loadLatestNapCheck,
  type NapReadClient,
  type NapWriteClient
} from '@/lib/onboarding/nap-check';
import {
  GBP_MODE_OPTIONS,
  isPresenceItemNA,
  buildGbpPresencePayload,
  loadGbpPresence,
  persistGbpPresence,
  type GbpMode,
  type GbpPresenceReadClient,
  type GbpPresenceWriteClient
} from '@/lib/onboarding/gbp-mode';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

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
  // F-083: create-vs-existing axis (R-03) + verification attestation (R-14), persisted
  // to `gbp_profiles`.
  const [gbpMode, setGbpMode] = useState<GbpMode>('existing');
  const [attested, setAttested] = useState(false);
  const [gbpProfileId, setGbpProfileId] = useState<string | null>(null);

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

    // F-080 (R-06): `.maybeSingle()` inside `loadLatestNapCheck` so 0 rows resolve to a
    // null row (no 406) and the page loads with an empty checklist.
    const nap = await loadLatestNapCheck(
      supabase as unknown as NapReadClient,
      clientId
    );
    if (nap.napCheckId) setNapCheckId(nap.napCheckId);
    setChecklist(nap.checklist);
    setNotes(nap.notes);

    // F-083 (R-03/R-14): load the create-vs-existing axis + attestation from
    // `gbp_profiles` (maybeSingle → legacy/missing rows default to `existing`).
    const presence = await loadGbpPresence(
      supabase as unknown as GbpPresenceReadClient,
      clientId
    );
    setGbpProfileId(presence.gbpProfileId);
    setGbpMode(presence.gbpMode);
    setAttested(presence.verificationStatus === 'verified');

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

    // F-080 (R-04/R-05): the write reads `error` on both branches and throws on
    // failure; `handleNapSave` routes it to `onError` (visible toast) and reports
    // `ok=false`, so a false success toast can no longer fire off the 201 from
    // `activity_log`. `items_passed` in the metadata is derived locally (`passedCount`),
    // not from the persisted payload (the generated column is no longer written).
    const { ok, napCheckId: newId } = await handleNapSave(
      {
        supabase: supabase as unknown as NapWriteClient,
        payload: data,
        napCheckId
      },
      {
        logActivity: () =>
          logActivity({
            tenantId,
            userId: user.id,
            action: 'nap_check_completed',
            entityType: 'nap_check',
            entityId: napCheckId || clientId,
            clientId,
            metadata: { risk_level: risk.level, items_passed: passedCount }
          }),
        onError: (error) => {
          console.error('Error saving NAP check:', error);
          toast.error('Error al guardar');
        }
      }
    );

    if (ok) {
      if (newId) setNapCheckId(newId);
      // F-083 (R-03/R-14): persist the create-vs-existing axis + attestation to
      // `gbp_profiles`. Surfaces its own error; never fires a false success toast.
      try {
        await persistGbpPresence({
          supabase: supabase as unknown as GbpPresenceWriteClient,
          gbpProfileId,
          payload: buildGbpPresencePayload({ gbpMode, attested })
        });
      } catch (error) {
        console.error('Error saving GBP mode:', error);
        toast.error('Error al guardar el modo GBP');
        setSaving(false);
        return;
      }
      toast.success('Verificación NAP guardada');
    }
    setSaving(false);
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

        {/* F-083 (R-03): root question — branches the flow + sets gbp_mode */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Presencia en Google</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label>
                ¿El negocio ya tiene un Google Business Profile en Google?
              </Label>
              <Select
                value={gbpMode}
                onValueChange={(v) => setGbpMode(v as GbpMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GBP_MODE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {gbpMode === 'create' && (
                <p className='text-muted-foreground text-xs'>
                  Modo crear: las verificaciones que dependen de un GBP
                  existente no aplican (N/A) y no cuentan en contra.
                </p>
              )}
            </div>

            {/* F-083 (R-14): attestation — existing mode only */}
            {gbpMode === 'existing' && (
              <div className='flex items-start gap-3 rounded-lg border p-3'>
                <Checkbox
                  id='gbp_verified_attested'
                  checked={attested}
                  onCheckedChange={(c) => setAttested(!!c)}
                  className='mt-0.5'
                />
                <div className='flex-1'>
                  <Label
                    htmlFor='gbp_verified_attested'
                    className='cursor-pointer font-medium'
                  >
                    GBP verificado/reclamado en Google
                  </Label>
                  <p className='text-muted-foreground mt-0.5 text-xs'>
                    Atestiguo que el GBP existe y está verificado/reclamado
                    (fija verification_status = verified).
                  </p>
                </div>
              </div>
            )}
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
              {NAP_CHECKLIST.map((item) => {
                // F-083 (R-04): presence-dependent items are N/A in create mode —
                // disabled, forced unchecked, not required, not penalizing.
                const na = isPresenceItemNA(item.id, gbpMode);
                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      na ? 'opacity-60' : ''
                    }`}
                  >
                    <Checkbox
                      id={item.id}
                      checked={na ? false : !!checklist[item.id]}
                      disabled={na}
                      onCheckedChange={(checked) =>
                        setChecklist((prev) => ({
                          ...prev,
                          [item.id]: !!checked
                        }))
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
                        {na && (
                          <Badge variant='secondary' className='text-xs'>
                            N/A (modo crear)
                          </Badge>
                        )}
                      </div>
                      <p className='text-muted-foreground mt-0.5 text-xs'>
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
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
