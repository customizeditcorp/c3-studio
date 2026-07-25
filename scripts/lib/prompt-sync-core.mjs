/**
 * F-101 — Fase 0: núcleo puro del seed/sync de prompts (git = fuente autoritativa).
 *
 * Framework-free, SIN I/O (patrón "seam puro" F-093/F-100 · design.md §1.2): toda la
 * lógica decidible vive aquí y es testeable con `node --test` sin red. El I/O (cliente
 * service-role, lectura/escritura de tabla y de archivos) vive SOLO en el shell
 * `scripts/sync-prompts.mjs`.
 *
 * Formato de archivo (DT-01): una carpeta por step `prompts/<step>/` con:
 *   - `system_prompt.md` : el `system_prompt` VERBATIM (ancla de fidelidad byte-a-byte;
 *      sin escapar, SIN trailing-newline añadido — se escribe/lee tal cual).
 *   - `meta.json`        : `{ step, methodology, vertical, validation_rules, version, tenant }`
 *      (JSON 2-espacios + un único trailing "\n"; `validation_rules` jsonb exacto).
 *
 * Representación del tenant (DT-02): en git va una REFERENCIA (p.ej. "__primary__"),
 * NUNCA la UUID literal. La UUID concreta se resuelve por env `PROMPT_SYNC_TENANT_ID`
 * al sincronizar (resolveSyncTenantId).
 *
 * Campos versionados (DT-04): step, system_prompt, methodology, vertical,
 * validation_rules, version. `id`/`created_at` = artefactos DB (NO versionados).
 * `active` = implícito true (git = el conjunto activo). `tenant_id` vía DT-02.
 */

import { isDeepStrictEqual } from 'node:util';

/** Referencia de tenant por defecto que se escribe en git (DT-02). NO es una UUID. */
export const DEFAULT_TENANT_REF = '__primary__';

/** Campos que definen el CONTENIDO versionado de un prompt (DT-04, sin `tenant`). */
export const VERSIONED_FIELDS = Object.freeze([
  'step',
  'system_prompt',
  'methodology',
  'vertical',
  'validation_rules',
  'version'
]);

/** Orden canónico de claves de `meta.json` (determinista → round-trip byte-exacto). */
const META_KEY_ORDER = Object.freeze([
  'step',
  'methodology',
  'vertical',
  'validation_rules',
  'version',
  'tenant'
]);

/**
 * @typedef {Object} PromptGitRow  Representación en git de un prompt (DT-01/DT-02/DT-04).
 * @property {string} step
 * @property {string} system_prompt        Texto verbatim.
 * @property {string|null} methodology
 * @property {string|null} vertical
 * @property {*} validation_rules           jsonb (objeto/array/valor).
 * @property {number} version
 * @property {string} tenant                Referencia de tenant (NO uuid).
 */

/**
 * @typedef {Object} PromptFiles  Contenido serializado de los 2 archivos de un step.
 * @property {string} systemPromptMd   Contenido de `system_prompt.md` (verbatim).
 * @property {string} metaJson         Contenido de `meta.json` (JSON + trailing "\n").
 */

/**
 * Serializa un `PromptGitRow` a los contenidos de sus 2 archivos.
 * Garantía: `serializePrompt(parsePromptFile(files))` es byte-a-byte igual a `files`
 * (idempotencia, R-05) cuando `files` es canónico; y `parsePromptFile(serializePrompt(row))`
 * es deep-equal a `row` (fidelidad, R-02).
 *
 * @param {PromptGitRow} row
 * @returns {PromptFiles}
 */
export function serializePrompt(row) {
  if (row == null || typeof row !== 'object') {
    throw new Error('serializePrompt: row debe ser un objeto');
  }
  if (typeof row.step !== 'string' || row.step.length === 0) {
    throw new Error('serializePrompt: `step` requerido');
  }
  if (typeof row.system_prompt !== 'string') {
    throw new Error('serializePrompt: `system_prompt` debe ser string (verbatim)');
  }
  // system_prompt.md = texto VERBATIM (sin añadir/quitar newline — evita el footgun).
  const systemPromptMd = row.system_prompt;

  // meta.json en orden de claves canónico → JSON determinista.
  const meta = {};
  for (const key of META_KEY_ORDER) {
    if (key === 'tenant') {
      meta.tenant = row.tenant == null ? DEFAULT_TENANT_REF : row.tenant;
    } else if (key === 'methodology' || key === 'vertical') {
      meta[key] = row[key] == null ? null : row[key];
    } else if (key === 'validation_rules') {
      meta.validation_rules = row.validation_rules === undefined ? null : row.validation_rules;
    } else {
      meta[key] = row[key];
    }
  }
  const metaJson = JSON.stringify(meta, null, 2) + '\n';
  return { systemPromptMd, metaJson };
}

