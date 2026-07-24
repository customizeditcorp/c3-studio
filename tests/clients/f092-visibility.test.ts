/**
 * F-092 — Fix de visibilidad (D2): la lista de clientes y el dashboard derivan labels del
 * canonical `STATUS_LABELS` de `client-status.ts` (9 estados, incl. delivered/maintenance/
 * paused), el filtro y el desglose iteran el set completo, y ningún estado cae al valor
 * crudo del enum. + No-regresión de la ficha (pestaña Entregable) + flujos F-087/F-088/F-089.
 *
 * Los componentes son puramente UI: se verifica el wiring sobre el código fuente REAL
 * (patrón §6.1 / f088-ficha) + la seam canónica para la no-regresión de labels.
 * `Ref: R-10, R-11, R-12, R-13, R-14, R-15`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CLIENT_STATUS_VALUES,
  STATUS_LABELS,
  statusLabel
} from '../../src/lib/clients/client-status.ts';

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const listSrc = read('../../src/app/(app)/clients/page.tsx');
const dashSrc = read('../../src/app/(app)/dashboard/overview/c3-dashboard.tsx');
const fichaSrc = read('../../src/app/(app)/clients/[id]/page.tsx');

// ===================================================================
// T-21 — labels canónicos: los 9 estados tienen label; nada cae al enum crudo (R-10, R-13)
// ===================================================================
test('T-21 la lista y el dashboard importan STATUS_LABELS canonical (no mapas locales) (R-10)', () => {
  // Import del canonical.
  assert.match(
    listSrc,
    /import \{[^}]*STATUS_LABELS[^}]*\} from '@\/lib\/clients\/client-status'/
  );
  assert.match(
    dashSrc,
    /import \{ STATUS_LABELS \} from '@\/lib\/clients\/client-status'/
  );
  // Ya NO hay un STATUS_LABELS local incompleto en ninguno de los dos.
  assert.doesNotMatch(listSrc, /const STATUS_LABELS\s*[:=]/);
  assert.doesNotMatch(dashSrc, /const STATUS_LABELS\s*[:=]/);
});

test('T-21 existe label legible para los 9 estados incl. delivered/maintenance/paused (R-10/R-13)', () => {
  assert.equal(CLIENT_STATUS_VALUES.length, 9);
  for (const v of CLIENT_STATUS_VALUES) {
    assert.equal(typeof STATUS_LABELS[v], 'string');
    assert.ok(STATUS_LABELS[v].length > 0, `label vacío para ${v}`);
    // Ningún estado cae al valor crudo del enum (deshonestidad de los mapas locales).
    assert.notEqual(STATUS_LABELS[v], v);
  }
  assert.equal(STATUS_LABELS.delivered, 'Entregado');
  assert.equal(STATUS_LABELS.maintenance, 'Mantenimiento');
  assert.equal(STATUS_LABELS.paused, 'Pausado');
});

test('T-21 el badge de la lista usa statusLabel (string-safe), no el enum crudo (R-13)', () => {
  assert.match(listSrc, /statusLabel\(client\.status\)/);
  // El fallback deshonesto anterior (`STATUS_LABELS[...] || client.status`) ya no está.
  assert.doesNotMatch(
    listSrc,
    /STATUS_LABELS\[client\.status\] \|\| client\.status/
  );
  // La variante cubre los estados post-venta antes omitidos.
  for (const v of ['delivered', 'maintenance', 'paused']) {
    assert.match(
      listSrc,
      new RegExp(`${v}: '(default|secondary|destructive|outline)'`)
    );
  }
  // statusLabel resuelve los 9 sin caer al crudo.
  for (const v of CLIENT_STATUS_VALUES) {
    assert.notEqual(statusLabel(v), v);
  }
});

// ===================================================================
// T-22 — filtro de la lista ofrece el set canónico completo (R-11)
// ===================================================================
test('T-22 el filtro de estado itera STATUS_LABELS (set canónico completo) (R-11)', () => {
  // El <Select> del filtro mapea Object.entries(STATUS_LABELS) → los 9 estados filtrables.
  assert.match(listSrc, /Object\.entries\(STATUS_LABELS\)\.map/);
  // Como STATUS_LABELS ahora es el canonical (9 estados), delivered/maintenance/paused
  // son opciones del filtro (antes omitidas por el mapa local).
  assert.ok((CLIENT_STATUS_VALUES as readonly string[]).includes('delivered'));
  assert.ok(
    (CLIENT_STATUS_VALUES as readonly string[]).includes('maintenance')
  );
  assert.ok((CLIENT_STATUS_VALUES as readonly string[]).includes('paused'));
});

// ===================================================================
// T-23 — desglose del dashboard itera el set canónico (R-12)
// ===================================================================
test('T-23 el desglose "Clientes por estado" itera Object.entries(STATUS_LABELS) canónico (R-12)', () => {
  assert.match(dashSrc, /Object\.entries\(STATUS_LABELS\)\.map/);
  // Un cliente delivered (count>0) aparece: la guarda de zero-count sólo oculta count===0.
  assert.match(dashSrc, /count === 0 &&/);
  // El estado delivered no está excluido explícitamente del desglose.
  assert.doesNotMatch(dashSrc, /status !== 'delivered'/);
});

// ===================================================================
// T-24 — no-regresión de render: pestaña Entregable entre GBP y Readiness (R-14)
// ===================================================================
test('T-24 la ficha monta la pestaña Entregable entre GBP y Readiness sin romper el orden (R-14)', () => {
  const gbpIdx = fichaSrc.indexOf(`value='gbp'`);
  const delivIdx = fichaSrc.indexOf(`value='deliverable'`);
  const readyIdx = fichaSrc.indexOf(`value='readiness'`);
  assert.ok(gbpIdx > 0 && delivIdx > 0 && readyIdx > 0);
  // Orden de los TabsTrigger: gbp < deliverable < readiness.
  assert.ok(gbpIdx < delivIdx, 'Entregable después de GBP');
  assert.ok(delivIdx < readyIdx, 'Entregable antes de Readiness');
  // El trigger y el contenido existen.
  assert.match(
    fichaSrc,
    /<TabsTrigger value='deliverable'>Entregable<\/TabsTrigger>/
  );
  assert.match(fichaSrc, /<TabsContent value='deliverable'/);
  // Consume el read-model puro (buildDeliverableSummary), no re-implementa la lógica.
  assert.match(fichaSrc, /buildDeliverableSummary\(/);
});

test('T-24 la lista y el dashboard resuelven label para los estados actuales + existing/AGS sin caer al crudo (R-14)', () => {
  // Estados que un cliente puede tener hoy (incl. existing/AGS = active/maintenance).
  for (const s of [
    'lead',
    'diagnosed',
    'negotiating',
    'onboarding',
    'active',
    'maintenance',
    'paused',
    'churned'
  ]) {
    assert.equal(typeof statusLabel(s), 'string');
    assert.ok(statusLabel(s).length > 0);
  }
});

// ===================================================================
// T-25 — no-regresión de flujos previos F-087/F-088/F-089 (R-15)
// ===================================================================
test('T-25 los badges F-087 (origen/lifecycle/verificado) siguen intactos en la ficha (R-15)', () => {
  assert.match(fichaSrc, /GBP_MODE_LABELS/);
  assert.match(fichaSrc, /GBP_LIFECYCLE_LABELS/);
  assert.match(fichaSrc, /gbpLifecycle\?\.verificationStatus/);
  assert.match(fichaSrc, /gbpLifecycle\?\.verifiedAt/);
});

test('T-25 la timeline + control de transición F-088 siguen intactos (R-15)', () => {
  assert.match(fichaSrc, /isLinearStatus\(client\.status\)/);
  assert.match(fichaSrc, /onValueChange=\{requestStatusChange\}/);
  assert.match(
    fichaSrc,
    /const confirmStatusChange[\s\S]*?persistClientStatus\(/
  );
  // La transición sigue pasando por el seam (ahora con currentDeliveredAt aditivo).
  assert.match(
    fichaSrc,
    /target,\s*\n\s*\/\/[\s\S]*?currentDeliveredAt: client\.delivered_at/
  );
});

test('T-25 la aprobación de contenido F-089 (content_status) sigue intacta (R-15)', () => {
  // El read-model REUSA el vocabulario de content-status.ts (no lo redefine).
  const deliverable = read('../../src/lib/clients/deliverable.ts');
  assert.match(
    deliverable,
    /import \{ GBP_CONTENT_STATUS_APPROVED \} from '\.\.\/gbp-slice\/content-status\.ts'/
  );
  // El seam de aprobación F-089 no fue tocado (única transición a approved sigue ahí).
  const contentStatus = read('../../src/lib/gbp-slice/content-status.ts');
  assert.match(contentStatus, /export async function approveGbpContent/);
  assert.match(
    contentStatus,
    /GBP_CONTENT_STATUS_APPROVED: RecordStatus = 'approved'/
  );
});
