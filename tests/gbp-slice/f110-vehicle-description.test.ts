/**
 * F-110 T-05/T-07 — DT-2=SÍ: `vehicle_description` al user message del GBP por simetría.
 * Source-guard (patrón F-107, whitespace-tolerante) + comprobación conductual con fixtures.
 * Coherencia CL-092: los campos cableados son de la OFV, NO de la persona (R-12).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readGbpContext } from '../../src/lib/gbp-slice/context.ts';
import { buildGbpUserMessage } from '../../src/lib/gbp-slice/prompt.ts';
import { CLIENT, REAL_OFFER, APPROVED_BRANDBOARD } from './fixtures.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const PROMPT = readFileSync(
  resolve(REPO, 'src/lib/gbp-slice/prompt.ts'),
  'utf8'
);

/* Segmento acotado al bloque OFV del GBP: desde la etiqueta del bloque hasta el
 * inicio del bloque BRANDBOARD (T-07: acotar el assert anti-persona al bloque nuevo). */
const iStart = PROMPT.indexOf('## OFERTA DE VALOR APROBADA');
const iEnd = PROMPT.indexOf('## BRANDBOARD APROBADO');
assert.ok(iStart >= 0 && iEnd > iStart, 'no se acotó el bloque OFV del GBP');
const PROMPT_OFV_BLOCK = PROMPT.slice(iStart, iEnd);

/* ---- R-05: la línea condicional de vehicle_description está presente ------------- */

test('R-05 buildGbpUserMessage agrega vehicle_description como línea condicional', () => {
  assert.match(PROMPT_OFV_BLOCK, /if\s*\(\s*offer\.vehicle_description\s*\)/);
  assert.match(
    PROMPT_OFV_BLOCK,
    /lines\.push\(\s*['"]Descripción del vehículo: ['"]/
  );
});

/* ---- R-09: las líneas previas del bloque OFV del GBP siguen intactas ------------- */

test('R-09 el bloque OFV del GBP preserva Vehículo/Entregables/Prueba social', () => {
  assert.match(PROMPT_OFV_BLOCK, /Vehículo: /);
  assert.match(PROMPT_OFV_BLOCK, /offer\.deliverables\.join\(/);
  assert.match(PROMPT_OFV_BLOCK, /offer\.social_proof\.join\(/);
  assert.match(PROMPT_OFV_BLOCK, /Entregables: /);
  assert.match(PROMPT_OFV_BLOCK, /Prueba social: /);
});

/* ---- R-12 / CL-092: no se introduce lectura/cableado de persona en el bloque OFV -- */

test('R-12/CL-092 el bloque OFV del GBP no introduce buyer_personas ni persona', () => {
  assert.doesNotMatch(PROMPT_OFV_BLOCK, /buyer_personas|persona/i);
});

/* ---- Conductual: presente → aparece; ausente → omitido (R-04/R-05) --------------- */

test('R-05 conductual: con vehicle_description presente, aparece en el user message', () => {
  const ctx = readGbpContext({
    client: CLIENT,
    offer: {
      ...REAL_OFFER,
      vehicle_description: 'Método ColorBoost™ de 30 días'
    },
    brandboard: APPROVED_BRANDBOARD
  });
  const msg = buildGbpUserMessage(ctx);
  assert.match(msg, /Descripción del vehículo: Método ColorBoost™ de 30 días/);
});

test('R-04 conductual: sin vehicle_description (REAL_OFFER), la línea se omite', () => {
  const ctx = readGbpContext({
    client: CLIENT,
    offer: REAL_OFFER, // vehicle_description ausente → normalizeOffer → null
    brandboard: APPROVED_BRANDBOARD
  });
  const msg = buildGbpUserMessage(ctx);
  assert.doesNotMatch(msg, /Descripción del vehículo:/);
});
