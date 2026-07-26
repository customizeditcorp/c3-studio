/**
 * F-107 — OFV single-source — write-path core + orquestación.
 *
 * Dos capas (patrón F-097 f097-brief-write-path.test.ts):
 *  1. Unit puro (`node --test`) sobre `src/lib/offers/write-path.ts`
 *     (buildOfvWritePayload, ofvFieldsToContent) → R-01..R-04, R-09.
 *  2. Source-guards (`readFileSync`+regex) sobre `page.tsx`, `route.ts` y
 *     `context.ts` → wiring UI/route + read-fallback + no-regresión
 *     (R-05..R-08, R-10, R-11).
 *
 * El cierre AUTORITATIVO (R-12: columna plana Y content sincronizadas en vivo +
 * generate-content recoge la edición) es LIVE y de frontera (operador/Leader,
 * gated §6.1). Estos tests verifican lógica pura + estructura.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildOfvWritePayload,
  ofvFieldsToContent
} from '../../src/lib/offers/write-path.ts';

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

const contextSrc = readFileSync(
  fileURLToPath(new URL('../../src/lib/gbp-slice/context.ts', import.meta.url)),
  'utf8'
);

const writePathSrc = readFileSync(
  fileURLToPath(new URL('../../src/lib/offers/write-path.ts', import.meta.url)),
  'utf8'
);

// Aísla el cuerpo de un handler/rama por su marcador (patrón f097).
function sliceFrom(src: string, marker: string, len = 1200): string {
  const idx = src.indexOf(marker);
  assert.ok(idx > 0, `no se encontró el marcador: ${marker}`);
  return src.slice(idx, idx + len);
}

/* ================================================================== */
/*  T-06 — buildOfvWritePayload (R-01/R-02/R-03)                       */
/* ================================================================== */

test('T-06 buildOfvWritePayload: content completo → 9 columnas + content (R-01)', () => {
  const content = {
    big_promise: 'BP',
    vehicle_name: 'VN',
    vehicle_description: 'VD',
    quick_win: 'QW',
    guarantee: 'G',
    urgency: 'U',
    decision_frame: { option_a: 'a' },
    deliverables: ['d1', 'd2'],
    social_proof: ['s1'],
    raw_text: 'resumen'
  };
  const { columns, content: c } = buildOfvWritePayload(content);
  assert.deepEqual(columns, {
    big_promise: 'BP',
    vehicle_name: 'VN',
    vehicle_description: 'VD',
    quick_win: 'QW',
    guarantee: 'G',
    urgency: 'U',
    decision_frame: { option_a: 'a' },
    deliverables: ['d1', 'd2'],
    social_proof: ['s1']
  });
  // raw_text NO es columna de `offers` → no se proyecta.
  assert.ok(!('raw_text' in columns));
  // content se devuelve intacto (el route le añade validación/grounding fuera, R-10).
  assert.equal(c, content);
});

test('T-06 buildOfvWritePayload: claves falsy/ausentes se omiten, no escribe null/"" (R-03)', () => {
  const { columns } = buildOfvWritePayload({
    big_promise: 'BP',
    vehicle_name: '', // vacío → omitido
    quick_win: undefined, // ausente → omitido
    guarantee: null, // null → omitido
    deliverables: [] // array vacío es truthy → SÍ se proyecta (paridad inline)
  } as Record<string, unknown>);
  assert.deepEqual(columns, { big_promise: 'BP', deliverables: [] });
  assert.ok(!('vehicle_name' in columns));
  assert.ok(!('quick_win' in columns));
  assert.ok(!('guarantee' in columns));
});

test('T-06 buildOfvWritePayload: puro/determinista — misma entrada → misma salida (R-02)', () => {
  const content = { big_promise: 'BP', urgency: 'U' };
  const a = buildOfvWritePayload(content).columns;
  const b = buildOfvWritePayload(content).columns;
  assert.deepEqual(a, b);
  // sin efectos sobre la entrada
  assert.deepEqual(content, { big_promise: 'BP', urgency: 'U' });
});

