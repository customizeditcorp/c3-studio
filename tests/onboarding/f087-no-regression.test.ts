/**
 * F-087 — T-11: no-regresión de la atestación de F-083 (R-07).
 *
 * La atestación de onboarding (modo existe + atestado) SIGUE fijando
 * `verification_status='verified'` (`buildGbpPresencePayload` intacto), y las seams de
 * carga de F-083 (`loadGbpPresence`) y F-087 (`loadGbpAsset`) CONVIVEN sin romper filas
 * legacy. El lifecycle nuevo es un SUPERCONJUNTO que incluye `verified`. `Ref: R-07`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGbpPresencePayload,
  loadGbpPresence,
  type GbpPresenceReadClient
} from '../../src/lib/onboarding/gbp-mode.ts';
import {
  loadGbpAsset,
  VERIFICATION_STATUS_OPTIONS,
  type GbpAssetReadClient
} from '../../src/lib/gbp-slice/gbp-asset.ts';

function mockPresenceRead(
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

function mockAssetRead(
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

// --- Atestación F-083 intacta ---
test('T-11 atestación F-083 sigue fijando verification_status=verified (intacta)', () => {
  const p = buildGbpPresencePayload({ gbpMode: 'existing', attested: true });
  assert.equal(p.verification_status, 'verified');
  assert.equal(p.gbp_mode, 'existing');
});

test('T-11 el lifecycle F-087 es superconjunto: incluye "verified"', () => {
  assert.ok(
    VERIFICATION_STATUS_OPTIONS.some((o) => o.value === 'verified'),
    'verified debe seguir siendo un estado válido del lifecycle'
  );
});

// --- loadGbpPresence (F-083) y loadGbpAsset (F-087) conviven ---
test('T-11 una fila verified es leída coherentemente por ambas seams', async () => {
  const row = {
    id: 'g-verified',
    gbp_mode: 'existing',
    verification_status: 'verified',
    operational_email: 'jd@gmail.com',
    verified_at: '2026-07-23T00:00:00.000Z'
  };
  const presence = await loadGbpPresence(mockPresenceRead(row), 'client-1');
  assert.equal(presence.gbpMode, 'existing');
  assert.equal(presence.verificationStatus, 'verified');

  const asset = await loadGbpAsset(mockAssetRead(row), 'client-1');
  assert.equal(asset.gbpProfileId, 'g-verified');
  assert.equal(asset.verificationStatus, 'verified');
  assert.equal(asset.operationalEmail, 'jd@gmail.com');
});

test('T-11 fila legacy (sin columnas F-087) no rompe loadGbpAsset', async () => {
  // Fila previa a F-087: sólo columnas de F-083; las de identidad/verified_at ausentes.
  const legacy = {
    id: 'g-legacy',
    gbp_mode: 'existing',
    verification_status: 'verified'
  };
  const asset = await loadGbpAsset(mockAssetRead(legacy), 'client-1');
  assert.equal(asset.gbpProfileId, 'g-legacy');
  assert.equal(asset.verificationStatus, 'verified');
  assert.equal(asset.operationalEmail, ''); // default seguro
  assert.equal(asset.verifiedAt, null);
});

test('T-11 fila 0 → loadGbpPresence existing + loadGbpAsset pending (defaults, sin throw)', async () => {
  const presence = await loadGbpPresence(mockPresenceRead(null), 'client-1');
  assert.equal(presence.gbpMode, 'existing');
  const asset = await loadGbpAsset(mockAssetRead(null), 'client-1');
  assert.equal(asset.verificationStatus, 'pending');
});
