/**
 * F-084 — city/state a `clients` (home canónico, DT-1). Bloque C.
 *
 * T-11: wiring REAL sobre el código fuente de `diagnostic/page.tsx` (alta) y
 * `onboarding/brief/[clientId]/page.tsx` (brief). Ambos son componentes de
 * página (React); siguiendo el patrón establecido del repo (f080/f081), la
 * verificación de wiring se hace sobre el código fuente. El cierre autoritativo
 * de que las filas aterrizan pobladas es LIVE (T-12, gateada, §6.1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const diagnosticSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/app/(app)/diagnostic/page.tsx', import.meta.url)
  ),
  'utf8'
);

const briefSrc = readFileSync(
  fileURLToPath(
    new URL(
      '../../src/app/(app)/onboarding/brief/[clientId]/page.tsx',
      import.meta.url
    )
  ),
  'utf8'
);

// ------------------------------------------------------------------
// T-11 (a) — alta de cliente nuevo con city/state → insert a clients
// ------------------------------------------------------------------
test('T-09/T-11 diagnostic: newClientData incluye city y state', () => {
  const idx = diagnosticSrc.indexOf('useState({');
  assert.ok(idx > 0);
  // El estado newClientData declara city y state.
  assert.match(diagnosticSrc, /city:\s*''/);
  assert.match(diagnosticSrc, /state:\s*'CA'/);
});

test('T-09/T-11 diagnostic: el insert a clients propaga newClientData (city/state incluidos)', () => {
  // El insert usa spread de newClientData → city/state fluyen al insert de clients.
  assert.match(
    diagnosticSrc,
    /\.from\('clients'\)\s*\.insert\(\{\s*\.\.\.newClientData/
  );
});

test('T-09 diagnostic: hay inputs de UI para city y state', () => {
  assert.match(diagnosticSrc, /newClientData\.city/);
  assert.match(diagnosticSrc, /newClientData\.state/);
  // set de ambos campos desde inputs.
  assert.match(diagnosticSrc, /city:\s*e\.target\.value/);
  assert.match(diagnosticSrc, /state:\s*e\.target\.value/);
});

// ------------------------------------------------------------------
// T-11 (b) — save de brief con city/state → update a clients
// ------------------------------------------------------------------
test('T-10/T-11 brief: existe el espejo mirrorCityStateToClient hacia clients', () => {
  assert.match(briefSrc, /const mirrorCityStateToClient/);
  assert.match(briefSrc, /\.from\('clients'\)\s*\.update\(patch\)/);
  // Espeja los campos city/state del brief.
  // ⚠️ [F-122 ENMIENDA 2026-07-28 · R-47] La ciudad pasa por `canonicalizeCity` ANTES de
  // persistirse (`santa maria` ⇒ `Santa Maria`). El assert se AMPLÍA la ventana para
  // seguir exigiendo lo mismo que exigía —que el patch tome la ciudad DE `briefFields`—
  // sin quedar acoplado a que la asignación sea literal. Intent intacto, no debilitado.
  assert.match(briefSrc, /patch\.city\s*=[\s\S]{0,80}?briefFields\.city/);
  assert.match(briefSrc, /patch\.state\s*=\s*briefFields\.state/);
});

test('T-10/T-11 brief: handleApproveBrief espeja city/state a clients', () => {
  const idx = briefSrc.indexOf('const handleApproveBrief');
  assert.ok(idx > 0);
  // F-097/F-109: los handlers crecieron (insert-on-first-save + raw_text sync +
  // guard de aprobación + approved_by/at) → ventana ampliada para seguir
  // capturando mirrorCityStateToClient. Intent intacto.
  const body = briefSrc.slice(idx, idx + 2600);
  assert.match(body, /await mirrorCityStateToClient\(\)/);
  // Sigue conservando el narrativo en briefs.content (no rompe el flujo).
  assert.match(body, /\.from\('briefs'\)/);
});

test('T-10/T-11 brief: handleSaveDraft espeja city/state a clients', () => {
  const idx = briefSrc.indexOf('const handleSaveDraft');
  assert.ok(idx > 0);
  // F-097: los handlers crecieron (insert-on-first-save + raw_text sync) →
  // ventana ampliada para seguir capturando mirrorCityStateToClient. Intent intacto.
  const body = briefSrc.slice(idx, idx + 2200);
  assert.match(body, /await mirrorCityStateToClient\(\)/);
  assert.match(body, /\.from\('briefs'\)/);
});
