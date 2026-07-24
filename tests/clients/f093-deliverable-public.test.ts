/**
 * F-093 — Página client-facing del entregable. Cubre el seam PURO client-safe
 * (`buildPublicDeliverableView`), el gate `isPublicDeliverable` y la lógica de link
 * (`resolveDeliverableLinkAction`), + guards estructurales read-only (R-14/R-15) y
 * no-regresión (R-16/R-17/R-18).
 *
 * Ejercita el code-path REAL (§6.1): las MISMAS funciones puras que consumen la ruta pública
 * y la ficha, no una re-implementación.
 * `Ref: R-02, R-03, R-04, R-05, R-08, R-09, R-10, R-11, R-12, R-13, R-14, R-15, R-16, R-17, R-18`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildPublicDeliverableView,
  isPublicDeliverable,
  resolveDeliverableLinkAction,
  type PublicDeliverableInputs
} from '../../src/lib/clients/deliverable-public.ts';
import { CONTENT_STALE_LABEL } from '../../src/lib/clients/deliverable.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * Elimina comentarios de código (bloque `/* *​/`, JSX `{/* *​/}` y línea `//`) para que los
 * guards estructurales chequeen el CÓDIGO REAL, no la documentación (un comentario que
 * menciona "Aprobar" o ".update" no es una violación). Preserva el resto intacto.
 */
const stripComments = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments /* ... */
    .replace(/^\s*\/\/.*$/gm, ''); // line comments // ...

// Inputs de un entregable "completo": verificado, contenido aprobado, fotos, NAP, place_id.
const FULL: PublicDeliverableInputs = {
  deliveredAt: '2026-07-23T12:00:00.000Z',
  gbpProfile: {
    gbp_url: 'https://maps.google.com/?cid=123',
    place_id: 'ChIJsecretPlaceId',
    verification_status: 'verified',
    content_status: 'approved',
    description:
      'Somos el mejor taller de la ciudad, con 20 años de experiencia.',
    business_name: 'JD Valley Auto',
    phone: '(805) 111-2222',
    website_url: 'https://jdvalley.example',
    address: '123 Main St, Buellton, CA'
  },
  client: {
    business_name: 'JD Valley Auto (fallback)',
    phone: '(805) 000-0000'
  },
  photos: [
    {
      id: 'p1',
      public_url: 'https://cdn.example/1.jpg',
      alt_text_final: 'frente'
    },
    {
      id: 'p2',
      public_url: 'https://cdn.example/2.jpg',
      alt_text_auto: 'taller'
    }
  ]
};

// ===================================================================
// T-07 — buildPublicDeliverableView: campos client-safe + omisión honesta (R-09..R-13)
// ===================================================================

test('T-07 (i) verification_status=verified → badge verificado presente (R-10)', () => {
  const v = buildPublicDeliverableView(FULL);
  assert.equal(v.verified, true);
});

for (const status of ['created', 'pending', 'not_found'] as const) {
  test(`T-07 (i) verification_status=${status} → badge OMITIDO, sin label crudo (R-10/R-13)`, () => {
    const v = buildPublicDeliverableView({
      ...FULL,
      gbpProfile: { ...FULL.gbpProfile!, verification_status: status }
    });
    assert.equal(v.verified, false);
    // El status crudo NUNCA aparece en el view-model serializado (R-13).
    assert.doesNotMatch(JSON.stringify(v), new RegExp(status));
  });
}

test('T-07 (ii) content_status=approved + desc → descripción mostrada (R-11)', () => {
  const v = buildPublicDeliverableView(FULL);
  assert.equal(v.description, FULL.gbpProfile!.description);
});

test('T-07 (ii) content_status=draft → descripción OMITIDA (null), sin filtrar contenido no aprobado (R-11)', () => {
  const v = buildPublicDeliverableView({
    ...FULL,
    gbpProfile: { ...FULL.gbpProfile!, content_status: 'draft' }
  });
  assert.equal(v.description, null);
  // El texto no aprobado NO se filtra a la vista pública.
  assert.doesNotMatch(JSON.stringify(v), /mejor taller de la ciudad/);
});

