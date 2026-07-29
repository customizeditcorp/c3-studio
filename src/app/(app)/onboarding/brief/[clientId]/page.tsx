'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import PageContainer from '@/components/layout/page-container';
import { useUser } from '@/contexts/UserContext';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/activity';
import { generateContent } from '@/lib/edge-functions';
import { buildBriefWritePayload } from '@/lib/briefs/write-path';
// F-107 — single-source de la OFV: el adaptador de campos + el proyector puro
// hacen que aprobar/editar la OFV persista `content` Y las columnas planas/jsonb
// sincronizadas (antes escribía solo `content` → edición cosmética).
import {
  buildOfvWritePayload,
  ofvFieldsToContent
} from '@/lib/offers/write-path';
// F-109 — (c) guard de aprobación: bloquea aprobar vacío / esencialmente-todo-
// placeholder. NO bloquea `[PENDIENTE]` legítimo (invariante F-104/F-106).
import { assessApproval } from '@/lib/onboarding/approval-guard';
// F-122 R-21/R-22/R-23 — declaración ÚNICA del catálogo de ciudades + selector
// compartido con el alta.
import {
  canonicalizeCity,
  fetchLocations,
  type LocationRef
} from '@/lib/clients/locations';
import { CitySelect } from '@/components/clients/CitySelect';
// F-122 R-28/R-31/R-32 — ⭐ el espejo del Brief hacia `clients` es el sitio EXACTO por
// el que el marcador cruzó de espacio-generación a espacio-captura (§0 del spec).
import { stripPlaceholdersFromCapture } from '@/lib/clients/capture-guard';
// F-119 — (a) seam de versión: los 6 `INSERT` de esta superficie derivan su `version` de
// `max(version)+1` por `(client_id, tabla)` en vez del literal `1`. HOY es un no-op
// demostrable (estas ramas sólo disparan con la tabla VACÍA para ese cliente ⇒
// `nextVersion([]) === 1`); se hace igual para que el invariante sea ESTRUCTURAL y no
// dependa de razonar sobre estado de React (DT-03).
import { nextVersion, type VersionedRow } from '@/lib/onboarding/next-version';
// F-119 — (b) seam de procedencia: la superficie SEÑALA cuál fila alimenta la generación.
// NO cambia de dónde salen los campos editables (R-25/R-26): la lectura `created_at desc`
// SIN filtro de `status` es intencional y existe para que el operador siga editando su
// borrador (F-113 R-35). Alinearla a ciegas le borraría el draft vivo de la pantalla.
import {
  resolveGenerationSource,
  type GenerationCandidateRow,
  type GenerationSourceResult
} from '@/lib/onboarding/generation-source';
// F-121 (R-17/R-18) — el prefill deja de copiar token-códigos: industria y los DOS
// campos de siempre del diagnóstico pasan por los seams de etiquetas. No se amplía
// ninguna fuente (GATE-D1 pendiente).
// F-122 R-14/R-15 — y ahora TODA presentación textual de la industria de esta pantalla
// pasa por acá. Tenía CUATRO consumidores del código crudo (E-8 a/b/c), y de tres de
// ellos —las plantillas de los `SuggestButton`— salieron los defectos que CL-113
// atribuía al modelo: son plantillas hardcodeadas, no llaman a ninguna API.
import { toIndustryLabel } from '@/lib/clients/industry-label';
import {
  buildDigitalPresenceSentence,
  toTeamSizeLabel
} from '@/lib/onboarding/diagnostic-labels';
// F-121 (R-27/R-28) — aviso ADVISORY de residuo de prueba en campos manuales.
import { detectTestResidueFields } from '@/lib/onboarding/assembly-guard';
// F-123 (R-07/R-08) — las plantillas de los botones se declaran UNA vez, fuera de esta
// pantalla. Acá no queda ni un literal de plantilla escrito en línea.
import {
  TEMPLATE_BUTTONS,
  buildTemplate,
  detectTemplateFields,
  templateFor,
  type TemplateCtx
} from '@/lib/onboarding/field-templates';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
// F-122 R-20 — puntero a la ficha del cliente, donde vive `ClientForm` (E-10).
import Link from 'next/link';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BriefFields {
  business_name: string;
  industry: string;
  city: string;
  state: string;
  service_area: string;
  years_experience: string;
  licenses: string;
  website: string;
  team_size: string;
  main_problem: string;
  pain_1: string;
  pain_2: string;
  pain_3: string;
  digital_presence: string;
  marketing_investment: string;
  demo_age: string;
  demo_occupation: string;
  demo_income: string;
  demo_language: string;
  psychographics: string;
  search_behavior: string;
  differentiators: string;
  guarantees: string;
  success_cases: string;
  goal_90: string;
  goal_12m: string;
  budget: string;
  urgency: string;
}

interface PersonaFields {
  name_age: string;
  location_language: string;
  profession: string;
  education: string;
  lifestyle: string;
  social_media: string;
  search_method: string;
  tech_comfort: string;
  personal_goal: string;
  professional_goal: string;
  provider_values: string;
  revenue_target: string;
  main_pain: string;
  secondary_pains: string;
  hidden_costs: string;
  action_trigger: string;
  dream_result: string;
  past_attempts: string;
  why_failed: string;
  awareness_level: string;
  objection_price: string;
  objection_trust: string;
  objection_time: string;
  if_nothing: string;
  if_competitor: string;
  if_c3: string;
}

interface OFVFields {
  big_promise: string;
  vehicle_name: string;
  vehicle_steps: string;
  quick_win: string;
  option_a: string;
  option_b: string;
  option_c: string;
  deliverables: string;
  guarantee: string;
  urgency_scarcity: string;
  social_proof: string;
}

interface ContentRecord {
  id: string;
  content: Record<string, unknown> | string;
  status: string;
  created_at: string;
}

interface DiagnosticData {
  google_presence: string | null;
  digital_health: string | null;
  revenue_range: string | null;
  team_size: string | null;
  license_status: string | null;
  expectation: string | null;
  recommended_tier: string | null;
}

// ⤫ F-122 R-22 — `LocationRef` se declara UNA sola vez, en
// `src/lib/clients/locations.ts`, junto con la consulta y la forma de la opción.

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved')
    return (
      <Badge className='border-green-200 bg-green-100 text-green-800'>
        Aprobado
      </Badge>
    );
  return <Badge variant='outline'>Borrador</Badge>;
}

/**
 * F-119 (b) — Aviso NO BLOQUEANTE de procedencia (R-27/R-28/R-29/R-30).
 *
 * Hace visible una relación que hasta ahora era invisible: la superficie puede mostrarte una
 * fila mientras el generador consume **otra**, sin que nada lo señale — el síntoma *"lo edité
 * y no cambió nada"*. Reusa el lenguaje visual ya presente en el archivo (el mismo `div`
 * `rounded-md border … px-3 py-2 text-xs` de los avisos existentes); NO crea superficie nueva.
 *
 * Reglas duras:
 *   - **`aligned` ⇒ NO se renderiza NADA** (R-28): delta visual **cero** para los clientes ya
 *     alineados ⇒ el control de no-regresión de (b) es observable, no argumentado.
 *   - **Nunca deshabilita** edición, guardado ni aprobación (R-29): la divergencia la creó el
 *     sistema, no el operador (anti-sobre-corrección, AGENTS.md §8.2).
 *   - **Nunca ofrece ni ejecuta** promoción, copia ni aprobación automática (R-30): aprobar es
 *     un gate humano explícito (F-109). A lo sumo EXPLICA que aprobar el borrador lo convierte
 *     en la fila que genera.
 *   - `none-approved` es su **propia clase**, no un sub-caso de `diverged` (R-21): sin fila
 *     `approved` el generador **no recibe el artefacto en absoluto** (los read-paths de
 *     contexto no tienen fallback).
 */
function GenerationSourceNotice({
  source,
  artifact
}: {
  source: GenerationSourceResult | null;
  artifact: string;
}) {
  if (!source) return null;
  if (source.state === 'aligned') return null; // R-28 — delta visual CERO
  if (source.state === 'none-approved') {
    return (
      <div className='rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'>
        <span className='font-medium'>
          Ninguna versión de {artifact} alimenta la generación.
        </span>{' '}
        No hay ninguna versión <strong>aprobada</strong> de este artefacto, y la
        generación sólo consume versiones aprobadas. Podés seguir editando y
        guardando este borrador; en cuanto lo apruebes, pasa a ser la versión
        que alimenta la generación.
      </div>
    );
  }
  const id = source.canonicalId ?? '';
  const aprobado = source.canonical?.approved_at
    ? new Date(String(source.canonical.approved_at)).toLocaleDateString(
        'es-MX',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }
      )
    : null;
  return (
    <div className='rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'>
      <span className='font-medium'>
        Estás editando una versión distinta de la que alimenta la generación.
      </span>{' '}
      La generación consume la versión <strong>aprobada</strong> de {artifact}{' '}
      <code>{id.slice(0, 8)}</code>
      {aprobado ? ` (aprobada el ${aprobado})` : ''}
      {source.editableId ? (
        <>
          , y acá estás editando <code>{source.editableId.slice(0, 8)}</code>
        </>
      ) : null}
      . Tus cambios se guardan igual; para que alimenten la generación, aprobá
      esta versión.
    </div>
  );
}

/**
 * F-121 (R-27/R-28/R-29) — **Aviso ADVISORY de residuo de prueba.**
 *
 * `differentiators = "TEST T-04"` viajó al modelo como un hecho afirmado por el operador
 * y quedó en el Brief de R & M QTB LLC (`b56d1fa3`). **No hubo un bug: faltó una señal.**
 * El mecanismo, verificado y documentado en la cabecera de `assembly-guard.ts`, tiene 4
 * eslabones legítimos por separado (carga sin filtro de `status` → `briefFields` →
 * `structured_fields` verbatim → bucle de re-inyección post-generación); lo que nunca
 * existió es alguien que le dijera al operador que ese valor iba a viajar.
 *
 * **Avisa, NO bloquea (DT-04, R-28/R-29):**
 *   · cero `disabled`, cero `onClick`, cero escrituras: no puede gatear nada;
 *   · **no muta ni borra el valor** — corregir el dato es del operador (R-29), y el
 *     `delete` está prohibido al agente;
 *   · bloquear colisionaría con R-02 (crearía una condición nueva que impide aprobar) y
 *     frenaría por un falso positivo a un operador que hoy no está frenado.
 *
 * Sin residuos ⇒ `return null` ⇒ **delta visual CERO** (mismo patrón que
 * `GenerationSourceNotice`, F-119 R-28).
 */
function TestResidueNotice({ fields }: { fields: object }) {
  const residuos = detectTestResidueFields(fields);
  if (residuos.length === 0) return null;
  return (
    <div className='rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800'>
      <span className='font-medium'>
        {residuos.length === 1
          ? 'Un campo parece contener un valor de prueba.'
          : `${residuos.length} campos parecen contener valores de prueba.`}
      </span>{' '}
      {residuos.map((k) => (
        <code key={k} className='mr-1'>
          {k}
        </code>
      ))}
      — estos valores se envían al modelo <strong>tal cual</strong> como input
      del operador, y el generador los trata como hechos del negocio. Revisalos
      antes de generar. No se modifica ni se borra nada automáticamente: la
      corrección es tuya.
    </div>
  );
}

