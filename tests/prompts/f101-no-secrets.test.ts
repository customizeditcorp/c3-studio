/**
 * F-101 — T-07 (R-03): scanForSecrets detecta patrones de secreto en contenido sembrado
 * y pasa limpio sobre un system_prompt de método real.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanForSecrets } from '../../scripts/lib/prompt-sync-core.mjs';

test('T-07 detecta un JWT-like (forma de key Supabase legacy)', () => {
  const seeded =
    'texto\neyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZSJ9.abcDEF123_-signature\nmás';
  const findings = scanForSecrets(seeded);
  assert.ok(findings.some((f) => f.kind === 'jwt_like'));
});

test('T-07 detecta una OpenAI-style secret key (sk-...)', () => {
  const findings = scanForSecrets('config KEY=sk-abcdefghijklmnop1234567890');
  assert.ok(findings.some((f) => f.kind === 'openai_sk'));
});

test('T-07 detecta la referencia service_role', () => {
  const findings = scanForSecrets('usa la service_role para bypass RLS');
  assert.ok(findings.some((f) => f.kind === 'service_role'));
});

test('T-07 detecta nombres de env de keys Supabase', () => {
  const a = scanForSecrets('SUPABASE_SERVICE_ROLE_KEY=xxx');
  assert.ok(
    a.some(
      (f) => f.kind === 'supabase_key_env' || f.kind === 'service_role_key_env'
    )
  );
  const b = scanForSecrets('SUPABASE_ANON_KEY=yyy');
  assert.ok(b.some((f) => f.kind === 'supabase_key_env'));
});

test('T-07 detecta un bloque de clave privada PEM', () => {
  const findings = scanForSecrets(
    '-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END-----'
  );
  assert.ok(findings.some((f) => f.kind === 'private_key_block'));
});

test('T-07 pasa LIMPIO sobre un system_prompt de método real (R-03)', () => {
  const realPrompt =
    'Eres GBP Profile Specialist del sistema C3 Local Marketing.\n\n' +
    'MISIÓN: Producir el contenido de un perfil de Google Business Profile (GBP) para un\n' +
    'negocio local, consumiendo su Oferta de Valor (OFV) YA APROBADA y su brandboard.\n' +
    'REGLAS:\n- No inventes datos de contacto, licencias, reseñas ni cifras.\n' +
    '- Refleja el big_promise, quick_win, garantía y deliverables de la OFV.\n' +
    'FORMATO DE SALIDA: Responde SOLO con un objeto JSON válido.';
  assert.deepStrictEqual(scanForSecrets(realPrompt), []);
});

test('T-07 los hallazgos incluyen kind + index (sin volcar el secreto entero)', () => {
  const findings = scanForSecrets('x sk-abcdefghijklmnop1234567890');
  assert.ok(findings.length > 0);
  for (const f of findings) {
    assert.strictEqual(typeof f.kind, 'string');
    assert.strictEqual(typeof f.index, 'number');
    assert.ok(!('match' in f)); // no re-exponemos el valor
  }
});
