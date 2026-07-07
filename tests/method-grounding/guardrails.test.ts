/**
 * F-065 method grounding — source-level guardrails: secrets by env (T-V01/T-V20),
 * route order & injection point (T-V12), static prompts not touched (T-V14),
 * F-064 intact (T-V16), no corpus duplication (T-V18).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '../..');
const ROUTE = readFileSync(
  resolve(ROOT, 'src/app/api/generate-content/route.ts'),
  'utf8'
);
const MODULE_FILES = [
  'types.ts',
  'query-by-step.ts',
  'retrieve-method-client.ts',
  'method-block.ts',
  'grounding.ts',
  'index.ts'
].map((f) =>
  readFileSync(resolve(ROOT, 'src/lib/method-grounding', f), 'utf8')
);
const ALL_SRC = [ROUTE, ...MODULE_FILES].join('\n');

// --- T-V01 / T-V20: secrets read from process.env, no hardcoded URL/key value ---
test('T-V01/T-V20 URL and KEY come from process.env, not literals', () => {
  assert.ok(
    /process\.env\.RETRIEVE_METHOD_URL/.test(ALL_SRC),
    'RETRIEVE_METHOD_URL env read missing'
  );
  assert.ok(
    /process\.env\.RETRIEVE_METHOD_KEY/.test(ALL_SRC),
    'RETRIEVE_METHOD_KEY env read missing'
  );
  // no literal aeos-hq function URL hardcoded anywhere
  assert.equal(
    /uhhumgcgrumwaidffmvi/.test(ALL_SRC),
    false,
    'aeos-hq project ref hardcoded'
  );
  assert.equal(
    /https?:\/\/[^\s'"]*retrieve-method/.test(ALL_SRC),
    false,
    'retrieve-method URL literal present'
  );
  // the header NAME is allowed; a hardcoded key VALUE (x-aeos-method-key: 'literal') is not
  assert.equal(
    /['"]x-aeos-method-key['"]\s*:\s*['"][^'"]+['"]/.test(ALL_SRC),
    false,
    'literal key value assigned to x-aeos-method-key'
  );
});

// --- T-V12: retrieval before completion; grounding attach after validation, before insert ---
test('T-V12 retrieval runs before openai completion', () => {
  const idxFetch = ROUTE.indexOf('fetchRetrieveMethod(');
  const idxCompletion = ROUTE.indexOf('openai.chat.completions.create');
  assert.ok(idxFetch > -1, 'fetchRetrieveMethod not wired');
  assert.ok(idxCompletion > -1, 'completion call missing');
  assert.ok(idxFetch < idxCompletion, 'retrieval must precede completion');
});

test('T-V12 attachMethodGrounding runs after attachValidation and before insert', () => {
  // generated_outputs branch: attachValidation -> attachMethodGrounding -> insert
  const idxValidation = ROUTE.indexOf(
    'const validatedContent = attachValidation'
  );
  const idxGroundOutputs = ROUTE.indexOf(
    'const groundedContent = attachMethodGrounding'
  );
  const idxInsertOutputs = ROUTE.indexOf(".from('generated_outputs')");
  assert.ok(
    idxValidation > -1 && idxGroundOutputs > -1 && idxInsertOutputs > -1
  );
  assert.ok(
    idxValidation < idxGroundOutputs,
    'grounding must follow validation'
  );
  assert.ok(
    idxGroundOutputs < idxInsertOutputs,
    'grounding must precede insert'
  );

  // tableMap branch: attachMethodGrounding on insertData.content before .insert(insertData)
  const idxGroundTable = ROUTE.indexOf(
    'insertData.content = attachMethodGrounding'
  );
  const idxInsertTable = ROUTE.indexOf('.insert(insertData)');
  assert.ok(idxGroundTable > -1 && idxInsertTable > -1);
  assert.ok(
    idxGroundTable < idxInsertTable,
    'grounding must precede tableMap insert'
  );
});

// --- T-V14: static prompts not mutated (no write to prompt_versions) ---
test('T-V14 route does not mutate prompt_versions', () => {
  assert.equal(
    /prompt_versions'\)\s*\.\s*(update|insert|upsert|delete)/.test(ROUTE),
    false,
    'route writes to prompt_versions'
  );
});

// --- T-V16: F-064 validator not imported-around or reimplemented; still reused ---
test('T-V16 F-064 attachValidation still used, grounding does not reimplement it', () => {
  assert.ok(
    /attachValidation\(/.test(ROUTE),
    'attachValidation calls removed from route'
  );
  // grounding module must not import or redefine the validator
  const grounding = MODULE_FILES[4];
  assert.equal(/anti-ai\/validator/.test(grounding), false);
});

// --- T-V18: no corpus duplication (no pgvector/embedding/match/seed in the delta) ---
test('T-V18 no corpus duplication structures introduced', () => {
  for (const needle of [
    'pgvector',
    'match_knowledge_segments',
    'text-embedding',
    'create table',
    'CREATE TABLE'
  ]) {
    assert.equal(
      ALL_SRC.includes(needle),
      false,
      `unexpected corpus structure: ${needle}`
    );
  }
});