/* ================================================================== */
/*  T-07 — ofvFieldsToContent (round-trip, R-04 / DT-01)              */
/* ================================================================== */

test('T-07 ofvFieldsToContent: renames + fold + split + raw_text (R-04)', () => {
  const content = ofvFieldsToContent({
    big_promise: 'BP',
    vehicle_name: 'VN',
    vehicle_steps: 'paso 1\npaso 2', // rename → vehicle_description
    quick_win: 'QW',
    option_a: 'A',
    option_b: 'B',
    option_c: 'C',
    deliverables: 'd1\nd2\nd3',
    guarantee: 'G',
    urgency_scarcity: 'U', // rename → urgency
    social_proof: 's1\ns2'
  });
  assert.equal(content.vehicle_description, 'paso 1\npaso 2');
  assert.equal(content.urgency, 'U');
  assert.ok(!('vehicle_steps' in content));
  assert.ok(!('urgency_scarcity' in content));
  // fold option_a/b/c → decision_frame objeto
  assert.deepEqual(content.decision_frame, {
    option_a: 'A',
    option_b: 'B',
    option_c: 'C'
  });
  // split string → array
  assert.deepEqual(content.deliverables, ['d1', 'd2', 'd3']);
  assert.deepEqual(content.social_proof, ['s1', 's2']);
  // raw_text preservado (resumen legible desde los campos del form)
  assert.equal(typeof content.raw_text, 'string');
  assert.match(content.raw_text as string, /big_promise: BP/);
});

test('T-07 ofvFieldsToContent: fold solo con claves no vacías (DT-01)', () => {
  const content = ofvFieldsToContent({
    option_a: 'A',
    option_b: '',
    option_c: 'C'
  });
  assert.deepEqual(content.decision_frame, { option_a: 'A', option_c: 'C' });
});

test('T-07 ofvFieldsToContent: campos vacíos no ensucian el content (solo-truthy)', () => {
  const content = ofvFieldsToContent({
    big_promise: 'BP',
    vehicle_name: '',
    vehicle_steps: '',
    deliverables: '',
    social_proof: '',
    option_a: '',
    option_b: '',
    option_c: ''
  });
  assert.equal(content.big_promise, 'BP');
  assert.ok(!('vehicle_name' in content));
  assert.ok(!('vehicle_description' in content));
  assert.ok(!('deliverables' in content));
  assert.ok(!('social_proof' in content));
  assert.ok(!('decision_frame' in content));
  // raw_text siempre presente (aunque solo con las claves truthy)
  assert.equal(typeof content.raw_text, 'string');
});

test('T-07 ofvFieldsToContent: split ignora líneas en blanco y trimea', () => {
  const content = ofvFieldsToContent({
    deliverables: '  d1  \n\n  d2 \n   \n'
  });
  assert.deepEqual(content.deliverables, ['d1', 'd2']);
});

/* ================================================================== */
/*  T-08 — byte-equivalencia del route (no-regresión, R-09)          */
/* ================================================================== */

// Oráculo: replica EXACTAMENTE el bucle inline previo del route
// (`route.ts:485-497`) — misma enumeración, orden y condición solo-truthy.
function inlineOracle(parsedContent: Record<string, unknown>) {
  const insertData: Record<string, unknown> = {};
  for (const k of [
    'big_promise',
    'vehicle_name',
    'vehicle_description',
    'quick_win',
    'decision_frame',
    'guarantee',
    'urgency',
    'social_proof',
    'deliverables'
  ]) {
    if (parsedContent[k]) insertData[k] = parsedContent[k];
  }
  return insertData;
}

