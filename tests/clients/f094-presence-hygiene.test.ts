/**
 * F-094 — Higiene de presencia (fix directo gateado): los canales sin wiring
 * (seo/geo/social) se muestran como 'Próximamente' + nota 'No disponible aún'
 * en vez de arrastrar el badge de status crudo ('Pendiente'), que los hacía
 * pasar por trackeado-pero-estancado. gbp/website (canales reales) conservan el
 * badge de status real + la nota de locked.
 *
 * ClientAssetHub es puramente UI: se verifica el wiring sobre el código fuente
 * REAL (patrón §6.1 / f092-visibility).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const hubSrc = read('../../src/app/(app)/clients/[id]/client-asset-hub.tsx');

// ===================================================================
// T-01 — seo/geo/social son los canales 'Próximamente'; gbp/website NO
// ===================================================================
test('T-01 COMING_SOON_ASSET_TYPES = solo seo/geo/social (gbp/website excluidos)', () => {
  const m = hubSrc.match(
    /COMING_SOON_ASSET_TYPES:\s*AssetType\[\]\s*=\s*\[([^\]]*)\]/
  );
  assert.ok(m, 'no se encontró la constante COMING_SOON_ASSET_TYPES');
  const list = m![1];
  for (const t of ['seo', 'geo', 'social']) {
    assert.match(list, new RegExp(`'${t}'`), `${t} debe ser coming-soon`);
  }
  for (const t of ['gbp', 'website']) {
    assert.doesNotMatch(
      list,
      new RegExp(`'${t}'`),
      `${t} es canal real, no coming-soon`
    );
  }
});

// ===================================================================
// T-02 — el render decide por isComingSoon y muestra 'Próximamente'
// ===================================================================
test('T-02 el render deriva isComingSoon y muestra el badge Próximamente muted', () => {
  assert.match(
    hubSrc,
    /const isComingSoon = COMING_SOON_ASSET_TYPES\.includes\(type\)/
  );
  // Badge 'Próximamente' condicionado a isComingSoon.
  assert.match(hubSrc, /isComingSoon \?[\s\S]*?Próximamente/);
  // Nota honesta 'No disponible aún' en vez de la de locked.
  assert.match(hubSrc, /No disponible aún/);
  // Los coming-soon también reciben el opacity-60 (muted) como locked.
  assert.match(hubSrc, /status === 'locked' \|\| isComingSoon/);
});

// ===================================================================
// T-03 — no-regresión: gbp/website conservan status real + nota de locked
// ===================================================================
test('T-03 gbp/website conservan el badge de status real + la nota de locked (no-regresión)', () => {
  // El badge de status crudo sigue existiendo (rama no-coming-soon).
  assert.match(hubSrc, /<Badge variant=\{statusMeta\.variant\}>/);
  // La nota de locked sigue presente para los canales reales.
  assert.match(hubSrc, /🔒 Requiere brandboard aprobado/);
  // ASSET_TYPES sigue conteniendo los 5 (seo/geo/social solo re-etiquetados, no removidos).
  const at = hubSrc.match(/ASSET_TYPES:\s*AssetType\[\]\s*=\s*\[([^\]]*)\]/);
  assert.ok(at);
  for (const t of ['gbp', 'website', 'seo', 'geo', 'social']) {
    assert.match(at![1], new RegExp(`'${t}'`), `${t} sigue en ASSET_TYPES`);
  }
});
