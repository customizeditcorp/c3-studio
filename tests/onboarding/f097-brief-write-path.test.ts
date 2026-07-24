/**
 * F-097 — Higiene de captura del brief — write-path core (Scope A).
 *
 * Cobertura R→test. Dos capas:
 *  1. Unit puro (`node --test`) sobre los helpers `src/lib/briefs/write-path.ts`
 *     (buildBriefWritePayload, resolveWriteMode) → R-06..R-08, R-10, R-11.
 *  2. Source-guards (`readFileSync`+regex, patrón f084-city-state.test.ts) sobre
 *     `page.tsx` y `generate-content/route.ts` → wiring de insert-on-first-save,
 *     raw_text sync, gating de botones, insert→update, no-regresión.
 *
 * El cierre AUTORITATIVO (persistir sin generar, no-duplicación de drafts,
 * columna raw_text sincronizada) es LIVE en JD Valley y es de frontera
 * (operador/Leader, gated §6.1). Estos tests verifican estructura + lógica pura.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildBriefWritePayload,
  resolveWriteMode
} from '../../src/lib/briefs/write-path.ts';

const briefSrc = readFileSync(
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

// Helper: aísla el cuerpo de un handler por su declaración.
function sliceFrom(src: string, marker: string, len = 1500): string {
  const idx = src.indexOf(marker);
  assert.ok(idx > 0, `no se encontró el marcador: ${marker}`);
  return src.slice(idx, idx + len);
}

/* ================================================================== */
/*  T-07 — buildBriefWritePayload (invariante R-10/R-11)              */
/* ================================================================== */

test('T-07 buildBriefWritePayload: content.raw_text string → raw_text lo copia (R-10)', () => {
  const p = buildBriefWritePayload(
    { business_name: 'JD Valley', raw_text: 'X narrativo' },
    { status: 'draft' }
  );
  assert.equal(p.raw_text, 'X narrativo');
  assert.equal(p.status, 'draft');
  assert.equal(p.version, 1);
  // invariante: columna === content.raw_text
  assert.equal(p.raw_text, p.content.raw_text ?? null);
});

test('T-07 buildBriefWritePayload: sin raw_text → raw_text === null (R-10)', () => {
  const p = buildBriefWritePayload(
    { business_name: 'JD Valley' },
    { status: 'approved' }
  );
  assert.equal(p.raw_text, null);
  assert.equal(p.status, 'approved');
  assert.equal(p.raw_text, p.content.raw_text ?? null);
});

test('T-07 buildBriefWritePayload: raw_text no-string (número) → null (R-10, invariante duro)', () => {
  const p = buildBriefWritePayload(
    { raw_text: 123 as unknown as string },
    { status: 'draft' }
  );
  assert.equal(p.raw_text, null);
});

test('T-07 buildBriefWritePayload: version override respetado (DT-04)', () => {
  const p = buildBriefWritePayload(
    { raw_text: 'a' },
    {
      status: 'draft',
      version: 3
    }
  );
  assert.equal(p.version, 3);
});

/* ================================================================== */
/*  T-08 — resolveWriteMode (R-06/R-07/R-08)                          */
/* ================================================================== */

test('T-08 resolveWriteMode: draft existente → update(id) (R-06/R-08)', () => {
  assert.deepEqual(resolveWriteMode({ id: 'a', status: 'draft' }), {
    mode: 'update',
    id: 'a'
  });
});

test('T-08 resolveWriteMode: última fila approved → insert (R-07)', () => {
  assert.deepEqual(resolveWriteMode({ id: 'a', status: 'approved' }), {
    mode: 'insert'
  });
});

test('T-08 resolveWriteMode: sin fila (null) → insert (R-07)', () => {
  assert.deepEqual(resolveWriteMode(null), { mode: 'insert' });
});

test('T-08 resolveWriteMode idempotencia: el mismo draft se reusa siempre (R-08)', () => {
  const latest = { id: 'draft-1', status: 'draft' };
  const first = resolveWriteMode(latest);
  const second = resolveWriteMode(latest);
  assert.deepEqual(first, second);
  assert.deepEqual(first, { mode: 'update', id: 'draft-1' });
});

/* ================================================================== */
/*  T-09 — Source-guard cliente: early-return eliminado + insert      */
/*         (R-01/R-02/R-04)                                            */
/* ================================================================== */

test('T-09 handleSaveDraft: ya NO tiene early-return por !briefRecord', () => {
  const body = sliceFrom(briefSrc, 'const handleSaveDraft');
  assert.doesNotMatch(body, /if\s*\(\s*!briefRecord[^)]*\)\s*return/);
});

test('T-09 handleApproveBrief: ya NO tiene early-return por !briefRecord', () => {
  const body = sliceFrom(briefSrc, 'const handleApproveBrief');
  assert.doesNotMatch(body, /if\s*\(\s*!briefRecord[^)]*\)\s*return/);
});

