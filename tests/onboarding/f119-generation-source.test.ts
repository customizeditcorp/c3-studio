/**
 * F-119 — T-04 — Seam de procedencia `resolveGenerationSource`: los 3 estados + ⭐ fixtures
 * de filas REALES de producción citadas por su `id` (R-20..R-24, R-33, R-34).
 *
 * Unit tests framework-free (`node --test`). Lo que se prueba:
 *   - los 3 estados con sus condiciones EXACTAS, incluida la asimetría: `none-approved`
 *     **no** es un sub-caso de `diverged` (R-21/R-22/R-23);
 *   - ⭐ **R-24 conductual**: para el MISMO conjunto de candidatos, la fila que devuelve el
 *     seam es **idéntica** a la que devuelve **directamente** el selector del generador. Si
 *     divergieran, la señal sería **procedencia falsa** — peor que no señalar nada;
 *   - los 4 casos reales medidos por `SELECT` read-only el 2026-07-27 (§G-5 de
 *     `requirements.md`), que son los mismos que la §6.1 va a observar en vivo (R-33/R-34).
 *
 * **Anti-no-op:** ningún veredicto se hardcodea como constante — el estado se **deriva** de
 * los fixtures, y los fixtures llevan el `id` real de la fila de producción.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGenerationSource,
  type GenerationCandidateRow
} from '../../src/lib/onboarding/generation-source.ts';
import { pickCanonicalContentRow } from '../../src/lib/onboarding/select-canonical-row.ts';
import { pickCanonicalOffer } from '../../src/lib/offers/select-canonical.ts';

/** `content` con exactamente `n` claves útiles (la noción de riqueza de F-113). */
const content = (n: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`campo_${i}`, `valor real ${i}`])
  );

/* ================================================================== */
/*  ⭐ FIXTURES REALES — §G-5, medición read-only 2026-07-27           */
/* ================================================================== */

/**
 * (a) `briefs` / **R & M QTB** `4a59cbff-7124-4bea-9c44-81d9b7f63b0d` — **DIVERGE**.
 * La UI edita `b56d1fa3` (**draft**, 9 claves, la más reciente por `created_at`); el generador
 * consume `45b77a71` (**approved**, 7 claves), la única `approved` del cliente.
 */
const RM_QTB_EDITABLE = { id: 'b56d1fa3', status: 'draft' };
const RM_QTB_APPROVED: GenerationCandidateRow[] = [
  {
    id: '45b77a71',
    version: 1,
    content: content(7),
    updated_at: '2026-05-02T10:00:00Z',
    approved_at: '2026-05-02T10:00:00Z'
  }
];

/**
 * (b) `buyer_personas` / **JD Valley Painting** `1d3b28b1-dce2-4e48-b8ac-a5561b202a6c` —
 * **DIVERGE**. La UI edita `9a5357b6` (**draft**, editado el 2026-07-25 — el borrador vivo que
 * la opción A de DT-01 habría borrado de la pantalla); el generador consume `400dbe18`
 * (**approved**, 1 clave útil).
 */
const JD_VALLEY_PERSONA_EDITABLE = { id: '9a5357b6', status: 'draft' };
const JD_VALLEY_PERSONA_APPROVED: GenerationCandidateRow[] = [
  {
    id: '400dbe18',
    version: 1,
    content: content(1),
    updated_at: '2026-04-19T12:00:00Z',
    approved_at: '2026-04-19T12:00:00Z'
  }
];

/**
 * (c) `offers` / **Customize It** `b016f86b-9791-41f7-ba65-07500aec684e` — **NONE-APPROVED**.
 * 4 drafts, **0 approved** ⇒ el read-path de contexto NO tiene fallback: el generador no
 * recibe la OFV en absoluto. Es la clase más severa.
 */
const CUSTOMIZE_IT_OFV_EDITABLE = { id: 'e682af22', status: 'draft' };
const CUSTOMIZE_IT_OFV_APPROVED: GenerationCandidateRow[] = [];

/**
 * (d) **SCS CLeaning Service** `e24ddff3-4cf3-4e74-b9e6-3f2bc007a600` — **ALINEADO** en las 3
 * tablas: el control de delta-visual-cero (R-34). Alineado **de facto**, como declaró F-113
 * R-35: la fila más reciente coincide con la que el tie-break elige entre las approved en tie.
 */
