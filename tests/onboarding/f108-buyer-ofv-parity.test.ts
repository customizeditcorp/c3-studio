/**
 * F-108 — Paridad F-097 en la UI de Buyer/OFV (Guardar borrador +
 * insert-on-first-save + approve-sin-generar).
 *
 * Source-guards (`readFileSync`+regex, patrón f097-brief-write-path.test.ts /
 * f107-ofv-write-path.test.ts) sobre `page.tsx`. Los write-path helpers
 * (buildBriefWritePayload F-097 / buildOfvWritePayload+ofvFieldsToContent F-107)
 * ya están unit-testeados por sus features → aquí solo se verifica que la UI los
 * cablea correctamente + insert-on-first-save + eliminación del early-return.
 *
 * Regex whitespace/newline-tolerantes (\s*) porque el hook husky/prettier
 * reformatea al commit (lección F-107). El cierre AUTORITATIVO (conteo de filas
 * draft/approved en vivo) es LIVE y de frontera (operador/Leader, gated §6.1).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pageSrc = readFileSync(
  fileURLToPath(
    new URL(
      '../../src/app/(app)/onboarding/brief/[clientId]/page.tsx',
      import.meta.url
    )
  ),
  'utf8'
);

// Aísla el cuerpo de un handler por su marcador (patrón f097/f107).
function sliceFrom(src: string, marker: string, len = 1600): string {
  const idx = src.indexOf(marker);
  assert.ok(idx > 0, `no se encontró el marcador: ${marker}`);
  return src.slice(idx, idx + len);
}

/* ================================================================== */
/*  T-08 — Source-guards Persona (R-01/R-03/R-04/R-06/R-08/R-10/R-15) */
/* ================================================================== */

test('T-08 handleSaveDraftPersona: existe', () => {
  assert.match(pageSrc, /const handleSaveDraftPersona\s*=\s*async/);
});

