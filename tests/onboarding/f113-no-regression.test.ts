/**
 * F-113 — T-09 — NO-REGRESIÓN **CONDUCTUAL** (R-18, R-19, R-05).
 *
 * **Modalidad obligatoria (`docs/verification.md §6`, DT-07):** la claim es *"cuando el
 * cliente NO tiene empate, la salida es byte-idéntica al estado post-F-112"*. Eso se
 * prueba **por comportamiento** (`assert.equal` sobre la fila elegida y sobre el STRING
 * compuesto), **NUNCA** por source-guard ni por `grep`: comprobar que la fuente "sigue
 * mencionando X" no prueba que la salida sea idéntica (falso PASS que DT-6 de F-111 y
 * R-16 de F-112 ya prohibieron).
 *
 * Estrategia: se replica acá (a) el comportamiento PREVIO del read-path
 * (`.order('version', desc).limit(1)`) y (b) la composición EXACTA del bloque de
 * contexto de `generate-content/route.ts`, y se asevera que el selector de F-113
 * produce **el mismo string**. En producción **solo SCS tiene empates**; el resto de
 * los clientes debe comportarse igual que antes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickCanonicalContentRow,
  type CanonicalContentRow
} from '../../src/lib/onboarding/select-canonical-row.ts';
import {
  buildPersonaMethodBlock,
  type RawPersonaRow
} from '../../src/lib/personas/method-context.ts';

type Row = CanonicalContentRow & { raw_text?: string | null };

/**
 * Comportamiento PREVIO a F-113 del read-path: Postgres aplicaba
 * `.order('version', { ascending: false }).limit(1).maybeSingle()`. Con **una sola**
 * fila candidata (o con versiones distintas) el resultado es inequívoco; solo el
 * EMPATE de `version` lo volvía arbitrario — y ése es el único caso que F-113 cambia.
 */
function legacyPick(rows: Row[]): Row | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => b.version - a.version)[0];
}

/** Composición EXACTA del bloque de brief en `generate-content/route.ts`. */
function composeBriefBlock(brief: Row | null): string {
  if (!brief) return '';
  return (
    '\n\n## BRIEF DEL NEGOCIO (APROBADO)\n' +
    (brief.raw_text || JSON.stringify(brief.content))
  );
}

/** Composición EXACTA del bloque de persona (blob F-112 incluido). */
function composePersonaBlock(persona: Row | null, step: string): string {
  if (!persona) return '';
  return (
    '\n\n## BUYER PERSONA (APROBADO)\n' +
    (persona.raw_text || JSON.stringify(persona.content)) +
    buildPersonaMethodBlock({ step, persona: persona as RawPersonaRow })
  );
}

const STEPS = [
  'ofv',
  'gbp_description',
  'gbp_posts',
  'campaign_copy',
  'website_home',
  'website_service',
  'website_location',
  'nurturing',
  'social_content'
];

/* ================================================================== */
/*  R-19 — control anclado en un caso REAL sin empate: JD Valley       */
/* ================================================================== */

/**
 * `400dbe18` — la ÚNICA `buyer_persona` `approved` de JD Valley (sin empate). Fila
 * real pre-F-106: todos los campos canónicos en `[PENDIENTE]` (R-29: fixture derivado
 * de la fila real, citando su id). Es deliberadamente una fila **pobre**: si el
 * selector "filtrara" en vez de "desempatar", acá se notaría.
 */
function jdValleyPersona(): Row {
  return {
    id: '400dbe18',
    version: 1,
    updated_at: '2026-06-10T09:00:00.000Z',
    content: {
      main_pain: '[PENDIENTE]',
      dream_result: '[PENDIENTE]',
      objection_price: '[PENDIENTE]',
      raw_text: ''
    },
    raw_text: 'PERFIL DEL CLIENTE IDEAL — JD Valley Roofing\n(volcado crudo)'
  };
}

test('T-09 R-19 JD Valley `400dbe18` (único approved, SIN empate) → el selector elige LA MISMA fila que el comportamiento previo', () => {
  const rows = [jdValleyPersona()];
  const antes = legacyPick(rows);
  const despues = pickCanonicalContentRow(rows);
  assert.equal(despues, antes);
  assert.equal(despues?.id, '400dbe18');
});