test('T-07 (ii) content_status=approved pero descripción vacía → omitida (null) (R-11)', () => {
  const v = buildPublicDeliverableView({
    ...FULL,
    gbpProfile: { ...FULL.gbpProfile!, description: '   ' }
  });
  assert.equal(v.description, null);
});

test('T-07 (iii) GBP link presente pero NUNCA incluye place_id (R-09/R-13)', () => {
  const v = buildPublicDeliverableView(FULL);
  assert.equal(v.gbpUrl, 'https://maps.google.com/?cid=123');
  // Ni el campo ni ningún string del view-model contiene el place_id.
  assert.doesNotMatch(JSON.stringify(v), /ChIJsecretPlaceId/);
  assert.equal(
    Object.prototype.hasOwnProperty.call(v, 'place_id'),
    false,
    'el view-model no expone place_id'
  );
});

test('T-07 (iv) sin fotos aprobadas → galería omitida (photos=[]) (R-12)', () => {
  const v = buildPublicDeliverableView({ ...FULL, photos: [] });
  assert.deepEqual(v.photos, []);
});

test('T-07 (iv) fotos aprobadas → forma client-safe (id/url/alt), sin metadata interna (R-12)', () => {
  const v = buildPublicDeliverableView(FULL);
  assert.equal(v.photos.length, 2);
  assert.deepEqual(v.photos[0], {
    id: 'p1',
    url: 'https://cdn.example/1.jpg',
    alt: 'frente'
  });
  assert.equal(v.photos[1].alt, 'taller'); // fallback a alt_text_auto
});

test('T-07 (iv) foto sin url válida se descarta (sin foto rota en la galería) (R-12)', () => {
  const v = buildPublicDeliverableView({
    ...FULL,
    photos: [{ id: 'x', public_url: '   ' }]
  });
  assert.deepEqual(v.photos, []);
});

test('T-07 NAP del negocio presente (perfil GBP → fallback cliente) (R-09)', () => {
  const v = buildPublicDeliverableView(FULL);
  assert.equal(v.nap.phone, '(805) 111-2222');
  assert.equal(v.nap.website, 'https://jdvalley.example');
  assert.equal(v.nap.address, '123 Main St, Buellton, CA');
  // Fallback: sin teléfono en el perfil, usa el del cliente.
  const v2 = buildPublicDeliverableView({
    ...FULL,
    gbpProfile: { ...FULL.gbpProfile!, phone: null }
  });
  assert.equal(v2.nap.phone, '(805) 000-0000');
});

test('T-07 businessName: perfil GBP → fallback cliente; deliveredAt propagado (R-09)', () => {
  const v = buildPublicDeliverableView(FULL);
  assert.equal(v.businessName, 'JD Valley Auto');
  assert.equal(v.deliveredAt, '2026-07-23T12:00:00.000Z');
  const v2 = buildPublicDeliverableView({
    ...FULL,
    gbpProfile: { ...FULL.gbpProfile!, business_name: null }
  });
  assert.equal(v2.businessName, 'JD Valley Auto (fallback)');
});

test('T-07 (v) el view-model NUNCA contiene labels internos ni estado crudo (R-13)', () => {
  // Caso JD Valley real: creado (no verificado), contenido en draft, canal pendiente.
  const v = buildPublicDeliverableView({
    deliveredAt: '2026-07-23T12:00:00.000Z',
    gbpProfile: {
      gbp_url: 'https://maps.google.com/?cid=999',
      place_id: 'ChIJsecretPlaceId',
      verification_status: 'created',
      content_status: 'draft',
      description: 'texto NO aprobado',
      business_name: 'JD Valley',
      phone: '(805) 111-2222',
      website_url: null,
      address: '123 Main St'
    },
    client: null,
    photos: []
  });
  const serialized = JSON.stringify(v);
  const forbidden = [
    'Pendiente',
    'Entregado',
    CONTENT_STALE_LABEL,
    'requiere re-aprobación',
    'ChIJsecretPlaceId', // place_id
    'created',
    'pending',
    'not_found',
    'draft',
    'texto NO aprobado' // contenido no aprobado
  ];
  for (const needle of forbidden) {
    assert.equal(
      serialized.includes(needle),
      false,
      `el view-model no debe contener el string interno: "${needle}"`
    );
  }
});

