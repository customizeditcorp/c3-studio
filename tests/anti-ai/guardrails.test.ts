/**
 * F-064 anti-AI validator — anti-contamination / secrets / purity grep-checks
 * (T-V01 import purity, T-V17, T-V18).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MODULE_PATH = resolve(here, '../../src/lib/anti-ai/validator.ts');
const src = readFileSync(MODULE_PATH, 'utf8');

// --- T-V01: no forbidden runtime imports / clock in the core ---
test('T-V01 core has no LLM/network/clock dependencies', () => {
  assert.equal(/\banthropic\b/i.test(src), false, 'anthropic present');
  assert.equal(/\bfetch\s*\(/.test(src), false, 'fetch call present');
  assert.equal(/Date\.now/.test(src), false, 'Date.now present');
  assert.equal(/new Date\(/.test(src), false, 'new Date present in core');
  assert.equal(/\bimport\s+OpenAI\b/.test(src), false, 'OpenAI import present');
});

// --- T-V17: no client data contamination (ADR-002) ---
test('T-V17 no client tokens in the module', () => {
  assert.equal(/jv\s*roofing/i.test(src), false);
  assert.equal(/jv-roofing/i.test(src), false);
  assert.equal(/vasquez/i.test(src), false);
  assert.equal(/trustroof/i.test(src), false);
});

// --- T-V18: no secrets / Python shell-out ---
test('T-V18 no secrets or Python dependency', () => {
  assert.equal(/sk-ant-/.test(src), false, 'anthropic api key present');
  assert.equal(/child_process/.test(src), false);
  assert.equal(/\bspawn\b/.test(src), false);
  assert.equal(/\bpython\b/i.test(src), false);
});
