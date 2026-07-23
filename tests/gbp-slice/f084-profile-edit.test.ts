/**
 * F-084 — Integridad del draft de perfil GBP: guards de write-path.
 *
 * Tests de los helpers PUROS (T-03 clamp, T-07 sanitizer+guard, T-14 zip) y del
 * WIRING REAL sobre el código fuente (T-03 payload short_description, T-06 guard
 * en ambos write-paths, T-13 validación de zip en el save). Lección §6.1: el
 * cierre autoritativo de que el write aterriza limpio en prod es LIVE
 * (T-04/T-08/T-15, gateadas); estos tests fijan la lógica y el cableado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  sanitizeGbpDescription,
  descriptionLooksLikeBlob,
  guardGbpDescription,
  clampShortDescription,
  SHORT_DESCRIPTION_MAX,
  isValidUsZip,
  validateAddressZip
} from '../../src/lib/gbp-slice/profile-edit.ts';

// ------------------------------------------------------------------
// T-07 (R-04) — sanitizeGbpDescription
// ------------------------------------------------------------------
test('T-07 blob ```json{...} → extrae content.description (texto limpio)', () => {
  const blob =
    '```json\n{"description":"JD Valley Painting offers expert painting services.","short_description":"Pintura experta."}\n```';
  const out = sanitizeGbpDescription(blob);
  assert.equal(out, 'JD Valley Painting offers expert painting services.');
  assert.ok(!out.trim().startsWith('{'));
  assert.ok(!out.includes('```'));
});

test('T-07 objeto JSON serializado (sin fences) → extrae .description', () => {
  const obj = JSON.stringify({
    description: 'Paragraph text.',
    suggested_categories: ['Painting']
  });
  assert.equal(sanitizeGbpDescription(obj), 'Paragraph text.');
});

test('T-07 objeto sin description cae a short_description', () => {
  const obj = JSON.stringify({ short_description: 'Resumen corto.' });
  assert.equal(sanitizeGbpDescription(obj), 'Resumen corto.');
});

test('T-07 prosa limpia → sin cambios', () => {
  const prose = 'We paint homes across the Central Coast. Free estimates.';
  assert.equal(sanitizeGbpDescription(prose), prose);
});

test('T-07 solo remueve fences cuando el interior no es objeto (queda texto)', () => {
  const out = sanitizeGbpDescription('```\nTexto entre fences\n```');
  assert.equal(out, 'Texto entre fences');
});

test('T-07 input no-string → cadena vacía (nunca lanza)', () => {
  assert.equal(sanitizeGbpDescription(undefined as unknown as string), '');
  assert.equal(sanitizeGbpDescription(null as unknown as string), '');
});

// ------------------------------------------------------------------
// T-07 (R-05) — descriptionLooksLikeBlob + guardGbpDescription
// ------------------------------------------------------------------
test('T-07 guard: blob irrecuperable (objeto sin texto) → rechaza, no persiste', () => {
  // Objeto JSON sin description ni short_description → tras sanear sigue siendo blob.
  const irrecoverable = JSON.stringify({ suggested_categories: ['Painting'] });
  assert.equal(
    descriptionLooksLikeBlob(sanitizeGbpDescription(irrecoverable)),
    true
  );
  const res = guardGbpDescription(irrecoverable);
  assert.equal(res.ok, false);
  assert.ok(res.message && res.message.length > 0);
});

test('T-07 guard: blob ```json recuperable → ok=true con texto limpio', () => {
  const res = guardGbpDescription(
    '```json\n{"description":"Texto real."}\n```'
  );
  assert.equal(res.ok, true);
  assert.equal(res.value, 'Texto real.');
});

test('T-07 guard: prosa → ok=true sin cambios', () => {
  const res = guardGbpDescription('Prosa normal.');
  assert.equal(res.ok, true);
  assert.equal(res.value, 'Prosa normal.');
});

test('T-07 descriptionLooksLikeBlob: fence / objeto = blob; prosa / {no-parseable = no', () => {
  assert.equal(descriptionLooksLikeBlob('```json{}'), true);
  assert.equal(descriptionLooksLikeBlob('{"a":1}'), true);
  assert.equal(descriptionLooksLikeBlob('Texto normal'), false);
  // Empieza con { pero no parsea como objeto → prosa, no blob.
  assert.equal(descriptionLooksLikeBlob('{ ver nota: no es JSON'), false);
});

// ------------------------------------------------------------------
// T-03 (R-03) — clampShortDescription
// ------------------------------------------------------------------
test('T-03 clampShortDescription trunca > límite; nunca persiste sobre-límite', () => {
  assert.equal(SHORT_DESCRIPTION_MAX, 300);
  const long = 'x'.repeat(SHORT_DESCRIPTION_MAX + 50);
  const out = clampShortDescription(long);
  assert.equal(out.length, SHORT_DESCRIPTION_MAX);
});

test('T-03 clampShortDescription deja valores dentro del límite intactos', () => {
  assert.equal(clampShortDescription('Resumen corto.'), 'Resumen corto.');
  assert.equal(clampShortDescription(''), '');
});

// ------------------------------------------------------------------
// T-14 (R-09/R-10) — validación de zip
// ------------------------------------------------------------------
test('T-14 isValidUsZip: 5 dígitos y +4 válidos; truncado inválido', () => {
  assert.equal(isValidUsZip('93427'), true);
  assert.equal(isValidUsZip('93427-1234'), true);
  assert.equal(isValidUsZip('9342'), false); // truncado (bug JD Valley)
  assert.equal(isValidUsZip('934277'), false);
  assert.equal(isValidUsZip('abcde'), false);
});

test('T-14 validateAddressZip: address con zip 9342 (truncado) → rechazo legible', () => {
  const res = validateAddressZip('380 DANIA AVE BUELLTON, CA 9342');
  assert.equal(res.valid, false);
  assert.equal(res.zip, '9342');
  assert.match(res.message ?? '', /9342/);
});

test('T-14 validateAddressZip: address con zip 93427 → válido', () => {
  const res = validateAddressZip('380 Dania Ave, Buellton, CA 93427');
  assert.equal(res.valid, true);
  assert.equal(res.zip, '93427');
});

test('T-14 validateAddressZip: zip +4 → válido', () => {
  assert.equal(
    validateAddressZip('123 Main St, Santa Maria, CA 93458-1234').valid,
    true
  );
});

test('T-14 validateAddressZip: address vacío → válido (SAB, no valida)', () => {
  assert.equal(validateAddressZip('').valid, true);
  assert.equal(validateAddressZip('   ').valid, true);
});

// ------------------------------------------------------------------
// WIRING REAL — la página de edición GBP (código fuente)
// ------------------------------------------------------------------
const pageSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/app/(app)/gbp/[clientId]/page.tsx', import.meta.url)
  ),
  'utf8'
);

test('T-01 la página carga short_description en un estado editable', () => {
  assert.match(pageSrc, /const \[shortDescription, setShortDescription\]/);
  assert.match(pageSrc, /setShortDescription\(gbpData\.short_description/);
});

test('T-01/T-02 el payload de handleSaveProfile incluye short_description (clamp)', () => {
  const idx = pageSrc.indexOf('const handleSaveProfile');
  assert.ok(idx > 0);
  const body = pageSrc.slice(idx, idx + 2000);
  assert.match(
    body,
    /short_description:\s*clampShortDescription\(shortDescription\)/
  );
});

test('T-06 handleSaveProfile sanea + guardea la description antes de persistir', () => {
  const idx = pageSrc.indexOf('const handleSaveProfile');
  const body = pageSrc.slice(idx, idx + 2000);
  assert.match(body, /guardGbpDescription\(description\)/);
  // el payload persiste el valor saneado, no el crudo `description`.
  assert.match(body, /description:\s*descGuard\.value/);
  // si el guard falla, no persiste (return temprano).
  assert.match(body, /if\s*\(!descGuard\.ok\)/);
});

test('T-13 handleSaveProfile valida el zip del address antes de persistir', () => {
  const idx = pageSrc.indexOf('const handleSaveProfile');
  const body = pageSrc.slice(idx, idx + 2000);
  assert.match(body, /validateAddressZip\(address\)/);
  assert.match(body, /if\s*\(!zipCheck\.valid\)/);
});

// ------------------------------------------------------------------
// WIRING REAL — el upsert de generate-gbp/route.ts (código fuente)
// ------------------------------------------------------------------
const routeSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/app/api/generate-gbp/route.ts', import.meta.url)
  ),
  'utf8'
);

test('T-06 el route aplica el mismo guard compartido antes del upsert', () => {
  assert.match(routeSrc, /guardGbpDescription\(profileRow\.description\)/);
  assert.match(routeSrc, /profileRow\.description\s*=\s*descGuard\.value/);
  // El guard va ANTES del upsert a gbp_profiles.
  const guardIdx = routeSrc.indexOf(
    'guardGbpDescription(profileRow.description)'
  );
  const upsertIdx = routeSrc.indexOf(".from('gbp_profiles')");
  assert.ok(guardIdx > -1 && upsertIdx > -1 && guardIdx < upsertIdx);
});
