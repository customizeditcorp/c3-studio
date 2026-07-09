/**
 * F-066 — T-09/T-10/T-15 support — prompt assembly grounds in OFV+brandboard (R-03/R-04/R-10).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readGbpContext } from '../../src/lib/gbp-slice/context.ts';
import {
  buildGbpSystemPrompt,
  buildGbpUserMessage,
  GBP_REQUIRED_FIELDS
} from '../../src/lib/gbp-slice/prompt.ts';
import { CLIENT, REAL_OFFER, APPROVED_BRANDBOARD } from './fixtures.ts';

const ctx = readGbpContext({
  client: CLIENT,
  offer: REAL_OFFER,
  brandboard: APPROVED_BRANDBOARD
});

test('R-03 user message contains OFV strategic content', () => {
  const msg = buildGbpUserMessage(ctx);
  assert.match(msg, /ColorBoost/);
  assert.match(msg, /Quick Win/);
  assert.match(msg, /Garantía/);
  assert.match(msg, /Perfil de Negocio en Google/); // a deliverable
});

test('R-04 user message anchors brandboard tone (dos/donts/adjectives)', () => {
  const msg = buildGbpUserMessage(ctx);
  assert.match(msg, /Profesional y cercano/);
  assert.match(msg, /Confiable, meticuloso/);
  assert.match(msg, /escasez fabricada/); // a dont
});

test('R-04 system prompt instructs consume-not-redecide', () => {
  const sys = buildGbpSystemPrompt();
  assert.match(sys, /CONSUMES la estrategia/);
  assert.match(sys, /NO la re-decides/);
});

test('R-10 system prompt asks for all required GBP fields', () => {
  const sys = buildGbpSystemPrompt();
  for (const f of GBP_REQUIRED_FIELDS) {
    assert.ok(sys.includes(f), 'missing field in prompt: ' + f);
  }
});

test('buildGbpSystemPrompt prefers a provided base prompt', () => {
  assert.equal(buildGbpSystemPrompt('BASE PROMPT'), 'BASE PROMPT');
  assert.match(buildGbpSystemPrompt(''), /GBP Profile Specialist/);
});

test('R-05/R-06/R-07 degradation notes surfaced in the message', () => {
  const msg = buildGbpUserMessage(ctx);
  assert.match(msg, /Logo: PENDIENTE/);
  assert.match(msg, /sin fotos aprobadas/);
  assert.match(msg, /Estado operativo GBP: pendiente/);
});
