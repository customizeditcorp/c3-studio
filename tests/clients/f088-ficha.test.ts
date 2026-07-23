/**
 * F-088 — Cableado en la ficha + no-regresión + writers automáticos intactos +
 * tolerancia de frontera.
 *
 * Verificación de wiring sobre el código fuente REAL (patrón §6.1 / f087-ficha) para lo
 * que es puramente UI (confirmación, render), y ejercicio de la seam para la no-regresión
 * del display. `Ref: R-09, R-15, R-16, R-17`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLIENT_STATUS_VALUES,
  isValidClientStatus,
  statusLabel,
  statusStepIndex,
  isLinearStatus
} from '../../src/lib/clients/client-status.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const fichaSrc = read('../../src/app/(app)/clients/[id]/page.tsx');
const seamSrc = read('../../src/lib/clients/client-status.ts');

// ===================================================================
// T-16 — confirmación gatea la write (R-09)
// ===================================================================
test('T-16 seleccionar un target NO persiste: requestStatusChange solo abre el diálogo (R-09)', () => {
  // El onValueChange del dropdown llama a requestStatusChange…
  assert.match(fichaSrc, /onValueChange=\{requestStatusChange\}/);
  // …que abre el diálogo (setPendingStatus + setConfirmOpen) y NO escribe.
  assert.match(
    fichaSrc,
    /const requestStatusChange[\s\S]*?setPendingStatus\(target\)[\s\S]*?setConfirmOpen\(true\)/
  );
  // Cuerpo exacto de la arrow (sin comentarios vecinos): no debe llamar a la write.
  const requestBody =
    fichaSrc.match(
      /const requestStatusChange = \(target: string\) => \{([\s\S]*?)\};/
    )?.[1] ?? '';
  assert.ok(
    requestBody.length > 0,
    'debe encontrarse el cuerpo de requestStatusChange'
  );
  assert.doesNotMatch(
    requestBody,
    /persistClientStatus/,
    'seleccionar NO debe llamar a la write; solo confirmar'
  );
});

test('T-16 la write vive detrás de Confirmar; Cancelar deja el estado sin cambio (R-09)', () => {
  // persistClientStatus se invoca en confirmStatusChange (behind "Confirmar").
  assert.match(
    fichaSrc,
    /const confirmStatusChange[\s\S]*?persistClientStatus\(/
  );
  assert.match(fichaSrc, /onClick=\{confirmStatusChange\}/);
  // Cancelar → cancelStatusChange resetea sin escribir.
  assert.match(fichaSrc, /onClick=\{cancelStatusChange\}/);
  assert.match(
    fichaSrc,
    /const cancelStatusChange[\s\S]*?setConfirmOpen\(false\)[\s\S]*?setPendingStatus\(null\)/
  );
  const cancelBody = fichaSrc.slice(
    fichaSrc.indexOf('const cancelStatusChange'),
    fichaSrc.indexOf('const cancelStatusChange') + 300
  );
  assert.doesNotMatch(cancelBody, /persistClientStatus/);
});

test('T-16 error honesto cableado: el fallo de la write se superficia con toast.error (R-11)', () => {
  assert.match(fichaSrc, /catch[\s\S]*?toast\.error/);
});

// ===================================================================
// T-22 — no-regresión de render (R-15)
// ===================================================================
test('T-22 la ficha renderiza estados actuales + existing/AGS sin ambigüedad de display (R-15)', () => {
  // Todo estado que un cliente pueda tener hoy resuelve label + posición sin throw.
  const currentAndExisting = [
    'lead',
    'diagnosed',
    'negotiating',
    'onboarding',
    'active', // los "existing"/AGS viven en active/maintenance
    'maintenance',
    'paused',
    'churned'
  ];
  for (const s of currentAndExisting) {
    assert.equal(typeof statusLabel(s), 'string');
    assert.ok(statusLabel(s).length > 0);
    // no-lineales no rompen: index -1 pero isLinearStatus lo captura (badge)
    const idx = statusStepIndex(s);
    assert.ok(idx >= -1);
    assert.equal(typeof isLinearStatus(s), 'boolean');
  }
});

test('T-22 la ficha sigue mostrando timeline + badge de estado vía la seam importada', () => {
  // Import de la seam (single source), no labels duplicados inline.
  assert.match(fichaSrc, /from '@\/lib\/clients\/client-status'/);
  // Timeline lineal condicionada por linearStatus + badge fuera-de-carril.
  assert.match(fichaSrc, /isLinearStatus\(client\.status\)/);
  assert.match(fichaSrc, /fuera del flujo\s*\n?\s*lineal/);
  // Badge de estado en el overview usa statusLabel (string-safe).
  assert.match(fichaSrc, /statusLabel\(client\.status\)/);
  // Ya NO hay tabla de labels local (se movió a la seam).
  assert.doesNotMatch(fichaSrc, /const STATUS_LABELS\s*[:=]/);
  assert.doesNotMatch(fichaSrc, /const STATUS_STEPS\s*=/);
});

// ===================================================================
// T-23 — writers automáticos intactos (R-16)
// ===================================================================
test('T-23 ClientForm sigue escribiendo status="lead" (R-16)', () => {
  const src = read('../../src/components/clients/ClientForm.tsx');
  assert.match(src, /status:\s*'lead'\s*as const/);
  assert.doesNotMatch(src, /persistClientStatus/);
});

test('T-23 diagnostic sigue escribiendo "lead" y "diagnosed" (R-16)', () => {
  const src = read('../../src/app/(app)/diagnostic/page.tsx');
  assert.match(src, /status:\s*'lead'/);
  assert.match(src, /status:\s*'diagnosed'/);
  assert.doesNotMatch(src, /persistClientStatus/);
});

test('T-23 preview-approve sigue escribiendo status="onboarding" (R-16)', () => {
  const src = read('../../src/app/api/preview-approve/route.ts');
  assert.match(src, /status:\s*'onboarding'/);
  assert.doesNotMatch(src, /persistClientStatus/);
});

// ===================================================================
// T-24 — tolerancia de frontera: el código offline no asume el apply del DDL (R-17)
// ===================================================================
test('T-24 la validación de destino es app-side (no roundtrip a la DB) → funciona offline (R-17)', () => {
  // Los valores nuevos son válidos en la capa app aun antes del apply del DDL.
  assert.equal(isValidClientStatus('delivered'), true);
  assert.equal(isValidClientStatus('maintenance'), true);
  // La validez se decide contra la lista app, no consultando el enum de la DB.
  assert.ok((CLIENT_STATUS_VALUES as readonly string[]).includes('delivered'));
});

test('T-24 la seam documenta la dependencia del apply gateado (frontera F-074, R-17)', () => {
  assert.match(seamSrc, /F-074/);
  assert.match(seamSrc, /R-17/);
  // Deja explícito que si el apply no ocurrió, el UPDATE falla y se superficia (R-11).
  assert.match(seamSrc, /apply/i);
});
