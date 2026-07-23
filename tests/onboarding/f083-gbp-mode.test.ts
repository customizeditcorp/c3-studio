/**
 * F-083 — Onboarding: captura del eje crear-vs-existe + N/A + reword + atestación.
 * T-15 (persist gbp_mode=create + ítems presencia N/A), T-16 (reword + atestación),
 * T-17 (backward-compat de la carga).
 *
 * Ejercita el code-path REAL de la seam `gbp-mode.ts` (persist/load puros) y verifica
 * el WIRING de las páginas sobre el archivo fuente real (patrón F-081, §6.1): si alguien
 * remueve la pregunta raíz / el N/A / la persistencia, el test falla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isPresenceItemNA,
  buildGbpPresencePayload,
  persistGbpPresence,
  loadGbpPresence,
  NAP_PRESENCE_ITEM_IDS,
  CREDENTIALS_PRESENCE_ITEM_IDS,
  type GbpPresenceWriteClient,
  type GbpPresenceReadClient
} from '../../src/lib/onboarding/gbp-mode.ts';
import { NAP_CHECKLIST } from '../../src/lib/onboarding/nap-check.ts';

// --- Mock clients over the structural seam interfaces ---
function mockWriteClient(opts: { error?: unknown }): {
  client: GbpPresenceWriteClient;
  captured: { table: string; values: Record<string, unknown>; id: string }[];
} {
  const captured: {
    table: string;
    values: Record<string, unknown>;
    id: string;
  }[] = [];
  const error = opts.error ?? null;
  const client: GbpPresenceWriteClient = {
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
): GbpPresenceReadClient {
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
// T-15 — pregunta raíz persiste gbp_mode=create; ítems presencia N/A, no bloquean
// ===================================================================

test('T-15 buildGbpPresencePayload(create) → gbp_mode=create (sin verification_status)', () => {
  const p = buildGbpPresencePayload({ gbpMode: 'create', attested: false });
  assert.equal(p.gbp_mode, 'create');
  assert.ok(!('verification_status' in p));
});

test('T-15 persistGbpPresence escribe gbp_mode=create a gbp_profiles (code-path real)', async () => {
  const { client, captured } = mockWriteClient({});
  const ok = await persistGbpPresence({
    supabase: client,
    gbpProfileId: 'gbp-1',
    payload: buildGbpPresencePayload({ gbpMode: 'create', attested: false })
  });
  assert.equal(ok, true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].table, 'gbp_profiles');
  assert.equal(captured[0].id, 'gbp-1');
  assert.equal(captured[0].values.gbp_mode, 'create');
});

test('T-15 sin gbpProfileId no hay home → no-op (no lanza, no bloquea el guardado)', async () => {
  const { client, captured } = mockWriteClient({});
  const ok = await persistGbpPresence({
    supabase: client,
    gbpProfileId: null,
    payload: buildGbpPresencePayload({ gbpMode: 'create', attested: false })
  });
  assert.equal(ok, false);
  assert.equal(captured.length, 0);
});

test('T-15 create mode: los 3 ítems NAP de presencia + gbp_access son N/A; los legales NO', () => {
  for (const id of [
    'google_name_match',
    'address_consistent',
    'phone_consistent'
  ]) {
    assert.equal(
      isPresenceItemNA(id, 'create'),
      true,
      `${id} debe ser N/A en crear`
    );
  }
  assert.equal(isPresenceItemNA('gbp_access', 'create'), true);
  // Legales: NUNCA N/A (siguen aplicando en modo crear)
  for (const id of [
    'cslb_name_match',
    'cslb_active',
    'entity_verified',
    'sos_registration'
  ]) {
    assert.equal(
      isPresenceItemNA(id, 'create'),
      false,
      `${id} NO debe ser N/A`
    );
  }
  // En modo existe nada es N/A
  for (const id of [
    ...NAP_PRESENCE_ITEM_IDS,
    ...CREDENTIALS_PRESENCE_ITEM_IDS
  ]) {
    assert.equal(isPresenceItemNA(id, 'existing'), false);
  }
});

// Wiring real de la NAP page: pregunta raíz + persistencia + N/A
const napPageSrc = readFileSync(
  fileURLToPath(
    new URL(
      '../../src/app/(app)/onboarding/nap/[clientId]/page.tsx',
      import.meta.url
    )
  ),
  'utf8'
);

test('T-15 NAP page cablea la pregunta raíz, persistGbpPresence y el N/A (source)', () => {
  assert.match(napPageSrc, /¿El negocio ya tiene un Google Business Profile/);
  assert.match(napPageSrc, /persistGbpPresence\(/);
  assert.match(napPageSrc, /isPresenceItemNA\(item\.id,\s*gbpMode\)/);
  // el N/A deshabilita el checkbox y lo fuerza desmarcado
  assert.match(napPageSrc, /disabled=\{na\}/);
});

const credPageSrc = readFileSync(
  fileURLToPath(
    new URL(
      '../../src/app/(app)/onboarding/credentials/[clientId]/page.tsx',
      import.meta.url
    )
  ),
  'utf8'
);

test('T-15 credentials page marca gbp_access N/A en modo crear y no lo cuenta como requerido (source)', () => {
  assert.match(credPageSrc, /isPresenceItemNA\(item\.id,\s*gbpMode\)/);
  // missingRequired excluye los N/A
  assert.match(credPageSrc, /!isPresenceItemNA\(item\.id,\s*gbpMode\)/);
  assert.match(credPageSrc, /disabled=\{na\}/);
});

// ===================================================================
// T-16 — reword + atestación
// ===================================================================

test('T-16 la etiqueta cslb_name_match ya no referencia "GBP"', () => {
  const item = NAP_CHECKLIST.find((i) => i.id === 'cslb_name_match');
  assert.ok(item);
  assert.doesNotMatch(item!.description, /GBP/);
  assert.match(item!.description, /nombre legal del negocio/);
});

test('T-16 atestación en modo existe fija verification_status=verified', () => {
  const p = buildGbpPresencePayload({ gbpMode: 'existing', attested: true });
  assert.equal(p.verification_status, 'verified');
  assert.equal(p.gbp_mode, 'existing');
});

test('T-16 existe sin atestar → no escribe verification_status', () => {
  const p = buildGbpPresencePayload({ gbpMode: 'existing', attested: false });
  assert.ok(!('verification_status' in p));
});

test('T-16 create + attested → NO atestación (no hay GBP que verificar)', () => {
  const p = buildGbpPresencePayload({ gbpMode: 'create', attested: true });
  assert.ok(!('verification_status' in p));
});

test('T-16 persistGbpPresence escribe verification_status=verified cuando se atesta', async () => {
  const { client, captured } = mockWriteClient({});
  await persistGbpPresence({
    supabase: client,
    gbpProfileId: 'gbp-9',
    payload: buildGbpPresencePayload({ gbpMode: 'existing', attested: true })
  });
  assert.equal(captured[0].values.verification_status, 'verified');
});

test('T-16 NAP page cablea el checkbox de atestación (source)', () => {
  assert.match(napPageSrc, /gbp_verified_attested/);
  assert.match(napPageSrc, /GBP verificado\/reclamado en Google/);
});

// ===================================================================
// T-17 — backward-compat de la carga (filas legacy / 0 filas → existing)
// ===================================================================

test('T-17 loadGbpPresence con 0 filas → existing, sin throw (no 406)', async () => {
  const res = await loadGbpPresence(mockReadClient(null), 'client-1');
  assert.equal(res.gbpMode, 'existing');
  assert.equal(res.gbpProfileId, null);
  assert.equal(res.verificationStatus, null);
});

test('T-17 fila legacy sin gbp_mode → existing (R-02)', async () => {
  const res = await loadGbpPresence(
    mockReadClient({ id: 'g-legacy', verification_status: null }),
    'client-1'
  );
  assert.equal(res.gbpMode, 'existing');
  assert.equal(res.gbpProfileId, 'g-legacy');
});

test('T-17 fila con gbp_mode=create → create; verificado atestado se refleja', async () => {
  const created = await loadGbpPresence(
    mockReadClient({ id: 'g1', gbp_mode: 'create' }),
    'client-1'
  );
  assert.equal(created.gbpMode, 'create');

  const verified = await loadGbpPresence(
    mockReadClient({
      id: 'g2',
      gbp_mode: 'existing',
      verification_status: 'verified'
    }),
    'client-1'
  );
  assert.equal(verified.gbpMode, 'existing');
  assert.equal(verified.verificationStatus, 'verified');
});