const byteEqCases: Record<string, unknown>[] = [
  // todas presentes
  {
    big_promise: 'BP',
    vehicle_name: 'VN',
    vehicle_description: 'VD',
    quick_win: 'QW',
    decision_frame: { option_a: 'a', option_b: 'b' },
    guarantee: 'G',
    urgency: 'U',
    social_proof: ['s1', 's2'],
    deliverables: ['d1']
  },
  // subconjunto
  { big_promise: 'BP', quick_win: 'QW', urgency: '' },
  // con jsonb + claves ajenas (deben ignorarse)
  {
    decision_frame: { option_a: 'a' },
    deliverables: ['d1', 'd2'],
    social_proof: ['s1'],
    raw_text: 'no es columna',
    _validation: { is_valid: true }
  },
  // vacío
  {}
];

byteEqCases.forEach((pc, i) => {
  test(`T-08 byte-equivalencia caso ${i}: buildOfvWritePayload.columns === bucle inline (R-09)`, () => {
    const helper = buildOfvWritePayload(pc).columns;
    const oracle = inlineOracle(pc);
    assert.deepEqual(helper, oracle);
    // byte-equivalencia dura: mismo orden de claves → misma serialización.
    assert.equal(JSON.stringify(helper), JSON.stringify(oracle));
  });
});

/* ================================================================== */
/*  T-09 — Source-guard UI: handleApproveOFV usa el helper (R-05/R-11) */
/* ================================================================== */

test('T-09 handleApproveOFV: invoca buildOfvWritePayload + ofvFieldsToContent (R-05)', () => {
  const body = sliceFrom(pageSrc, 'const handleApproveOFV');
  assert.match(body, /ofvFieldsToContent\(ofvFields\)/);
  assert.match(body, /buildOfvWritePayload\(/);
});

test('T-09 handleApproveOFV: el update ya NO es content-only (añade ...columns) (R-05)', () => {
  const body = sliceFrom(pageSrc, 'const handleApproveOFV');
  // update incluye el spread de columnas
  assert.match(body, /\.update\(\{[^}]*\.\.\.columns[^}]*\}\)/);
  // y ya no existe el update content-only con fieldsToContent(ofvFields)
  assert.doesNotMatch(body, /content:\s*fieldsToContent\(ofvFields\)/);
});

