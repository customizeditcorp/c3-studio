/**
 * F-100 — Snapshot inmutable del entregable (columna jsonb aditiva + captura set-once + read
 * snapshot-first, Scope A). Cubre: la migración aditiva (R-01/R-13), la honestidad heredada del
 * builder (R-03/R-04), el reader snapshot-first con fallback (R-08/R-09/R-10), el write-path
 * set-once (R-02/R-05/R-06/R-07) y la no-regresión (R-10/R-11/R-12/R-14).
 *
 * Ejercita el code-path REAL (§6.1): las MISMAS funciones puras que consumen la ruta pública y
 * la ficha, + el MISMO `persistClientStatus` que invoca el handler de confirmación (mockeando
 * sólo el cliente Supabase, ya que la escritura real a la DB es frontera F-074). La captura
 * set-once y el congelamiento se VERIFICAN AUTORITATIVAMENTE en vivo (T-15, §6.1).
 * `Ref: R-01, R-02, R-03, R-04, R-05, R-06, R-07, R-08, R-09, R-10, R-11, R-12, R-13, R-14`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  SNAPSHOT_VERSION,
  buildDeliverableSnapshot,
  buildPublicDeliverableView,
  resolveDeliverableView,
  isPublicDeliverable,
  type PublicDeliverableInputs,
  type DeliverableSnapshotEnvelope
} from '../../src/lib/clients/deliverable-public.ts';
import {
  persistClientStatus,
  type ClientStatusWriteClient
} from '../../src/lib/clients/client-status.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const stripComments = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments /* ... */
    .replace(/^\s*\/\/.*$/gm, ''); // line comments // ...

const CAPTURED_AT = '2026-07-24T10:00:00.000Z';

// Entregable "deshonesto en los inputs": place_id secreto, NO verificado, contenido NO
// aprobado. El view congelado DEBE heredar la sanitización de F-093 (place_id nunca, verified
// false, description null).
const DISHONEST: PublicDeliverableInputs = {
  deliveredAt: CAPTURED_AT,
  gbpProfile: {
    gbp_url: 'https://maps.google.com/?cid=123',
    place_id: 'ChIJsecretPlaceId',
    verification_status: 'created', // != 'verified' → verified:false
    content_status: 'draft', // != 'approved' → description:null
    description: 'texto NO aprobado',
    business_name: 'JD Valley Auto',
    phone: '(805) 111-2222',
    website_url: 'https://jdvalley.example',
    address: '123 Main St, Buellton, CA'
  },
  client: { business_name: 'JD Valley (fallback)', phone: '(805) 000-0000' },
  photos: [
    {
      id: 'p1',
      public_url: 'https://cdn.example/1.jpg',
      alt_text_final: 'frente'
    }
  ]
};

// Entregable "completo y honesto": verificado + contenido aprobado.
const FULL: PublicDeliverableInputs = {
  deliveredAt: CAPTURED_AT,
  gbpProfile: {
    gbp_url: 'https://maps.google.com/?cid=999',
    place_id: 'ChIJanotherSecret',
    verification_status: 'verified',
    content_status: 'approved',
    description: 'Somos el mejor taller de la ciudad.',
    business_name: 'JD Valley Auto',
    phone: '(805) 111-2222',
    website_url: 'https://jdvalley.example',
    address: '123 Main St'
  },
  client: null,
  photos: []
};

// ===================================================================
// T-08 — Migración aditiva, nullable, sin default/backfill/GENERATED (R-01, R-13)
// ===================================================================
test('T-08 la migración solo agrega deliverable_snapshot jsonb (aditivo, nullable) (R-01)', () => {
  const sql = read(
    '../../supabase/migrations/20260724_f100_clients_deliverable_snapshot.sql'
  );
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  assert.match(
    statements,
    /ADD COLUMN IF NOT EXISTS\s+deliverable_snapshot\s+jsonb/i
  );
  // Nullable: sin NOT NULL, sin DEFAULT, sin backfill (UPDATE), sin destructivo, sin GENERATED.
  assert.doesNotMatch(statements, /NOT NULL/i);
  assert.doesNotMatch(statements, /DEFAULT/i);
  assert.doesNotMatch(statements, /UPDATE/i);
  assert.doesNotMatch(statements, /DROP/i);
  assert.doesNotMatch(statements, /RENAME/i);
  assert.doesNotMatch(statements, /GENERATED/i);
  const alters = statements.match(/ALTER TABLE[^;]*/gi) ?? [];
  assert.equal(alters.length, 1);
  assert.match(alters[0], /ADD COLUMN/i);
});