/**
 * Parsea los 2 archivos de un step a un `PromptGitRow`.
 * @param {PromptFiles} files
 * @returns {PromptGitRow}
 */
export function parsePromptFile(files) {
  if (files == null || typeof files !== 'object') {
    throw new Error('parsePromptFile: files debe ser { systemPromptMd, metaJson }');
  }
  const { systemPromptMd, metaJson } = files;
  if (typeof systemPromptMd !== 'string') {
    throw new Error('parsePromptFile: `systemPromptMd` debe ser string');
  }
  if (typeof metaJson !== 'string') {
    throw new Error('parsePromptFile: `metaJson` debe ser string');
  }
  let meta;
  try {
    meta = JSON.parse(metaJson);
  } catch (e) {
    throw new Error('parsePromptFile: `meta.json` no es JSON válido: ' + e.message);
  }
  if (meta == null || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error('parsePromptFile: `meta.json` debe ser un objeto');
  }
  const row = {
    step: meta.step,
    system_prompt: systemPromptMd,
    methodology: meta.methodology === undefined ? null : meta.methodology,
    vertical: meta.vertical === undefined ? null : meta.vertical,
    validation_rules: meta.validation_rules === undefined ? null : meta.validation_rules,
    version: meta.version,
    tenant: meta.tenant === undefined ? DEFAULT_TENANT_REF : meta.tenant
  };
  if (typeof row.step !== 'string' || row.step.length === 0) {
    throw new Error('parsePromptFile: `meta.step` requerido');
  }
  if (typeof row.version !== 'number') {
    throw new Error('parsePromptFile: `meta.version` debe ser number');
  }
  return row;
}

/**
 * Compara los campos versionados (DT-04) de una fila git contra una fila viva de la DB.
 * NO compara tenant (se resuelve por env, DT-02) ni artefactos DB (id/created_at/active).
 * Cero cambios ⇒ el `apply` sería no-op (R-05).
 *
 * @param {PromptGitRow} gitRow
 * @param {Object} dbRow   Fila viva de `prompt_versions` (subset con los campos versionados).
 * @returns {{field:string, git:*, db:*}[]}  Lista de diferencias (vacía ⇒ no-op).
 */
export function diffPrompt(gitRow, dbRow) {
  if (gitRow == null) throw new Error('diffPrompt: gitRow requerido');
  const changes = [];
  const db = dbRow ?? {};
  for (const field of VERSIONED_FIELDS) {
    const g = normalizeForCompare(gitRow[field]);
    const d = normalizeForCompare(db[field]);
    if (!isDeepStrictEqual(g, d)) {
      changes.push({ field, git: gitRow[field] ?? null, db: db[field] ?? null });
    }
  }
  return changes;
}

/** Normaliza `undefined`→`null` para comparar git vs DB de forma consistente. */
function normalizeForCompare(v) {
  return v === undefined ? null : v;
}

/**
 * Construye el PLAN de upsert idempotente (R-04/R-05/R-06/R-11), read-modify-write por
 * la clave lógica `(step, tenant_id)`:
 *   - Si existe la fila viva → UPDATE by id SOLO de los campos versionados
 *     (system_prompt, methodology, vertical, validation_rules, version, step).
 *     NO toca `id`, `created_at`, `tenant_id`, `active` (preservados). Sin version-bump
 *     (version = valor de git, idéntico al vivo). `noop=true` si no hay diffs.
 *   - Si NO existe → INSERT con tenant_id resuelto + active:true; `id`/`created_at` los
 *     genera la DB.
 *
 * Es una función PURA: no ejecuta el write (lo hace el shell en modo `apply`, frontera).
 *
 * @param {PromptGitRow} gitRow
 * @param {Object|null} dbRow      Fila viva o null si no existe.
 * @param {string} tenantId        UUID de tenant resuelto (resolveSyncTenantId).
 * @returns {{op:string, step:string, tenant_id:string, id?:string, noop?:boolean, changes?:{field:string,git:*,db:*}[], values:Object.<string,*>, preserved?:string[]}} plan
 */