test('T-08 handleSaveDraftPersona: rama insert a buyer_personas con prompt_version_id null + client_id (R-01/R-10/R-15)', () => {
  const body = sliceFrom(pageSrc, 'const handleSaveDraftPersona', 2000);
  assert.match(body, /\.from\('buyer_personas'\)\s*\.insert\(/);
  assert.match(body, /prompt_version_id:\s*null/);
  assert.match(body, /client_id:\s*clientId/);
  assert.match(body, /setPersonaRecord\(/);
});

test('T-08 handleSaveDraftPersona: usa buildBriefWritePayload (raw_text sync, R-08)', () => {
  const body = sliceFrom(pageSrc, 'const handleSaveDraftPersona');
  assert.match(
    body,
    /buildBriefWritePayload\(\s*fieldsToContent\(\s*personaFields/
  );
});

test('T-08 handleSaveDraftPersona: rama update-si-existe por .eq(id) (R-03)', () => {
  const body = sliceFrom(pageSrc, 'const handleSaveDraftPersona');
  assert.match(body, /\.update\(\{[^}]*raw_text:/);
  assert.match(body, /\.eq\('id',\s*personaRecord\.id\)/);
});

test('T-08 handleApprovePersona: ya NO tiene early-return por !personaRecord (R-06)', () => {
  const body = sliceFrom(pageSrc, 'const handleApprovePersona');
  assert.doesNotMatch(body, /if\s*\(\s*!personaRecord[^)]*\)\s*return/);
});

test('T-08 handleApprovePersona: rama insert-si-no + buildBriefWritePayload approved (R-04/R-08)', () => {
  const body = sliceFrom(pageSrc, 'const handleApprovePersona');
  assert.match(body, /\.from\('buyer_personas'\)\s*\.insert\(/);
  assert.match(body, /buildBriefWritePayload\(/);
  assert.match(body, /status:\s*'approved'/);
  assert.match(body, /prompt_version_id:\s*null/);
});

/* ================================================================== */
/*  T-09 — Source-guards OFV (R-02/R-05/R-06/R-08/R-10/R-11)          */
/* ================================================================== */

test('T-09 handleSaveDraftOFV: existe', () => {
  assert.match(pageSrc, /const handleSaveDraftOFV\s*=\s*async/);
});

test('T-09 handleSaveDraftOFV: usa buildOfvWritePayload(ofvFieldsToContent( (single-source, R-08)', () => {
  const body = sliceFrom(pageSrc, 'const handleSaveDraftOFV');
  assert.match(
    body,
    /buildOfvWritePayload\(\s*ofvFieldsToContent\(ofvFields\)/
  );
});

test('T-09 handleSaveDraftOFV: rama insert a offers con prompt_version_id null (R-02/R-10)', () => {
  const body = sliceFrom(pageSrc, 'const handleSaveDraftOFV');
  assert.match(body, /\.from\('offers'\)\s*\.insert\(/);
  assert.match(body, /prompt_version_id:\s*null/);
  assert.match(body, /client_id:\s*clientId/);
  assert.match(body, /setOfvRecord\(/);
});

test('T-09 handleSaveDraftOFV: el insert NO incluye persona_id (FK-linking = F-109, R-11)', () => {
  const body = sliceFrom(pageSrc, 'const handleSaveDraftOFV');
  assert.doesNotMatch(body, /persona_id/);
});

test('T-09 handleApproveOFV: ya NO tiene early-return por !ofvRecord (R-06)', () => {
  const body = sliceFrom(pageSrc, 'const handleApproveOFV');
  assert.doesNotMatch(body, /if\s*\(\s*!ofvRecord[^)]*\)\s*return/);
});

test('T-09 handleApproveOFV: rama insert-si-no con status approved + sin persona_id (R-05/R-11)', () => {
  const body = sliceFrom(pageSrc, 'const handleApproveOFV');
  assert.match(body, /\.from\('offers'\)\s*\.insert\(/);
  assert.match(
    body,
    /buildOfvWritePayload\(\s*ofvFieldsToContent\(ofvFields\)/
  );
  assert.match(body, /status:\s*'approved'/);
  assert.match(body, /prompt_version_id:\s*null/);
  assert.doesNotMatch(body, /persona_id/);
});

/* ================================================================== */
/*  T-10 — Source-guards botones (R-07)                              */
/* ================================================================== */

test('T-10 botón Guardar borrador Persona: gateado por !personaApproved, llama handleSaveDraftPersona', () => {
  assert.match(
    pageSrc,
    /\{!personaApproved && \(\s*<Button\s+variant='outline'\s+onClick=\{handleSaveDraftPersona\}/
  );
});

test('T-10 botón Guardar borrador Persona: NO gateado por personaRecord (R-07)', () => {
  assert.doesNotMatch(
    pageSrc,
    /\{personaRecord && [^}]*\(\s*<Button\s+variant='outline'\s+onClick=\{handleSaveDraftPersona\}/
  );
});

test('T-10 botón Guardar borrador OFV: gateado por !ofvApproved, llama handleSaveDraftOFV', () => {
  assert.match(
    pageSrc,
    /\{!ofvApproved && \(\s*<Button\s+variant='outline'\s+onClick=\{handleSaveDraftOFV\}/
  );
});

test('T-10 botón Guardar borrador OFV: NO gateado por ofvRecord (R-07)', () => {
  assert.doesNotMatch(
    pageSrc,
    /\{ofvRecord && [^}]*\(\s*<Button\s+variant='outline'\s+onClick=\{handleSaveDraftOFV\}/
  );
});

/* ================================================================== */
/*  T-11 — No-regresión / idempotencia (R-09/R-12/R-15)              */
/* ================================================================== */

test('T-11 brief intacto: handleSaveDraft y handleApproveBrief presentes (R-12)', () => {
  assert.match(pageSrc, /const handleSaveDraft\s*=\s*async/);
  assert.match(pageSrc, /const handleApproveBrief\s*=\s*async/);
});

test('T-11 idempotencia: tras insert se setea el record (2ª escritura = update, R-09)', () => {
  const persona = sliceFrom(pageSrc, 'const handleSaveDraftPersona', 2000);
  const ofv = sliceFrom(pageSrc, 'const handleSaveDraftOFV', 2000);
  assert.match(persona, /setPersonaRecord\(data as ContentRecord\)/);
  assert.match(ofv, /setOfvRecord\(data as ContentRecord\)/);
});

test('T-11 aislamiento: los approve nuevos actualizan por .eq(id) y conservan status approved + logActivity (R-15/R-12)', () => {
  const persona = sliceFrom(pageSrc, 'const handleApprovePersona', 3400);
  const ofv = sliceFrom(pageSrc, 'const handleApproveOFV', 3400);
  assert.match(persona, /\.eq\('id',\s*personaRecord\.id\)/);
  assert.match(persona, /status:\s*'approved'/);
  assert.match(persona, /logActivity\(/);
  assert.match(ofv, /\.eq\('id',\s*ofvRecord\.id\)/);
  assert.match(ofv, /status:\s*'approved'/);
  assert.match(ofv, /logActivity\(/);
});

/* ================================================================== */
/*  T-12 — Frontera F-109 + sin DDL (R-13/R-14)                      */
/* ================================================================== */

test('T-12 F-108 NO introduce approved_by/approved_at en los handlers nuevos (frontera F-109, R-13)', () => {
  const persona = sliceFrom(pageSrc, 'const handleSaveDraftPersona', 3400);
  const ofv = sliceFrom(pageSrc, 'const handleSaveDraftOFV', 3400);
  assert.doesNotMatch(persona, /approved_by|approved_at/);
  assert.doesNotMatch(ofv, /approved_by|approved_at/);
});

test('T-12 F-108 NO introduce validación [PENDIENTE]/no-vacío en los handlers nuevos (F-109, R-13)', () => {
  const persona = sliceFrom(pageSrc, 'const handleSaveDraftPersona', 3400);
  const ofv = sliceFrom(pageSrc, 'const handleSaveDraftOFV', 3400);
  assert.doesNotMatch(persona, /\[PENDIENTE\]/);
  assert.doesNotMatch(ofv, /\[PENDIENTE\]/);
});

test('T-12 SIN DDL: page.tsx no contiene SQL/migración', () => {
  assert.doesNotMatch(pageSrc, /CREATE TABLE|ALTER TABLE|migration/i);
});