test('T-07 gbpProfile/client null no rompe (omisión honesta total) (R-09..R-13)', () => {
  const v = buildPublicDeliverableView({
    deliveredAt: null,
    gbpProfile: null,
    client: null,
    photos: []
  });
  assert.equal(v.businessName, null);
  assert.equal(v.gbpUrl, null);
  assert.equal(v.verified, false);
  assert.equal(v.description, null);
  assert.deepEqual(v.nap, { phone: null, website: null, address: null });
  assert.deepEqual(v.photos, []);
  assert.equal(v.deliveredAt, null);
});

// ===================================================================
// T-08 — isPublicDeliverable (R-08) + resolveDeliverableLinkAction (R-03/R-04/R-05) + gate R-02
// ===================================================================

test('T-08 isPublicDeliverable: delivered_at NULL/undefined/vacío → false (R-08)', () => {
  assert.equal(isPublicDeliverable({ deliveredAt: null }), false);
  assert.equal(isPublicDeliverable({ deliveredAt: undefined }), false);
  assert.equal(isPublicDeliverable({ deliveredAt: '   ' }), false);
});

test('T-08 isPublicDeliverable: delivered_at seteado → true (R-08)', () => {
  assert.equal(
    isPublicDeliverable({ deliveredAt: '2026-07-23T12:00:00.000Z' }),
    true
  );
});

test('T-08 generate sin token previo → uuid nuevo + shouldPersist=true (R-03)', () => {
  const r = resolveDeliverableLinkAction({
    currentToken: null,
    action: 'generate',
    genToken: () => 'tok-new'
  });
  assert.equal(r.token, 'tok-new');
  assert.equal(r.shouldPersist, true);
});

test('T-08 generate con token previo → idempotente (mismo token, no persiste) (R-03/R-04)', () => {
  const r = resolveDeliverableLinkAction({
    currentToken: 'tok-existing',
    action: 'generate',
    genToken: () => 'tok-new'
  });
  assert.equal(r.token, 'tok-existing');
  assert.equal(r.shouldPersist, false);
});

test('T-08 copy con token existente → mismo token + shouldPersist=false (link estable, R-04)', () => {
  const r = resolveDeliverableLinkAction({
    currentToken: 'tok-existing',
    action: 'copy',
    genToken: () => 'tok-new'
  });
  assert.equal(r.token, 'tok-existing');
  assert.equal(r.shouldPersist, false);
});

test('T-08 regenerate → uuid DISTINTO del previo + shouldPersist=true, invalida el previo (R-05)', () => {
  // El generador devuelve primero el token actual (colisión) y luego uno nuevo: el seam
  // debe SALTAR la colisión y garantizar un token distinto (revocación real).
  const seq = ['tok-existing', 'tok-rotated'];
  let i = 0;
  const r = resolveDeliverableLinkAction({
    currentToken: 'tok-existing',
    action: 'regenerate',
    genToken: () => seq[i++]
  });
  assert.equal(r.token, 'tok-rotated');
  assert.notEqual(r.token, 'tok-existing');
  assert.equal(r.shouldPersist, true);
});