export function buildUpsertPlan(gitRow, dbRow, tenantId) {
  if (gitRow == null) throw new Error('buildUpsertPlan: gitRow requerido');
  if (typeof tenantId !== 'string' || tenantId.length === 0) {
    throw new Error('buildUpsertPlan: tenantId resuelto requerido (no global/null)');
  }
  const versionedValues = {
    step: gitRow.step,
    system_prompt: gitRow.system_prompt,
    methodology: gitRow.methodology ?? null,
    vertical: gitRow.vertical ?? null,
    validation_rules: gitRow.validation_rules ?? null,
    version: gitRow.version
  };

  if (dbRow == null) {
    // INSERT: fila nueva, tenant preservado (nunca global), active:true.
    return {
      op: 'insert',
      step: gitRow.step,
      tenant_id: tenantId,
      values: { ...versionedValues, tenant_id: tenantId, active: true }
    };
  }

  // UPDATE in-place por id. NO se incluyen id/created_at/tenant_id/active en `values`
  // (preservados). version = git (sin bump).
  const changes = diffPrompt(gitRow, dbRow);
  return {
    op: 'update',
    id: dbRow.id,
    step: gitRow.step,
    tenant_id: tenantId,
    noop: changes.length === 0,
    changes,
    values: { ...versionedValues },
    // Trazabilidad: lo que se preserva sin tocar.
    preserved: ['id', 'created_at', 'tenant_id', 'active']
  };
}

/**
 * Resuelve la UUID de tenant desde el entorno (DT-02). Preserva el aislamiento por
 * tenant (nunca global/null). Aborta con error explícito si falta (R-08).
 *
 * @param {Record<string,string|undefined>} env  p.ej. `process.env`
 * @returns {string} UUID de tenant
 */
export function resolveSyncTenantId(env) {
  const raw = env && env.PROMPT_SYNC_TENANT_ID;
  const val = typeof raw === 'string' ? raw.trim() : '';
  if (val.length === 0) {
    throw new Error(
      'F-101 sync: falta la variable de entorno PROMPT_SYNC_TENANT_ID ' +
        '(tenant destino). No se ejecuta ningún write. (R-08/DT-02)'
    );
  }
  if (!UUID_RE.test(val)) {
    throw new Error(
      'F-101 sync: PROMPT_SYNC_TENANT_ID no parece una UUID válida: "' +
        val +
        '". No se ejecuta ningún write. (R-08)'
    );
  }
  return val;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida TODAS las env vars requeridas por el sync y devuelve la config resuelta.
 * Aborta con error explícito nombrando la que falta (R-08); no ejecuta ningún write.
 *
 * @param {Record<string,string|undefined>} env
 * @returns {{ supabaseUrl:string, serviceRoleKey:string, tenantId:string }}
 */
export function resolveSyncEnv(env) {
  const e = env ?? {};
  const supabaseUrl = typeof e.NEXT_PUBLIC_SUPABASE_URL === 'string' ? e.NEXT_PUBLIC_SUPABASE_URL.trim() : '';
  const serviceRoleKey = typeof e.SUPABASE_SERVICE_ROLE_KEY === 'string' ? e.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  if (supabaseUrl.length === 0) {
    throw new Error(
      'F-101 sync: falta la variable de entorno NEXT_PUBLIC_SUPABASE_URL. ' +
        'No se ejecuta ningún write. (R-08)'
    );
  }
  if (serviceRoleKey.length === 0) {
    throw new Error(
      'F-101 sync: falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY. ' +
        'No se ejecuta ningún write. (R-08)'
    );
  }
  const tenantId = resolveSyncTenantId(e); // lanza si falta/inválida
  return { supabaseUrl, serviceRoleKey, tenantId };
}

/**
 * Escanea texto en busca de secretos (R-03). Los prompts son TEXTO DE MÉTODO (no
 * secretos); si el export arrastrara una key, se detiene antes de commitear. Los
 * secretos viven en env/Drive, fuera de git.
 *
 * @param {string} content  Contenido a escanear (p.ej. system_prompt.md o meta.json).
 * @returns {{kind:string, index:number}[]}  Hallazgos (vacío ⇒ limpio).
 */
export function scanForSecrets(content) {
  if (typeof content !== 'string') {
    throw new Error('scanForSecrets: content debe ser string');
  }
  const findings = [];
  for (const { kind, re } of SECRET_PATTERNS) {
    // `re` es global → iteramos todas las coincidencias.
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      findings.push({ kind, index: m.index });
      if (m.index === re.lastIndex) re.lastIndex++; // guard anti-loop en match vacío
    }
  }
  return findings;
}

const SECRET_PATTERNS = [
  // JWT-like (3 segmentos base64url separados por '.') — forma de las keys Supabase legacy.
  { kind: 'jwt_like', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  // OpenAI-style secret key.
  { kind: 'openai_sk', re: /\bsk-[A-Za-z0-9_-]{16,}/g },
  // Referencia explícita a la service-role.
  { kind: 'service_role', re: /service_role/gi },
  // Nombres de env de keys Supabase.
  { kind: 'supabase_key_env', re: /SUPABASE_[A-Z0-9_]*KEY/g },
  { kind: 'service_role_key_env', re: /SERVICE_ROLE_KEY/g },
  // Bloque de clave privada PEM.
  { kind: 'private_key_block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g }
];