test('T-09 handleApproveOFV: status "approved" sigue presente (no-regresión R-11)', () => {
  // F-108/F-109 ampliaron handleApproveOFV (insert-on-first-save + guard +
  // approved_by/at); el logActivity quedó más abajo → ventana ampliada (la
  // aserción no cambia).
  const body = sliceFrom(pageSrc, 'const handleApproveOFV', 2400);
  assert.match(body, /status:\s*'approved'/);
  assert.match(body, /logActivity\(/);
});

/* ================================================================== */
/*  T-10 — Source-guard route: rama ofv usa el helper + F-064/F-065   */
/*         intactos (R-06/R-10)                                        */
/* ================================================================== */

test('T-10 route rama ofv: invoca buildOfvWritePayload (R-06)', () => {
  // F-109: el FK-linking persona_id (prefer approved + fallback) añadió líneas
  // antes de buildOfvWritePayload → ventana ampliada. Intent intacto.
  // F-113: el selector canónico del FK persona_id añadió más líneas en la misma
  // rama → ventana ampliada otra vez. La ASERCIÓN no cambia: solo la ventana.
  const body = sliceFrom(routeSrc, "step === 'ofv' && parsedContent", 2500);
  assert.match(
    body,
    /Object\.assign\(\s*insertData,\s*buildOfvWritePayload\(parsedContent\)\.columns\s*\)/
  );
});

test('T-10 route: ya NO existe el bucle inline `for (const k of [ ... big_promise ... ])` (R-06)', () => {
  assert.doesNotMatch(routeSrc, /for\s*\(const k of \[\s*'big_promise'/);
});

test('T-10 route rama ofv: attachValidation + attachMethodGrounding + persona_id intactos (R-10/R-11)', () => {
  // F-109: FK-linking persona_id (prefer approved) creció la rama → ventana
  // ampliada. persona_id = lp.id y el 422 siguen intactos.
  // F-113: el selector canónico del FK persona_id creció la rama otra vez →
  // ventana ampliada. Las ASERCIONES no cambian: solo la ventana.
  const body = sliceFrom(routeSrc, "step === 'ofv' && parsedContent", 3000);
  assert.match(body, /attachValidation\(/);
  assert.match(body, /insertData\.persona_id = lp\.id/);
  // attachMethodGrounding se aplica justo después de la rama (R-10)
  assert.match(routeSrc, /attachMethodGrounding\(/);
  // 422 por persona faltante intacto (R-11)
  assert.match(body, /status:\s*422/);
});

/* ================================================================== */
/*  T-11 — Source-guard read-fallback en generate-content (R-07/R-08) */
/* ================================================================== */

test('T-11 needsOffer: usa normalizeOffer (read content-first, R-07)', () => {
  // F-109: el tie-break (pickCanonicalOffer sobre approved) añadió líneas antes
  // de normalizeOffer → ventana ampliada. La cadena normalizada intacta.
  const body = sliceFrom(routeSrc, 'if (needsOffer)', 1400);
  assert.match(body, /normalizeOffer\(offer as RawOfferRow\)/);
  // la cadena se construye desde los campos normalizados (`o.`), no crudos
  assert.match(body, /o\.big_promise/);
  assert.match(body, /o\.guarantee/);
});

test('T-11 needsOffer: ya NO usa los accesos crudos `offer.big_promise` en la cadena (R-08)', () => {
  const body = sliceFrom(routeSrc, 'if (needsOffer)', 900);
  assert.doesNotMatch(body, /offer\.big_promise/);
  assert.doesNotMatch(body, /offer\.guarantee/);
});

/* ================================================================== */
/*  T-12 — Source-guard no-regresión downstream/estado (R-11)         */
/* ================================================================== */

test('T-12 normalizeOffer: conserva el orden plana-first (pickString(flat, content)) (DT-03/R-11)', () => {
  const body = sliceFrom(contextSrc, 'export function normalizeOffer', 900);
  // plana primero, content de fallback (sin invertir el orden)
  assert.match(body, /pickString\(offer\.big_promise,\s*c\.big_promise\)/);
  assert.match(body, /pickString\(offer\.vehicle_name,\s*c\.vehicle_name\)/);
});

test('T-12 F-107 write-path single-source intacto; F-109 cruzó la frontera (approved_by/at)', () => {
  // Antes esta prueba asertaba la AUSENCIA de approved_by/at como "frontera F-109".
  // F-109 cruza esa frontera legítimamente: ahora el approve SÍ sella approved_by/at.
  // Lo que F-107 debe preservar (no-regresión) es el write-path single-source:
  // el approve escribe vía el helper (content Y columnas sincronizadas).
  const body = sliceFrom(pageSrc, 'const handleApproveOFV', 2400);
  assert.match(
    body,
    /buildOfvWritePayload\(\s*ofvFieldsToContent\(ofvFields\)/
  );
  // F-109 (no-regresión de F-107): el sello de aprobación ya presente.
  assert.match(body, /approved_by:\s*user\.id/);
});

test('T-12 SIN DDL: el helper no toca migraciones ni SQL', () => {
  assert.doesNotMatch(writePathSrc, /CREATE TABLE|ALTER TABLE|migration/i);
});

/* ================================================================== */
/*  Pureza del seam (R-02): framework-free, sin next/server ni supabase */
/* ================================================================== */

test('write-path.ts es puro: sin next/server, sin cliente supabase, sin process.env', () => {
  assert.doesNotMatch(writePathSrc, /next\/server/);
  assert.doesNotMatch(
    writePathSrc,
    /@supabase|createClient|createServerClient/
  );
  assert.doesNotMatch(writePathSrc, /process\.env/);
  // se importó arriba sin lanzar → node --test-able como seam framework-free.
  assert.equal(typeof buildOfvWritePayload, 'function');
  assert.equal(typeof ofvFieldsToContent, 'function');
});
