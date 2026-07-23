/**
 * F-087 — T-08: guards de identidad del activo GBP (R-03).
 *
 * Ejercita los helpers PUROS `validateOperationalEmail` / `validateGbpUrl` (patrón
 * `validateAddressZip` de F-084). Un valor vacío es válido (campos opcionales); un
 * email/URL inválido produce `valid=false` → la UI no persiste (wiring en T-06/handler).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  validateOperationalEmail,
  validateGbpUrl
} from '../../src/lib/gbp-slice/profile-edit.ts';

// ------------------------------------------------------------------
// validateOperationalEmail (R-03)
// ------------------------------------------------------------------
test('T-08 validateOperationalEmail: email válido → valid', () => {
  assert.equal(validateOperationalEmail('negocio@gmail.com').valid, true);
  assert.equal(validateOperationalEmail('a.b+tag@sub.example.co').valid, true);
});

test('T-08 validateOperationalEmail: vacío/whitespace → válido (opcional)', () => {
  assert.equal(validateOperationalEmail('').valid, true);
  assert.equal(validateOperationalEmail('   ').valid, true);
});

test('T-08 validateOperationalEmail: inválido → valid=false + mensaje (no persiste)', () => {
  for (const bad of ['no-at', 'a@b', 'a@ b.com', 'a b@c.com', '@gmail.com']) {
    const res = validateOperationalEmail(bad);
    assert.equal(res.valid, false, `"${bad}" debe ser inválido`);
    assert.ok(res.message && res.message.length > 0);
  }
});

// ------------------------------------------------------------------
// validateGbpUrl (R-03)
// ------------------------------------------------------------------
test('T-08 validateGbpUrl: http(s) válido → valid', () => {
  assert.equal(validateGbpUrl('https://g.co/kgs/abc123').valid, true);
  assert.equal(validateGbpUrl('http://maps.google.com/?cid=123').valid, true);
});

test('T-08 validateGbpUrl: vacío → válido (opcional)', () => {
  assert.equal(validateGbpUrl('').valid, true);
  assert.equal(validateGbpUrl('   ').valid, true);
});

test('T-08 validateGbpUrl: no-URL o protocolo inválido → valid=false + mensaje', () => {
  for (const bad of [
    'no es una url',
    'ftp://x.com',
    'g.co/kgs/abc',
    'javascript:alert(1)'
  ]) {
    const res = validateGbpUrl(bad);
    assert.equal(res.valid, false, `"${bad}" debe ser inválido`);
    assert.ok(res.message && res.message.length > 0);
  }
});

// ------------------------------------------------------------------
// WIRING REAL — el handler handleSaveAsset valida antes de persistir (R-03)
// ------------------------------------------------------------------
const pageSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/app/(app)/gbp/[clientId]/page.tsx', import.meta.url)
  ),
  'utf8'
);

test('T-08 handleSaveAsset valida email + URL y retorna sin persistir si inválido', () => {
  const idx = pageSrc.indexOf('const handleSaveAsset');
  assert.ok(idx > 0, 'handleSaveAsset debe existir');
  const body = pageSrc.slice(idx, idx + 2500);
  assert.match(body, /validateOperationalEmail\(operationalEmail\)/);
  assert.match(body, /validateGbpUrl\(gbpUrl\)/);
  // guard: si inválido, toast.error + return ANTES de persistGbpAsset
  assert.match(body, /if\s*\(!emailCheck\.valid\)/);
  assert.match(body, /if\s*\(!urlCheck\.valid\)/);
  const emailGuardIdx = body.indexOf('!emailCheck.valid');
  const persistIdx = body.indexOf('persistGbpAsset');
  assert.ok(emailGuardIdx > -1 && persistIdx > emailGuardIdx);
});
