/**
 * F-087 — T-13: reflejo en la ficha (R-09).
 *
 * La ficha del cliente (`clients/[id]/page.tsx`, tab GBP) refleja el estado del
 * lifecycle + el origen (`gbp_mode`) de forma legible y READ-ONLY (consume el estado;
 * NO lo edita — el editor vive en `/gbp/[clientId]`). Verificación sobre el código
 * fuente real (patrón wiring §6.1). `Ref: R-09`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fichaSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/app/(app)/clients/[id]/page.tsx', import.meta.url)
  ),
  'utf8'
);

test('T-13 la ficha carga origen + lifecycle del activo (query + estado)', () => {
  // La query del gbp_profiles trae los campos del lifecycle/origen.
  assert.match(
    fichaSrc,
    /\.select\('description, gbp_mode, verification_status, verified_at'\)/
  );
  assert.match(fichaSrc, /setGbpLifecycle\(/);
});

test('T-13 la ficha DISTINGUE origen (gbp_mode) del estado (lifecycle), legible', () => {
  assert.match(fichaSrc, /GBP_MODE_LABELS/);
  assert.match(fichaSrc, /GBP_LIFECYCLE_LABELS/);
  // Renderiza ambas dimensiones con etiquetas.
  assert.match(fichaSrc, /Origen:/);
  assert.match(fichaSrc, /Estado:/);
  assert.match(fichaSrc, /gbpLifecycle\?\.gbpMode/);
  assert.match(fichaSrc, /gbpLifecycle\?\.verificationStatus/);
});

test('T-13 el reflejo es READ-ONLY: la ficha no edita el activo (no persistGbpAsset)', () => {
  // La ficha NO importa las funciones de escritura del activo (edición vive en /gbp).
  assert.doesNotMatch(fichaSrc, /persistGbpAsset/);
  assert.doesNotMatch(fichaSrc, /buildGbpAssetPayload/);
  // El tab GBP sigue deep-linkeando al editor.
  assert.match(fichaSrc, /href=\{`\/gbp\/\$\{client\.id\}`\}/);
});
