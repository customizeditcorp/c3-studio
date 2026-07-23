/**
 * F-089 — Aprobación de contenido GBP (content_status en gbp_profiles) + anti-duplicación
 * de generated_outputs + preview honesto. Cobertura C-02: cada R-XX → ≥1 test.
 *
 * Ejercita el code-path REAL (§6.1): las mismas funciones puras del seam que usan la
 * route, el handler de la página y el preview; más aserciones estructurales sobre los
 * archivos cableados (patrón F-088). `Ref: R-01..R-14`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GBP_CONTENT_STATUS_DRAFT,
  GBP_CONTENT_STATUS_APPROVED,
  GBP_CONTENT_APPROVED_ACTION,
  GBP_DESCRIPTION_OUTPUT_TYPE,
  withDraftContentStatus,
  resolveApprovedGbpDescription,
  shouldPersistGeneratedOutput,
  approveGbpContent,
  type GbpContentApprovalClient
} from '../../src/lib/gbp-slice/content-status.ts';

const read = (p: string) => readFileSync(p, 'utf8');
// Elimina comentarios TS (`/* */`, `//`) para aserciones que deben mirar CÓDIGO, no prosa.
const stripTsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

// Vocabulario RecordStatus (src/types/c3-domain.ts:17-22) — el set que comparten
// briefs/personas/offers. Los constantes del seam deben pertenecer a este set (R-02/R-11).
const RECORD_STATUS_VALUES = [
  'draft',
  'in_review',
  'approved',
  'rejected',
  'published'
];

// --- Mock del write client (update().eq() + insert()) sobre el seam estructural ---
function mockApprovalClient(opts?: { updateError?: unknown }): {
  client: GbpContentApprovalClient;
  captured: {
    table: string;
    op: 'update' | 'insert';
    values: Record<string, unknown>;
  }[];
} {
  const captured: {
    table: string;
    op: 'update' | 'insert';
    values: Record<string, unknown>;
  }[] = [];
  const client: GbpContentApprovalClient = {
    from(table) {
      return {
        update(values) {
          return {
            eq: async () => {
              captured.push({ table, op: 'update', values });
              return { error: opts?.updateError ?? null };
            }
          };
        },
        insert: async (values) => {
          captured.push({ table, op: 'insert', values });
          return { error: null };
        }
      };
    }
  };
  return { client, captured };
}

// ===================================================================
// R-01 (T-09/T-12) — gbp_profiles es el ÚNICO home de gbp_description
// ===================================================================
test('T-12 (R-01) resolveApprovedGbpDescription lee de gbp_profiles; ningún path deriva de generated_outputs', () => {
  // El resolvedor sólo consume la fila gbp_profiles (content_status + description).
  const desc = resolveApprovedGbpDescription({
    content_status: 'approved',
    description: 'Descripción viva'
  });
  assert.equal(desc, 'Descripción viva');
  // gbp_description NO tiene home en generated_outputs (skip del write).
  assert.equal(
    shouldPersistGeneratedOutput(GBP_DESCRIPTION_OUTPUT_TYPE),
    false
  );
});

