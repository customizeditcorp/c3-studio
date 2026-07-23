/**
 * F-087 — T-09: seam del activo GBP (identidad + lifecycle).
 * `buildGbpAssetPayload` (identidad + status + verified_at + independencia + no-secretos),
 * `persistGbpAsset` (lee error, throw en fallo), `loadGbpAsset` (defaults seguros).
 *
 * Ejercita el code-path REAL (§6.1): las mismas funciones puras que usa el handler.
 * `Ref: R-01, R-02, R-05, R-06, R-10, R-11`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGbpAssetPayload,
  persistGbpAsset,
  loadGbpAsset,
  VERIFICATION_STATUS_OPTIONS,
  type GbpAssetWriteClient,
  type GbpAssetReadClient,
  type GbpAssetPayload
} from '../../src/lib/gbp-slice/gbp-asset.ts';

const NOW = () => '2026-07-23T12:00:00.000Z';
const IDENTITY = {
  operationalEmail: 'jd@gmail.com',
  gbpUrl: 'https://g.co/kgs/jdvalley',
  placeId: 'ChIJabc'
};

// --- Mock clients over the structural seam interfaces ---
function mockWriteClient(opts: { error?: unknown }): {
  client: GbpAssetWriteClient;
  captured: { table: string; values: Record<string, unknown>; id: string }[];
} {
  const captured: {
    table: string;
    values: Record<string, unknown>;
    id: string;
  }[] = [];
  const error = opts.error ?? null;
  const client: GbpAssetWriteClient = {
    from(table) {
      return {
        update(values) {
          return {
            eq: async (_col, id) => {
              captured.push({ table, values, id });
              return { error };
            }
          };
        }
      };
    }
  };
  return { client, captured };
}

function mockReadClient(
  row: Record<string, unknown> | null
): GbpAssetReadClient {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return {
                        maybeSingle: async () => ({ data: row, error: null })
                      };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };
}

// ===================================================================
// buildGbpAssetPayload — identidad + verification_status (R-01/R-04)
// ===================================================================
test('T-09 buildGbpAssetPayload incluye identidad + verification_status', () => {
  const p = buildGbpAssetPayload({
    identity: IDENTITY,
    status: 'created',
    method: 'postal',
    notes: 'código recibido',
    now: NOW
  });
  assert.equal(p.operational_email, 'jd@gmail.com');
  assert.equal(p.gbp_url, 'https://g.co/kgs/jdvalley');
  assert.equal(p.place_id, 'ChIJabc');
  assert.equal(p.verification_status, 'created');
  assert.equal(p.verification_method, 'postal');
  assert.equal(p.verification_notes, 'código recibido');
});

// verified_at SÓLO cuando status ∈ {created, verified} (R-05)
test('T-09 verified_at se setea sólo en created/verified; null en pending/not_found', () => {
  assert.equal(
    buildGbpAssetPayload({ identity: IDENTITY, status: 'created', now: NOW })
      .verified_at,
    NOW()
  );
  assert.equal(
    buildGbpAssetPayload({ identity: IDENTITY, status: 'verified', now: NOW })
      .verified_at,
    NOW()
  );
  assert.equal(
    buildGbpAssetPayload({ identity: IDENTITY, status: 'pending', now: NOW })
      .verified_at,
    null
  );
  assert.equal(
    buildGbpAssetPayload({ identity: IDENTITY, status: 'not_found', now: NOW })
      .verified_at,
    null
  );
});

// Independencia (R-10): el payload NO incluye gbp_mode
test('T-09 buildGbpAssetPayload NO incluye gbp_mode (independencia R-10)', () => {
  const p = buildGbpAssetPayload({ identity: IDENTITY, status: 'verified' });
  assert.ok(!('gbp_mode' in p), 'fijar el lifecycle no debe mutar el origen');
});

// No-secretos (R-02): ninguna clave del payload es un secreto
test('T-09 payload NO contiene ningún campo de secreto (R-02)', () => {
  const p = buildGbpAssetPayload({
    identity: IDENTITY,
    status: 'created',
    method: 'postal',
    notes: 'x'
  });
  const keys = Object.keys(p);
  const expected = [
    'operational_email',
    'gbp_url',
    'place_id',
    'verification_status',
    'verification_method',
    'verification_notes',
    'verified_at'
  ].sort();
  assert.deepEqual(keys.sort(), expected);
  const secretish = /password|passwd|recovery|secret|token|pin|otp|credential/i;
  for (const k of keys) {
    assert.ok(!secretish.test(k), `la clave "${k}" no debe parecer un secreto`);
  }
});

// Normalización: vacío → null (no persiste cadenas en blanco)
test('T-09 identidad vacía → null (opcional, no persiste blancos)', () => {
  const p = buildGbpAssetPayload({
    identity: { operationalEmail: '  ', gbpUrl: '', placeId: '   ' },
    status: 'pending'
  });
  assert.equal(p.operational_email, null);
  assert.equal(p.gbp_url, null);
  assert.equal(p.place_id, null);
  assert.equal(p.verification_method, null);
  assert.equal(p.verification_notes, null);
});

// VERIFICATION_STATUS_OPTIONS cubre el set del lifecycle (R-04)
test('T-09 VERIFICATION_STATUS_OPTIONS = {pending, created, verified, not_found}', () => {
  assert.deepEqual(VERIFICATION_STATUS_OPTIONS.map((o) => o.value).sort(), [
    'created',
    'not_found',
    'pending',
    'verified'
  ]);
});

// ===================================================================
// persistGbpAsset — update por id, error-surfacing (R-11)
// ===================================================================
test('T-09 persistGbpAsset escribe a gbp_profiles por id (code-path real)', async () => {
  const { client, captured } = mockWriteClient({});
  const payload: GbpAssetPayload = buildGbpAssetPayload({
    identity: IDENTITY,
    status: 'created',
    now: NOW
  });
  const ok = await persistGbpAsset({
    supabase: client,
    gbpProfileId: 'gbp-1',
    payload,
    now: NOW
  });
  assert.equal(ok, true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].table, 'gbp_profiles');
  assert.equal(captured[0].id, 'gbp-1');
  assert.equal(captured[0].values.verification_status, 'created');
  assert.equal(captured[0].values.operational_email, 'jd@gmail.com');
  assert.equal(captured[0].values.updated_at, NOW());
  assert.ok(!('gbp_mode' in captured[0].values));
});

test('T-09 persistGbpAsset lee error y THROWea en fallo (R-11, sin éxito falso)', async () => {
  const { client } = mockWriteClient({ error: { message: 'boom' } });
  await assert.rejects(
    persistGbpAsset({
      supabase: client,
      gbpProfileId: 'gbp-1',
      payload: buildGbpAssetPayload({ identity: IDENTITY, status: 'created' })
    })
  );
});

test('T-09 persistGbpAsset sin gbpProfileId → no-op (false), no escribe', async () => {
  const { client, captured } = mockWriteClient({});
  const ok = await persistGbpAsset({
    supabase: client,
    gbpProfileId: null,
    payload: buildGbpAssetPayload({ identity: IDENTITY, status: 'created' })
  });
  assert.equal(ok, false);
  assert.equal(captured.length, 0);
});

// ===================================================================
// loadGbpAsset — defaults seguros (R-06)
// ===================================================================
test('T-09 loadGbpAsset con 0 filas → defaults (verification_status=pending)', async () => {
  const res = await loadGbpAsset(mockReadClient(null), 'client-1');
  assert.equal(res.gbpProfileId, null);
  assert.equal(res.verificationStatus, 'pending');
  assert.equal(res.operationalEmail, '');
  assert.equal(res.gbpUrl, '');
  assert.equal(res.placeId, '');
  assert.equal(res.verifiedAt, null);
});

test('T-09 loadGbpAsset hidrata identidad + lifecycle de la fila', async () => {
  const res = await loadGbpAsset(
    mockReadClient({
      id: 'g1',
      operational_email: 'jd@gmail.com',
      gbp_url: 'https://g.co/x',
      place_id: 'ChIJ',
      verification_status: 'created',
      verification_method: 'postal',
      verification_notes: 'ok',
      verified_at: '2026-07-23T00:00:00.000Z'
    }),
    'client-1'
  );
  assert.equal(res.gbpProfileId, 'g1');
  assert.equal(res.operationalEmail, 'jd@gmail.com');
  assert.equal(res.verificationStatus, 'created');
  assert.equal(res.verifiedAt, '2026-07-23T00:00:00.000Z');
});

test('T-09 loadGbpAsset con verification_status desconocido/legacy → pending (R-06)', async () => {
  const res = await loadGbpAsset(
    mockReadClient({ id: 'g2', verification_status: 'weird_value' }),
    'client-1'
  );
  assert.equal(res.verificationStatus, 'pending');
});