const SCS_BRIEF_EDITABLE = { id: '874bf5b6', status: 'approved' };
const SCS_BRIEFS_APPROVED: GenerationCandidateRow[] = [
  {
    id: '874bf5b6',
    version: 1,
    content: content(25),
    updated_at: '2026-06-22T09:00:00Z',
    approved_at: '2026-06-22T09:00:00Z'
  },
  {
    id: 'bde29cca',
    version: 1,
    content: content(25),
    updated_at: '2026-04-19T09:00:00Z',
    approved_at: '2026-04-19T09:00:00Z'
  },
  {
    id: '73a3f894',
    version: 1,
    content: content(25),
    updated_at: '2026-04-14T09:00:00Z',
    approved_at: '2026-04-14T09:00:00Z'
  },
  {
    id: '99748e46',
    version: 1,
    content: content(6),
    updated_at: '2026-04-11T09:00:00Z',
    approved_at: '2026-04-11T09:00:00Z'
  }
];

const SCS_PERSONA_EDITABLE = { id: '76b1f28e', status: 'approved' };
const SCS_PERSONAS_APPROVED: GenerationCandidateRow[] = [
  {
    id: '76b1f28e',
    version: 1,
    content: content(26),
    updated_at: '2026-06-22T09:30:00Z',
    approved_at: '2026-06-22T09:30:00Z'
  },
  {
    id: '3c62c1e6',
    version: 1,
    content: content(23),
    updated_at: '2026-04-19T09:30:00Z',
    approved_at: '2026-04-19T09:30:00Z'
  },
  {
    id: 'e8e8c500',
    version: 1,
    content: content(2),
    updated_at: '2026-04-11T09:30:00Z',
    approved_at: '2026-04-11T09:30:00Z'
  }
];

const SCS_OFV_EDITABLE = { id: 'ee346c76', status: 'approved' };
const SCS_OFFERS_APPROVED: GenerationCandidateRow[] = [
  {
    id: 'ee346c76',
    version: 1,
    content: { big_promise: 'Limpieza comercial sin sorpresas' },
    big_promise: 'Limpieza comercial sin sorpresas',
    updated_at: '2026-06-22T10:00:00Z',
    approved_at: '2026-06-22T10:00:00Z'
  }
];

/**
 * (e) `offers` / **JD Valley** — el tie real que F-109 desempata: `a6c66d5c` (REAL) vs
 * `b106ad61` (vacía-shadow). Sirve para probar que el seam **hereda** el criterio del
 * generador en vez de re-implementarlo.
 */
const JD_VALLEY_OFFERS_APPROVED: GenerationCandidateRow[] = [
  {
    id: 'b106ad61',
    version: 1,
    content: {},
    big_promise: '',
    updated_at: '2026-06-30T08:00:00Z',
    approved_at: '2026-06-30T08:00:00Z'
  },
  {
    id: 'a6c66d5c',
    version: 1,
    content: { big_promise: 'Pintura exterior que dura 10 años' },
    big_promise: 'Pintura exterior que dura 10 años',
    updated_at: '2026-05-15T08:00:00Z',
    approved_at: '2026-05-15T08:00:00Z'
  }
];

/* ================================================================== */
/*  R-22 — `diverged` (los 2 casos reales que la §6.1 va a observar)   */
/* ================================================================== */

test('T-04 ⭐ R-22/R-33 `briefs` de R & M QTB: editable `b56d1fa3` (draft) vs canónica `45b77a71` ⇒ DIVERGED', () => {
  const r = resolveGenerationSource({
    artifact: 'brief',
    editable: RM_QTB_EDITABLE,
    approvedCandidates: RM_QTB_APPROVED
  });
  assert.equal(r.state, 'diverged');
  assert.equal(r.canonicalId, '45b77a71');
  assert.equal(r.editableId, 'b56d1fa3');
  assert.notEqual(r.canonicalId, r.editableId);
});

test('T-04 ⭐ R-22/R-33 `buyer_personas` de JD Valley: editable `9a5357b6` vs canónica `400dbe18` ⇒ DIVERGED', () => {
  const r = resolveGenerationSource({
    artifact: 'persona',
    editable: JD_VALLEY_PERSONA_EDITABLE,
    approvedCandidates: JD_VALLEY_PERSONA_APPROVED
  });
  assert.equal(r.state, 'diverged');
  assert.equal(r.canonicalId, '400dbe18');
  assert.equal(r.editableId, '9a5357b6');
  // El borrador vivo NO se pierde: el seam lo reporta, no lo reemplaza (R-25).
  assert.equal(r.editableId, JD_VALLEY_PERSONA_EDITABLE.id);
});