/**
 * ⭐ **F-123 R-14 — `tpl` es una procedencia más, y la más honesta de todas.**
 *
 * `ai` significa «esto lo infirió el modelo para este cliente». Cuando el texto salió de
 * una plantilla del propio archivo, eso es **falso**, y era falso en **8 de 18 briefs de
 * producción** (6 de ellos ya `approved`). `tpl` dice la verdad.
 */
function FieldDot({
  type
}: {
  type: 'auto' | 'manual' | 'ai' | 'diag' | 'tpl';
}) {
  const colors = {
    auto: 'bg-green-500',
    manual: 'bg-amber-500',
    ai: 'bg-blue-500',
    diag: 'bg-purple-500',
    tpl: 'bg-slate-400'
  };
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors[type]}`} />
  );
}

function SuggestButton({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='mt-1 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800'
    >
      {/* ⭐ F-123 R-12 — fuera `sparkles`. Este botón NO llama a ningún modelo: pega un
          texto de ejemplo del catálogo. El ícono de documento dice eso; el de chispas
          afirmaba una inferencia que nunca ocurrió. Ícono ya existente, no se agrega
          ninguno. */}
      <Icons.post className='h-3 w-3' />
      {label}
    </button>
  );
}

/**
 * ⭐⭐⭐ **F-123 (R-18..R-21) — el aviso de PROCEDENCIA, en el momento de APROBAR.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EN LA APROBACIÓN Y NO SÓLO AL INSERTAR
 * ─────────────────────────────────────────────────────────────────────────────────
 * El dato lo decidió: de los **8 briefs contaminados de producción, 6 estaban `approved`**.
 * El punto de fuga **no es la inserción, es la aprobación** — y es esperable, porque el
 * ícono de chispas decía «lo generó la IA», así que revisar ese texto **no era el trabajo
 * del humano**. Corregir sólo el ícono habría dejado pasar los briefs que ya lo tienen.
 *
 * **Avisa, NO bloquea (DT-02, decisión del operador):** cero `disabled`, cero `onClick`,
 * cero escrituras, **cero mutación de valores**. El operador pidió explícitamente *«no
 * cambiar todavía la autoridad de aprobación en este frente»* ⇒ `assessApproval` no se toca.
 *
 * ⭐ **R-21 — el aviso DECLARA EL LÍMITE DE SU PROPIA MEDICIÓN.** Las plantillas fijas se
 * reconocen por igualdad exacta; las parametrizadas, por sus segmentos literales en orden.
 * **Un texto muy editado puede dejar de reconocerse, y el aviso lo dice.** No se compensa
 * con matching difuso: un falso rojo enseña a ignorar el aviso, y ahí el guard muere.
 *
 * Sin detección ⇒ `return null` ⇒ **delta visual CERO** (R-20, mismo patrón que
 * `TestResidueNotice` y `GenerationSourceNotice`).
 */
function TemplateProvenanceNotice({
  fields,
  ctx
}: {
  fields: object;
  ctx: TemplateCtx;
}) {
  const hits = detectTemplateFields(fields, ctx);
  if (hits.length === 0) return null;
  return (
    <div className='rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700'>
      <span className='font-medium'>
        {hits.length === 1
          ? 'Un campo tiene texto de EJEMPLO, no generado por el modelo.'
          : `${hits.length} campos tienen texto de EJEMPLO, no generado por el modelo.`}
      </span>{' '}
      {hits.map((h) => (
        <code key={h.field} className='mr-1'>
          {h.field}
        </code>
      ))}
      — ese texto lo pegó un botón de plantilla de esta pantalla, no lo infirió
      la IA a partir de este cliente. Convendría editarlo antes de aprobar. No
      se modifica ni se borra nada automáticamente: la corrección es tuya.{' '}
      <span className='text-slate-500'>
        La detección reconoce las plantillas sin editar y las editadas en sus
        partes variables; un texto muy retocado puede no reconocerse, así que
        esta lista puede quedarse corta.
      </span>
    </div>
  );
}

function BlockCard({
  title,
  badge,
  children
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
        <CardTitle className='text-sm font-medium'>{title}</CardTitle>
        {badge && (
          <span className='rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700'>
            {badge}
          </span>
        )}
      </CardHeader>
      <CardContent className='space-y-3'>{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  dot,
  children,
  hint
}: {
  label: string;
  dot: 'auto' | 'manual' | 'ai' | 'diag' | 'tpl';
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <Label className='text-muted-foreground mb-1 flex items-center gap-1.5 text-xs'>
        <FieldDot type={dot} />
        {label}
      </Label>
      {children}
      {hint && (
        <p className='text-muted-foreground mt-0.5 text-[11px]'>{hint}</p>
      )}
    </div>
  );
}

const emptyBrief: BriefFields = {
  business_name: '',
  industry: '',
  city: '',
  state: 'CA',
  service_area: '',
  years_experience: '',
  licenses: '',
  website: '',
  team_size: '',
  main_problem: '',
  pain_1: '',
  pain_2: '',
  pain_3: '',
  digital_presence: '',
  marketing_investment: '',
  demo_age: '',
  demo_occupation: '',
  demo_income: '',
  demo_language: '',
  psychographics: '',
  search_behavior: '',
  differentiators: '',
  guarantees: '',
  success_cases: '',
  goal_90: '',
  goal_12m: '',
  budget: '',
  urgency: ''
};

const emptyPersona: PersonaFields = {
  name_age: '',
  location_language: '',
  profession: '',
  education: '',
  lifestyle: '',
  social_media: '',
  search_method: '',
  tech_comfort: '',
  personal_goal: '',
  professional_goal: '',
  provider_values: '',
  revenue_target: '',
  main_pain: '',
  secondary_pains: '',
  hidden_costs: '',
  action_trigger: '',
  dream_result: '',
  past_attempts: '',
  why_failed: '',
  awareness_level: '',
  objection_price: '',
  objection_trust: '',
  objection_time: '',
  if_nothing: '',
  if_competitor: '',
  if_c3: ''
};

const emptyOFV: OFVFields = {
  big_promise: '',
  vehicle_name: '',
  vehicle_steps: '',
  quick_win: '',
  option_a: '',
  option_b: '',
  option_c: '',
  deliverables: '',
  guarantee: '',
  urgency_scarcity: '',
  social_proof: ''
};

function parseContentToFields<T extends Record<string, string>>(
  content: Record<string, unknown> | string | null,
  defaults: T
): T {
  if (!content) return { ...defaults };
  const obj =
    typeof content === 'string'
      ? (() => {
          try {
            return JSON.parse(content);
          } catch {
            return {};
          }
        })()
      : content;
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const val = obj[key];
    if (typeof val === 'string') (result as Record<string, string>)[key] = val;
  }
  return result;
}

function fieldsToContent<T extends Record<string, string>>(
  fields: T
): Record<string, unknown> {
  const content: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v) content[k] = v;
  }
  content.raw_text = Object.entries(fields)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n');
  return content;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function BriefPage() {
  const params = useParams<{ clientId: string | string[] }>();
  const clientId =
    typeof params.clientId === 'string'
      ? params.clientId
      : params.clientId?.[0];
  const { tenantId, user, loading: userLoading } = useUser();
  const supabase = createSupabaseClient();

  const [client, setClient] = useState<Record<string, unknown> | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [locations, setLocations] = useState<LocationRef[]>([]);
  const [loading, setLoading] = useState(true);

  // Brief
  const [briefRecord, setBriefRecord] = useState<ContentRecord | null>(null);
  const [briefFields, setBriefFields] = useState<BriefFields>({
    ...emptyBrief
  });
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [approvingBrief, setApprovingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  // Persona
  const [personaRecord, setPersonaRecord] = useState<ContentRecord | null>(
    null
  );
  const [personaFields, setPersonaFields] = useState<PersonaFields>({
    ...emptyPersona
  });
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [approvingPersona, setApprovingPersona] = useState(false);
  // F-108 R-07 — mirror de `savingDraft` del brief para la pestaña Persona.
  const [savingDraftPersona, setSavingDraftPersona] = useState(false);

  // OFV
  const [ofvRecord, setOfvRecord] = useState<ContentRecord | null>(null);
  const [ofvFields, setOfvFields] = useState<OFVFields>({ ...emptyOFV });
  const [generatingOfv, setGeneratingOfv] = useState(false);
  const [approvingOfv, setApprovingOfv] = useState(false);
  // F-108 R-07 — mirror de `savingDraft` del brief para la pestaña OFV.
  const [savingDraftOfv, setSavingDraftOfv] = useState(false);

  // F-119 (b) R-20/R-24 — estado de PROCEDENCIA por artefacto: `aligned` | `diverged` |
  // `none-approved`. Es INFORMACIÓN, no control: no gatea nada y no toca los campos.
  const [briefSource, setBriefSource] = useState<GenerationSourceResult | null>(
    null
  );
  const [personaSource, setPersonaSource] =
    useState<GenerationSourceResult | null>(null);
  const [ofvSource, setOfvSource] = useState<GenerationSourceResult | null>(
    null
  );

  /**
   * F-119 R-10/R-12 — `max(version)+1` del `(client_id, tabla)`, TODOS los `status` (R-05).
   * Consulta ligera que corre en el camino de escritura de esta superficie; la rama que la
   * usa (insert-on-first-save) sólo dispara cuando el cliente no tiene ninguna fila ⇒ hoy
   * devuelve `1` y el comportamiento es byte-idéntico (R-02). Límite declarado (R-41): dos
   * escrituras concurrentes pueden calcular el mismo `max+1` — degrada al empate previo a
   * F-119, que el tie-break de F-113/F-109 resuelve. Por eso la red NO se retira (R-14).
   */
  const nextVersionFor = async (
    table: 'briefs' | 'buyer_personas' | 'offers'
  ): Promise<number> => {
    const { data } = await supabase
      .from(table)
      .select('version')
      .eq('client_id', clientId);
    return nextVersion((data ?? []) as VersionedRow[]);
  };

  useEffect(() => {
    if (!userLoading && tenantId && clientId) void loadData();
  }, [tenantId, userLoading, clientId]);

  const loadData = async () => {
    // Client
    const { data: c } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();
    if (c) setClient(c);

    // Diagnostic
    const { data: d } = await supabase
      .from('diagnostics')
      .select(
        'google_presence, digital_health, revenue_range, team_size, license_status, expectation, recommended_tier'
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (d) setDiagnostic(d as DiagnosticData);

    // Locations (California)
    // ⤫ F-122 R-22 — la consulta se mudó a `src/lib/clients/locations.ts`: la
    // declaración ÚNICA del catálogo (tabla, proyección, filtro, orden, forma de
    // opción) que ahora comparten el Brief y el alta. Misma proyección, mismo
    // filtro y mismo orden que acá — sólo dejó de estar declarada dos veces.
    setLocations(await fetchLocations(supabase));

    // Brief
    const { data: b } = await supabase
      .from('briefs')
      .select('id, content, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (b) {
      setBriefRecord(b as ContentRecord);
      const parsed = parseContentToFields(
        b.content as Record<string, unknown>,
        emptyBrief
      );
      // Pre-fill from client data if fields are empty
      if (c) {
        if (!parsed.business_name)
          parsed.business_name = (c.business_name as string) || '';
        // F-121 R-17 — el prefill copia la ETIQUETA, nunca el token-código. Copiarlo
        // crudo lo metía en `input_data.structured_fields` y de ahí salió la clave
        // `industry` de las 3 filas de producción (`other`,
        // `portable_toilet_rental_service`). `null` = sin industria declarada ⇒ el
        // campo queda vacío y el modelo lo marca ausente, que es la verdad.
        if (!parsed.industry)
          parsed.industry = toIndustryLabel(c.industry as string) || '';
        if (!parsed.city) parsed.city = (c.city as string) || '';
        if (!parsed.state) parsed.state = (c.state as string) || 'CA';
        if (!parsed.service_area && c.service_area_cities)
          parsed.service_area = Array.isArray(c.service_area_cities)
            ? (c.service_area_cities as string[]).join(', ')
            : '';
      }
      if (d) {
        // F-121 R-18 — LOS MISMOS 2 CAMPOS DE SIEMPRE (`team_size` y
        // `google_presence`+`digital_health`), sólo que en LENGUAJE. No se amplía lo
        // que el diagnóstico aporta: eso es la rama (2), elevada al operador
        // (GATE-D1) y NO implementada. Antes esto ensamblaba
        // `GBP: no_gbp, Salud digital: nothing` y se persistió verbatim.
        if (!parsed.team_size)
          parsed.team_size =
            toTeamSizeLabel((d as DiagnosticData).team_size) || '';
        if (!parsed.digital_presence)
          parsed.digital_presence = buildDigitalPresenceSentence(
            (d as DiagnosticData).google_presence,
            (d as DiagnosticData).digital_health
          );
      }
      setBriefFields(parsed);
    } else if (c) {
      // No brief yet — pre-fill from client + diagnostic
      setBriefFields({
        ...emptyBrief,
        business_name: (c.business_name as string) || '',
        // F-121 R-17 — segundo call-site del prefill de industria (rama "sin brief").
        industry: toIndustryLabel(c.industry as string) || '',
        city: (c.city as string) || '',
        state: (c.state as string) || 'CA',
        service_area: c.service_area_cities
          ? Array.isArray(c.service_area_cities)
            ? (c.service_area_cities as string[]).join(', ')
            : ''
          : '',
        // F-121 R-18 — ídem: mismos 2 campos, en lenguaje.
        team_size: d
          ? toTeamSizeLabel((d as DiagnosticData).team_size) || ''
          : '',
        digital_presence: d
          ? buildDigitalPresenceSentence(
              (d as DiagnosticData).google_presence,
              (d as DiagnosticData).digital_health
            )
          : ''
      });
    }

    // Persona
    const { data: p } = await supabase
      .from('buyer_personas')
      .select('id, content, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (p) {
      setPersonaRecord(p as ContentRecord);
      setPersonaFields(
        parseContentToFields(p.content as Record<string, unknown>, emptyPersona)
      );
    }

    // OFV
    const { data: o } = await supabase
      .from('offers')
      .select('id, content, status, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (o) {
      setOfvRecord(o as ContentRecord);
      setOfvFields(
        parseContentToFields(o.content as Record<string, unknown>, emptyOFV)
      );
    }

    // ---------------------------------------------------------------- //
    // F-119 (b) — R-24/R-25/R-26: TRES lecturas ADICIONALES y de SOLO LECTURA
    // ---------------------------------------------------------------- //
    // Las 3 consultas de arriba quedan INTACTAS (`created_at desc`, SIN filtro de `status`,
    // misma proyección): son las que pueblan los campos editables y **mandan** — el borrador
    // vivo no desaparece, no se reemplaza y no se vuelve read-only (R-25/R-26).
    //
    // Estas 3 consultas nuevas resuelven, en paralelo, QUÉ FILA ALIMENTA LA GENERACIÓN, con
    // EL MISMO selector y LOS MISMOS filtros que el generador (`client_id` + `status =
    // 'approved'` + `order('version')` + `pickCanonicalContentRow`/`pickCanonicalOffer`,
    // encapsulados en `resolveGenerationSource`). Divergir del generador emitiría una
    // PROCEDENCIA FALSA — peor que no señalar nada (R-24, regla heredada de F-113 R-14/R-15).
    //
    // Proyección: la que cada selector necesita (`id, version, updated_at, content`;
    // `+ big_promise` en `offers`) MÁS `approved_at`, que el aviso usa para decirle al
    // operador desde cuándo esa fila es la que genera.
    const { data: briefApprovedRows } = await supabase
      .from('briefs')
      .select('id, version, updated_at, content, approved_at')
      .eq('client_id', clientId)
      .eq('status', 'approved')
      .order('version', { ascending: false });
    setBriefSource(
      resolveGenerationSource({
        artifact: 'brief',
        editable: (b as ContentRecord | null) ?? null,
        approvedCandidates: (briefApprovedRows ??
          []) as GenerationCandidateRow[]
      })
    );

    const { data: personaApprovedRows } = await supabase
      .from('buyer_personas')
      .select('id, version, updated_at, content, approved_at')
      .eq('client_id', clientId)
      .eq('status', 'approved')
      .order('version', { ascending: false });
    setPersonaSource(
      resolveGenerationSource({
        artifact: 'persona',
        editable: (p as ContentRecord | null) ?? null,
        approvedCandidates: (personaApprovedRows ??
          []) as GenerationCandidateRow[]
      })
    );

    const { data: ofvApprovedRows } = await supabase
      .from('offers')
      .select('id, version, updated_at, content, big_promise, approved_at')
      .eq('client_id', clientId)
      .eq('status', 'approved')
      .order('version', { ascending: false });
    setOfvSource(
      resolveGenerationSource({
        artifact: 'offer',
        editable: (o as ContentRecord | null) ?? null,
        approvedCandidates: (ofvApprovedRows ?? []) as GenerationCandidateRow[]
      })
    );

    setLoading(false);
  };

  /* ---- Brief helpers ---- */
  const updateBrief = (key: keyof BriefFields, val: string) =>
    setBriefFields((prev) => ({ ...prev, [key]: val }));

  // F-084 R-07/R-08 — espejar city/state del brief a `clients` (home canónico,
  // DT-1), además del narrativo en `briefs.content`. Solo escribe valores no
  // vacíos para no sobrescribir con blancos un valor existente.
  //
  // ⭐ F-122 R-28/R-31/R-32 (DT-03 b · H-4) — **el guard vive DENTRO de esta función,
  // no en sus dos call-sites** (`handleApproveBrief` y `handleSaveDraft`): así los dos
  // quedan cubiertos por construcción y hay **un solo punto** que el source-guard de
  // R-34 puede exigir.
  //
  // Éste es el sitio por el que entró el defecto: `briefs.content.city = "[PENDIENTE]"`
  // es degradación honesta LEGÍTIMA (F-104/F-106) y nadie la toca — lo que se prohíbe es
  // que ese valor **cruce** a `clients`, donde se vuelve un hecho falso del home
  // canónico y corrompe el guard anti-fabricación de F-098.
  //
  // Se bloquea el VALOR, no al OPERADOR (R-31): el patch pierde la clave, se avisa, y
  // guardar/aprobar siguen su curso.
  //
  // ⭐ F-122 R-47 (ENMIENDA 2026-07-28) — la ciudad que coincide con el catálogo se
  // espeja en su FORMA CANÓNICA (`santa maria` ⇒ `Santa Maria`); una ciudad genuinamente
  // ausente se espeja VERBATIM (trim) y **no** se da de alta en `locations_reference`
  // (R-48). La colisión se cierra en el seam, no en el componente.
  const mirrorCityStateToClient = async () => {
    let patch: Record<string, string> = {};
    if (briefFields.city)
      patch.city = canonicalizeCity(briefFields.city, locations);
    if (briefFields.state) patch.state = briefFields.state;
    const guarded = stripPlaceholdersFromCapture(patch);
    patch = guarded.patch as Record<string, string>;
    if (guarded.blocked.length > 0) {
      toast.warning(
        `No se copió al cliente: ${guarded.blocked.join(', ')} — el brief lo marcó como pendiente.`
      );
    }
    if (Object.keys(patch).length === 0) return;
    await supabase.from('clients').update(patch).eq('id', clientId);
  };

  const handleGenerateBrief = async () => {
    if (!clientId || !user?.id || !tenantId) {
      toast.error('Faltan datos');
      return;
    }
    setGeneratingBrief(true);
    try {
      setBriefError(null);
      const result = await generateContent({
        step: 'brief',
        clientId,
        inputData: { structured_fields: briefFields }
      });
      // Re-fetch
      const { data: newB } = await supabase
        .from('briefs')
        .select('id, content, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newB) {
        setBriefRecord(newB as ContentRecord);
        const parsed = parseContentToFields(
          newB.content as Record<string, unknown>,
          emptyBrief
        );
        // Keep manually entered values if AI returned empty
        for (const k of Object.keys(briefFields) as (keyof BriefFields)[]) {
          if (!parsed[k] && briefFields[k]) parsed[k] = briefFields[k];
        }
        setBriefFields(parsed);
      }
      toast.success('Brief generado con GPT-4o');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.error(`Error: ${msg}`);
      setBriefError(msg);
    } finally {
      setGeneratingBrief(false);
    }
  };

  // F-119 R-10/R-11/R-12 — la `version` de la rama insert-on-first-save viaja por
  // `opts.version`, el parámetro que F-097 DT-04 ya había reservado exactamente para esto:
  // `src/lib/briefs/write-path.ts` NO se toca y su `?? 1` pasa a ser, correctamente, el
  // default del caso "cliente sin filas". La rama `update` no manda `version`.
  // (El comentario vive FUERA del cuerpo: `f084`/`f108` inspeccionan ventanas de tamaño
  // fijo desde `const handle…` y crecer el cuerpo las desbordaría.)
  const handleApproveBrief = async () => {
    // F-097 R-02/R-04 — ya no early-return por `!briefRecord`: si no hay fila,
    // se CREA directamente `approved` (aprobar sin generar con AI).
    if (!tenantId || !user) return;
    // F-109 R-05/R-06 — guard de aprobación ANTES de escribir `status:'approved'`.
    // Bloquea vacío / esencialmente-todo-placeholder; NO bloquea `[PENDIENTE]`
    // legítimo (F-104/F-106). El save-draft NO pasa por aquí.
    if (!assessApproval(briefFields).ok) {
      toast.error('No se puede aprobar: contenido vacío o incompleto');
      return;
    }
    setApprovingBrief(true);
    try {
      // F-097 R-10/R-11 — payload con la columna `raw_text` sincronizada.
      const payload = buildBriefWritePayload(fieldsToContent(briefFields), {
        status: 'approved',
        version: await nextVersionFor('briefs')
      });
      // F-109 R-07 — sello de aprobación (columnas nullable ya existentes, SIN DDL).
      const approvedAt = new Date().toISOString();
      let entityId: string | undefined = briefRecord?.id;
      if (briefRecord) {
        await supabase
          .from('briefs')
          .update({
            status: 'approved',
            content: payload.content,
            raw_text: payload.raw_text,
            approved_by: user.id, // F-109 R-07
            approved_at: approvedAt // F-109 R-07
          })
          .eq('id', briefRecord.id);
        setBriefRecord((prev) =>
          prev ? { ...prev, status: 'approved' } : prev
        );
      } else {
        // F-097 R-02 — insert-on-first-save (rama sin `briefRecord`).
        const { data } = await supabase
          .from('briefs')
          .insert({
            client_id: clientId,
            prompt_version_id: null, // DT-01 — brief manual, sin prompt_version
            content: payload.content,
            raw_text: payload.raw_text,
            status: payload.status,
            version: payload.version,
            approved_by: user.id, // F-109 R-07
            approved_at: approvedAt // F-109 R-07
          })
          .select('id, content, status, created_at')
          .single();
        if (data) {
          entityId = (data as ContentRecord).id;
          setBriefRecord(data as ContentRecord); // subsecuentes = update (R-08)
        }
      }
      // F-084 R-07/R-08 — espejar city/state a `clients` en el mismo save.
      await mirrorCityStateToClient();
      if (entityId) {
        await logActivity({
          tenantId,
          userId: user.id,
          action: 'brief_approved',
          entityType: 'brief',
          entityId,
          clientId
        });
      }
      toast.success('Brief aprobado');
    } catch {
      toast.error('Error al aprobar');
    } finally {
      setApprovingBrief(false);
    }
  };

  const handleSaveDraft = async () => {
    // F-097 R-01/R-04 — ya no early-return por `!briefRecord`: si no hay fila,
    // se CREA (insert-on-first-save) para poder guardar sin generar con AI.
    if (!tenantId) return;
    setSavingDraft(true);
    try {
      // F-097 R-10/R-11 — payload con la columna `raw_text` sincronizada.
      // F-119 R-10/R-12 — `version` del seam, dentro del objeto `opts`.
      const payload = buildBriefWritePayload(fieldsToContent(briefFields), {
        status: 'draft',
        version: await nextVersionFor('briefs')
      });
      if (briefRecord) {
        await supabase
          .from('briefs')
          .update({ content: payload.content, raw_text: payload.raw_text })
          .eq('id', briefRecord.id);
      } else {
        // F-097 R-01 — insert-on-first-save (rama sin `briefRecord`).
        const { data } = await supabase
          .from('briefs')
          .insert({
            client_id: clientId,
            prompt_version_id: null, // DT-01 — brief manual, sin prompt_version
            content: payload.content,
            raw_text: payload.raw_text,
            status: payload.status,
            version: payload.version
          })
          .select('id, content, status, created_at')
          .single();
        if (data) setBriefRecord(data as ContentRecord); // subsecuentes = update (R-08)
      }
      // F-084 R-07/R-08 — espejar city/state a `clients` en el mismo save.
      await mirrorCityStateToClient();
      toast.success('Borrador guardado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.error(`Error al guardar: ${msg}`);
      setBriefError(msg);
    } finally {
      setSavingDraft(false);
    }
  };

  /* ---- Persona helpers ---- */
  const updatePersona = (key: keyof PersonaFields, val: string) =>
    setPersonaFields((prev) => ({ ...prev, [key]: val }));

  const handleGeneratePersona = async () => {
    if (!clientId || !user?.id || !tenantId) {
      toast.error('Faltan datos');
      return;
    }
    setGeneratingPersona(true);
    try {
      await generateContent({
        step: 'buyer_persona',
        clientId,
        inputData: { structured_fields: personaFields }
      });
      const { data: newP } = await supabase
        .from('buyer_personas')
        .select('id, content, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newP) {
        setPersonaRecord(newP as ContentRecord);
        setPersonaFields(
          parseContentToFields(
            newP.content as Record<string, unknown>,
            emptyPersona
          )
        );
      }
      toast.success('Buyer Persona generada');
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : 'desconocido'}`);
    } finally {
      setGeneratingPersona(false);
    }
  };

  const handleSaveDraftPersona = async () => {
    // F-108 R-01/R-03 — espejo de `handleSaveDraft` del brief: si no hay fila,
    // se CREA (insert-on-first-save) para poder guardar sin generar con AI.
    // NO early-return por record; solo guard de sesión.
    if (!tenantId) return;
    setSavingDraftPersona(true);
    try {
      // F-108 R-08 — `buyer_personas` tiene columna `raw_text` (homólogo del
      // brief) → payload con la columna sincronizada vía buildBriefWritePayload.
      // `PersonaFields` no tiene index signature → se adapta al genérico de
      // `fieldsToContent` (Record<string,string>); runtime = Object.entries, ok.
      // F-119 R-10/R-12 — `version` desde el seam, dentro del objeto `opts`.
      const payload = buildBriefWritePayload(
        fieldsToContent(personaFields as unknown as Record<string, string>),
        { status: 'draft', version: await nextVersionFor('buyer_personas') }
      );
      if (personaRecord) {
        // F-108 R-03 — update-in-place (conserva id).
        await supabase
          .from('buyer_personas')
          .update({ content: payload.content, raw_text: payload.raw_text })
          .eq('id', personaRecord.id);
      } else {
        // F-108 R-01 — insert-on-first-save (rama sin `personaRecord`).
        const { data } = await supabase
          .from('buyer_personas')
          .insert({
            client_id: clientId,
            prompt_version_id: null, // F-108 R-10 — persona manual, sin prompt_version
            content: payload.content,
            raw_text: payload.raw_text,
            status: payload.status,
            version: payload.version
          })
          .select('id, content, status, created_at')
          .single();
        if (data) setPersonaRecord(data as ContentRecord); // subsecuentes = update (R-03)
      }
      toast.success('Borrador guardado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.error(`Error al guardar: ${msg}`);
    } finally {
      setSavingDraftPersona(false);
    }
  };

  // F-119 R-10/R-12 — `version` del seam en `opts` (ídem `handleApproveBrief`). El
  // comentario vive fuera del cuerpo por las ventanas fijas de `f108` (ver arriba).
  const handleApprovePersona = async () => {
    // F-108 R-04/R-06 — ya no early-return por `!personaRecord`: si no hay fila,
    // se CREA directamente `approved` (aprobar sin generar con AI).
    if (!tenantId || !user) return;
    // F-109 R-05/R-06 — guard de aprobación ANTES de escribir `status:'approved'`.
    if (!assessApproval(personaFields).ok) {
      toast.error('No se puede aprobar: contenido vacío o incompleto');
      return;
    }
    setApprovingPersona(true);
    try {
      // F-108 R-08 — payload con la columna `raw_text` sincronizada.
      const payload = buildBriefWritePayload(fieldsToContent(personaFields), {
        status: 'approved',
        version: await nextVersionFor('buyer_personas')
      });
      // F-109 R-07 — sello de aprobación (columnas nullable ya existentes, SIN DDL).
      const approvedAt = new Date().toISOString();
      let entityId: string | undefined = personaRecord?.id;
      if (personaRecord) {
        await supabase
          .from('buyer_personas')
          .update({
            status: 'approved',
            content: payload.content,
            raw_text: payload.raw_text,
            approved_by: user.id, // F-109 R-07
            approved_at: approvedAt // F-109 R-07
          })
          .eq('id', personaRecord.id);
        setPersonaRecord((prev) =>
          prev ? { ...prev, status: 'approved' } : prev
        );
      } else {
        // F-108 R-04 — insert-on-first-save (rama sin `personaRecord`).
        const { data } = await supabase
          .from('buyer_personas')
          .insert({
            client_id: clientId,
            prompt_version_id: null, // F-108 R-10 — persona manual, sin prompt_version
            content: payload.content,
            raw_text: payload.raw_text,
            status: payload.status,
            version: payload.version,
            approved_by: user.id, // F-109 R-07
            approved_at: approvedAt // F-109 R-07
          })
          .select('id, content, status, created_at')
          .single();
        if (data) {
          entityId = (data as ContentRecord).id;
          setPersonaRecord(data as ContentRecord); // subsecuentes = update (R-03)
        }
      }
      if (entityId) {
        await logActivity({
          tenantId,
          userId: user.id,
          action: 'persona_approved',
          entityType: 'buyer_persona',
          entityId,
          clientId
        });
      }
      toast.success('Buyer Persona aprobada');
    } catch {
      toast.error('Error al aprobar');
    } finally {
      setApprovingPersona(false);
    }
  };

  /* ---- OFV helpers ---- */
  const updateOFV = (key: keyof OFVFields, val: string) =>
    setOfvFields((prev) => ({ ...prev, [key]: val }));

  const handleGenerateOFV = async () => {
    if (!clientId || !user?.id || !tenantId) {
      toast.error('Faltan datos');
      return;
    }
    setGeneratingOfv(true);
    try {
      await generateContent({
        step: 'ofv',
        clientId,
        inputData: { structured_fields: ofvFields }
      });
      const { data: newO } = await supabase
        .from('offers')
        .select('id, content, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (newO) {
        setOfvRecord(newO as ContentRecord);
        setOfvFields(
          parseContentToFields(
            newO.content as Record<string, unknown>,
            emptyOFV
          )
        );
      }
      toast.success('OFV generado');
    } catch (e) {
      toast.error(`Error: ${e instanceof Error ? e.message : 'desconocido'}`);
    } finally {
      setGeneratingOfv(false);
    }
  };

  const handleSaveDraftOFV = async () => {
    // F-108 R-02/R-03 — espejo de `handleSaveDraft` del brief con los helpers
    // F-107 (single-source content + columnas planas). NO early-return por record.
    if (!tenantId) return;
    setSavingDraftOfv(true);
    try {
      // F-108 R-08 — single-source: content Y columnas planas nunca divergen.
      const { columns, content: ofvContent } = buildOfvWritePayload(
        ofvFieldsToContent(ofvFields)
      );
      if (ofvRecord) {
        // F-108 R-03 — update-in-place (conserva id).
        await supabase
          .from('offers')
          .update({ content: ofvContent, ...columns })
          .eq('id', ofvRecord.id);
      } else {
        // F-108 R-02 — insert-on-first-save (rama sin `ofvRecord`).
        // R-11 — la FK a la persona queda null (nullable; FK-linking = F-109).
        const { data } = await supabase
          .from('offers')
          .insert({
            client_id: clientId,
            prompt_version_id: null, // F-108 R-10 — OFV manual, sin prompt_version
            content: ofvContent,
            ...columns,
            status: 'draft',
            // F-119 R-10 — `version` desde el seam (`offers` no pasa por
            // `buildBriefWritePayload`, así que acá reemplaza al literal `1`).
            version: await nextVersionFor('offers')
          })
          .select('id, content, status, created_at')
          .single();
        if (data) setOfvRecord(data as ContentRecord); // subsecuentes = update (R-03)
      }
      toast.success('Borrador guardado');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido';
      toast.error(`Error al guardar: ${msg}`);
    } finally {
      setSavingDraftOfv(false);
    }
  };

  const handleApproveOFV = async () => {
    // F-108 R-05/R-06 — sin early-return por `!ofvRecord`: crea-y-aprueba si no hay fila.
    if (!tenantId || !user) return;
    // F-109 R-05/R-06 — guard de aprobación ANTES de escribir `status:'approved'`.
    if (!assessApproval(ofvFields).ok) {
      toast.error('No se puede aprobar: contenido vacío o incompleto');
      return;
    }
    setApprovingOfv(true);
    try {
      // F-107 R-05 — single-source: content Y columnas planas sincronizadas.
      const { columns, content: ofvContent } = buildOfvWritePayload(
        ofvFieldsToContent(ofvFields)
      );
      // F-109 R-07 — sello de aprobación (columnas nullable ya existentes, SIN DDL).
      const approvedAt = new Date().toISOString();
      let entityId: string | undefined = ofvRecord?.id;
      if (ofvRecord) {
        await supabase
          .from('offers')
          .update({
            status: 'approved',
            content: ofvContent,
            ...columns,
            approved_by: user.id, // F-109 R-07
            approved_at: approvedAt // F-109 R-07
          })
          .eq('id', ofvRecord.id);
        setOfvRecord((prev) => (prev ? { ...prev, status: 'approved' } : prev));
      } else {
        // F-108 R-05 — insert-on-first-save; R-11 FK persona queda null (F-109).
        const { data } = await supabase
          .from('offers')
          .insert({
            client_id: clientId,
            prompt_version_id: null, // F-108 R-10 — OFV manual, sin prompt_version
            content: ofvContent,
            ...columns,
            status: 'approved',
            // F-119 R-10 — `version` desde el seam (reemplaza el literal `1`).
            version: await nextVersionFor('offers'),
            approved_by: user.id, // F-109 R-07
            approved_at: approvedAt // F-109 R-07
          })
          .select('id, content, status, created_at')
          .single();
        if (data) {
          entityId = (data as ContentRecord).id;
          setOfvRecord(data as ContentRecord); // subsecuentes = update (R-03)
        }
      }
      if (entityId) {
        await logActivity({
          tenantId,
          userId: user.id,
          action: 'offer_approved',
          entityType: 'offer',
          entityId,
          clientId
        });
      }
      toast.success('OFV aprobado');
    } catch {
      toast.error('Error al aprobar');
    } finally {
      setApprovingOfv(false);
    }
  };

  const briefApproved = briefRecord?.status === 'approved';
  const personaApproved = personaRecord?.status === 'approved';
  const ofvApproved = ofvRecord?.status === 'approved';

  if (loading) {
    return (
      <PageContainer pageTitle='Brief & Persona'>
        <div className='p-4'>
          <p className='text-muted-foreground'>Cargando...</p>
        </div>
      </PageContainer>
    );
  }

  const clientName = (client?.business_name as string) || clientId;
  // ⤫ F-122 R-14 — `const ind = (client?.industry as string) || ''` era el código CRUDO
  // que alimentaba los otros cuatro sitios de esta pantalla. Ahora la industria se
  // resuelve UNA vez por la declaración única, y `null` significa **ausencia de
  // industria declarada** (F-121 R-15): cada superficie la expresa como ausencia, nunca
  // como hueco, `undefined` ni token (R-15).
  const ind = toIndustryLabel((client?.industry as string) || '');

  /**
   * ⭐ F-123 — el contexto con el que se construyen y se detectan las plantillas. La
   * industria entra **ya resuelta** por `toIndustryLabel` (R-03): el catálogo nunca ve
   * `clients.industry` crudo, así que F-122 R-18 no gana un sujeto nuevo que vigilar.
   */
  const tplCtx: TemplateCtx = {
    business_name: briefFields.business_name,
    industry_label: ind,
    city: briefFields.city
  };

  /**
   * ⭐⭐⭐ **F-123 R-14/R-15 — la procedencia se DERIVA DEL VALOR, no de un flag.**
   *
   * Ésta es la decisión que sostiene todo el frente, y vale la pena que quede escrita:
   * un flag de sesión («este campo lo llenó el botón») habría sido más fácil y **peor**.
   * Derivar del valor da tres cosas gratis que un flag no puede dar:
   *
   *   1. **las 8 filas YA contaminadas quedan señaladas sin tocarlas** — se abre el brief
   *      y la marca aparece, sin migración, sin `update`, sin escribir una sola fila
   *      (R-02: la corrección de esos datos es del operador, no del agente);
   *   2. **la marca se APAGA SOLA** (R-15) cuando el operador edita el campo o cuando el
   *      modelo lo sobrescribe al generar — sin ninguna llamada de limpieza que alguien
   *      pueda olvidarse de invocar;
   *   3. sobrevive a recargar la página, que es donde un flag de sesión se pierde.
   *
   * ⚠️ **Sólo los 12 campos alcanzables cambian de criterio.** Los `Field` de Buyer
   * Persona y OFV **no se tocan**: ahí `ai` es verdad, y borrarlo habría introducido la
   * **mentira simétrica** — que es exactamente lo que la lectura literal de «quitar
   * `dot='ai'`» habría provocado sobre los otros 33 campos que llevan esa marca.
   */
  const tplHits = detectTemplateFields(briefFields, tplCtx);
  const provenanceOf = (...keys: string[]): 'ai' | 'tpl' =>
    keys.some((k) => tplHits.some((h) => h.field === k)) ? 'tpl' : 'ai';

  /** Aplica la plantilla de un campo del catálogo. Cero literales en esta pantalla (R-08). */
  const applyTemplate = (field: string): void =>
    updateBrief(
      field as keyof BriefFields,
      buildTemplate(templateFor(field)!, tplCtx)
    );

  /** Aplica TODAS las plantillas de un botón (los de dolores y demografía escriben varias). */
  const applyButton = (id: string): void => {
    const btn = TEMPLATE_BUTTONS.find((b) => b.id === id);
    if (!btn) return;
    for (const f of btn.fields) applyTemplate(f.field);
  };

  /** La etiqueta declarada del botón (R-13): vive en el catálogo, no en el JSX. */
  const btnLabel = (id: string): string =>
    TEMPLATE_BUTTONS.find((b) => b.id === id)?.label ?? '';

  return (
    <PageContainer
      pageTitle={`Onboarding — ${clientName}`}
      pageDescription={
        ind ? `${ind} · Brief, Persona y OFV` : 'Brief, Persona y OFV'
      }
    >
      <div className='flex flex-1 flex-col gap-4 p-4 md:px-6'>
        <div className='text-muted-foreground mb-1 flex gap-2 text-xs'>
          <span className='flex items-center gap-1'>
            <FieldDot type='auto' /> Del cliente
          </span>
          <span className='flex items-center gap-1'>
            <FieldDot type='diag' /> Del diagnóstico
          </span>
          <span className='flex items-center gap-1'>
            <FieldDot type='ai' /> AI sugiere
          </span>
          <span className='flex items-center gap-1'>
            <FieldDot type='manual' /> Carlos completa
          </span>
          {/* F-123 R-16 — la quinta procedencia. Sin esta entrada, la marca nueva sería
              un punto de color que nadie sabe leer. */}
          <span className='flex items-center gap-1'>
            <FieldDot type='tpl' /> Ejemplo de plantilla
          </span>
        </div>

        <Tabs defaultValue='brief'>
          <TabsList>
            <TabsTrigger value='brief'>Brief</TabsTrigger>
            <TabsTrigger value='persona' disabled={!briefApproved}>
              {!briefApproved && '🔒 '}Buyer Persona
            </TabsTrigger>
            <TabsTrigger value='ofv' disabled={!personaApproved}>
              {!personaApproved && '🔒 '}OFV
            </TabsTrigger>
          </TabsList>

          {/* ============ TAB 1: BRIEF ============ */}
          <TabsContent value='brief' className='mt-4 max-w-3xl space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-sm font-medium'>Brief del negocio</h3>
              {briefRecord && <StatusBadge status={briefRecord.status} />}
            </div>

            {/* F-119 (b) — aviso de procedencia, no bloqueante. `aligned` ⇒ nada. */}
            <GenerationSourceNotice source={briefSource} artifact='el brief' />

            {/* Block 1 */}
            <BlockCard
              title='Bloque 1 — Información del negocio'
              badge='70% auto'
            >
              <div className='grid grid-cols-2 gap-3'>
                <Field label='Nombre del negocio' dot='auto'>
                  <Input
                    value={briefFields.business_name}
                    onChange={(e) =>
                      updateBrief('business_name', e.target.value)
                    }
                  />
                </Field>
                <Field label='Industria' dot='auto'>
                  {/* F-122 R-19 — SIGUE `readOnly` a propósito: la industria es dato del
                      cliente. Hacerla editable acá crearía DOS fuentes de verdad sobre el
                      mismo dato, que es exactamente lo que R-08 prohíbe. */}
                  <Input
                    value={briefFields.industry}
                    readOnly
                    className='bg-muted/30'
                  />
                  {/* F-122 R-20 — y se dice DÓNDE se corrige. Cierra el mismo bucle
                      abierto que CL-109 nombró: pedirte que apruebes un dato sin
                      decirte dónde arreglarlo.
                      ⚠️ Mandato 1 de CL-102 — esta pantalla es el NÚCLEO: el puntero es
                      un enlace a la ficha, no una superficie nueva acá. */}
                  {!ind && (
                    <p className='text-muted-foreground text-xs'>
                      Sin industria declarada — se corrige en{' '}
                      <Link
                        href={`/clients/${clientId}`}
                        className='underline underline-offset-2'
                      >
                        la ficha del cliente
                      </Link>
                      .
                    </p>
                  )}
                </Field>
              </div>
              <div className='grid grid-cols-3 gap-3'>
                <Field label='Ciudad' dot='manual'>
                  {/* ⤫ F-122 R-21/R-22/R-23 — el `<select>` local se reemplaza por el
                      selector COMPARTIDO con el alta, alimentado por la declaración
                      única del catálogo. Mismas opciones, mismo orden, misma forma. */}
                  <CitySelect
                    value={briefFields.city}
                    locations={locations}
                    onChange={(e) => updateBrief('city', e.target.value)}
                  />
                </Field>
                <Field label='Estado' dot='auto'>
                  <Input
                    value={briefFields.state}
                    readOnly
                    className='bg-muted/30'
                  />
                </Field>
                <Field
                  label='Área de servicio'
                  dot='manual'
                  hint='Ciudades separadas por coma'
                >
                  <Input
                    value={briefFields.service_area}
                    onChange={(e) =>
                      updateBrief('service_area', e.target.value)
                    }
                    placeholder='Santa Maria, SLO, SB...'
                  />
                </Field>
              </div>
              <div className='grid grid-cols-3 gap-3'>
                <Field label='Años de experiencia' dot='manual'>
                  <Input
                    type='number'
                    value={briefFields.years_experience}
                    onChange={(e) =>
                      updateBrief('years_experience', e.target.value)
                    }
                    placeholder='Ej: 10'
                  />
                </Field>
                <Field label='Licencias / certificaciones' dot='manual'>
                  <Input
                    value={briefFields.licenses}
                    onChange={(e) => updateBrief('licenses', e.target.value)}
                    placeholder='CSLB#, seguros, permisos'
                  />
                </Field>
                <Field label='Tamaño del equipo' dot='diag'>
                  <select
                    className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                    value={briefFields.team_size}
                    onChange={(e) => updateBrief('team_size', e.target.value)}
                  >
                    <option value=''>Seleccionar...</option>
                    <option value='solo'>Solo</option>
                    <option value='2_5'>2-5</option>
                    <option value='6_10'>6-10</option>
                    <option value='11_plus'>11+</option>
                  </select>
                </Field>
              </div>
              <Field
                label='Sitio web actual'
                dot='manual'
                hint='Dejar vacío si no tiene'
              >
                <Input
                  type='url'
                  value={briefFields.website}
                  onChange={(e) => updateBrief('website', e.target.value)}
                  placeholder='https://...'
                />
              </Field>
            </BlockCard>

            {/* Block 2 */}
            <BlockCard
              title='Bloque 2 — Situación actual'
              badge='80% AI sugiere'
            >
              <Field label='Presencia digital actual' dot='diag'>
                <Input
                  value={briefFields.digital_presence}
                  readOnly
                  className='bg-muted/30'
                />
              </Field>
              <Field
                label='Problema principal'
                dot={provenanceOf('main_problem')}
              >
                <Input
                  value={briefFields.main_problem}
                  onChange={(e) => updateBrief('main_problem', e.target.value)}
                  placeholder='Ej: Sin presencia digital'
                />
                <SuggestButton
                  label={btnLabel('main_problem')}
                  onClick={() => applyButton('main_problem')}
                />
              </Field>
              <Field
                label='Dolores específicos (máx 3)'
                dot={provenanceOf('pain_1', 'pain_2', 'pain_3')}
              >
                <Input
                  value={briefFields.pain_1}
                  onChange={(e) => updateBrief('pain_1', e.target.value)}
                  placeholder='1. '
                  className='mb-1.5'
                />
                <Input
                  value={briefFields.pain_2}
                  onChange={(e) => updateBrief('pain_2', e.target.value)}
                  placeholder='2. '
                  className='mb-1.5'
                />
                <Input
                  value={briefFields.pain_3}
                  onChange={(e) => updateBrief('pain_3', e.target.value)}
                  placeholder='3. '
                />
                <SuggestButton
                  label={btnLabel('pains')}
                  onClick={() => applyButton('pains')}
                />
              </Field>
              <Field label='Inversión actual en marketing' dot='ai'>
                <select
                  className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                  value={briefFields.marketing_investment}
                  onChange={(e) =>
                    updateBrief('marketing_investment', e.target.value)
                  }
                >
                  <option value=''>Seleccionar...</option>
                  <option value='$0'>$0 — no invierte</option>
                  <option value='<$200'>Menos de $200/mes</option>
                  <option value='$200-$500'>$200-$500/mes</option>
                  <option value='$500-$1000'>$500-$1,000/mes</option>
                  <option value='>$1000'>Más de $1,000/mes</option>
                </select>
              </Field>
            </BlockCard>

            {/* Block 3 */}
            <BlockCard
              title='Bloque 3 — Perfil del cliente ideal'
              badge='AI sugiere'
            >
              <p className='text-muted-foreground mb-3 text-xs'>
                Este perfil es un primer esbozo que el AI usará para generar el
                Brief y servirá como punto de partida para la Buyer Persona
                completa.
              </p>
              <div className='grid grid-cols-2 gap-3'>
                <Field label='Edad' dot={provenanceOf('demo_age')}>
                  <Input
                    value={briefFields.demo_age}
                    onChange={(e) => updateBrief('demo_age', e.target.value)}
                    placeholder='Ej: 35-55'
                  />
                </Field>
                <Field label='Ocupación' dot={provenanceOf('demo_occupation')}>
                  <Input
                    value={briefFields.demo_occupation}
                    onChange={(e) =>
                      updateBrief('demo_occupation', e.target.value)
                    }
                    placeholder='Ej: contractor, event planner'
                  />
                </Field>
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <Field label='Ingresos' dot={provenanceOf('demo_income')}>
                  <Input
                    value={briefFields.demo_income}
                    onChange={(e) => updateBrief('demo_income', e.target.value)}
                    placeholder='Ej: $50K-$150K'
                  />
                </Field>
                <Field label='Idioma' dot={provenanceOf('demo_language')}>
                  <Input
                    value={briefFields.demo_language}
                    onChange={(e) =>
                      updateBrief('demo_language', e.target.value)
                    }
                    placeholder='Ej: bilingual'
                  />
                </Field>
              </div>
              <SuggestButton
                label={btnLabel('demographics')}
                onClick={() => applyButton('demographics')}
              />
              <Field
                label='Psicografía (valores, miedos, aspiraciones)'
                dot={provenanceOf('psychographics')}
              >
                <Textarea
                  value={briefFields.psychographics}
                  onChange={(e) =>
                    updateBrief('psychographics', e.target.value)
                  }
                  rows={2}
                  placeholder='Qué valora, qué le da miedo, a qué aspira...'
                />
                <SuggestButton
                  label={btnLabel('psychographics')}
                  onClick={() => applyButton('psychographics')}
                />
              </Field>
              <Field
                label='Comportamiento de búsqueda'
                dot={provenanceOf('search_behavior')}
              >
                <Textarea
                  value={briefFields.search_behavior}
                  onChange={(e) =>
                    updateBrief('search_behavior', e.target.value)
                  }
                  rows={2}
                  placeholder='Dónde busca servicios, cómo decide...'
                />
                <SuggestButton
                  label={btnLabel('search_behavior')}
                  onClick={() => applyButton('search_behavior')}
                />
              </Field>
            </BlockCard>

            {/* Block 4 */}
            <BlockCard
              title='Bloque 4 — Diferenciadores y evidencia'
              badge='Carlos completa'
            >
              <Field label='Qué hace diferente vs competencia' dot='manual'>
                <Textarea
                  value={briefFields.differentiators}
                  onChange={(e) =>
                    updateBrief('differentiators', e.target.value)
                  }
                  rows={2}
                  placeholder='Ej: servicio bilingüe, entrega same-day, mantenimiento incluido...'
                />
              </Field>
              <Field
                label='Garantías'
                dot='manual'
                hint='Datos crudos — el AI los elaborará en el OFV'
              >
                <Input
                  value={briefFields.guarantees}
                  onChange={(e) => updateBrief('guarantees', e.target.value)}
                  placeholder='Ej: entrega en 24hrs o gratis'
                />
              </Field>
              <Field
                label='Casos de éxito o métricas'
                dot='manual'
                hint='El AI los convertirá en social proof en el OFV'
              >
                <Input
                  value={briefFields.success_cases}
                  onChange={(e) => updateBrief('success_cases', e.target.value)}
                  placeholder='Ej: 200+ eventos servidos, 10 años sin queja'
                />
              </Field>
            </BlockCard>

            {/* Block 5 */}
            <BlockCard title='Bloque 5 — Objetivos' badge='AI sugiere'>
              <div className='grid grid-cols-2 gap-3'>
                <Field label='Meta a 90 días' dot={provenanceOf('goal_90')}>
                  <Input
                    value={briefFields.goal_90}
                    onChange={(e) => updateBrief('goal_90', e.target.value)}
                    placeholder='Ej: GBP verificado + 5 reseñas'
                  />
                  <SuggestButton
                    label={btnLabel('goal_90')}
                    onClick={() => applyButton('goal_90')}
                  />
                </Field>
                <Field label='Meta a 12 meses' dot={provenanceOf('goal_12m')}>
                  <Input
                    value={briefFields.goal_12m}
                    onChange={(e) => updateBrief('goal_12m', e.target.value)}
                    placeholder='Ej: top 3 en Maps'
                  />
                  <SuggestButton
                    label={btnLabel('goal_12m')}
                    onClick={() => applyButton('goal_12m')}
                  />
                </Field>
              </div>
              <div className='grid grid-cols-2 gap-3'>
                <Field
                  label='Inversión esperada'
                  dot='ai'
                  hint='Basado en tier recomendado'
                >
                  <select
                    className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                    value={briefFields.budget}
                    onChange={(e) => updateBrief('budget', e.target.value)}
                  >
                    <option value=''>Seleccionar...</option>
                    <option value='$99/mes'>
                      $99/mes (mantenimiento básico)
                    </option>
                    <option value='$275/mes'>
                      $275/mes (Presencia Digital)
                    </option>
                    <option value='$500+/mes'>$500+/mes (growth)</option>
                  </select>
                </Field>
                <Field label='Urgencia' dot='ai'>
                  <select
                    className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                    value={briefFields.urgency}
                    onChange={(e) => updateBrief('urgency', e.target.value)}
                  >
                    <option value=''>Seleccionar...</option>
                    <option value='baja'>Baja — explorando opciones</option>
                    <option value='media'>Media — quiere empezar pronto</option>
                    <option value='alta'>Alta — necesita presencia YA</option>
                    <option value='critica'>
                      Crítica — perdiendo clientes ahora
                    </option>
                  </select>
                </Field>
              </div>
            </BlockCard>

            {/* F-121 R-28 — aviso ADVISORY de residuo de prueba, ANTES de generar y de
                aprobar. Ver `TestResidueNotice` para el mecanismo y el porqué de que
                sea aviso y no gate (DT-04). */}
            <TestResidueNotice fields={briefFields} />

            {/* F-123 R-18 — aviso ADVISORY de PROCEDENCIA, en el mismo lugar y por la
                misma razón: visible ANTES de «Generar Brief» y de «Aprobar Brief». El
                dato que lo puso acá: 6 de los 8 briefs contaminados ya estaban
                `approved` ⇒ el punto de fuga es la APROBACIÓN, no la inserción. */}
            <TemplateProvenanceNotice fields={briefFields} ctx={tplCtx} />

            {/* Actions */}
            <div className='flex flex-wrap gap-2'>
              <Button
                onClick={handleGenerateBrief}
                disabled={generatingBrief || savingDraft}
              >
                {generatingBrief ? (
                  <>
                    <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                    Generando...
                  </>
                ) : briefRecord ? (
                  '↺ Regenerar Brief'
                ) : (
                  '✨ Generar Brief con AI'
                )}
              </Button>
              {/* F-097 R-03 — visible sin generar (no gateado por briefRecord). */}
              {!briefApproved && (
                <Button
                  variant='outline'
                  onClick={handleSaveDraft}
                  disabled={savingDraft || generatingBrief}
                >
                  {savingDraft ? (
                    <>
                      <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                      Guardando...
                    </>
                  ) : (
                    'Guardar borrador'
                  )}
                </Button>
              )}
              {/* F-097 R-03 — aprobable sin generar (no gateado por briefRecord). */}
              {!briefApproved && (
                <Button
                  onClick={handleApproveBrief}
                  disabled={approvingBrief}
                  className='bg-green-600 hover:bg-green-700'
                >
                  {approvingBrief ? (
                    <>
                      <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                      Aprobando...
                    </>
                  ) : (
                    '✓ Aprobar Brief'
                  )}
                </Button>
              )}
              {briefApproved && (
                <p className='self-center text-sm font-medium text-green-700'>
                  ✅ Brief aprobado. Buyer Persona desbloqueada.
                </p>
              )}
            </div>

            {/* Advertencia de regeneracion */}
            {briefRecord && !briefApproved && (
              <p className='text-muted-foreground text-xs'>
                Regenerar reemplazará el contenido actual.
              </p>
            )}

            {/* Error persistente */}
            {briefError && (
              <div className='rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700'>
                <span className='font-medium'>Error al generar:</span>{' '}
                {briefError}. Revisa tu conexión o contacta soporte si el error
                persiste.
              </div>
            )}

            {/* Output panel */}
            {briefRecord && (
              <Card className='border-blue-100 bg-blue-50/40'>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
                  <CardTitle className='text-sm font-medium text-blue-900'>
                    Resultado AI — Brief generado
                  </CardTitle>
                  <div className='flex items-center gap-2'>
                    <span className='text-muted-foreground text-xs'>
                      {new Date(briefRecord.created_at).toLocaleDateString(
                        'es-MX',
                        {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        }
                      )}
                    </span>
                    <StatusBadge status={briefRecord.status} />
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className='grid grid-cols-1 gap-y-1.5 text-sm sm:grid-cols-2'>
                    {(
                      Object.entries(briefFields) as [
                        keyof BriefFields,
                        string
                      ][]
                    )
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k} className='flex flex-col'>
                          <dt className='text-muted-foreground text-[11px] capitalize'>
                            {k.replace(/_/g, ' ')}
                          </dt>
                          <dd className='text-foreground font-medium'>{v}</dd>
                        </div>
                      ))}
                  </dl>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============ TAB 2: BUYER PERSONA ============ */}
          <TabsContent value='persona' className='mt-4 max-w-3xl space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-sm font-medium'>
                Buyer Persona completa (el AI la genera usando el Brief aprobado
                como contexto)
              </h3>
              {personaRecord && <StatusBadge status={personaRecord.status} />}
            </div>

            {/* F-119 (b) — aviso de procedencia, no bloqueante. `aligned` ⇒ nada. */}
            <GenerationSourceNotice
              source={personaSource}
              artifact='la buyer persona'
            />

            {briefApproved && (
              <div className='text-muted-foreground rounded-md border border-blue-100 bg-blue-50/40 px-3 py-2 text-xs'>
                El AI usará el perfil del cliente ideal del Brief como punto de
                partida. Puedes aceptar las sugerencias o sobrescribirlas.
              </div>
            )}

            {!briefApproved ? (
              <Card>
                <CardContent className='text-muted-foreground py-8 text-center text-sm'>
                  🔒 Primero aprueba el Brief
                </CardContent>
              </Card>
            ) : (
              <>
                <BlockCard title='1. Datos demográficos' badge='AI sugiere'>
                  <div className='grid grid-cols-2 gap-3'>
                    <Field label='Nombre ficticio y edad' dot='ai'>
                      <Input
                        value={personaFields.name_age}
                        onChange={(e) =>
                          updatePersona('name_age', e.target.value)
                        }
                        placeholder='Ej: "Rafael", 42 años'
                      />
                    </Field>
                    <Field label='Ubicación e idioma' dot='ai'>
                      <Input
                        value={personaFields.location_language}
                        onChange={(e) =>
                          updatePersona('location_language', e.target.value)
                        }
                        placeholder='Ej: Santa Maria, CA — bilingüe'
                      />
                    </Field>
                  </div>
                </BlockCard>

                <BlockCard title='2. Profesión y educación'>
                  <div className='grid grid-cols-2 gap-3'>
                    <Field label='Profesión / tipo de negocio' dot='ai'>
                      <Input
                        value={personaFields.profession}
                        onChange={(e) =>
                          updatePersona('profession', e.target.value)
                        }
                        placeholder='Ej: Dueño de negocio de sanitation'
                      />
                    </Field>
                    <Field label='Educación' dot='ai'>
                      <Input
                        value={personaFields.education}
                        onChange={(e) =>
                          updatePersona('education', e.target.value)
                        }
                        placeholder='Ej: High school, certificaciones técnicas'
                      />
                    </Field>
                  </div>
                </BlockCard>

                <BlockCard title='3-4. Estilo de vida y comportamiento digital'>
                  <Field label='Estilo de vida y valores' dot='ai'>
                    <Textarea
                      value={personaFields.lifestyle}
                      onChange={(e) =>
                        updatePersona('lifestyle', e.target.value)
                      }
                      rows={2}
                      placeholder='Rutina, valores familiares, nivel socioeconómico...'
                    />
                  </Field>
                  <div className='grid grid-cols-3 gap-3'>
                    <Field label='Redes sociales' dot='ai'>
                      <Input
                        value={personaFields.social_media}
                        onChange={(e) =>
                          updatePersona('social_media', e.target.value)
                        }
                        placeholder='Facebook, WhatsApp...'
                      />
                    </Field>
                    <Field label='Cómo busca proveedores' dot='ai'>
                      <Input
                        value={personaFields.search_method}
                        onChange={(e) =>
                          updatePersona('search_method', e.target.value)
                        }
                        placeholder='Google, referidos...'
                      />
                    </Field>
                    <Field label='Nivel tech' dot='ai'>
                      <Input
                        value={personaFields.tech_comfort}
                        onChange={(e) =>
                          updatePersona('tech_comfort', e.target.value)
                        }
                        placeholder='Bajo / Medio / Alto'
                      />
                    </Field>
                  </div>
                </BlockCard>

                <BlockCard title='5-6. Metas y objetivos'>
                  <div className='grid grid-cols-2 gap-3'>
                    <Field label='Meta personal' dot='ai'>
                      <Input
                        value={personaFields.personal_goal}
                        onChange={(e) =>
                          updatePersona('personal_goal', e.target.value)
                        }
                        placeholder='Ej: estabilidad financiera para familia'
                      />
                    </Field>
                    <Field label='Meta profesional' dot='ai'>
                      <Input
                        value={personaFields.professional_goal}
                        onChange={(e) =>
                          updatePersona('professional_goal', e.target.value)
                        }
                        placeholder='Ej: duplicar clientes en 1 año'
                      />
                    </Field>
                  </div>
                  <div className='grid grid-cols-2 gap-3'>
                    <Field label='Facturación objetivo' dot='ai'>
                      <Input
                        value={personaFields.revenue_target}
                        onChange={(e) =>
                          updatePersona('revenue_target', e.target.value)
                        }
                        placeholder='Ej: $25K-$50K/mes'
                      />
                    </Field>
                    <Field label='Qué valora en un proveedor' dot='manual'>
                      <Input
                        value={personaFields.provider_values}
                        onChange={(e) =>
                          updatePersona('provider_values', e.target.value)
                        }
                        placeholder='Ej: transparencia, resultados medibles'
                      />
                    </Field>
                  </div>
                </BlockCard>

                <BlockCard
                  title='7-8. Dolores y motivaciones'
                  badge='Clave para ARC7'
                >
                  <Field
                    label='Dolor principal (el que lo mantiene despierto)'
                    dot='ai'
                  >
                    <Input
                      value={personaFields.main_pain}
                      onChange={(e) =>
                        updatePersona('main_pain', e.target.value)
                      }
                      placeholder='Ej: no aparece en Google, pierde clientes'
                    />
                  </Field>
                  <Field label='Dolores secundarios' dot='ai'>
                    <Textarea
                      value={personaFields.secondary_pains}
                      onChange={(e) =>
                        updatePersona('secondary_pains', e.target.value)
                      }
                      rows={2}
                      placeholder='3-5 dolores separados por línea'
                    />
                  </Field>
                  <div className='grid grid-cols-2 gap-3'>
                    <Field label='Costos ocultos de no resolver' dot='ai'>
                      <Input
                        value={personaFields.hidden_costs}
                        onChange={(e) =>
                          updatePersona('hidden_costs', e.target.value)
                        }
                        placeholder='Ej: $5K-$10K/mes en leads perdidos'
                      />
                    </Field>
                    <Field label='Qué lo impulsa a actuar' dot='ai'>
                      <Input
                        value={personaFields.action_trigger}
                        onChange={(e) =>
                          updatePersona('action_trigger', e.target.value)
                        }
                        placeholder='Ej: ver competidor rankeando arriba'
                      />
                    </Field>
                  </div>
                  {/* F-120 (c) — R-30/R-31: `dream_result` SE PRODUCE, VIAJA Y NO SE VE.
                      El prompt lo declara bajo `8. MOTIVACIONES`, `method-context.ts` lo
                      mapea persona→OFV con la etiqueta canónica `Resultado soñado`
                      (PERSONA_METHOD_LABELS, F-112), y el tipo + el round-trip ya existen
                      — lo único que faltaba era el render. Va acá, en el bloque que aloja
                      los bloques 7-8 del método, para que UI, prompt y mapeo nombren lo
                      mismo con el mismo nombre. NO se toca `PersonaFields` ni
                      `emptyPersona` ni el write-path (R-32/R-33): el núcleo no gana
                      campos. */}
                  <Field label='Resultado soñado' dot='ai'>
                    <Input
                      value={personaFields.dream_result}
                      onChange={(e) =>
                        updatePersona('dream_result', e.target.value)
                      }
                      placeholder='Ej: ser el referente de su zona sin depender del boca a boca'
                    />
                  </Field>
                </BlockCard>

                <BlockCard title='9-10. Frustraciones y nivel de conciencia'>
                  <Field label='Qué intentó antes' dot='manual'>
                    <Input
                      value={personaFields.past_attempts}
                      onChange={(e) =>
                        updatePersona('past_attempts', e.target.value)
                      }
                      placeholder='Ej: Yelp ads, un primo que le hizo el sitio...'
                    />
                  </Field>
                  <Field label='Por qué falló' dot='manual'>
                    <Input
                      value={personaFields.why_failed}
                      onChange={(e) =>
                        updatePersona('why_failed', e.target.value)
                      }
                      placeholder='Ej: no era especialista en local SEO'
                    />
                  </Field>
                  <Field label='Nivel de conciencia' dot='ai'>
                    <select
                      className='border-input bg-background h-9 w-full rounded-md border px-3 text-sm'
                      value={personaFields.awareness_level}
                      onChange={(e) =>
                        updatePersona('awareness_level', e.target.value)
                      }
                    >
                      <option value=''>Seleccionar...</option>
                      <option value='inconsciente'>
                        Inconsciente del problema
                      </option>
                      <option value='consciente'>
                        Consciente del problema
                      </option>
                      <option value='buscando'>Buscando solución</option>
                      <option value='comparando'>Comparando opciones</option>
                      <option value='listo'>Listo para comprar</option>
                    </select>
                  </Field>
                </BlockCard>

                <BlockCard
                  title='11-12. Barreras y escenarios'
                  badge='Clave para ARC5-6'
                >
                  <div className='grid grid-cols-3 gap-3'>
                    <Field label='Objeción: precio' dot='ai'>
                      <Input
                        value={personaFields.objection_price}
                        onChange={(e) =>
                          updatePersona('objection_price', e.target.value)
                        }
                        placeholder='Ej: es mucho para empezar'
                      />
                    </Field>
                    <Field label='Objeción: confianza' dot='ai'>
                      <Input
                        value={personaFields.objection_trust}
                        onChange={(e) =>
                          updatePersona('objection_trust', e.target.value)
                        }
                        placeholder='Ej: ya me estafaron antes'
                      />
                    </Field>
                    <Field label='Objeción: tiempo' dot='ai'>
                      <Input
                        value={personaFields.objection_time}
                        onChange={(e) =>
                          updatePersona('objection_time', e.target.value)
                        }
                        placeholder='Ej: no tengo tiempo'
                      />
                    </Field>
                  </div>
                  <div className='grid grid-cols-3 gap-3'>
                    <Field label='Si no hace nada' dot='ai'>
                      <Textarea
                        value={personaFields.if_nothing}
                        onChange={(e) =>
                          updatePersona('if_nothing', e.target.value)
                        }
                        rows={2}
                        placeholder='Status quo...'
                      />
                    </Field>
                    <Field label='Si elige competencia' dot='ai'>
                      <Textarea
                        value={personaFields.if_competitor}
                        onChange={(e) =>
                          updatePersona('if_competitor', e.target.value)
                        }
                        rows={2}
                        placeholder='Qué pasa...'
                      />
                    </Field>
                    <Field label='Si elige C3' dot='ai'>
                      <Textarea
                        value={personaFields.if_c3}
                        onChange={(e) => updatePersona('if_c3', e.target.value)}
                        rows={2}
                        placeholder='Resultado ideal...'
                      />
                    </Field>
                  </div>
                </BlockCard>

                <div className='flex flex-wrap gap-2'>
                  <Button
                    onClick={handleGeneratePersona}
                    disabled={generatingPersona}
                  >
                    {generatingPersona ? (
                      <>
                        <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                        Generando...
                      </>
                    ) : (
                      '✨ Generar Buyer Persona con AI'
                    )}
                  </Button>
                  {/* F-108 R-07 — visible sin generar (no gateado por personaRecord). */}
                  {!personaApproved && (
                    <Button
                      variant='outline'
                      onClick={handleSaveDraftPersona}
                      disabled={savingDraftPersona || generatingPersona}
                    >
                      {savingDraftPersona ? (
                        <>
                          <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                          Guardando...
                        </>
                      ) : (
                        'Guardar borrador'
                      )}
                    </Button>
                  )}
                  {personaRecord && personaRecord.status !== 'approved' && (
                    <Button
                      onClick={handleApprovePersona}
                      disabled={approvingPersona}
                      className='bg-green-600 hover:bg-green-700'
                    >
                      {approvingPersona ? 'Aprobando...' : '✓ Aprobar Persona'}
                    </Button>
                  )}
                  {personaApproved && (
                    <p className='self-center text-sm font-medium text-green-700'>
                      ✅ Persona aprobada. OFV desbloqueado.
                    </p>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          {/* ============ TAB 3: OFV ============ */}
          <TabsContent value='ofv' className='mt-4 max-w-3xl space-y-4'>
            <div className='flex items-center justify-between'>
              <h3 className='text-sm font-medium'>Oferta de Valor (OFV)</h3>
              {ofvRecord && <StatusBadge status={ofvRecord.status} />}
            </div>

            {/* F-119 (b) — aviso de procedencia, no bloqueante. `aligned` ⇒ nada. */}
            <GenerationSourceNotice source={ofvSource} artifact='la OFV' />

            {!personaApproved ? (
              <Card>
                <CardContent className='text-muted-foreground py-8 text-center text-sm'>
                  🔒 Primero aprueba la Buyer Persona
                </CardContent>
              </Card>
            ) : (
              <>
                <BlockCard title='1. Big Promise' badge='Ecuación Hormozi'>
                  <Field
                    label='[Resultado] + [Plazo] + [Vehículo] + [Objeción anulada]'
                    dot='ai'
                  >
                    <Textarea
                      value={ofvFields.big_promise}
                      onChange={(e) => updateOFV('big_promise', e.target.value)}
                      rows={2}
                      placeholder='Ej: "Presencia digital completa en 90 días con el Sistema VIP™ — sin frenar tu operación"'
                    />
                  </Field>
                </BlockCard>

                <BlockCard title='2. Vehículo Único (Método Branded™)'>
                  <Field label='Nombre del método (con ™)' dot='ai'>
                    <Input
                      value={ofvFields.vehicle_name}
                      onChange={(e) =>
                        updateOFV('vehicle_name', e.target.value)
                      }
                      placeholder='Ej: Sistema VIP™ (Verificación + Identidad + Presencia)'
                    />
                  </Field>
                  <Field label='3-5 pasos del método' dot='ai'>
                    <Textarea
                      value={ofvFields.vehicle_steps}
                      onChange={(e) =>
                        updateOFV('vehicle_steps', e.target.value)
                      }
                      rows={3}
                      placeholder='1. Verificación GBP&#10;2. Identidad digital&#10;3. Presencia web + SEO'
                    />
                  </Field>
                </BlockCard>

                <BlockCard title='3. Quick Win' badge='Primeros 7-14 días'>
                  <Field label='Entregable inicial medible' dot='ai'>
                    <Input
                      value={ofvFields.quick_win}
                      onChange={(e) => updateOFV('quick_win', e.target.value)}
                      placeholder='Ej: "GBP activo en 7 días. Primera reseña antes del día 15."'
                    />
                  </Field>
                </BlockCard>

                <BlockCard title='4. Decision Frame' badge='Principio de Tres'>
                  <div className='grid grid-cols-3 gap-3'>
                    <Field label='Opción A (entrada)' dot='ai'>
                      <Textarea
                        value={ofvFields.option_a}
                        onChange={(e) => updateOFV('option_a', e.target.value)}
                        rows={3}
                        placeholder='Paquete base...'
                      />
                    </Field>
                    <Field label='Opción B (recomendado)' dot='ai'>
                      <Textarea
                        value={ofvFields.option_b}
                        onChange={(e) => updateOFV('option_b', e.target.value)}
                        rows={3}
                        placeholder='Paquete recomendado...'
                      />
                    </Field>
                    <Field label='Opción C (status quo)' dot='ai'>
                      <Textarea
                        value={ofvFields.option_c}
                        onChange={(e) => updateOFV('option_c', e.target.value)}
                        rows={3}
                        placeholder='Consecuencias de no actuar...'
                      />
                    </Field>
                  </div>
                </BlockCard>

                <BlockCard title='5. Entregables específicos'>
                  <Field label='Lista de qué recibe el cliente' dot='ai'>
                    <Textarea
                      value={ofvFields.deliverables}
                      onChange={(e) =>
                        updateOFV('deliverables', e.target.value)
                      }
                      rows={4}
                      placeholder='- GBP verificado y optimizado&#10;- Website con SEO local&#10;- 3 meses de posts GBP&#10;- Fotos profesionales con alt-text'
                    />
                  </Field>
                </BlockCard>

                <BlockCard title='6-7. Garantía y urgencia'>
                  <div className='grid grid-cols-2 gap-3'>
                    <Field
                      label='Garantía / Risk Reversal'
                      dot='manual'
                      hint='Basado en las garantías del Brief — elabora y formaliza'
                    >
                      <Textarea
                        value={ofvFields.guarantee}
                        onChange={(e) => updateOFV('guarantee', e.target.value)}
                        rows={2}
                        placeholder='Real y verificable...'
                      />
                    </Field>
                    <Field
                      label='Urgencia / Escasez (ÉTICA)'
                      dot='ai'
                      hint='No fabricar escasez falsa'
                    >
                      <Textarea
                        value={ofvFields.urgency_scarcity}
                        onChange={(e) =>
                          updateOFV('urgency_scarcity', e.target.value)
                        }
                        rows={2}
                        placeholder='Cupos limitados, bono con fecha...'
                      />
                    </Field>
                  </div>
                </BlockCard>

                <BlockCard title='8. Social Proof'>
                  <Field
                    label='Prueba social real y verificable'
                    dot='manual'
                    hint='Solo lo que el Brief o el contexto respalden — nunca inventar'
                  >
                    <Textarea
                      value={ofvFields.social_proof}
                      onChange={(e) =>
                        updateOFV('social_proof', e.target.value)
                      }
                      rows={3}
                      placeholder='Enlace a reseñas reales, o [PENDIENTE: aportar reseñas/testimonios reales del cliente]'
                    />
                  </Field>
                </BlockCard>

                <div className='flex flex-wrap gap-2'>
                  <Button onClick={handleGenerateOFV} disabled={generatingOfv}>
                    {generatingOfv ? (
                      <>
                        <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                        Generando...
                      </>
                    ) : (
                      '✨ Generar OFV con AI'
                    )}
                  </Button>
                  {/* F-108 R-07 — visible sin generar (no gateado por ofvRecord). */}
                  {!ofvApproved && (
                    <Button
                      variant='outline'
                      onClick={handleSaveDraftOFV}
                      disabled={savingDraftOfv || generatingOfv}
                    >
                      {savingDraftOfv ? (
                        <>
                          <Icons.spinner className='mr-2 h-4 w-4 animate-spin' />
                          Guardando...
                        </>
                      ) : (
                        'Guardar borrador'
                      )}
                    </Button>
                  )}
                  {ofvRecord && ofvRecord.status !== 'approved' && (
                    <Button
                      onClick={handleApproveOFV}
                      disabled={approvingOfv}
                      className='bg-green-600 hover:bg-green-700'
                    >
                      {approvingOfv ? 'Aprobando...' : '✓ Aprobar OFV'}
                    </Button>
                  )}
                  {ofvRecord?.status === 'approved' && (
                    <p className='self-center text-sm font-medium text-green-700'>
                      ✅ OFV aprobado. Pipeline de contenido desbloqueado.
                    </p>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