test('T-09 handleSaveDraft: tiene rama insert a briefs + setBriefRecord (R-01)', () => {
  const body = sliceFrom(briefSrc, 'const handleSaveDraft');
  assert.match(body, /\.from\('briefs'\)\s*\.insert\(/);
  assert.match(body, /setBriefRecord\(/);
});

test('T-09 handleApproveBrief: tiene rama insert a briefs + setBriefRecord (R-02)', () => {
  const body = sliceFrom(briefSrc, 'const handleApproveBrief');
  assert.match(body, /\.from\('briefs'\)\s*\.insert\(/);
  assert.match(body, /setBriefRecord\(/);
});

/* ================================================================== */
/*  T-10 — Source-guard raw_text: columna sincronizada (R-10/R-11/12) */
/* ================================================================== */

test('T-10 handleSaveDraft: update e insert incluyen raw_text (columna, no solo content)', () => {
  const body = sliceFrom(briefSrc, 'const handleSaveDraft');
  // update de la rama existente
  assert.match(body, /\.update\(\{\s*content:[^}]*raw_text:/);
  // insert de la rama nueva
  assert.match(body, /\.insert\(\{[^}]*raw_text:/);
});

test('T-10 handleApproveBrief: update e insert incluyen raw_text (columna sincronizada)', () => {
  const body = sliceFrom(briefSrc, 'const handleApproveBrief');
  assert.match(body, /\.update\(\{[^}]*raw_text:/);
  assert.match(body, /\.insert\(\{[^}]*raw_text:/);
});

test('T-10 ambos handlers derivan el payload de buildBriefWritePayload (invariante R-10 por construcción)', () => {
  const save = sliceFrom(briefSrc, 'const handleSaveDraft');
  const approve = sliceFrom(briefSrc, 'const handleApproveBrief');
  assert.match(save, /buildBriefWritePayload\(/);
  assert.match(approve, /buildBriefWritePayload\(/);
});

/* ================================================================== */
/*  T-11 — Source-guard gating de botones (R-03)                      */
/* ================================================================== */

test('T-11 gating: "Guardar borrador" ya NO se gatea por briefRecord && ...', () => {
  assert.doesNotMatch(
    briefSrc,
    /\{briefRecord && !briefApproved && \(\s*<Button\s+variant='outline'\s+onClick=\{handleSaveDraft\}/
  );
});

test('T-11 gating: "Aprobar Brief" ya NO se gatea por briefRecord.status', () => {
  assert.doesNotMatch(
    briefSrc,
    /\{briefRecord && briefRecord\.status !== 'approved' && \(\s*<Button\s+onClick=\{handleApproveBrief\}/
  );
});

test('T-11 gating: ambos botones usan !briefApproved sin briefRecord', () => {
  // Guardar borrador gateado solo por !briefApproved
  assert.match(
    briefSrc,
    /\{!briefApproved && \(\s*<Button\s+variant='outline'\s+onClick=\{handleSaveDraft\}/
  );
  // Aprobar Brief gateado solo por !briefApproved
  assert.match(
    briefSrc,
    /\{!briefApproved && \(\s*<Button\s+onClick=\{handleApproveBrief\}/
  );
});

/* ================================================================== */
/*  T-12 — Source-guard ruta: insert→update + generated_outputs intacto */
/*         (R-06/R-07/R-09/R-14)                                       */
/* ================================================================== */

test('T-12 route: el path tableMap invoca resolveWriteMode', () => {
  assert.match(routeSrc, /resolveWriteMode\(/);
});

test('T-12 route: hay rama update(...).eq(id) para el draft vivo (R-06)', () => {
  assert.match(routeSrc, /\.update\(insertData\)\s*\.eq\('id',\s*mode\.id\)/);
});

test('T-12 route: el lookup latest filtra por client_id + status (R-14)', () => {
  assert.match(
    routeSrc,
    /\.from\(table\)\s*\.select\('id, status'\)\s*\.eq\('client_id',\s*client_id\)/
  );
});

test('T-12 route: NO queda un insert(insertData) incondicional (solo dentro del ternario mode)', () => {
  // Debe existir insert(insertData) pero precedido por la rama update/ternario,
  // no como sentencia suelta `.from(table).insert(insertData).select().single()`
  // sin el mode. Verificamos que la decisión mode.mode === 'update' está presente.
  assert.match(routeSrc, /mode\.mode === 'update'/);
});

test('T-12 route: la rama generated_outputs sigue presente e intacta (no-regresión R-09)', () => {
  assert.match(routeSrc, /\.from\('generated_outputs'\)\s*\.insert\(/);
  assert.match(routeSrc, /shouldPersistGeneratedOutput\(step\)/);
});

/* ================================================================== */
/*  T-13 — No-regresión estructural del downstream (R-09)             */
/* ================================================================== */

test('T-13 route: downstream del brief approved intacto (status approved + raw_text||JSON)', () => {
  assert.match(routeSrc, /\.eq\('status',\s*'approved'\)/);
  assert.match(
    routeSrc,
    /brief\.raw_text \|\| JSON\.stringify\(brief\.content\)/
  );
});

test('T-13 route: resolución de prompt intacta (prompt_versions step/active)', () => {
  assert.match(routeSrc, /\.from\('prompt_versions'\)/);
  assert.match(routeSrc, /prompt_version_id:\s*prompt\.id/);
});

/* ================================================================== */
/*  T-14 — prompt_version_id manual = null (DT-01 / R-05)             */
/* ================================================================== */

test('T-14 handleSaveDraft: insert manual setea prompt_version_id: null (DT-01)', () => {
  const body = sliceFrom(briefSrc, 'const handleSaveDraft');
  assert.match(body, /prompt_version_id:\s*null/);
});

test('T-14 handleApproveBrief: insert manual setea prompt_version_id: null (DT-01)', () => {
  const body = sliceFrom(briefSrc, 'const handleApproveBrief');
  assert.match(body, /prompt_version_id:\s*null/);
});
