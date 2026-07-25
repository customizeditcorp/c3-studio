/**
 * F-101 — T-06 (R-07, R-08): resolución de tenant por env + preservación de tenant +
 * abort explícito si falta cualquier env var requerida (no write).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSyncTenantId,
  resolveSyncEnv,
  buildUpsertPlan
} from '../../scripts/lib/prompt-sync-core.mjs';

const TENANT_UUID = '1d3b28b1-0000-4000-8000-000000000001';
const FULL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://uxczbwtfcsjsrmrikwoh.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-placeholder',
  PROMPT_SYNC_TENANT_ID: TENANT_UUID
};

test('T-06 resolveSyncTenantId devuelve la UUID desde la env (DT-02)', () => {
  assert.strictEqual(resolveSyncTenantId(FULL_ENV), TENANT_UUID);
});

test('T-06 resolveSyncTenantId lanza si falta PROMPT_SYNC_TENANT_ID (R-08)', () => {
  assert.throws(
    () =>
      resolveSyncTenantId({ ...FULL_ENV, PROMPT_SYNC_TENANT_ID: undefined }),
    /PROMPT_SYNC_TENANT_ID/
  );
  assert.throws(() => resolveSyncTenantId({}), /PROMPT_SYNC_TENANT_ID/);
});

test('T-06 resolveSyncTenantId lanza si la UUID es inválida (no global/basura)', () => {
  assert.throws(
    () => resolveSyncTenantId({ PROMPT_SYNC_TENANT_ID: 'not-a-uuid' }),
    /UUID/
  );
});

test('T-06 resolveSyncEnv exige NEXT_PUBLIC_SUPABASE_URL (R-08)', () => {
  assert.throws(
    () => resolveSyncEnv({ ...FULL_ENV, NEXT_PUBLIC_SUPABASE_URL: undefined }),
    /NEXT_PUBLIC_SUPABASE_URL/
  );
});

test('T-06 resolveSyncEnv exige SUPABASE_SERVICE_ROLE_KEY (R-08)', () => {
  assert.throws(
    () => resolveSyncEnv({ ...FULL_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined }),
    /SUPABASE_SERVICE_ROLE_KEY/
  );
});

test('T-06 resolveSyncEnv exige PROMPT_SYNC_TENANT_ID (R-08)', () => {
  assert.throws(
    () => resolveSyncEnv({ ...FULL_ENV, PROMPT_SYNC_TENANT_ID: undefined }),
    /PROMPT_SYNC_TENANT_ID/
  );
});

test('T-06 resolveSyncEnv devuelve la config completa cuando todo está presente', () => {
  const cfg = resolveSyncEnv(FULL_ENV);
  assert.deepStrictEqual(cfg, {
    supabaseUrl: FULL_ENV.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: FULL_ENV.SUPABASE_SERVICE_ROLE_KEY,
    tenantId: TENANT_UUID
  });
});

test('T-06 el plan de upsert PRESERVA tenant (nunca null/global, R-07)', () => {
  const gitRow = {
    step: 'brief',
    system_prompt: 'x',
    methodology: null,
    vertical: null,
    validation_rules: null,
    version: 1,
    tenant: '__primary__'
  };
  const insertPlan = buildUpsertPlan(gitRow, null, TENANT_UUID);
  assert.strictEqual(insertPlan.values.tenant_id, TENANT_UUID);
  assert.notStrictEqual(insertPlan.values.tenant_id, null);

  // buildUpsertPlan aborta si el tenant resuelto está vacío (nunca escribe global).
  assert.throws(() => buildUpsertPlan(gitRow, null, ''), /tenantId/);
});
