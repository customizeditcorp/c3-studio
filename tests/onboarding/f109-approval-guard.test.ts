/**
 * F-109 — T-08 — Helper puro `assessApproval` (guard de aprobación, R-01..R-04).
 *
 * Unit tests framework-free (`node --test`) del seam puro. Verifica el umbral
 * DT-01 (`meaningfulFieldCount > 0`) y — CRÍTICO — el invariante de coherencia
 * F-104/F-106: `[PENDIENTE]` legítimo NO bloquea la aprobación (R-04).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessApproval,
  isPlaceholderOnly
} from '../../src/lib/onboarding/approval-guard.ts';

/* ================================================================== */
/*  R-02 — contenido vacío → no aprobable, reason 'empty'             */
/* ================================================================== */

test('T-08 vacío (todos "") → ok:false, reason empty (R-02)', () => {
  const r = assessApproval({ a: '', b: '', c: '' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'empty');
  assert.equal(r.meaningfulFieldCount, 0);
});

test('T-08 solo-whitespace (todos "   ") → ok:false, reason empty (R-02)', () => {
  const r = assessApproval({ a: '   ', b: '\n\t ' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'empty');
});

test('T-08 objeto sin campos → ok:false, reason empty (R-02)', () => {
  const r = assessApproval({});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'empty');
  assert.equal(r.meaningfulFieldCount, 0);
});

/* ================================================================== */
/*  R-03 — esencialmente-todo-placeholder → no aprobable              */
/* ================================================================== */

test('T-08 todo-[PENDIENTE] → ok:false, reason all_placeholder (R-03)', () => {
  const r = assessApproval({ a: '[PENDIENTE]', b: '[PENDIENTE]' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'all_placeholder');
  assert.equal(r.meaningfulFieldCount, 0);
});

test('T-08 mezcla vacío + placeholder → ok:false, reason all_placeholder (R-03)', () => {
  const r = assessApproval({ a: '', b: '[PENDIENTE]', c: '   ' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'all_placeholder');
});

test('T-08 variantes de placeholder ([ PENDIENTE ], [PENDING], case) → all_placeholder (R-03)', () => {
  const r = assessApproval({
    a: '[ PENDIENTE ]',
    b: '[pendiente]',
    c: '[PENDING]'
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'all_placeholder');
});

test('T-08 placeholder con puntuación envolvente ("- [PENDIENTE].") → all_placeholder (R-03)', () => {
  const r = assessApproval({ a: '- [PENDIENTE].' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'all_placeholder');
});

/* ================================================================== */
/*  R-04 — al menos un campo real → aprobable (COHERENCIA F-104/F-106) */
/* ================================================================== */

test('T-08 un campo real + guarantee [PENDIENTE] + resto vacío → ok:true (R-04)', () => {
  const r = assessApproval({
    big_promise: 'Duplicamos tus leads en 90 días',
    guarantee: '[PENDIENTE]',
    urgency: ''
  });
  assert.equal(r.ok, true);
  assert.equal(r.meaningfulFieldCount, 1);
  assert.equal(r.reason, undefined);
});

test('T-08 CRÍTICO coherencia F-104/F-106: prosa real CON [PENDIENTE] inline → meaningful (R-04)', () => {
  // Un campo con prosa real más un [PENDIENTE] inline cuenta como meaningful:
  // el guard NUNCA bloquea `[PENDIENTE]` legítimo.
  const r = assessApproval({
    big_promise: 'Atendemos [PENDIENTE] clientes al mes con garantía real'
  });
  assert.equal(r.ok, true);
  assert.equal(r.meaningfulFieldCount, 1);
});

test('T-08 OFV bien-generado con 1-2 [PENDIENTE] honestos → ok:true (R-04/F-104/F-106)', () => {
  const r = assessApproval({
    big_promise: 'Más clientes locales en 60 días',
    vehicle_name: 'Sistema de Presencia Local C3',
    quick_win: 'Optimización del perfil de Google en 48h',
    guarantee: '[PENDIENTE]',
    urgency_scarcity: '[PENDIENTE]'
  });
  assert.equal(r.ok, true);
  assert.ok(r.meaningfulFieldCount >= 3);
});

/* ================================================================== */
/*  isPlaceholderOnly — unidad fina                                   */
/* ================================================================== */

test('T-08 isPlaceholderOnly: token puro true; prosa+token false; vacío false', () => {
  assert.equal(isPlaceholderOnly('[PENDIENTE]'), true);
  assert.equal(isPlaceholderOnly('[ PENDIENTE ]'), true);
  assert.equal(isPlaceholderOnly('[PENDING]'), true);
  assert.equal(isPlaceholderOnly('texto real [PENDIENTE]'), false);
  assert.equal(isPlaceholderOnly('texto real'), false);
  assert.equal(isPlaceholderOnly(''), false); // vacío NO es placeholder-only
  assert.equal(isPlaceholderOnly('   '), false);
});

test('T-08 acentos español cuentan como prosa real (no placeholder-only)', () => {
  assert.equal(isPlaceholderOnly('garantía'), false);
  const r = assessApproval({ a: 'ñañez áéíóú', b: '[PENDIENTE]' });
  assert.equal(r.ok, true);
});