test('T-08 la migración documenta la frontera F-074 (no aplicada, apply precede al deploy) (R-13)', () => {
  const sql = read(
    '../../supabase/migrations/20260724_f100_clients_deliverable_snapshot.sql'
  );
  assert.match(sql, /F-074/);
  assert.match(sql, /NO aplicada/i);
  assert.match(sql, /PRECEDE al deploy/i);
});

// ===================================================================
// T-09 — Honestidad heredada del snapshot (R-03, R-04)
// ===================================================================
test('T-09 buildDeliverableSnapshot produce el envelope {version, captured_at, view} (R-04)', () => {
  const env = buildDeliverableSnapshot(FULL, () => CAPTURED_AT);
  assert.equal(env.version, SNAPSHOT_VERSION);
  assert.equal(env.captured_at, CAPTURED_AT);
  assert.equal(typeof env.view, 'object');
});

test('T-09 el view del envelope es IDÉNTICO a buildPublicDeliverableView(inputs) (R-04)', () => {
  const env = buildDeliverableSnapshot(FULL, () => CAPTURED_AT);
  assert.deepEqual(env.view, buildPublicDeliverableView(FULL));
});

test('T-09 hereda la honestidad F-093: sin place_id, verified:false, description:null (R-03)', () => {
  const env = buildDeliverableSnapshot(DISHONEST, () => CAPTURED_AT);
  const v = env.view;
  // place_id NUNCA presente (ni el campo ni el string en la serialización del view).
  assert.equal(Object.prototype.hasOwnProperty.call(v, 'place_id'), false);
  assert.doesNotMatch(JSON.stringify(v), /ChIJsecretPlaceId/);
  // verification_status != 'verified' → verified:false, sin el label crudo.
  assert.equal(v.verified, false);
  assert.doesNotMatch(JSON.stringify(v), /created/);
  // content_status != 'approved' → description:null, sin filtrar contenido no aprobado.
  assert.equal(v.description, null);
  assert.doesNotMatch(JSON.stringify(v), /texto NO aprobado/);
});

test('T-09 `now` por defecto genera un captured_at ISO válido (R-04)', () => {
  const env = buildDeliverableSnapshot(FULL);
  assert.equal(typeof env.captured_at, 'string');
  assert.equal(Number.isNaN(Date.parse(env.captured_at)), false);
});

// ===================================================================
// T-10 — Reader snapshot-first con fallback a live (R-08, R-09, R-10)
// ===================================================================

// Un envelope congelado cuyo `view` DIFIERE de lo que producirían los liveInputs: el reader
// debe servir el view congelado, NO recomputar.
const FROZEN_ENVELOPE: DeliverableSnapshotEnvelope = {
  version: SNAPSHOT_VERSION,
  captured_at: CAPTURED_AT,
  view: {
    businessName: 'NOMBRE CONGELADO',
    gbpUrl: 'https://frozen.example',
    verified: true,
    description: 'descripción congelada',
    nap: { phone: '(000) 000-0000', website: null, address: null },
    photos: [],
    deliveredAt: CAPTURED_AT,
    category: null,
    hours: null
  }
};

test('T-10 (i) envelope válido → devuelve snapshot.view TAL CUAL, sin recomputar (R-08)', () => {
  const view = resolveDeliverableView({
    snapshot: FROZEN_ENVELOPE,
    liveInputs: FULL // difiere del view congelado
  });
  assert.deepEqual(view, FROZEN_ENVELOPE.view);
  // No es lo que producirían los liveInputs (prueba de congelamiento en unit-level).
  assert.notDeepEqual(view, buildPublicDeliverableView(FULL));
  assert.equal(view.businessName, 'NOMBRE CONGELADO');
});

test('T-10 (ii) snapshot=null → cae a live buildPublicDeliverableView(liveInputs) (R-09)', () => {
  const view = resolveDeliverableView({ snapshot: null, liveInputs: FULL });
  assert.deepEqual(view, buildPublicDeliverableView(FULL));
});

test('T-10 (iii) versión desconocida → cae a live (R-09)', () => {
  const view = resolveDeliverableView({
    snapshot: { ...FROZEN_ENVELOPE, version: 999 },
    liveInputs: FULL
  });
  assert.deepEqual(view, buildPublicDeliverableView(FULL));
});

