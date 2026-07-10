/**
 * F-066 — T-15 (R-10/R-11) + T-16 support (R-12/R-13) — production + transition.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGbpContext } from '../../src/lib/gbp-slice/context.ts';
import {
  parseGbpJson,
  toGbpProfileRow,
  buildPreviewSnapshot,
  assetStatusForDecision,
  GbpDomainError
} from '../../src/lib/gbp-slice/profile.ts';
import { GBP_REQUIRED_FIELDS } from '../../src/lib/gbp-slice/prompt.ts';
import {
  CLIENT,
  REAL_OFFER,
  APPROVED_BRANDBOARD,
  VALID_GBP_JSON
} from './fixtures.ts';

const ctx = readGbpContext({
  client: CLIENT,
  offer: REAL_OFFER,
  brandboard: APPROVED_BRANDBOARD
});

// --- T-15a (R-10): eligible client -> row with all required fields ---
test('T-15a toGbpProfileRow maps all required fields', () => {
  const row = toGbpProfileRow(CLIENT.id, VALID_GBP_JSON, ctx);
  assert.equal(row.client_id, CLIENT.id);
  assert.equal(row.business_name, 'JD Valley Painting');
  assert.ok(row.primary_category && row.description && row.short_description);
  assert.ok(row.services && row.service_area);
  assert.equal(row.phone, CLIENT.phone); // client fallback
});

// --- T-15b (R-11): incomplete generation -> throws BEFORE write ---
test('T-15b missing required fields -> GbpDomainError listing them, no partial row', () => {
  const bad = { business_name: 'X', primary_category: 'Painter' }; // missing several
  assert.throws(
    () => toGbpProfileRow(CLIENT.id, bad, ctx),
    (e: unknown) =>
      e instanceof GbpDomainError &&
      /description/.test(e.message) &&
      /service_area/.test(e.message)
  );
});

test('T-15b malformed model output -> GbpDomainError before write', () => {
  assert.throws(() => parseGbpJson('not json at all'), GbpDomainError);
});

test('parseGbpJson strips code fences', () => {
  const parsed = parseGbpJson('```json\n{"a":1}\n```');
  assert.equal(parsed.a, 1);
});

test('T-15b empty client business_name -> GbpDomainError', () => {
  const ctx2 = readGbpContext({
    client: { ...CLIENT, business_name: '' },
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD
  });
  assert.throws(
    () => toGbpProfileRow(CLIENT.id, VALID_GBP_JSON, ctx2),
    GbpDomainError
  );
});

// --- T-16 (R-12): preview snapshot shape ---
test('T-16 buildPreviewSnapshot carries the GBP content + grounding provenance', () => {
  const row = toGbpProfileRow(CLIENT.id, VALID_GBP_JSON, ctx);
  const snap = buildPreviewSnapshot(row, ctx);
  assert.equal(snap.kind, 'gbp');
  const profile = snap.profile as Record<string, unknown>;
  assert.equal(profile.business_name, 'JD Valley Painting');
  const grounded = snap.grounded_in as Record<string, unknown>;
  assert.equal(grounded.offer_id, REAL_OFFER.id);
  const degr = snap.degradation as Record<string, unknown>;
  assert.equal(degr.logo, 'pending');
  assert.equal(degr.media_empty, true);
});

// --- T-16 (R-13): transition decision ---
test('T-16 assetStatusForDecision: approved->approved, rejected->review', () => {
  assert.equal(assetStatusForDecision(true), 'approved');
  assert.equal(assetStatusForDecision(false), 'review');
});

// =====================================================================
// F-070 STAGE 2 — Barrera 1 (Branch A): client-source + key-mismatch fix
// =====================================================================

/** The REAL OpenAI raw shape captured in F-070 Fase 0: `suggested_categories` /
 * `suggested_services` (NOT `primary_category` / `services`), and NO business_name /
 * service_area (those are client-sourced). */
const REAL_MODEL_OUTPUT = {
  description:
    'JD Valley Painting entrega acabados prolijos y resultados concretos con plazos claros.',
  short_description: 'Pintura profesional con garantía de satisfacción.',
  suggested_categories: ['Painter', 'Painting Contractor'],
  suggested_services: [
    { name: 'Pintura interior', description: 'Acabados prolijos.' },
    { name: 'Pintura exterior', description: 'Protección duradera.' }
  ],
  suggested_attributes: ['Licensed', 'Family-owned'],
  from_the_business: 'Confiables y puntuales.'
};