test('T-09 ⭐ R-18/R-19 JD Valley: el BLOQUE DE CONTEXTO compuesto es BYTE-IDÉNTICO en los 9 steps (conductual, no grep)', () => {
  const rows = [jdValleyPersona()];
  for (const step of STEPS) {
    assert.equal(
      composePersonaBlock(pickCanonicalContentRow(rows), step),
      composePersonaBlock(legacyPick(rows), step),
      `el bloque de persona cambió para el step ${step}`
    );
  }
});

/* ================================================================== */
/*  R-18 — byte-identidad con una sola fila approved (caso general)    */
/* ================================================================== */

test('T-09 ⭐ R-18 UNA sola fila approved: brief y persona byte-idénticos, en 4 formas de almacenamiento distintas', () => {
  // Las 4 formas reales que conviven en producción (grounding F-112): raw_text en la
  // columna, raw_text en `content`, ambos, ninguno.
  const formas: Row[] = [
    {
      id: 'f1',
      version: 1,
      updated_at: '2026-05-01T00:00:00.000Z',
      content: { business_name: 'SCS Cleaning', city: 'Miami' },
      raw_text: '- business_name: SCS Cleaning\n- city: Miami'
    },
    {
      id: 'f2',
      version: 3,
      updated_at: '2026-05-02T00:00:00.000Z',
      content: { business_name: 'JD Valley', raw_text: '# Bloque 1 — Negocio' }
    },
    { id: 'f3', version: 1, content: null, raw_text: 'solo columna' },
    { id: 'f4', version: 1, content: {}, raw_text: '' }
  ];
  for (const fila of formas) {
    const rows = [fila];
    assert.equal(pickCanonicalContentRow(rows), legacyPick(rows));
    assert.equal(
      composeBriefBlock(pickCanonicalContentRow(rows)),
      composeBriefBlock(legacyPick(rows)),
      `el bloque de brief cambió para la forma ${fila.id}`
    );
    for (const step of STEPS) {
      assert.equal(
        composePersonaBlock(pickCanonicalContentRow(rows), step),
        composePersonaBlock(legacyPick(rows), step),
        `el bloque de persona cambió para la forma ${fila.id} / step ${step}`
      );
    }
  }
});

test('T-09 R-18 SIN empate de `version`: gana la versión mayor, exactamente como antes (aunque sea la más pobre)', () => {
  // Éste es el caso que demuestra que la riqueza NO se cuela por encima de `version`:
  // si lo hiciera, la no-regresión de todo cliente versionado se rompería en silencio.
  const rows: Row[] = [
    {
      id: 'vieja-rica',
      version: 1,
      updated_at: '2026-07-25T00:00:00.000Z',
      content: { a: '1', b: '2', c: '3', d: '4' }
    },
    {
      id: 'nueva-pobre',
      version: 2,
      updated_at: '2026-01-01T00:00:00.000Z',
      content: {}
    }
  ];
  assert.equal(pickCanonicalContentRow(rows)?.id, legacyPick(rows)?.id);
  assert.equal(pickCanonicalContentRow(rows)?.id, 'nueva-pobre');
  assert.equal(
    composeBriefBlock(pickCanonicalContentRow(rows)),
    composeBriefBlock(legacyPick(rows))
  );
});

test('T-09 R-18 sin ninguna fila approved: `null` ⇒ el bloque NO se emite, igual que antes (R-06)', () => {
  assert.equal(pickCanonicalContentRow([] as Row[]), legacyPick([]));
  assert.equal(composeBriefBlock(pickCanonicalContentRow([] as Row[])), '');
  assert.equal(
    composePersonaBlock(pickCanonicalContentRow([] as Row[]), 'ofv'),
    ''
  );
});

/* ================================================================== */
/*  R-05 — la no-regresión no depende del orden de llegada             */
/* ================================================================== */

test('T-09 R-05 sin empate, el resultado es el mismo llegue en el orden que llegue', () => {
  const rows: Row[] = [
    {
      id: 'a',
      version: 1,
      content: { x: '1' },
      updated_at: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'b',
      version: 4,
      content: { x: '1' },
      updated_at: '2026-01-02T00:00:00.000Z'
    },
    {
      id: 'c',
      version: 2,
      content: { x: '1' },
      updated_at: '2026-01-03T00:00:00.000Z'
    }
  ];
  assert.equal(pickCanonicalContentRow(rows)?.id, 'b');
  assert.equal(pickCanonicalContentRow([...rows].reverse())?.id, 'b');
  assert.equal(pickCanonicalContentRow([rows[1], rows[0], rows[2]])?.id, 'b');
});
