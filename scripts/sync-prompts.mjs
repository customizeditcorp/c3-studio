#!/usr/bin/env node
/**
 * F-101 — Fase 0: shell fino del seed/sync de prompts (git = fuente autoritativa).
 *
 * Uso:
 *   node --env-file=.env.local scripts/sync-prompts.mjs <export|check|apply>
 *
 * Modos:
 *   export : lee las 11 filas activas del tenant (SELECT) → escribe prompts/<step>/*.
 *            READ-ONLY sobre la DB (escribe archivos locales). Puebla la fuente inicial.
 *   check  : parsea prompts/<step>/* + lee las filas vivas (SELECT) → imprime diffPrompt
 *            por step. NO escribe (ni DB ni archivos). exit≠0 si hay diffs. Prueba de
 *            fidelidad/no-op (R-09).
 *   apply  : read-modify-write git→DB (upsert idempotente por (step,tenant_id)).
 *            *** ESCRIBE prompt_versions = FRONTERA (F-074/CL-023). NO lo corre el
 *            implementer. Requiere autorización del operador (tramo LIVE). ***
 *
 * Toca EXCLUSIVAMENTE `prompt_versions` (R-14). Aborta con error explícito si falta una
 * env var (R-08). Toda la lógica decidible vive en el núcleo puro (prompt-sync-core.mjs).
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  serializePrompt,
  parsePromptFile,
  diffPrompt,
  buildUpsertPlan,
  resolveSyncEnv,
  scanForSecrets,
  DEFAULT_TENANT_REF
} from './lib/prompt-sync-core.mjs';

/** Los 11 steps del método (requirements.md §Grounding). */
export const STEPS = Object.freeze([
  'brief',
  'buyer_persona',
  'ofv',
  'gbp_description',
  'gbp_posts',
  'campaign_copy',
  'nurturing',
  'social_content',
  'website_home',
  'website_service',
  'website_location'
]);

const TABLE = 'prompt_versions';
/** Campos que trae el SELECT (incluye artefactos DB para el plan de upsert). */
const SELECT_COLUMNS =
  'id, step, system_prompt, methodology, vertical, validation_rules, version, tenant_id, active, created_at';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PROMPTS_DIR = join(REPO_ROOT, 'prompts');

function stepDir(step) {
  return join(PROMPTS_DIR, step);
}

/** Convierte una fila viva de la DB en la representación git (tenant → referencia). */
function dbRowToGitRow(dbRow) {
  return {
    step: dbRow.step,
    system_prompt: dbRow.system_prompt ?? '',
    methodology: dbRow.methodology ?? null,
    vertical: dbRow.vertical ?? null,
    validation_rules: dbRow.validation_rules ?? null,
    version: dbRow.version,
    tenant: DEFAULT_TENANT_REF
  };
}

function makeClient(cfg) {
  return createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/** SELECT la fila activa de un step para el tenant configurado (tenant-scoped). */
async function fetchLiveRow(supabase, step, tenantId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq('step', step)
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`SELECT ${TABLE} (${step}) falló: ${error.message}`);
  }
  return data ?? null;
}

async function readGitFiles(step) {
  const dir = stepDir(step);
  const spPath = join(dir, 'system_prompt.md');
  const metaPath = join(dir, 'meta.json');
  if (!existsSync(spPath) || !existsSync(metaPath)) {
    throw new Error(
      `Faltan archivos de git para el step "${step}" (${spPath} / ${metaPath}). ` +
        `Corré \`export\` primero.`
    );
  }
  const systemPromptMd = await readFile(spPath, 'utf8');
  const metaJson = await readFile(metaPath, 'utf8');
  return { systemPromptMd, metaJson };
}

// --- export ---------------------------------------------------------------
async function runExport(supabase, cfg) {
  const { tenantId } = cfg;
  let written = 0;
  for (const step of STEPS) {
    const live = await fetchLiveRow(supabase, step, tenantId);
    if (!live) {
      console.warn(`[export] AVISO: sin fila activa para step "${step}" (tenant ${tenantId}) — se omite.`);
      continue;
    }
    const gitRow = dbRowToGitRow(live);
    const files = serializePrompt(gitRow);

    // R-03: chequeo de no-secretos ANTES de escribir. Si hay hallazgo → abortar.
    const findings = [
      ...scanForSecrets(files.systemPromptMd),
      ...scanForSecrets(files.metaJson)
    ];
    if (findings.length > 0) {
      throw new Error(
        `[export] SECRETO detectado en el contenido del step "${step}" ` +
          `(${findings.map((f) => f.kind).join(', ')}). NO se escribe. (R-03)`
      );
    }

    const dir = stepDir(step);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'system_prompt.md'), files.systemPromptMd, 'utf8');
    await writeFile(join(dir, 'meta.json'), files.metaJson, 'utf8');
    written++;
    console.log(`[export] ${step} → prompts/${step}/ (v${gitRow.version})`);
  }
  console.log(`[export] listo: ${written}/${STEPS.length} steps escritos. READ-ONLY sobre la DB.`);
}

