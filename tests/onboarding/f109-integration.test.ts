/**
 * F-109 — Source-guards de integración (T-09/T-10/T-12).
 *
 * Verifica por `readFileSync`+regex (whitespace-tolerantes, `\s*`, lección F-107)
 * que el guard y el tie-break están CABLEADOS en los code-paths reales:
 *   T-09 — page.tsx: los 3 approve handlers llaman `assessApproval` + `return` en
 *          `!ok`, y setean `approved_by`/`approved_at` en AMBAS ramas.
 *   T-10 — route.ts: FK-linking `persona_id`/`brief_id` prefieren `approved` con
 *          fallback; el consumo de offers y el `offer_id` de generated_outputs usan
 *          `pickCanonicalOffer`.
 *   T-12 — no-regresión (F-107/F-108/generación) + save-draft libre + guard NO
 *          bloquea `[PENDIENTE]` legítimo (espejo runtime de T-08) + SIN DDL.
 *
 * El cierre AUTORITATIVO (approved_by/at poblados, bloqueo en vivo, FK a approved,
 * tie resuelto) es LIVE §6.1 y de frontera (operador/Leader).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assessApproval } from '../../src/lib/onboarding/approval-guard.ts';

const pageSrc = readFileSync(
  fileURLToPath(
    new URL(
      '../../src/app/(app)/onboarding/brief/[clientId]/page.tsx',
      import.meta.url
    )
  ),
  'utf8'
);
const routeSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/app/api/generate-content/route.ts', import.meta.url)
  ),
  'utf8'
);
const writePathSrc = readFileSync(
  fileURLToPath(new URL('../../src/lib/offers/write-path.ts', import.meta.url)),
  'utf8'
);
const guardSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/lib/onboarding/approval-guard.ts', import.meta.url)
  ),
  'utf8'
);
const selectSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/lib/offers/select-canonical.ts', import.meta.url)
  ),
  'utf8'
);

/**
 * Aísla el cuerpo de un handler desde su marcador HASTA la próxima declaración
 * `const handleXxx` (o 3000 chars). Robusto al bleed entre handlers adyacentes
 * (a diferencia de un `len` fijo — lección: la ventana no debe cruzar handlers).
 */
function handlerBody(src: string, marker: string): string {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `no se encontró el marcador: ${marker}`);
  const next = src.indexOf('const handle', start + marker.length);
  return src.slice(start, next > start ? next : start + 3000);
}

function countMatches(hay: string, re: RegExp): number {
  return (hay.match(re) ?? []).length;
}

/* ================================================================== */
/*  T-09 — page.tsx: guard + approved_by/at en los 3 handlers         */
/* ================================================================== */

test('T-09 import de assessApproval desde approval-guard (R-05)', () => {
  assert.match(
    pageSrc,
    /import\s*\{\s*assessApproval\s*\}\s*from\s*'@\/lib\/onboarding\/approval-guard'/
  );
});

