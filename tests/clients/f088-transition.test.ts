/**
 * F-088 — Write-path de transición de estado: persistencia, onboarding→active,
 * bidireccional, destino inválido rechazado, error honesto.
 *
 * Ejercita el code-path REAL (§6.1): `persistClientStatus` es la MISMA función que
 * invoca el handler de confirmación de la ficha. El cliente Supabase se MOCKEA (la
 * escritura real a la DB es frontera F-074); el mock captura el UPDATE para verificar
 * la fila que aterrizaría. `Ref: R-05, R-06, R-08, R-10, R-11`
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
              // segunda eq resuelve la promesa (mirror del builder supabase).
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
// T-12 — write-path: confirmar target invoca UPDATE clients.status (R-05)
// ===================================================================
test('T-12 persistClientStatus escribe clients.status con el target esperado (R-05)', async () => {
  const { client, captured } = mockWriteClient({});
  const result = await persistClientStatus({
    supabase: client,
    clientId: 'client-1',
    tenantId: 'tenant-1',
    target: 'delivered',
    now: NOW
  });
  assert.equal(result, 'delivered');
  assert.equal(captured.length, 1);
  assert.equal(captured[0].table, 'clients');
  assert.equal(captured[0].values.status, 'delivered');
  assert.equal(captured[0].values.updated_at, NOW());
  // Scoped por id + tenant_id (defensa en profundidad, mirror del fetch).
  assert.deepEqual(captured[0].filters, [
    { column: 'id', value: 'client-1' },
    { column: 'tenant_id', value: 'tenant-1' }
  ]);
});

// ===================================================================
// T-13 — onboarding→active (la transición hoy muerta) (R-06)
// ===================================================================
test('T-13 onboarding→active persiste status=active (cablea la transición muerta, R-06)', async () => {
  const { client, captured } = mockWriteClient({});
  const result = await persistClientStatus({
    supabase: client,
    clientId: 'c-onb',
    tenantId: 't-1',
    target: 'active',
    now: NOW
  });
  assert.equal(result, 'active');
  assert.equal(captured[0].values.status, 'active');
});

// ===================================================================
// T-15 — transición bidireccional (forward + backward) (R-08)
// ===================================================================
test('T-15 transición hacia adelante y hacia atrás, ambas persisten (R-08)', async () => {
  // forward: active → delivered
  const fwd = mockWriteClient({});
  await persistClientStatus({
    supabase: fwd.client,
    clientId: 'c1',
    tenantId: 't1',
    target: 'delivered',
    now: NOW
  });
  assert.equal(fwd.captured[0].values.status, 'delivered');

  // backward: active → onboarding (retroceso permitido, sin precondición dura)
  const bwd = mockWriteClient({});
  const r = await persistClientStatus({
    supabase: bwd.client,
    clientId: 'c1',
    tenantId: 't1',
    target: 'onboarding',
    now: NOW
  });
  assert.equal(r, 'onboarding');
  assert.equal(bwd.captured[0].values.status, 'onboarding');
});

// ===================================================================
// T-17 — destino inválido rechazado, no muta clients.status (R-10)
// ===================================================================
test('T-17 target fuera de ClientStatus es rechazado y NO escribe (R-10)', async () => {
  const { client, captured } = mockWriteClient({});
  await assert.rejects(
    persistClientStatus({
      supabase: client,
      clientId: 'c1',
      tenantId: 't1',
      target: 'super_active', // no es un valor válido
      now: NOW
    }),
    /inválido/
  );
  assert.equal(captured.length, 0, 'no debe haber ninguna write');
});

// ===================================================================
// T-18 — error honesto: si el UPDATE falla, se propaga y el estado no cambia (R-11)
// ===================================================================
test('T-18 si el UPDATE retorna error, persistClientStatus lanza (sin éxito silencioso, R-11)', async () => {
  const { client } = mockWriteClient({ error: { message: 'boom db' } });
  await assert.rejects(
    persistClientStatus({
      supabase: client,
      clientId: 'c1',
      tenantId: 't1',
      target: 'active',
      now: NOW
    }),
    (err: unknown) =>
      typeof err === 'object' &&
      err !== null &&
      (err as { message?: string }).message === 'boom db'
  );
});