// --- T-V03 (R-03): business_name comes from the client, never required from output ---
test('T-V03 business_name is client-sourced; parsed without business_name does not throw', () => {
  const parsed = {
    ...REAL_MODEL_OUTPUT,
    service_area: { cities: ['Santa Maria'] }
  };
  assert.ok(!('business_name' in parsed));
  const row = toGbpProfileRow(CLIENT.id, parsed, ctx);
  assert.equal(row.business_name, 'JD Valley Painting'); // from ctx.client
});

test('T-V03 GBP_REQUIRED_FIELDS no longer includes business_name', () => {
  assert.ok(
    !(GBP_REQUIRED_FIELDS as readonly string[]).includes('business_name')
  );
});

// --- R-06: suggested_categories -> primary_category + secondary_categories ---
test('R-06 suggested_categories maps to primary_category + secondary_categories', () => {
  const parsed = {
    ...REAL_MODEL_OUTPUT,
    service_area: { cities: ['Santa Maria'] }
  };
  const row = toGbpProfileRow(CLIENT.id, parsed, ctx);
  assert.equal(row.primary_category, 'Painter');
  assert.deepEqual(row.secondary_categories, ['Painting Contractor']);
});

// --- R-06: suggested_services -> services ---
test('R-06 suggested_services maps to services', () => {
  const parsed = {
    ...REAL_MODEL_OUTPUT,
    service_area: { cities: ['Santa Maria'] }
  };
  const row = toGbpProfileRow(CLIENT.id, parsed, ctx);
  assert.deepEqual(row.services, REAL_MODEL_OUTPUT.suggested_services);
});

// --- T-V04 (R-04): service_area seeded from client.service_area_cities ---
test('T-V04 service_area seeded from client.service_area_cities when output omits it', () => {
  const ctxWithCities = readGbpContext({
    client: { ...CLIENT, service_area_cities: ['Santa Maria'] },
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD
  });
  const parsed = { ...REAL_MODEL_OUTPUT }; // no service_area from the model
  assert.ok(!('service_area' in parsed));
  const row = toGbpProfileRow(CLIENT.id, parsed, ctxWithCities);
  assert.deepEqual(row.service_area, { cities: ['Santa Maria'] });
});

test('T-V04 model service_area wins over client cities when non-empty', () => {
  const ctxWithCities = readGbpContext({
    client: { ...CLIENT, service_area_cities: ['Santa Maria'] },
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD
  });
  const parsed = {
    ...REAL_MODEL_OUTPUT,
    service_area: { cities: ['Santa Barbara'], notes: 'from model' }
  };
  const row = toGbpProfileRow(CLIENT.id, parsed, ctxWithCities);
  assert.deepEqual(row.service_area, {
    cities: ['Santa Barbara'],
    notes: 'from model'
  });
});

// --- T-V05 (R-05): service_area absent from BOTH sources -> GbpDomainError ---
test('T-V05 service_area missing from output and client -> GbpDomainError, no partial row', () => {
  // CLIENT fixture has service_area_cities = null
  const parsed = { ...REAL_MODEL_OUTPUT }; // no service_area
  assert.throws(
    () => toGbpProfileRow(CLIENT.id, parsed, ctx),
    (e: unknown) =>
      e instanceof GbpDomainError && /service_area/.test(e.message)
  );
});

// --- T-V07 (R-07): genuinely-generated fields missing -> GbpDomainError listing them ---
test('T-V07 missing primary_category + services -> GbpDomainError naming both', () => {
  const parsed = {
    description: 'x',
    short_description: 'y',
    service_area: { cities: ['Santa Maria'] }
    // no suggested_categories / primary_category, no suggested_services / services
  };
  assert.throws(
    () => toGbpProfileRow(CLIENT.id, parsed, ctx),
    (e: unknown) =>
      e instanceof GbpDomainError &&
      /primary_category/.test(e.message) &&
      /services/.test(e.message)
  );
});
