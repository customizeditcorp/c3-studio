/**
 * F-096 — Entregable de alta fidelidad: `GbpKnowledgePanel` compartido data-driven + purga
 * de hardcodes falsos. Cubre la lógica PURA (`formatGbpHoursLine`, `buildDeliveredPanelData`,
 * `buildSalesPanelData`), la extensión ADITIVA del seam (`buildPublicDeliverableView`) y
 * guards ESTRUCTURALES (anti-hardcode, variante, scope del preview, uso compartido).
 *
 * Ejercita el code-path REAL (§6.1): las MISMAS funciones puras que consumen las vistas, no
 * una re-implementación. Los guards leen el SOURCE real (patrón `stripComments` de F-093).
 * `Ref: R-01, R-02, R-03, R-04, R-05, R-06, R-07, R-08, R-09, R-10, R-11, R-12, R-14, R-15`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  formatGbpHoursLine,
  buildDeliveredPanelData,
  buildSalesPanelData
} from '../../src/lib/gbp-slice/knowledge-panel.ts';
import {
  buildPublicDeliverableView,
  type PublicDeliverableInputs,
  type PublicDeliverableView
} from '../../src/lib/clients/deliverable-public.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Igual que en F-093: elimina comentarios para chequear el CÓDIGO real, no la doc. */
const stripComments = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '') // JSX comments {/* ... */}
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments /* ... */
    .replace(/^\s*\/\/.*$/gm, ''); // line comments // ...

// Horario real (forma viva JD Valley Painting): días→string, Lun–Vie con horario, Sáb/Dom Cerrado.
const REAL_HOURS = {
  friday: '8:00 AM - 6:00 PM',
  monday: '8:00 AM - 6:00 PM',
  sunday: 'Cerrado',
  tuesday: '8:00 AM - 6:00 PM',
  saturday: 'Cerrado',
  thursday: '8:00 AM - 6:00 PM',
  wednesday: '8:00 AM - 6:00 PM'
};

// Un view-model de entregable "completo" (mirror del FULL de F-093) + category/hours aditivos.
const DELIVERED_FULL: PublicDeliverableView = {
  businessName: 'JD Valley Painting',
  gbpUrl: 'https://maps.google.com/?cid=123',
  verified: true,
  description: 'Pintores profesionales en Buellton, 15 años de experiencia.',
  nap: {
    phone: '(805) 111-2222',
    website: 'https://jdvalley.example',
    address: '380 DANIA AVE BUELLTON, CA 93427'
  },
  photos: [
    { id: 'p1', url: 'https://cdn.example/1.jpg', alt: 'frente' },
    { id: 'p2', url: 'https://cdn.example/2.jpg', alt: null }
  ],
  deliveredAt: '2026-07-23T12:00:00.000Z',
  category: 'Painter',
  hours: 'Lun–Vie 8:00 AM - 6:00 PM · Sáb–Dom Cerrado'
};

// ===================================================================
// T-09 — formatGbpHoursLine: línea estática, nunca "Abierto ahora" (R-08)
// ===================================================================

test('T-09 formatGbpHoursLine: objeto de horas real → línea estática agrupada esperada (R-08)', () => {
  assert.equal(
    formatGbpHoursLine(REAL_HOURS),
    'Lun–Vie 8:00 AM - 6:00 PM · Sáb–Dom Cerrado'
  );
});

test('T-09 formatGbpHoursLine: NUNCA emite "Abierto ahora" ni claim de estado-en-vivo (R-08)', () => {
  const out = formatGbpHoursLine(REAL_HOURS) ?? '';
  assert.doesNotMatch(out, /Abierto ahora/i);
  assert.doesNotMatch(out, /abierto|cerrado ahora/i);
});