/* ================================================================== */
/*  ⭐ R-21 — `none-approved` NO es un sub-caso de `diverged`           */
/* ================================================================== */

test('T-04 ⭐ R-21/R-33 `offers` de Customize It (4 drafts, 0 approved) ⇒ NONE-APPROVED, no `diverged`', () => {
  const r = resolveGenerationSource({
    artifact: 'offer',
    editable: CUSTOMIZE_IT_OFV_EDITABLE,
    approvedCandidates: CUSTOMIZE_IT_OFV_APPROVED
  });
  assert.equal(
    r.state,
    'none-approved',
    'sin fila approved el read-path de contexto NO emite el bloque (no hay fallback): ' +
      'el generador no recibe la OFV en absoluto. Colapsarlo en `diverged` perdería ' +
      'exactamente la información que el operador necesita.'
  );
  assert.notEqual(r.state, 'diverged');
  assert.equal(r.canonical, null);
  assert.equal(r.canonicalId, null);
  assert.equal(r.editableId, 'e682af22');
});

test('T-04 R-21 `none-approved` si y SÓLO si no hay candidatos — en las 3 clases y con editable ausente', () => {
  for (const artifact of ['brief', 'persona', 'offer'] as const) {
    for (const candidates of [[], null, undefined]) {
      const r = resolveGenerationSource({
        artifact,
        editable: { id: 'cualquiera' },
        approvedCandidates: candidates
      });
      assert.equal(r.state, 'none-approved');
    }
    // Sin fila editable y sin approved: sigue siendo `none-approved`, no otra cosa.
    const sinNada = resolveGenerationSource({
      artifact,
      editable: null,
      approvedCandidates: []
    });
    assert.equal(sinNada.state, 'none-approved');
    assert.equal(sinNada.editableId, null);
  }
});

test('T-04 R-21 con AL MENOS un candidato el estado NUNCA es `none-approved`', () => {
  const r = resolveGenerationSource({
    artifact: 'brief',
    editable: null,
    approvedCandidates: RM_QTB_APPROVED
  });
  assert.notEqual(r.state, 'none-approved');
  assert.equal(r.state, 'diverged'); // hay canónica y la editable no existe ⇒ difieren
});

/* ================================================================== */
/*  R-23 — `aligned` (el control de delta visual cero, R-34)           */
/* ================================================================== */

test('T-04 ⭐ R-23/R-34 SCS está ALINEADO en las 3 tablas (control: no debe aparecer aviso)', () => {
  const casos = [
    {
      artifact: 'brief' as const,
      editable: SCS_BRIEF_EDITABLE,
      approvedCandidates: SCS_BRIEFS_APPROVED,
      esperado: '874bf5b6'
    },
    {
      artifact: 'persona' as const,
      editable: SCS_PERSONA_EDITABLE,
      approvedCandidates: SCS_PERSONAS_APPROVED,
      esperado: '76b1f28e'
    },
    {
      artifact: 'offer' as const,
      editable: SCS_OFV_EDITABLE,
      approvedCandidates: SCS_OFFERS_APPROVED,
      esperado: 'ee346c76'
    }
  ];
  for (const c of casos) {
    const r = resolveGenerationSource(c);
    assert.equal(
      r.state,
      'aligned',
      `SCS/${c.artifact} debería estar alineado (delta visual cero, R-34)`
    );
    assert.equal(r.canonicalId, c.esperado);
    assert.equal(r.canonicalId, r.editableId);
  }
});

/* ================================================================== */
/*  ⭐ R-24 — el seam usa EL MISMO selector que el generador            */
/* ================================================================== */

/**
 * La prueba conductual de R-24: para el mismo conjunto de candidatos, la fila del seam es
 * **la misma instancia** que devuelve el selector del generador llamado directamente. Si el
 * seam aplicara un criterio propio (p. ej. "la más reciente"), acá se vería rojo — y en
 * producción sería una **procedencia falsa** emitida con toda confianza.
 */
