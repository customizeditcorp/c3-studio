'use client';

/**
 * F-086 — Shared readiness component (single source of truth).
 *
 * Extracted lift-and-shift from the standalone panel
 * (`onboarding/readiness/[clientId]/page.tsx`): renders the verdict + blockers +
 * evidence snapshot and lets the operator TRIGGER an evaluation (append a
 * `readiness_assessments` row). Consumed by BOTH the panel and the client detail
 * page (`clients/[id]/page.tsx`, Readiness tab) so the UI + behavior live in ONE
 * place (anti-drift, design §1/DT-2).
 *
 * Self-contained ("smart"): obtains `user`/`tenantId` via `useUser()` and the
 * browser supabase client via `createSupabaseClient()` internally; the host only
 * passes `clientId`. Read-led: surfaces what the evidence says; it does NOT scrape
 * nor repair evidence, and it does NOT wire the Phase-E creation gate.
 *
 * NOTE: depends on the F-078/F-083 migration (`readiness_assessments` + snapshot
 * columns incl. `snap_gbp_mode`). Errors degrade honestly (R-12/R-13).
 */
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import {
  assessReadiness,
  getLatestReadiness,
  createSupabaseReadinessStore
} from '@/lib/gbp-slice/readiness-repo';
import type {
  EligibilityVerdict,
  ReadinessAssessment
} from '@/types/c3-domain';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const VERDICT_META: Record<
  EligibilityVerdict,
  { label: string; color: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  elegible: { label: 'Elegible', color: 'default' },
  bloqueado: { label: 'Bloqueado', color: 'destructive' },
  necesita_fix: { label: 'Necesita corrección', color: 'secondary' },
  datos_insuficientes: { label: 'Datos insuficientes', color: 'outline' }
};

export default function ReadinessPanelBody({
  clientId,
  className
}: {
  clientId: string;
  className?: string;
}) {
  const { user, tenantId, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [latest, setLatest] = useState<ReadinessAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    if (!userLoading && tenantId && clientId) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, userLoading, clientId]);

  const load = async () => {
    try {
      const store = createSupabaseReadinessStore(supabase);
      const row = await getLatestReadiness(store, clientId);
      setLatest(row);
    } catch (error) {
      // Table may not exist yet (gated DDL not applied) or query failed.
      // Degrade honestly: treat as no-assessment (R-13).
      console.error('Error loading readiness:', error);
      setLatest(null);
    }
    setLoading(false);
  };

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      const store = createSupabaseReadinessStore(supabase);
      const row = await assessReadiness(store, {
        clientId,
        assessedBy: user?.id ?? null
      });
      setLatest(row);
      toast.success('Evaluación de readiness registrada');
    } catch (error) {
      console.error('Error evaluating readiness:', error);
      toast.error('No se pudo evaluar (¿migración aplicada?)');
    } finally {
      setEvaluating(false);
    }
  };

  if (loading) {
    return (
      <div className={className}>
        <p className='text-muted-foreground'>Cargando...</p>
      </div>
    );
  }

  const meta = latest ? VERDICT_META[latest.verdict] : null;

  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      {/* Verdict */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Veredicto</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {meta && latest ? (
            <>
              <div className='flex items-center gap-3'>
                <Badge variant={meta.color} className='px-3 py-1 text-sm'>
                  {meta.label}
                </Badge>
                <span className='text-muted-foreground text-xs'>
                  Evaluado: {new Date(latest.assessed_at).toLocaleString()}
                </span>
              </div>
              {latest.rationale && (
                <p className='text-muted-foreground text-sm'>
                  {latest.rationale}
                </p>
              )}
            </>
          ) : (
            <p className='text-muted-foreground text-sm'>
              Sin evaluación registrada. Presiona “Evaluar” para computar el
              veredicto desde la evidencia actual.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Blockers */}
      {latest && latest.blockers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Bloqueadores</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-wrap gap-2'>
            {latest.blockers.map((b) => (
              <Badge key={b} variant='destructive'>
                {b}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Evidence snapshot */}
      {latest && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              Evidencia (snapshot del veredicto)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className='grid grid-cols-2 gap-2 text-sm'>
              <SnapRow label='SoS' value={latest.snap_sos_status} />
              <SnapRow label='CSLB activa' value={latest.snap_cslb_active} />
              <SnapRow
                label='CSLB nombre coincide'
                value={latest.snap_cslb_name_match}
              />
              <SnapRow label='NAP riesgo' value={latest.snap_nap_risk} />
              <SnapRow
                label='NAP consistente'
                value={latest.snap_nap_consistent}
              />
              <SnapRow label='GBP existe' value={latest.snap_gbp_exists} />
              <SnapRow
                label='GBP duplicado'
                value={latest.snap_gbp_duplicate}
              />
              {/* F-086 (DT-1) — fila aditiva GBP modo (create/existing) */}
              <SnapRow label='GBP modo' value={latest.snap_gbp_mode} />
            </dl>
          </CardContent>
        </Card>
      )}

      <Button onClick={handleEvaluate} disabled={evaluating}>
        {evaluating ? 'Evaluando...' : 'Evaluar readiness'}
      </Button>
    </div>
  );
}

function SnapRow({
  label,
  value
}: {
  label: string;
  value: string | boolean | null;
}) {
  const display =
    value === null || value === undefined
      ? '—'
      : typeof value === 'boolean'
        ? value
          ? 'Sí'
          : 'No'
        : String(value);
  return (
    <>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='font-medium'>{display}</dd>
    </>
  );
}