test('T-08 el token por defecto (sin genToken) es un uuid inadivinable (R-03)', () => {
  const r = resolveDeliverableLinkAction({
    currentToken: null,
    action: 'generate'
  });
  assert.match(
    r.token,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
  assert.equal(r.shouldPersist, true);
});

test('T-08 el gate del control depende de delivered_at (botón deshabilitado si NULL) (R-02)', () => {
  const ficha = read('../../src/app/(app)/clients/[id]/page.tsx');
  // El botón "Generar link de entregable" está deshabilitado bajo `!client.delivered_at`.
  assert.match(
    ficha,
    /!client\.delivered_at[\s\S]*?Generar link de entregable/
  );
  assert.match(ficha, /<Button disabled/);
});

// ===================================================================
// T-09 — Guard estructural read-only (R-14) + sin Aprobar/feedback en la vista (R-15)
// ===================================================================

test('T-09 la ruta del entregable NO contiene ninguna escritura ni transición (R-14)', () => {
  const route = stripComments(
    read('../../src/app/deliverable/[token]/page.tsx')
  );
  // Sin ninguna llamada de escritura del cliente Supabase.
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  // Sin la transición de status del preview-approve.
  assert.doesNotMatch(route, /status:\s*'onboarding'/);
  // Sin el avance del asset GBP (write de client_assets con status aprobado).
  assert.doesNotMatch(route, /\.from\('client_assets'\)[\s\S]*?\.update\(/);
  // Sin write de aprobación de preview.
  assert.doesNotMatch(route, /previews[\s\S]*?approved:\s*true/);
  // NOTA: no se chequea el token literal "approved" a secas: la lectura legítima de fotos
  // usa `.eq('approved', true)` (idéntico al loader de preview) — es un FILTRO de lectura,
  // no una escritura. R-14 prohíbe side-effects de escritura, no leer fotos aprobadas.
});

test('T-09 la ruta lee fotos aprobadas SOLO como filtro de lectura, no escritura (R-14)', () => {
  const route = read('../../src/app/deliverable/[token]/page.tsx');
  assert.match(route, /\.eq\('approved',\s*true\)/); // filtro de lectura (patrón preview)
});

test('T-09 la vista pública NO ofrece "Aprobar" ni controles de feedback (R-15)', () => {
  const view = stripComments(
    read('../../src/app/deliverable/[token]/deliverable-public-view.tsx')
  );
  assert.doesNotMatch(view, /Aprobar/);
  assert.doesNotMatch(view, /Textarea/);
  assert.doesNotMatch(view, /preview-approve/);
  assert.doesNotMatch(view, /preview-feedback/);
  assert.doesNotMatch(view, /<form/);
  assert.doesNotMatch(view, /onSubmit/);
  // CTA pasivo "Contáctanos" = C3 la agencia (DT-03).
  assert.match(view, /Contáctanos/);
  assert.match(view, /C3 Local Marketing/);
});

// ===================================================================
// T-10 — No-regresión (R-16/R-17/R-18)
// ===================================================================

test('T-10 R-16: el preview conserva su side-effect de aprobación (no gutted)', () => {
  const approve = read('../../src/app/api/preview-approve/route.ts');
  // El write de aprobación del preview sigue intacto (status→onboarding + previews.approved).
  assert.match(approve, /status:\s*'onboarding'/);
  assert.match(approve, /approved:\s*true/);
  const previewPage = read('../../src/app/preview/[token]/page.tsx');
  assert.match(previewPage, /\.from\('previews'\)/);
});

test('T-10 R-17: F-092 intacto — buildDeliverableSummary + pestaña Entregable sin alterar', () => {
  const deliverable = read('../../src/lib/clients/deliverable.ts');
  assert.match(deliverable, /export function buildDeliverableSummary/);
  assert.match(deliverable, /CONTENT_STALE_LABEL/);
  const ficha = read('../../src/app/(app)/clients/[id]/page.tsx');
  // El read-model de F-092 sigue consumido por la pestaña Entregable.
  assert.match(ficha, /buildDeliverableSummary\(/);
  // El control de link de F-093 se AGREGA (no reemplaza el read-model).
  assert.match(ficha, /Link público del entregable/);
});

test("T-10 R-18: la ficha lee el cliente con select('*') (tolera deliverable_token ausente pre-apply)", () => {
  const ficha = read('../../src/app/(app)/clients/[id]/page.tsx');
  assert.match(ficha, /\.from\('clients'\)[\s\S]*?\.select\('\*'\)/);
});

// ===================================================================
// R-19/R-01 — La migración es aditiva, nullable, sin default/backfill, frontera documentada
// ===================================================================

test('R-01/R-19 la migración solo agrega deliverable_token text (aditivo, nullable, frontera F-074)', () => {
  const sql = read(
    '../../supabase/migrations/20260724_f093_clients_deliverable_token.sql'
  );
  const statements = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
  assert.match(
    statements,
    /ADD COLUMN IF NOT EXISTS\s+deliverable_token\s+text/i
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
  // Frontera F-074 documentada (apply gateado, apply antes del deploy).
  assert.match(sql, /F-074/);
  assert.match(sql, /NO aplicada/i);
  assert.match(sql, /PRECEDE al deploy/i);
});