for (const { name, marker, fields } of [
  { name: 'Brief', marker: 'const handleApproveBrief', fields: 'briefFields' },
  {
    name: 'Persona',
    marker: 'const handleApprovePersona',
    fields: 'personaFields'
  },
  { name: 'OFV', marker: 'const handleApproveOFV', fields: 'ofvFields' }
]) {
  test(`T-09 handleApprove${name}: llama assessApproval(${fields}) y hace return en !ok (R-05/R-06)`, () => {
    const body = handlerBody(pageSrc, marker);
    // guard invocado sobre los campos de la entidad, en la condición de bloqueo
    assert.match(
      body,
      new RegExp(`!\\s*assessApproval\\(\\s*${fields}\\s*\\)\\.ok`)
    );
    // bloquea: toast de error + return, ANTES de cualquier .from(...).update/insert
    assert.match(body, /toast\.error\(/);
    const guardIdx = body.search(
      new RegExp(`assessApproval\\(\\s*${fields}\\s*\\)`)
    );
    const returnIdx = body.indexOf('return', guardIdx);
    // primer write a DB (`.update(`/`.insert(`) — el guard debe precederlo
    const writeIdx = body.search(/\.(?:update|insert)\(/);
    assert.ok(returnIdx > guardIdx, 'return tras el guard');
    assert.ok(
      guardIdx < writeIdx,
      'el guard se evalúa ANTES de escribir en DB'
    );
  });

  test(`T-09 handleApprove${name}: setea approved_by/approved_at en AMBAS ramas (R-07)`, () => {
    const body = handlerBody(pageSrc, marker);
    // update-in-place + insert-on-first-save → 2 ocurrencias de cada uno
    assert.equal(
      countMatches(body, /approved_by:\s*user\.id/g),
      2,
      'approved_by en las 2 ramas'
    );
    assert.equal(
      countMatches(body, /approved_at:\s*approvedAt/g),
      2,
      'approved_at en las 2 ramas'
    );
  });
}

/* ================================================================== */
/*  T-10 — route.ts: FK-linking prefiere approved + pickCanonicalOffer */
/* ================================================================== */

test('T-10 route importa pickCanonicalOffer desde select-canonical (R-11)', () => {
  assert.match(
    routeSrc,
    /import\s*\{[\s\S]*pickCanonicalOffer[\s\S]*\}\s*from\s*'@\/lib\/offers\/select-canonical'/
  );
});

test('T-10 persona_id: prefiere buyer_personas approved con fallback (R-08)', () => {
  const block = routeSrc.slice(
    routeSrc.indexOf("step === 'ofv' && parsedContent"),
    routeSrc.indexOf('insertData.persona_id')
  );
  assert.match(block, /\.from\(\s*'buyer_personas'\s*\)/);
  assert.match(block, /\.eq\(\s*'status'\s*,\s*'approved'\s*\)/);
  // fallback explícito (última cualquier-status por created_at)
  assert.match(block, /\.order\(\s*'created_at'/);
  // 422 preservado si no hay ninguna persona
  assert.match(routeSrc, /OFV requiere una buyer persona para el cliente/);
});

test('T-10 brief_id: prefiere briefs approved con fallback (R-09)', () => {
  const block = routeSrc.slice(
    routeSrc.indexOf("step === 'buyer_persona'"),
    routeSrc.indexOf('if (lb) insertData.brief_id')
  );
  assert.match(block, /\.from\(\s*'briefs'\s*\)/);
  assert.match(block, /\.eq\(\s*'status'\s*,\s*'approved'\s*\)/);
  assert.match(block, /\.order\(\s*'created_at'/); // fallback
});

test('T-10 consumo de offers usa pickCanonicalOffer sobre approved (R-11)', () => {
  const block = routeSrc.slice(
    routeSrc.indexOf('if (needsOffer)'),
    routeSrc.indexOf('normalizeOffer(offer as RawOfferRow)')
  );
  // trae TODOS los approved (sin limit(1)) y elige la canónica
  assert.match(block, /\.eq\(\s*'status'\s*,\s*'approved'\s*\)/);
  assert.match(block, /pickCanonicalOffer\(/);
  assert.doesNotMatch(block, /\.limit\(\s*1\s*\)/); // ya no hay limit(1) aquí
});

test('T-10 DT-06: offer_id de generated_outputs usa pickCanonicalOffer sobre approved', () => {
  const startIdx = routeSrc.indexOf('shouldPersistGeneratedOutput(step)');
  const block = routeSrc.slice(
    startIdx,
    // fin = USO de extractGeneratedOutputFields (no el import al tope del archivo)
    routeSrc.indexOf('extractGeneratedOutputFields', startIdx)
  );
  assert.match(block, /pickCanonicalOffer\(/);
  assert.match(block, /\.eq\(\s*'status'\s*,\s*'approved'\s*\)/);
  // el insert enlaza el offerId canónico calculado
  assert.match(routeSrc, /offer_id:\s*offerId/);
});

/* ================================================================== */
/*  T-12 — No-regresión + save-draft libre + coherencia + SIN DDL     */
/* ================================================================== */

test('T-12 save-draft NO pasa por el guard ni sella approved_by/at (R-06/R-12)', () => {
  for (const marker of [
    'const handleSaveDraft',
    'const handleSaveDraftPersona',
    'const handleSaveDraftOFV'
  ]) {
    const body = handlerBody(pageSrc, marker);
    assert.doesNotMatch(body, /assessApproval\(/, `${marker} sin guard`);
    assert.doesNotMatch(
      body,
      /approved_by|approved_at/,
      `${marker} no sella approved_*`
    );
  }
});

test('T-12 F-108/F-107 intactos: insert-on-first-save + update-in-place + helpers (R-12)', () => {
  // los 3 save-draft + los 3 approve siguen existiendo
  for (const h of [
    'const handleSaveDraft',
    'const handleSaveDraftPersona',
    'const handleSaveDraftOFV',
    'const handleApproveBrief',
    'const handleApprovePersona',
    'const handleApproveOFV'
  ]) {
    assert.ok(pageSrc.includes(h), `${h} presente`);
  }
  // single-source helpers sin cambio de firma
  assert.match(
    writePathSrc,
    /export function buildOfvWritePayload\(\s*content: Record<string, unknown>\s*\)/
  );
  assert.match(writePathSrc, /export function ofvFieldsToContent\(/);
  // approve handlers siguen usando los helpers de write-path (no divergen)
  const ofv = handlerBody(pageSrc, 'const handleApproveOFV');
  assert.match(ofv, /buildOfvWritePayload\(\s*ofvFieldsToContent\(ofvFields\)/);
  const persona = handlerBody(pageSrc, 'const handleApprovePersona');
  assert.match(persona, /buildBriefWritePayload\(/);
});

test('T-12 generación intacta: retry/anti-AI/grounding/422 sin tocar (R-13)', () => {
  assert.match(routeSrc, /attachValidation\(/);
  assert.match(routeSrc, /attachMethodGrounding\(/);
  assert.match(routeSrc, /resolveWriteMode\(/);
  assert.match(
    routeSrc,
    /Object\.assign\(\s*insertData,\s*buildOfvWritePayload\(/
  );
});

test('T-12 coherencia F-104/F-106 (espejo runtime de T-08): [PENDIENTE] legítimo NO bloquea (R-14)', () => {
  // contenido real con [PENDIENTE] honestos → aprobable
  assert.equal(
    assessApproval({
      big_promise: 'Más clientes en 60 días',
      guarantee: '[PENDIENTE]'
    }).ok,
    true
  );
  // vacío / todo-placeholder → bloqueado
  assert.equal(assessApproval({ a: '', b: '' }).ok, false);
  assert.equal(assessApproval({ a: '[PENDIENTE]' }).ok, false);
});

test('T-12 SIN DDL: page.tsx/route.ts/helpers no contienen SQL/migración', () => {
  for (const src of [pageSrc, routeSrc, guardSrc, selectSrc]) {
    assert.doesNotMatch(src, /CREATE TABLE|ALTER TABLE|migration/i);
  }
});