test('T-12 (R-01) el preview NO deriva la descripción de generated_outputs (source)', () => {
  const page = read('src/app/preview/[token]/page.tsx');
  assert.ok(
    !/from\(['"]generated_outputs['"]\)/.test(page),
    'preview/page.tsx no debe consultar generated_outputs'
  );
  assert.ok(!/generatedDescription/.test(page));
});

// ===================================================================
// R-02 (T-13) — columna content_status: default draft, RecordStatus, ortogonal
// ===================================================================
test('T-13 (R-02) migración añade content_status text NOT NULL DEFAULT draft (aditiva)', () => {
  const sql = read('supabase/migrations/20260723_f089_gbp_content_status.sql');
  assert.match(
    sql,
    /ADD COLUMN content_status text NOT NULL DEFAULT 'draft'/,
    'la migración debe añadir content_status default draft'
  );
  assert.ok(
    !/GENERATED\s+ALWAYS/i.test(sql),
    'no debe ser columna GENERATED ALWAYS (trap F-080)'
  );
  assert.ok(!/DROP COLUMN|ALTER COLUMN|RENAME/i.test(sql), 'debe ser aditiva');
});

test('T-13 (R-02) constantes del seam ∈ RecordStatus; default = draft', () => {
  assert.equal(GBP_CONTENT_STATUS_DRAFT, 'draft');
  assert.equal(GBP_CONTENT_STATUS_APPROVED, 'approved');
  assert.ok(RECORD_STATUS_VALUES.includes(GBP_CONTENT_STATUS_DRAFT));
  assert.ok(RECORD_STATUS_VALUES.includes(GBP_CONTENT_STATUS_APPROVED));
});

test('T-13 (R-02) content_status es ortogonal a verification_status (el seam no lo toca)', () => {
  const seamCode = stripTsComments(read('src/lib/gbp-slice/content-status.ts'));
  assert.ok(
    !/verification_status/.test(seamCode),
    'el CÓDIGO del seam de aprobación no debe leer/escribir verification_status'
  );
});

// ===================================================================
// R-03 (T-14) — generación de gbp_description NO inserta en generated_outputs
// ===================================================================
test('T-14 (R-03) shouldPersistGeneratedOutput: false para gbp_description, true para el resto', () => {
  assert.equal(shouldPersistGeneratedOutput('gbp_description'), false);
  for (const t of ['gbp_posts', 'campaign_copy', 'website_home', 'nurturing']) {
    assert.equal(shouldPersistGeneratedOutput(t), true);
  }
});

test('T-14 (R-03) route y edge guardan el skip de gbp_description (source, paridad)', () => {
  const route = read('src/app/api/generate-content/route.ts');
  assert.match(
    route,
    /outputSteps\.includes\(step\)\s*&&\s*shouldPersistGeneratedOutput\(step\)/
  );
  const edge = read('supabase/functions/generate-content/index.ts');
  assert.match(
    edge,
    /outputSteps\.includes\(step\)\s*&&\s*step\s*!==\s*'gbp_description'/
  );
});

// ===================================================================
// R-04 (T-15) — approveGbpContent: content_status='approved' + activity_log
// ===================================================================
test('T-15 (R-04) approveGbpContent fija approved en gbp_profiles + escribe activity_log', async () => {
  const { client, captured } = mockApprovalClient();
  const ok = await approveGbpContent({
    supabase: client,
    gbpProfileId: 'gbp-1',
    clientId: 'client-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    now: () => '2026-07-23T12:00:00.000Z'
  });
  assert.equal(ok, true);
  const upd = captured.find((c) => c.table === 'gbp_profiles');
  assert.ok(upd && upd.op === 'update');
  assert.equal(upd.values.content_status, 'approved');
  assert.equal(upd.values.updated_at, '2026-07-23T12:00:00.000Z');
  const log = captured.find((c) => c.table === 'activity_log');
  assert.ok(log && log.op === 'insert');
  assert.equal(log.values.action, GBP_CONTENT_APPROVED_ACTION);
  assert.equal(log.values.action, 'gbp_content_approved');
  assert.equal(log.values.entity_id, 'gbp-1');
  assert.equal(log.values.client_id, 'client-1');
});

test('T-15 (R-04) approveGbpContent lee error del update y THROWea (sin éxito falso)', async () => {
  const { client } = mockApprovalClient({ updateError: { message: 'boom' } });
  await assert.rejects(
    approveGbpContent({
      supabase: client,
      gbpProfileId: 'gbp-1',
      clientId: 'c',
      tenantId: 't',
      userId: 'u'
    })
  );
});

test('T-15 (R-04) approveGbpContent sin gbpProfileId → no-op (false), no escribe', async () => {
  const { client, captured } = mockApprovalClient();
  const ok = await approveGbpContent({
    supabase: client,
    gbpProfileId: null,
    clientId: 'c',
    tenantId: 't',
    userId: 'u'
  });
  assert.equal(ok, false);
  assert.equal(captured.length, 0);
});

// ===================================================================
// R-05 (T-16) — botón visible en draft, oculto/reemplazado en approved
// ===================================================================
test('T-16 (R-05) el tab Perfil GBP muestra el botón sólo si NO está aprobado (source)', () => {
  const page = read('src/app/(app)/gbp/[clientId]/page.tsx');
  assert.match(page, /Aprobar contenido GBP/);
  assert.match(page, /contentStatus === GBP_CONTENT_STATUS_APPROVED/);
  // en approved se reemplaza por un badge, no el botón
  assert.match(page, /Contenido aprobado/);
});

// ===================================================================
// R-06 (T-17) — regenerar/editar repone draft; sólo aprobar lleva a approved
// ===================================================================
test('T-17 (R-06) withDraftContentStatus sella draft y OVERRIDE cualquier estado previo', () => {
  const fresh = withDraftContentStatus({ description: 'x' });
  assert.equal(fresh.content_status, 'draft');
  const overridden = withDraftContentStatus({
    description: 'x',
    content_status: 'approved'
  });
  assert.equal(overridden.content_status, 'draft');
});

test('T-17 (R-06) generate-gbp (regenerar) y handleSaveProfile (editar) reponen draft (source)', () => {
  const gen = read('src/app/api/generate-gbp/route.ts');
  assert.match(gen, /withDraftContentStatus\(/);
  const page = read('src/app/(app)/gbp/[clientId]/page.tsx');
  assert.match(page, /const data = withDraftContentStatus\(/);
});

test('T-17 (R-06) la ÚNICA fuente de "approved" es approveGbpContent, no un write de edición', () => {
  const seam = read('src/lib/gbp-slice/content-status.ts');
  // approved sólo aparece como valor en approveGbpContent (via GBP_CONTENT_STATUS_APPROVED).
  assert.ok(
    !/content_status:\s*'approved'/.test(seam),
    'ningún write debe fijar content_status a un literal approved fuera del seam de aprobación'
  );
});

// ===================================================================
// R-07 (T-18) — el preview ya no consulta generated_outputs; deriva de gbp_profiles
// ===================================================================
test('T-18 (R-07) preview deriva content_status de gbp_profiles (fetch existente)', () => {
  const page = read('src/app/preview/[token]/page.tsx');
  assert.match(page, /from\('gbp_profiles'\)/);
  assert.ok(
    !/from\(['"]generated_outputs['"]\)/.test(page),
    'preview/page.tsx no debe consultar generated_outputs (sólo el comentario lo nombra)'
  );
});

// ===================================================================
// R-08 (T-19) — approved → muestra la descripción
// ===================================================================
test('T-19 (R-08) content_status=approved → muestra gbp_profiles.description', () => {
  assert.equal(
    resolveApprovedGbpDescription({
      content_status: 'approved',
      description: 'Somos JD Valley...'
    }),
    'Somos JD Valley...'
  );
});

// ===================================================================
// R-09 (T-20) — no-approved → NO muestra la descripción
// ===================================================================
test('T-20 (R-09) content_status != approved → null (draft/in_review/undefined/null)', () => {
  assert.equal(
    resolveApprovedGbpDescription({
      content_status: 'draft',
      description: 'x'
    }),
    null
  );
  assert.equal(
    resolveApprovedGbpDescription({
      content_status: 'in_review',
      description: 'x'
    }),
    null
  );
  assert.equal(resolveApprovedGbpDescription({ description: 'x' }), null);
  assert.equal(resolveApprovedGbpDescription(null), null);
  // approved pero descripción vacía → null (degradación honesta)
  assert.equal(
    resolveApprovedGbpDescription({
      content_status: 'approved',
      description: '  '
    }),
    null
  );
});

// ===================================================================
// R-10 (T-21) — backfill: description no-vacía → approved; vacía → draft
// ===================================================================
test('T-21 (R-10) la migración backfillea filas con descripción no-vacía a approved', () => {
  const sql = read('supabase/migrations/20260723_f089_gbp_content_status.sql');
  assert.match(sql, /UPDATE public\.gbp_profiles/);
  assert.match(sql, /SET content_status = 'approved'/);
  assert.match(sql, /description IS NOT NULL/);
  assert.match(sql, /btrim\(description\)\s*<>\s*''/);
});

test('T-21 (R-10) la semántica del backfill = la del gating (no-vacía+approved ⇒ visible)', () => {
  // Una fila viva backfilleada (approved + descripción) sigue mostrándose en el preview.
  assert.equal(
    resolveApprovedGbpDescription({
      content_status: 'approved',
      description: 'JD Valley live'
    }),
    'JD Valley live'
  );
});

// ===================================================================
// R-11 (T-22) — briefs/personas/offers + RecordStatus intactos
// ===================================================================
test('T-22 (R-11) el flujo de aprobación de briefs sigue intacto (handleApproveBrief)', () => {
  const brief = read('src/app/(app)/onboarding/brief/[clientId]/page.tsx');
  assert.match(brief, /handleApproveBrief/);
  assert.match(brief, /\.from\('briefs'\)\s*\.update\(\{ status: 'approved'/);
  assert.match(brief, /handleApprovePersona/);
});

test('T-22 (R-11) RecordStatus conserva los 5 valores (sin cambios)', () => {
  const domain = read('src/types/c3-domain.ts');
  for (const v of RECORD_STATUS_VALUES) {
    assert.ok(
      new RegExp(`'${v}'`).test(domain),
      `RecordStatus debe conservar '${v}'`
    );
  }
});

// ===================================================================
// R-12 (T-23) — F-084/F-087 intactos (guard anti-blob + verification_status)
// ===================================================================
test('T-23 (R-12) generate-gbp conserva el guard anti-blob F-084 (guardGbpDescription)', () => {
  const gen = read('src/app/api/generate-gbp/route.ts');
  assert.match(gen, /guardGbpDescription/);
});

test('T-23 (R-12) el activo F-087 (verification_status) es intacto y separado', () => {
  // el seam de F-087 sigue existiendo y controla verification_status; content-status no lo toca.
  const asset = read('src/lib/gbp-slice/gbp-asset.ts');
  assert.match(asset, /verification_status/);
});

// ===================================================================
// R-13 (T-24) — previews.approved + preview-approve/route.ts sin cambios
// ===================================================================
test('T-24 (R-13) preview-approve/route.ts sigue controlando previews.approved', () => {
  const route = read('src/app/api/preview-approve/route.ts');
  assert.match(route, /previews/);
  assert.match(route, /approved/);
});

// ===================================================================
// R-14 (T-25) — sin borrado automático de generated_outputs
// ===================================================================
test('T-25 (R-14) ningún archivo F-089 borra filas de generated_outputs', () => {
  const route = read('src/app/api/generate-content/route.ts');
  const edge = read('supabase/functions/generate-content/index.ts');
  const sql = read('supabase/migrations/20260723_f089_gbp_content_status.sql');
  for (const [name, src] of [
    ['route', route],
    ['edge', edge]
  ] as const) {
    assert.ok(
      !/from\(['"]generated_outputs['"]\)\s*\.delete\(/.test(src),
      `${name}: no debe borrar filas de generated_outputs`
    );
  }
  assert.ok(
    !/DELETE\s+FROM[\s\S]*generated_outputs/i.test(sql),
    'la migración no debe borrar filas de generated_outputs'
  );
});