test('T-04 ⭐ R-24 brief/persona: la canónica del seam === `pickCanonicalContentRow` directo', () => {
  for (const [artifact, candidates] of [
    ['brief', SCS_BRIEFS_APPROVED],
    ['brief', RM_QTB_APPROVED],
    ['persona', SCS_PERSONAS_APPROVED],
    ['persona', JD_VALLEY_PERSONA_APPROVED]
  ] as const) {
    const r = resolveGenerationSource({
      artifact,
      editable: null,
      approvedCandidates: candidates
    });
    const directo = pickCanonicalContentRow(candidates);
    assert.equal(
      r.canonical,
      directo,
      `${artifact}: el seam eligió otra fila que el selector del generador ⇒ procedencia falsa`
    );
  }
});

test('T-04 ⭐ R-24 offers: la canónica del seam === `pickCanonicalOffer` directo (tie real de JD Valley)', () => {
  for (const candidates of [
    SCS_OFFERS_APPROVED,
    JD_VALLEY_OFFERS_APPROVED
  ] as const) {
    const r = resolveGenerationSource({
      artifact: 'offer',
      editable: null,
      approvedCandidates: candidates
    });
    const directo = pickCanonicalOffer(candidates);
    assert.equal(r.canonical, directo);
  }
  // Y hereda el criterio: la OFV REAL gana a la vacía-shadow, aun siendo más vieja.
  const jd = resolveGenerationSource({
    artifact: 'offer',
    editable: { id: 'b106ad61' },
    approvedCandidates: JD_VALLEY_OFFERS_APPROVED
  });
  assert.equal(jd.canonicalId, 'a6c66d5c');
  assert.equal(jd.state, 'diverged');
});

test('T-04 ⭐ R-24 el selector de `offer` NO se sustituye por el de brief/persona (criterios distintos)', () => {
  // `pickCanonicalContentRow` desempata por RIQUEZA; `pickCanonicalOffer` por `big_promise`
  // no vacío. Sobre el tie de JD Valley ambos coinciden, pero el seam debe delegar en el que
  // corresponde a la clase — no unificar criterios (F-113 DT-02c: NO se unificaron).
  const comoOffer = resolveGenerationSource({
    artifact: 'offer',
    editable: null,
    approvedCandidates: JD_VALLEY_OFFERS_APPROVED
  });
  assert.equal(
    comoOffer.canonical,
    pickCanonicalOffer(JD_VALLEY_OFFERS_APPROVED)
  );
  assert.notEqual(
    pickCanonicalOffer,
    pickCanonicalContentRow,
    'son dos selectores distintos y así deben quedar (F-113 R-09)'
  );
});

/* ================================================================== */
/*  Pureza y no-destructividad                                         */
/* ================================================================== */

test('T-04 R-20 el seam es PURO: no muta candidatos ni fila editable, y no lanza', () => {
  const candidatos = SCS_BRIEFS_APPROVED.map((r) => ({ ...r }));
  const antes = JSON.stringify(candidatos);
  const editable = { ...SCS_BRIEF_EDITABLE };
  assert.doesNotThrow(() =>
    resolveGenerationSource({
      artifact: 'brief',
      editable,
      approvedCandidates: candidatos
    })
  );
  assert.equal(JSON.stringify(candidatos), antes);
  assert.deepEqual(editable, SCS_BRIEF_EDITABLE);
  assert.equal(candidatos.length, 4);
});

test('T-04 R-20 el resultado es determinista e independiente del orden de llegada', () => {
  const a = resolveGenerationSource({
    artifact: 'brief',
    editable: SCS_BRIEF_EDITABLE,
    approvedCandidates: SCS_BRIEFS_APPROVED
  });
  const b = resolveGenerationSource({
    artifact: 'brief',
    editable: SCS_BRIEF_EDITABLE,
    approvedCandidates: [...SCS_BRIEFS_APPROVED].reverse()
  });
  assert.equal(a.state, b.state);
  assert.equal(a.canonicalId, b.canonicalId);
});

test('T-04 R-30 el seam clasifica y NADA más: no expone ninguna afordancia de escritura', () => {
  const r = resolveGenerationSource({
    artifact: 'persona',
    editable: JD_VALLEY_PERSONA_EDITABLE,
    approvedCandidates: JD_VALLEY_PERSONA_APPROVED
  });
  assert.deepEqual(Object.keys(r).sort(), [
    'canonical',
    'canonicalId',
    'editableId',
    'state'
  ]);
  for (const v of Object.values(r)) {
    assert.notEqual(typeof v, 'function');
  }
});
