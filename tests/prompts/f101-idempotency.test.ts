/**
 * F-101 — T-05 (R-05, R-06, R-11): idempotencia / upsert plan.
 *
 * Fila idéntica ⇒ 0 diffs ⇒ apply no-op. Fila distinta ⇒ reporta exactamente los campos
 * que difieren. El plan de upsert es update-in-place por id (preserva id/created_at/
 * tenant_id/active/version — sin version-bump, sin desactivar); sin fila ⇒ INSERT.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diffPrompt,
  buildUpsertPlan
} from '../../scripts/lib/prompt-sync-core.mjs';

const TENANT_UUID = '1d3b28b1-0000-4000-8000-000000000001';

const GIT_ROW = {
  step: 'gbp_description',
  system_prompt: 'Eres GBP Specialist.\nRegla 1.\nRegla 2.',
  methodology: 'c3_value_method',
  vertical: null,
  validation_rules: { required: ['description'], min: 500 },
  version: 1,
  tenant: '__primary__'
};

/** Fila viva de la DB idéntica en contenido (con artefactos DB añadidos). */
const DB_ROW_IDENTICAL = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  step: 'gbp_description',
  system_prompt: 'Eres GBP Specialist.\nRegla 1.\nRegla 2.',
  methodology: 'c3_value_method',
  vertical: null,
  validation_rules: { required: ['description'], min: 500 },
  version: 1,
  tenant_id: TENANT_UUID,
  active: true,
  created_at: '2026-01-01T00:00:00Z'
};

test('T-05 diffPrompt con fila idéntica ⇒ 0 cambios (apply = no-op, R-05)', () => {
  assert.deepStrictEqual(diffPrompt(GIT_ROW, DB_ROW_IDENTICAL), []);
});

test('T-05 diffPrompt reporta EXACTAMENTE los campos que difieren', () => {
  const dbDifferent = {
    ...DB_ROW_IDENTICAL,
    system_prompt: 'OTRO texto',
    validation_rules: { required: ['description'], min: 999 }
  };
  const changes = diffPrompt(GIT_ROW, dbDifferent);
  const fields = changes.map((c) => c.field).sort();
  assert.deepStrictEqual(fields, ['system_prompt', 'validation_rules']);
});

test('T-05 diffPrompt NO considera tenant/id/created_at/active (artefactos)', () => {
  const dbOtherTenant = {
    ...DB_ROW_IDENTICAL,
    tenant_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    id: 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz',
    active: false
  };
  // El contenido versionado es idéntico ⇒ 0 diffs (esos campos no drivean el no-op).
  assert.deepStrictEqual(diffPrompt(GIT_ROW, dbOtherTenant), []);
});

test('T-05 buildUpsertPlan con fila existente ⇒ UPDATE by id, no-op, preservando artefactos (R-06/R-11)', () => {
  const plan = buildUpsertPlan(GIT_ROW, DB_ROW_IDENTICAL, TENANT_UUID);
  assert.strictEqual(plan.op, 'update');
  assert.strictEqual(plan.id, DB_ROW_IDENTICAL.id);
  assert.strictEqual(plan.noop, true);
  // El UPDATE NO toca id/created_at/tenant_id/active (no aparecen en values).
  assert.ok(!('id' in plan.values));
  assert.ok(!('created_at' in plan.values));
  assert.ok(!('tenant_id' in plan.values));
  assert.ok(!('active' in plan.values));
  // Sin version-bump: version = valor de git (idéntico al vivo).
  assert.strictEqual(plan.values.version, GIT_ROW.version);
});

test('T-05 buildUpsertPlan con fila distinta ⇒ UPDATE con changes, sin version-bump', () => {
  const dbDifferent = { ...DB_ROW_IDENTICAL, system_prompt: 'viejo' };
  const plan = buildUpsertPlan(GIT_ROW, dbDifferent, TENANT_UUID);
  assert.strictEqual(plan.op, 'update');
  assert.strictEqual(plan.noop, false);
  assert.ok(plan.changes);
  assert.deepStrictEqual(
    plan.changes.map((c) => c.field),
    ['system_prompt']
  );
  assert.strictEqual(plan.values.version, GIT_ROW.version); // sin bump
});

test('T-05 buildUpsertPlan sin fila viva ⇒ INSERT con tenant + active:true (R-06)', () => {
  const plan = buildUpsertPlan(GIT_ROW, null, TENANT_UUID);
  assert.strictEqual(plan.op, 'insert');
  assert.strictEqual(plan.values.tenant_id, TENANT_UUID);
  assert.strictEqual(plan.values.active, true);
  assert.strictEqual(plan.values.version, GIT_ROW.version);
  assert.strictEqual(plan.values.step, GIT_ROW.step);
  assert.strictEqual(plan.values.system_prompt, GIT_ROW.system_prompt);
});