test('T-10 (iii) forma inválida (view ausente / no-objeto / undefined) → cae a live (R-09)', () => {
  for (const bad of [
    { version: SNAPSHOT_VERSION }, // sin view
    { version: SNAPSHOT_VERSION, view: null },
    { version: SNAPSHOT_VERSION, view: 'no-objeto' },
    undefined,
    'garbage',
    42
  ]) {
    const view = resolveDeliverableView({ snapshot: bad, liveInputs: FULL });
    assert.deepEqual(view, buildPublicDeliverableView(FULL));
  }
});

test('T-10 el componente consume el MISMO PublicDeliverableView en ambos caminos (R-10)', () => {
  // Snapshot y live producen la MISMA forma (mismas keys) → el componente no distingue.
  const frozen = resolveDeliverableView({
    snapshot: FROZEN_ENVELOPE,
    liveInputs: FULL
  });
  const live = resolveDeliverableView({ snapshot: null, liveInputs: FULL });
  assert.deepEqual(Object.keys(frozen).sort(), Object.keys(live).sort());
});

// ===================================================================
// T-11 — Write-path set-once (mock del ClientStatusWriteClient, patrón f092) (R-02/R-05/R-06/R-07)
// ===================================================================
const NOW = () => '2026-07-24T12:00:00.000Z';

function mockWriteClient(opts: { error?: unknown } = {}): {
  client: ClientStatusWriteClient;
  captured: {
    table: string;
    values: Record<string, unknown>;
    filters: { column: string; value: string }[];
  }[];
} {
  const captured: {
    table: string;
    values: Record<string, unknown>;
    filters: { column: string; value: string }[];
  }[] = [];
  const error = opts.error ?? null;
  const client: ClientStatusWriteClient = {
    from(table) {
      return {
        update(values) {
          const filters: { column: string; value: string }[] = [];
          const chain = {
            eq(column: string, value: string) {
              filters.push({ column, value });
              return {
                eq(c2: string, v2: string) {
                  filters.push({ column: c2, value: v2 });
                  captured.push({ table, values, filters });
                  return Promise.resolve({ error });
                }
              };
            }
          };
          return chain;
        }
      };
    }
  };
  return { client, captured };
}

const SNAP: DeliverableSnapshotEnvelope = buildDeliverableSnapshot(
  FULL,
  () => CAPTURED_AT
);

test('T-11 (i) delivered + delivered_at NULL + snapshot → UPDATE incluye deliverable_snapshot Y delivered_at (mismo UPDATE, id+tenant) (R-02/R-07)', async () => {
  const { client, captured } = mockWriteClient();
  await persistClientStatus({
    supabase: client,
    clientId: 'c1',
    tenantId: 't1',
    target: 'delivered',
    currentDeliveredAt: null,
    deliverableSnapshot: SNAP,
    now: NOW
  });
  assert.equal(captured.length, 1);
  const { values, filters } = captured[0];
  assert.equal(values.status, 'delivered');
  assert.equal(values.delivered_at, NOW());
  assert.deepEqual(values.deliverable_snapshot, SNAP); // mismo UPDATE
  // Aislamiento por id + tenant_id (mirror del write de F-092).
  assert.deepEqual(filters, [
    { column: 'id', value: 'c1' },
    { column: 'tenant_id', value: 't1' }
  ]);
});

test('T-11 (ii) delivered + delivered_at YA presente → UPDATE NO incluye/pisa deliverable_snapshot (set-once, R-05)', async () => {
  const { client, captured } = mockWriteClient();
  await persistClientStatus({
    supabase: client,
    clientId: 'c1',
    tenantId: 't1',
    target: 'delivered',
    currentDeliveredAt: '2026-01-01T00:00:00.000Z', // ya entregado
    deliverableSnapshot: SNAP, // aun si el caller lo pasara, NO debe escribirse
    now: NOW
  });
  assert.equal(values(captured).status, 'delivered');
  assert.equal('deliverable_snapshot' in values(captured), false);
  assert.equal('delivered_at' in values(captured), false); // set-once de F-092 intacto
});

test('T-11 (iii) target distinto de delivered → UPDATE NO incluye deliverable_snapshot (R-05)', async () => {
  for (const target of ['active', 'onboarding', 'maintenance', 'paused']) {
    const { client, captured } = mockWriteClient();
    await persistClientStatus({
      supabase: client,
      clientId: 'c1',
      tenantId: 't1',
      target,
      currentDeliveredAt: null,
      deliverableSnapshot: SNAP,
      now: NOW
    });
    assert.equal(values(captured).status, target);
    assert.equal(
      'deliverable_snapshot' in values(captured),
      false,
      `${target}: ninguna otra transición escribe el snapshot`
    );
  }
});

