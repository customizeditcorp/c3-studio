/**
 * F-092 — Write-path de `clients.delivered_at` (set-once, DT-02): set al entrar a
 * `delivered` con delivered_at NULL, no lo pisa si ya tenía valor, ninguna otra transición
 * lo toca.
 *
 * Ejercita el code-path REAL (§6.1): `persistClientStatus` es la MISMA función que invoca
 * el handler de confirmación de la ficha. El cliente Supabase se MOCKEA (la escritura real a
 * la DB es frontera F-074); el mock captura el UPDATE para verificar la fila que aterrizaría.
 * `Ref: R-06, R-07, R-08`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  persistClientStatus,
  type ClientStatusWriteClient
} from '../../src/lib/clients/client-status.ts';

const NOW = () => '2026-07-23T12:00:00.000Z';

// Mock del cliente sobre la seam estructural: captura table/values/filtros del UPDATE.
function mockWriteClient(opts: { error?: unknown }): {
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

// ===================================================================
// T-14 — set: entrar a `delivered` con delivered_at NULL → escribe delivered_at (R-06)
// ===================================================================
test('T-14 target=delivered con delivered_at actual NULL → UPDATE incluye delivered_at=now (R-06)', async () => {
  const { client, captured } = mockWriteClient({});
  const result = await persistClientStatus({
    supabase: client,
    clientId: 'c1',
    tenantId: 't1',
    target: 'delivered',
    currentDeliveredAt: null,
    now: NOW
  });
  assert.equal(result, 'delivered');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].values.status, 'delivered');
  // La entrega registra CUÁNDO se entregó = el mismo `now` de la transición.
  assert.equal(captured[0].values.delivered_at, NOW());
  assert.equal(captured[0].values.updated_at, NOW());
});

test('T-14 delivered_at actual undefined (columna aún sin valor) también setea (R-06)', async () => {
  const { client, captured } = mockWriteClient({});
  await persistClientStatus({
    supabase: client,
    clientId: 'c1',
    tenantId: 't1',
    target: 'delivered',
    // sin currentDeliveredAt (undefined) = falsy → primera entrega
    now: NOW
  });
  assert.equal(captured[0].values.delivered_at, NOW());
});

// ===================================================================
// T-15 — set-once: delivered_at ya presente → NO se pisa (R-07)
// ===================================================================
test('T-15 target=delivered con delivered_at ya presente → UPDATE NO incluye/pisa delivered_at (R-07)', async () => {
  const { client, captured } = mockWriteClient({});
  await persistClientStatus({
    supabase: client,
    clientId: 'c1',
    tenantId: 't1',
    target: 'delivered',
    currentDeliveredAt: '2026-01-01T00:00:00.000Z', // ya entregado antes
    now: NOW
  });
  // El estado se re-persiste, pero delivered_at NO aparece en el payload (set-once).
  assert.equal(captured[0].values.status, 'delivered');
  assert.equal(
    'delivered_at' in captured[0].values,
    false,
    'set-once: no debe pisar la fecha de entrega original'
  );
});

// ===================================================================
// T-16 — aislamiento: cualquier otro target NO toca delivered_at (R-08)
// ===================================================================
test('T-16 target distinto de delivered NO incluye delivered_at en el UPDATE (R-08)', async () => {
  for (const target of ['active', 'onboarding', 'maintenance', 'paused']) {
    const { client, captured } = mockWriteClient({});
    await persistClientStatus({
      supabase: client,
      clientId: 'c1',
      tenantId: 't1',
      target,
      currentDeliveredAt: null,
      now: NOW
    });
    assert.equal(captured[0].values.status, target);
    assert.equal(
      'delivered_at' in captured[0].values,
      false,
      `${target}: ninguna otra transición toca delivered_at`
    );
  }
});

test('T-16 salir de delivered (delivered→maintenance) NO limpia ni re-escribe delivered_at (R-07/R-08)', async () => {
  const { client, captured } = mockWriteClient({});
  await persistClientStatus({
    supabase: client,
    clientId: 'c1',
    tenantId: 't1',
    target: 'maintenance',
    currentDeliveredAt: '2026-01-01T00:00:00.000Z',
    now: NOW
  });
  assert.equal('delivered_at' in captured[0].values, false);
});
