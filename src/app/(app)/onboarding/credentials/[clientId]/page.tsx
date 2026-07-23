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
import type { SosStatus } from '@/types/c3-domain';
import {
  CREDENTIALS_CHECKLIST as CHECKLIST_ITEMS,
  SOS_STATUS_OPTIONS,
  buildCredentialsPayload,
  parseCredentialsRow,
  handleCredentialsSave,
  loadCredentials,
  type CredentialsReadClient,
  type CredentialsWriteClient
} from '@/lib/onboarding/credentials';
import {
  isPresenceItemNA,
  loadGbpPresence,
  type GbpMode,
  type GbpPresenceReadClient
} from '@/lib/onboarding/gbp-mode';

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
  // F-078 (R-16): per-client LEGAL signal capture, inherited by the readiness engine.
  const [sosStatus, setSosStatus] = useState<SosStatus>('unknown');
  const [cslbActive, setCslbActive] = useState(false);
  const [legalNameVerified, setLegalNameVerified] = useState(false);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // F-083 (R-04): create-vs-existing axis (captured on the NAP screen, home =
  // `gbp_profiles`); read-only here to render `gbp_access` as N/A in create mode.
  const [gbpMode, setGbpMode] = useState<GbpMode>('existing');

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

    // Load existing credentials. F-080 (R-06): `.maybeSingle()` inside `loadCredentials`
    // so 0 rows resolve to a null row (no 406) and the page loads with safe defaults.
    const { credentialId: existingId, row: credData } = await loadCredentials(
      supabase as unknown as CredentialsReadClient,
      clientId
    );

    if (credData) {
      setCredentialId(existingId);
      setEntityType((credData.entity_type as string) || 'self_employment');
      setLegalName((credData.legal_name as string) || '');
      setDbaNumber((credData.dba_number as string) || '');
      setCslbNumber((credData.cslb_number as string) || '');
      setCityLicense((credData.city_license as string) || '');
      // Reconciled to the real schema (R-18/R-19): `items_completed` is a generated
      // INTEGER; parse defensively (handles a legacy array) and load the legal signals.
      const parsed = parseCredentialsRow(credData);
      setChecklist(parsed.checklist);
      setSosStatus(parsed.sosStatus);
      setCslbActive(parsed.cslbActive);
      setLegalNameVerified(parsed.legalNameVerified);
    }

    // F-083 (R-04): load the create-vs-existing axis from `gbp_profiles`.
    const presence = await loadGbpPresence(
      supabase as unknown as GbpPresenceReadClient,
      clientId
    );
    setGbpMode(presence.gbpMode);

    setLoading(false);
  };

  const completedCount = CHECKLIST_ITEMS.filter(
    (item) => checklist[item.id]
  ).length;
  // F-083 (R-04): a required item that is N/A in create mode is NOT counted as missing
  // (not required, not penalizing).
  const missingRequired = CHECKLIST_ITEMS.filter(
    (item) =>
      item.required &&
      !checklist[item.id] &&
      !isPresenceItemNA(item.id, gbpMode)
  );

  const handleToggle = async (itemId: string, checked: boolean) => {
    const newChecklist = { ...checklist, [itemId]: checked };
    setChecklist(newChecklist);
    await autoSave(newChecklist);
  };

  const autoSave = async (
    newChecklist: Record<string, boolean>
  ): Promise<boolean> => {
    if (!tenantId || !user) return false;

    // Reconciled to the REAL `credentials` schema: NO `items_completed` in the payload
    // (it is a generated column; F-080 R-02). The completed count for the activity
    // metadata is derived LOCALLY from the checklist, independent of the persisted
    // payload (R-09).
    const completedCount = Object.values(newChecklist).filter(Boolean).length;
    const data = buildCredentialsPayload({
      clientId,
      entityType,
      legalName,
      dbaNumber,
      cslbNumber,
      cityLicense,
      checklist: newChecklist,
      sosStatus,
      cslbActive,
      legalNameVerified
    });

    // F-080 (R-04/R-05): the write reads `error` on both branches and throws on
    // failure; `handleCredentialsSave` routes it to `onError` (visible toast — the
    // autoSave `catch` used to be silent) and reports `ok=false`, so the caller does
    // not show a false success toast.
    const { ok, credentialId: newId } = await handleCredentialsSave(
      {
        supabase: supabase as unknown as CredentialsWriteClient,
        payload: data,
        credentialId
      },
      {
        logActivity: () =>
          logActivity({
            tenantId,
            userId: user.id,
            action: 'credentials_updated',
            entityType: 'credential',
            entityId: credentialId || clientId,
            clientId,
            metadata: { items_completed: completedCount }
          }),
        onError: (error) => {
          console.error('Error auto-saving credentials:', error);
          toast.error('Error al guardar credenciales');
        }
      }
    );

    if (ok && newId) setCredentialId(newId);
    return ok;
  };

  const handleSave = async () => {
    if (!tenantId || !user) return;
    const ok = await autoSave(checklist);
    if (ok) toast.success('Credenciales guardadas');
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
      <div className='flex max-w-3xl flex-1 flex-col gap-4 p-4 md:px-6'>
        {/* Progress */}
        <Card>
          <CardContent className='pt-4'>
            <div className='mb-2 flex items-center justify-between'>
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

        {/* Legal signals (F-078 R-16): per-client evidence inherited by readiness */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              Señales legales (elegibilidad)
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-2'>
              <Label>Estado de la entidad (CA SOS)</Label>
              <Select
                value={sosStatus}
                onValueChange={(v) => setSosStatus(v as SosStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOS_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-start gap-3 rounded-lg border p-3'>
              <Checkbox
                id='cslb_active'
                checked={cslbActive}
                onCheckedChange={(c) => setCslbActive(!!c)}
                className='mt-0.5'
              />
              <div className='flex-1'>
                <Label
                  htmlFor='cslb_active'
                  className='cursor-pointer font-medium'
                >
                  Licencia CSLB activa
                </Label>
                <p className='text-muted-foreground mt-0.5 text-xs'>
                  La licencia CSLB está vigente y activa
                </p>
              </div>
            </div>
            <div className='flex items-start gap-3 rounded-lg border p-3'>
              <Checkbox
                id='legal_name_verified'
                checked={legalNameVerified}
                onCheckedChange={(c) => setLegalNameVerified(!!c)}
                className='mt-0.5'
              />
              <div className='flex-1'>
                <Label
                  htmlFor='legal_name_verified'
                  className='cursor-pointer font-medium'
                >
                  Nombre legal verificado
                </Label>
                <p className='text-muted-foreground mt-0.5 text-xs'>
                  El nombre legal coincide con el registro oficial
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Checklist */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              Checklist de credenciales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='space-y-3'>
              {CHECKLIST_ITEMS.map((item) => {
                // F-083 (R-04): presence-dependent items (gbp_access) are N/A in create
                // mode — disabled, forced unchecked, not required, not penalizing.
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
                        {na ? (
                          <Badge variant='secondary' className='text-xs'>
                            N/A (modo crear)
                          </Badge>
                        ) : (
                          item.required && (
                            <Badge variant='destructive' className='text-xs'>
                              Requerido
                            </Badge>
                          )
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

        <Button onClick={handleSave}>Guardar Credenciales</Button>
      </div>
    </PageContainer>
  );
}