test('T-09 formatGbpHoursLine es DETERMINISTA (no depende del reloj)', () => {
  const a = formatGbpHoursLine(REAL_HOURS);
  const b = formatGbpHoursLine(REAL_HOURS);
  assert.equal(a, b);
  // El CÓDIGO (sin comentarios) no debe usar el reloj (Date.now / new Date) para el horario.
  const src = stripComments(read('../../src/lib/gbp-slice/knowledge-panel.ts'));
  assert.doesNotMatch(src, /Date\.now\(/);
  assert.doesNotMatch(src, /new Date\(/);
});

test('T-09 formatGbpHoursLine: {}/null/no-objeto/array → null (fila omitida) (R-08)', () => {
  assert.equal(formatGbpHoursLine({}), null);
  assert.equal(formatGbpHoursLine(null), null);
  assert.equal(formatGbpHoursLine(undefined), null);
  assert.equal(formatGbpHoursLine('9-5'), null);
  assert.equal(formatGbpHoursLine(42), null);
  assert.equal(formatGbpHoursLine([]), null);
  // Días presentes pero vacíos → null (no fabrica una línea vacía).
  assert.equal(formatGbpHoursLine({ monday: '   ', tuesday: '' }), null);
});

test('T-09 formatGbpHoursLine: días no contiguos NO se fusionan en un rango falso', () => {
  // Solo Lun y Vie con el mismo valor → NO debe imprimir "Lun–Vie" (habría mentido sobre
  // martes/miércoles/jueves). Dos tramos de un día.
  const out = formatGbpHoursLine({
    monday: '9:00 AM - 5:00 PM',
    friday: '9:00 AM - 5:00 PM'
  });
  assert.equal(out, 'Lun 9:00 AM - 5:00 PM · Vie 9:00 AM - 5:00 PM');
});

// ===================================================================
// T-10 — buildDeliveredPanelData: rating null SIEMPRE + omisión honesta (R-05/R-06/R-07)
// ===================================================================

test('T-10 buildDeliveredPanelData: inputs completos → rating===null SIEMPRE (R-05)', () => {
  const d = buildDeliveredPanelData(DELIVERED_FULL, {
    category: DELIVERED_FULL.category,
    hours: DELIVERED_FULL.hours
  });
  assert.equal(d.rating, null);
  // Datos reales presentes (data-driven), no literales.
  assert.equal(d.businessName, 'JD Valley Painting');
  assert.equal(d.category, 'Painter');
  assert.equal(d.location, '380 DANIA AVE BUELLTON, CA 93427');
  assert.equal(d.phone, '(805) 111-2222');
  assert.equal(d.hours, 'Lun–Vie 8:00 AM - 6:00 PM · Sáb–Dom Cerrado');
  assert.equal(d.photos.length, 2);
});

test('T-10 buildDeliveredPanelData: el objeto NUNCA expone un rating fabricable (R-05)', () => {
  const d = buildDeliveredPanelData(DELIVERED_FULL, {
    category: 'Painter',
    hours: null
  });
  // Ni "5.0" ni estrellas ni ningún rating no-null puede salir de este builder.
  assert.doesNotMatch(JSON.stringify(d), /5\.0/);
  assert.equal(d.rating, null);
});

test('T-10 buildDeliveredPanelData: nap.address=null → location===null (fila omitida) (R-06)', () => {
  const view: PublicDeliverableView = {
    ...DELIVERED_FULL,
    nap: { ...DELIVERED_FULL.nap, address: null }
  };
  const d = buildDeliveredPanelData(view, { category: null, hours: null });
  assert.equal(d.location, null);
});

test('T-10 buildDeliveredPanelData: phone vacío → phone===null (R-07)', () => {
  const view: PublicDeliverableView = {
    ...DELIVERED_FULL,
    nap: { ...DELIVERED_FULL.nap, phone: null }
  };
  const d = buildDeliveredPanelData(view, { category: null, hours: null });
  assert.equal(d.phone, null);
});

test('T-10 buildDeliveredPanelData: hours vacío → hours===null (fila omitida) (R-08)', () => {
  const d = buildDeliveredPanelData(DELIVERED_FULL, {
    category: 'Painter',
    hours: null
  });
  assert.equal(d.hours, null);
});

test('T-10 buildDeliveredPanelData: website = gbpUrl ?? nap.website (DT-03/§2.2)', () => {
  const d = buildDeliveredPanelData(DELIVERED_FULL, {
    category: null,
    hours: null
  });
  assert.equal(d.website, 'https://maps.google.com/?cid=123');
  const noUrl: PublicDeliverableView = { ...DELIVERED_FULL, gbpUrl: null };
  const d2 = buildDeliveredPanelData(noUrl, { category: null, hours: null });
  assert.equal(d2.website, 'https://jdvalley.example');
});

// ===================================================================
// T-11 — buildSalesPanelData: datos reales; sin fallback fake; rating null (R-02/R-06/R-07)
// ===================================================================

test('T-11 buildSalesPanelData: gbpProfile real → location/phone/hours/category reales (R-02)', () => {
  const s = buildSalesPanelData({
    gbpProfile: {
      business_name: 'JD Valley Painting',
      primary_category: 'Painter',
      phone: '(805) 111-2222',
      website_url: 'https://jdvalley.example',
      address: '380 DANIA AVE BUELLTON, CA 93427',
      hours: REAL_HOURS
    },
    client: {
      business_name: 'JD (fallback)',
      industry: 'painting',
      phone: null
    },
    photos: [
      { public_url: 'https://cdn.example/1.jpg', alt_text_auto: 'frente' }
    ]
  });
  assert.equal(s.businessName, 'JD Valley Painting');
  assert.equal(s.category, 'Painter');
  assert.equal(s.location, '380 DANIA AVE BUELLTON, CA 93427');
  assert.equal(s.phone, '(805) 111-2222');
  assert.equal(s.hours, 'Lun–Vie 8:00 AM - 6:00 PM · Sáb–Dom Cerrado');
  assert.equal(s.website, 'https://jdvalley.example');
  assert.equal(s.photos.length, 1);
  assert.equal(s.rating, null);
});

test('T-11 buildSalesPanelData: fallbacks reales (client.*), sin literal fake (R-02/R-07)', () => {
  const s = buildSalesPanelData({
    gbpProfile: {
      business_name: null,
      primary_category: null,
      phone: null,
      address: null,
      hours: null
    },
    client: {
      business_name: 'Negocio Cliente',
      industry: 'home_services',
      phone: '(805) 333-4444'
    },
    photos: []
  });
  assert.equal(s.businessName, 'Negocio Cliente');
  assert.equal(s.category, 'home services'); // industry underscore→space, data-driven
  assert.equal(s.phone, '(805) 333-4444'); // fallback al teléfono real del cliente
  assert.equal(s.rating, null);
});

test('T-11 buildSalesPanelData: TODO vacío → todos null/[] (sin fallback fake) (R-06/R-07/R-08)', () => {
  const s = buildSalesPanelData({ gbpProfile: null, client: null, photos: [] });
  assert.equal(s.businessName, null);
  assert.equal(s.category, null);
  assert.equal(s.location, null); // nunca "Santa Maria"
  assert.equal(s.phone, null); // nunca "(805) 555-0100"
  assert.equal(s.hours, null); // nunca "Abierto ahora"
  assert.equal(s.website, null);
  assert.deepEqual(s.photos, []);
  assert.equal(s.rating, null);
  // Ningún literal fabricado en el objeto serializado.
  const j = JSON.stringify(s);
  assert.doesNotMatch(j, /Santa Maria/);
  assert.doesNotMatch(j, /Abierto ahora/);
  assert.doesNotMatch(j, /\(805\) 555-0100/);
});

// ===================================================================
// T-12 — Guard estructural ANTI-HARDCODE (source del componente) (R-03)
// ===================================================================

test('T-12 el componente NO contiene los 4 hardcodes falsos purgados (R-03)', () => {
  const src = stripComments(
    read('../../src/components/gbp/gbp-knowledge-panel.tsx')
  );
  assert.doesNotMatch(src, /Santa Maria/);
  assert.doesNotMatch(src, /5\.0/); // rating numérico fabricado
  assert.doesNotMatch(src, /Abierto ahora/);
  assert.doesNotMatch(src, /\(805\) 555-0100/);
});

test('T-12 tampoco el módulo puro contiene los hardcodes falsos (R-03)', () => {
  const src = stripComments(read('../../src/lib/gbp-slice/knowledge-panel.ts'));
  assert.doesNotMatch(src, /Santa Maria/);
  assert.doesNotMatch(src, /5\.0/);
  assert.doesNotMatch(src, /Abierto ahora/);
  assert.doesNotMatch(src, /\(805\) 555-0100/);
});

// ===================================================================
// T-13 — Guard estructural de VARIANTE: aspiracional gateado por sales (R-04/R-09)
// ===================================================================

test('T-13 las ramas aspiracionales están gateadas por variant sales (R-04/R-09)', () => {
  const src = stripComments(
    read('../../src/components/gbp/gbp-knowledge-panel.tsx')
  );
  // Existe el discriminante de variante.
  assert.match(src, /variant === 'sales'/);
  assert.match(src, /const isSales = variant === 'sales'/);
  // Cada elemento aspiracional aparece detrás de un gate `isSales &&` (no en delivered).
  assert.match(src, /isSales && data\.rating === null[\s\S]*?Nuevo negocio/);
  assert.match(src, /isSales && \([\s\S]*?Mockup ilustrativo/);
  // El placeholder de tiles-emoji está en la rama else de "sin fotos" gateada por isSales.
  assert.match(src, /isSales && \([\s\S]*?bg-blue-100/);
  // "Nuevo negocio" NUNCA aparece sin el gate isSales delante (una sola ocurrencia gateada).
  const occurrences = (src.match(/Nuevo negocio/g) ?? []).length;
  assert.equal(occurrences, 1);
});

test('T-13 el rating solo se pinta si data.rating !== null (nunca fabricado) (R-04/R-05)', () => {
  const src = stripComments(
    read('../../src/components/gbp/gbp-knowledge-panel.tsx')
  );
  assert.match(src, /data\.rating !== null &&/);
});

// ===================================================================
// T-14 — No-regresión del SEAM de honestidad F-093 + aditivo category/hours (R-11/R-12)
// ===================================================================

const SEAM_FULL: PublicDeliverableInputs = {
  deliveredAt: '2026-07-23T12:00:00.000Z',
  gbpProfile: {
    gbp_url: 'https://maps.google.com/?cid=123',
    place_id: 'ChIJsecretPlaceId',
    verification_status: 'verified',
    content_status: 'approved',
    description: 'Pintores profesionales en Buellton.',
    business_name: 'JD Valley Painting',
    phone: '(805) 111-2222',
    website_url: 'https://jdvalley.example',
    address: '380 DANIA AVE BUELLTON, CA 93427',
    primary_category: 'Painter',
    hours: REAL_HOURS
  },
  client: { business_name: 'JD (fallback)', phone: '(805) 000-0000' },
  photos: [
    {
      id: 'p1',
      public_url: 'https://cdn.example/1.jpg',
      alt_text_final: 'frente'
    }
  ]
};

test('T-14 aditivo: buildPublicDeliverableView expone category/hours honestos (R-11)', () => {
  const v = buildPublicDeliverableView(SEAM_FULL);
  assert.equal(v.category, 'Painter');
  assert.equal(v.hours, 'Lun–Vie 8:00 AM - 6:00 PM · Sáb–Dom Cerrado');
  // hours vacío/ausente → null (fila omitida).
  const v2 = buildPublicDeliverableView({
    ...SEAM_FULL,
    gbpProfile: { ...SEAM_FULL.gbpProfile!, hours: {}, primary_category: '  ' }
  });
  assert.equal(v2.hours, null);
  assert.equal(v2.category, null);
});

test('T-14 no-regresión F-093: place_id NUNCA surfaceado + NO campo rating (R-05/R-12)', () => {
  const v = buildPublicDeliverableView(SEAM_FULL);
  assert.doesNotMatch(JSON.stringify(v), /ChIJsecretPlaceId/);
  assert.equal(Object.prototype.hasOwnProperty.call(v, 'place_id'), false);
  // La extensión F-096 NO agrega rating al view-model.
  assert.equal(Object.prototype.hasOwnProperty.call(v, 'rating'), false);
});

test('T-14 no-regresión F-093: verified/description conservan su gating exacto (R-12)', () => {
  // verified solo si verification_status==='verified'.
  const notVerified = buildPublicDeliverableView({
    ...SEAM_FULL,
    gbpProfile: { ...SEAM_FULL.gbpProfile!, verification_status: 'created' }
  });
  assert.equal(notVerified.verified, false);
  // description solo si content_status==='approved'.
  const draft = buildPublicDeliverableView({
    ...SEAM_FULL,
    gbpProfile: { ...SEAM_FULL.gbpProfile!, content_status: 'draft' }
  });
  assert.equal(draft.description, null);
});

// ===================================================================
// T-15 — Guard estructural de SCOPE del preview (source) (R-10/R-14)
// ===================================================================

test('T-15 el preview usa el componente y NO retiene los hardcodes del panel (R-03/R-14)', () => {
  const src = stripComments(
    read('../../src/app/preview/[token]/preview-public-view.tsx')
  );
  assert.match(src, /<GbpKnowledgePanel/);
  assert.match(src, /variant='sales'/);
  assert.match(src, /buildSalesPanelData\(/);
  // Los 4 hardcodes del panel fueron purgados del preview.
  assert.doesNotMatch(src, /Santa Maria/);
  assert.doesNotMatch(src, /Abierto ahora/);
  assert.doesNotMatch(src, /\(805\) 555-0100/);
});

test('T-15 el preview conserva las secciones FUERA de scope (R-10/R-14)', () => {
  const src = stripComments(
    read('../../src/app/preview/[token]/preview-public-view.tsx')
  );
  // Mini-site / website mockup (F-097) — intacto (hardcodes fuera de scope conservados).
  assert.match(src, /Servicio 1/);
  assert.match(src, /Central Coast/);
  // GBP Mockup card (:204-296) — intacto.
  assert.match(src, /Google Business Profile/);
  // Plan recomendado + aprobar/feedback — intactos.
  assert.match(src, /Plan Recomendado/);
  assert.match(src, /Aprobar/);
  assert.match(src, /preview-feedback/);
});

// ===================================================================
// T-16 — Uso compartido + aislamiento por cliente/token (R-01/R-15)
// ===================================================================

test('T-16 el componente se usa en AMBAS vistas (preview sales + deliverable delivered) (R-01)', () => {
  const preview = read('../../src/app/preview/[token]/preview-public-view.tsx');
  const deliverable = read(
    '../../src/app/deliverable/[token]/deliverable-public-view.tsx'
  );
  assert.match(preview, /GbpKnowledgePanel/);
  assert.match(preview, /variant='sales'/);
  assert.match(deliverable, /GbpKnowledgePanel/);
  assert.match(deliverable, /variant='delivered'/);
});

test('T-16 los loaders cargan el activo ACOTADO por client_id/token (sin cross-cliente) (R-15)', () => {
  const previewPage = read('../../src/app/preview/[token]/page.tsx');
  const deliverablePage = read('../../src/app/deliverable/[token]/page.tsx');
  // gbp_profiles/photos filtrados por client_id resuelto por el token.
  assert.match(
    previewPage,
    /\.from\('gbp_profiles'\)[\s\S]*?\.eq\('client_id'/
  );
  assert.match(
    deliverablePage,
    /\.from\('gbp_profiles'\)[\s\S]*?\.eq\('client_id'/
  );
  assert.match(deliverablePage, /\.eq\('deliverable_token',\s*token\)/);
});