test('T-11 (iv) delivered + delivered_at NULL + snapshot undefined/null (captura falló) → delivered_at sin deliverable_snapshot (no bloquea, R-06)', async () => {
  for (const snap of [undefined, null]) {
    const { client, captured } = mockWriteClient();
    await persistClientStatus({
      supabase: client,
      clientId: 'c1',
      tenantId: 't1',
      target: 'delivered',
      currentDeliveredAt: null,
      deliverableSnapshot: snap,
      now: NOW
    });
    // La entrega SE COMPLETA: delivered_at se setea; sin snapshot (read caerá a live).
    assert.equal(values(captured).delivered_at, NOW());
    assert.equal('deliverable_snapshot' in values(captured), false);
  }
});

// Helper: los `values` del único UPDATE capturado.
function values(
  captured: { values: Record<string, unknown> }[]
): Record<string, unknown> {
  assert.equal(captured.length, 1);
  return captured[0].values;
}

// ===================================================================
// T-12 — No-regresión (R-10, R-11, R-12, R-14)
// ===================================================================
test('T-12 R-11: tab operador F-092 intacto (buildDeliverableSummary sigue LIVE, sin snapshot)', () => {
  const deliverable = read('../../src/lib/clients/deliverable.ts');
  assert.match(deliverable, /export function buildDeliverableSummary/);
  // El read-model operador NO conoce el snapshot (sigue agregación viva).
  assert.doesNotMatch(deliverable, /deliverable_snapshot/);
  assert.doesNotMatch(deliverable, /resolveDeliverableView/);
});

test('T-12 R-10/R-12: el componente público consume PublicDeliverableView sin cambios de forma', () => {
  const view = read(
    '../../src/app/deliverable/[token]/deliverable-public-view.tsx'
  );
  assert.match(view, /type\s*\{\s*PublicDeliverableView\s*\}/);
  // El componente no toca el snapshot (recibe el view ya resuelto).
  assert.doesNotMatch(view, /deliverable_snapshot/);
  assert.doesNotMatch(view, /resolveDeliverableView/);
});

test('T-12 R-12/R-14: la ruta pública sigue SIN write y usa resolveDeliverableView (snapshot-first)', () => {
  const route = stripComments(
    read('../../src/app/deliverable/[token]/page.tsx')
  );
  // CERO write (F-093 R-14): sin escritura del cliente Supabase.
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  // Read snapshot-first: usa resolveDeliverableView, no la llamada directa a buildPublic...
  assert.match(route, /resolveDeliverableView\(/);
  assert.doesNotMatch(route, /buildPublicDeliverableView\(/);
  // La columna se lee vía select EXPLÍCITO (no select('*')): seguro sólo post-apply (R-13).
  assert.match(route, /deliverable_snapshot/);
  // Gate `isPublicDeliverable` conservado (R-12).
  assert.match(route, /isPublicDeliverable\(/);
  // Filtro de lectura de fotos aprobadas conservado (patrón preview).
  assert.match(route, /\.eq\('approved',\s*true\)/);
});

test('T-12 R-12: gate isPublicDeliverable + set-once delivered_at F-092 intactos', () => {
  // isPublicDeliverable sigue exportado y funcional.
  assert.equal(
    isPublicDeliverable({ deliveredAt: '2026-07-24T00:00:00Z' }),
    true
  );
  assert.equal(isPublicDeliverable({ deliveredAt: null }), false);
  // El set-once de delivered_at (F-092) sigue en el write-path bajo la misma guarda.
  const cs = read('../../src/lib/clients/client-status.ts');
  assert.match(cs, /target === 'delivered' && !deps\.currentDeliveredAt/);
  assert.match(cs, /values\.delivered_at = now/);
});

test('T-12 R-12: el token F-093 (deliverable_token) sigue en la migración y la ficha', () => {
  const ficha = read('../../src/app/(app)/clients/[id]/page.tsx');
  assert.match(ficha, /deliverable_token/);
  // La ficha sigue leyendo el cliente con select('*') (tolera columnas nuevas pre-apply).
  assert.match(ficha, /\.from\('clients'\)[\s\S]*?\.select\('\*'\)/);
});