// --- check ----------------------------------------------------------------
async function runCheck(supabase, cfg) {
  const { tenantId } = cfg;
  let totalDiffs = 0;
  let missing = 0;
  for (const step of STEPS) {
    let gitRow;
    try {
      gitRow = parsePromptFile(await readGitFiles(step));
    } catch (e) {
      console.error(`[check] ${step}: ${e.message}`);
      missing++;
      continue;
    }
    const live = await fetchLiveRow(supabase, step, tenantId);
    if (!live) {
      console.warn(`[check] ${step}: sin fila viva (tenant ${tenantId}).`);
      totalDiffs++;
      continue;
    }
    const changes = diffPrompt(gitRow, live);
    if (changes.length === 0) {
      console.log(`[check] ${step}: OK (0 diffs)`);
    } else {
      totalDiffs += changes.length;
      console.log(`[check] ${step}: ${changes.length} diff(s) → ${changes.map((c) => c.field).join(', ')}`);
    }
  }
  console.log('[check] READ-ONLY. No se escribió nada.');
  if (missing > 0 || totalDiffs > 0) {
    console.error(`[check] FALLA: ${totalDiffs} diff(s), ${missing} step(s) sin archivos. exit 1`);
    process.exitCode = 1;
  } else {
    console.log('[check] fidelidad byte-a-byte confirmada: 0 diffs (apply sería no-op).');
  }
}

// --- apply (FRONTERA — write a prod, gateado F-074) -----------------------
async function runApply(supabase, cfg) {
  const { tenantId } = cfg;
  let inserts = 0;
  let updates = 0;
  let noops = 0;
  for (const step of STEPS) {
    const gitRow = parsePromptFile(await readGitFiles(step));
    const live = await fetchLiveRow(supabase, step, tenantId);
    const plan = buildUpsertPlan(gitRow, live, tenantId);

    if (plan.op === 'insert') {
      const { error } = await supabase.from(TABLE).insert(plan.values);
      if (error) throw new Error(`INSERT ${step} falló: ${error.message}`);
      inserts++;
      console.log(`[apply] ${step}: INSERT (fila nueva, tenant ${tenantId}, active=true)`);
    } else {
      if (plan.noop) {
        noops++;
        console.log(`[apply] ${step}: no-op (0 diffs; update-in-place omitido)`);
        continue;
      }
      const { error } = await supabase
        .from(TABLE)
        .update(plan.values) // SOLO campos versionados; id/created_at/tenant_id/active preservados
        .eq('id', plan.id);
      if (error) throw new Error(`UPDATE ${step} (id ${plan.id}) falló: ${error.message}`);
      updates++;
      console.log(`[apply] ${step}: UPDATE by id ${plan.id} → ${plan.changes.map((c) => c.field).join(', ')}`);
    }
  }
  console.log(`[apply] listo: ${inserts} insert, ${updates} update, ${noops} no-op. Sin version-bump, sin desactivar filas.`);
}

// --- entrypoint -----------------------------------------------------------
async function main() {
  const mode = process.argv[2];
  if (!mode || !['export', 'check', 'apply'].includes(mode)) {
    console.error('Uso: node --env-file=.env.local scripts/sync-prompts.mjs <export|check|apply>');
    process.exitCode = 2;
    return;
  }

  // R-08: valida TODAS las env vars requeridas ANTES de cualquier acceso. Aborta explícito.
  const cfg = resolveSyncEnv(process.env);
  const supabase = makeClient(cfg);

  if (mode === 'export') {
    await runExport(supabase, cfg);
  } else if (mode === 'check') {
    await runCheck(supabase, cfg);
  } else if (mode === 'apply') {
    console.warn(
      '[apply] *** ESCRIBE prompt_versions en prod = FRONTERA (F-074). Requiere ' +
        'autorización del operador. ***'
    );
    await runApply(supabase, cfg);
  }
}

// Solo ejecuta si se corre como script (no al importarlo en tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error('[sync-prompts] ERROR:', err.message);
    process.exitCode = 1;
  });
}
