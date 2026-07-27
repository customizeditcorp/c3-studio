/**
 * F-120 — T-05 — ⭐ **EL ANTI-NO-OP**, offline y determinista, con **filas reales**
 * (R-02, R-03, R-09, R-10, R-14, R-17, R-34, R-35, R-36).
 *
 * ## Por qué este archivo es el corazón de la feature
 *
 * La restricción de diseño no negociable de F-120 es: **mostrar contenido obliga al selector
 * canónico**. Hoy la ficha hace `.select('status').eq('status','approved').limit(1)` — correcto
 * para EXISTENCIA, inaceptable para CONTENIDO: sin `ORDER BY` total la ficha mostraría UNA fila
 * y el generador consumiría OTRA, que es **la procedencia falsa que F-119 acaba de eliminar**.
 *
 * Y el caso no es hipotético: está **armado en producción**. `SELECT` read-only (2026-07-27,
 * `requirements.md` §G-2) sobre `offers WHERE status='approved'`:
 *
 * | cliente | `id` | `version` | `updated_at` | `big_promise` | nº claves |
 * |---|---|---|---|---|---|
 * | JD Valley | `a6c66d5c-…` | 1 | **2026-07-09** | **sí** | **5** |
 * | JD Valley | `b106ad61-…` | 1 | **2026-07-25** | **no** | **1** |
 *
 * **La SHADOW VACÍA es la MÁS RECIENTE.** ⇒ un `.limit(1)` sin orden, o un
 * `ORDER BY updated_at desc`, devuelven **la OFV VACÍA**. `pickCanonicalOffer` (F-109) gana
 * **por riqueza antes que por fecha**: empatadas en `version`, vence la que tiene contenido
 * estratégico real. Por eso funciona — y por eso el fallo, si ocurriera, sería **visible a
 * simple vista** en la ficha desplegada (T-21, `[LIVE]`).
 *
 * ## Modalidad (`docs/verification.md` §6)
 *
 * Acá se prueba **el seam** con las filas reales: determinista, offline, sin red. Que la ficha
 * DESPLEGADA muestre `a6c66d5c` es conductual y vive en T-21 `[LIVE §6.1]`, gateado y **no
 * ejecutado** en este tramo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGenerationSource,
  type GenerationCandidateRow
} from '../../src/lib/onboarding/generation-source.ts';

/* ================================================================== */
/*  Fixtures de filas REALES (§G-2 / §G-3), citando `id`               */
/* ================================================================== */

const JD_VALLEY = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c';
const SCS = 'e24ddff3-4cf3-4e74-b9e6-3f2bc007a600';
const CUSTOMIZE_IT = 'b016f86b-9791-41f7-ba65-07500aec684e';
const RM_QTB = '4a59cbff-7124-4bea-9c44-81d9b7f63b0d';

/** JD Valley — la OFV **REAL**: 5 claves, `big_promise` presente, `updated_at` **2026-07-09**. */
const A6C66D5C: GenerationCandidateRow = {
  id: 'a6c66d5c-b7ac-4153-b056-eb0410ecc93c',
  version: 1,
  updated_at: '2026-07-09T00:00:00.000Z',
  approved_at: null, // §G-4: `approved_at` es NULL en las 3 filas `approved` de producción
  big_promise:
    'Presencia digital completa en 90 días con el Sistema VIP™ — sin frenar tu operación',
  content: {
    big_promise:
      'Presencia digital completa en 90 días con el Sistema VIP™ — sin frenar tu operación',
    vehicle_name: 'Sistema VIP™',
    deliverables: 'GBP verificado y optimizado\nWebsite con SEO local',
    urgency_scarcity: 'Cupos limitados este mes',
    social_proof: 'Clientes satisfechos en el condado'
  }
};

/**
 * JD Valley — la **SHADOW VACÍA**: 1 clave, `big_promise` vacío, y **`updated_at` MÁS
 * RECIENTE (2026-07-25)** que la real. Es el fixture que discrimina las dos formas naturales
 * de equivocarse: *"la primera fila que devuelva la DB"* y *"la más reciente"*.
 */
const B106AD61: GenerationCandidateRow = {
  id: 'b106ad61-0d6e-474d-b8b0-940b894cb8ca',
  version: 1,
  updated_at: '2026-07-25T00:00:00.000Z',
  approved_at: null,
  big_promise: '',
  content: { raw_text: '' }
};

/** SCS — 1 sola `approved`, 6 claves. La fila editable es **la misma** ⇒ `aligned` (§G-3). */
const EE346C76: GenerationCandidateRow = {
  id: 'ee346c76-a306-400d-933a-b6ed11bbda1d',
  version: 1,
  updated_at: '2026-07-21T00:00:00.000Z',
  approved_at: null,
  big_promise: 'Tu negocio de limpieza visible en Google en 60 días',
  content: {
    big_promise: 'Tu negocio de limpieza visible en Google en 60 días',
    vehicle_name: 'Método CLEAN™',
    vehicle_steps: '1. Verificación GBP\n2. Identidad\n3. Presencia web',
    quick_win: 'GBP activo en 7 días',
    guarantee: 'Si no aparecés en el mapa en 60 días, seguimos sin costo',
    deliverables: 'GBP verificado\nFotos con alt-text'
  }
};

/** Customize It — la fila editable es un **draft** (`e682af22`); hay 4 filas y **0 approved**. */
const CUSTOMIZE_IT_EDITABLE = { id: 'e682af22-0000-0000-0000-000000000000' };

/**
 * ⚠️ **El veredicto NO se hardcodea.** Se **deriva del fixture**: entre candidatos empatados en
 * `version`, la fila con contenido estratégico real (`big_promise` no vacío) es la que el
 * criterio de F-109 debe elegir. Si alguien "arreglara" el test poniendo el `id` a mano, el
 * test dejaría de probar el criterio y pasaría a probar una constante.
 */
const conContenidoReal = (
  rows: readonly GenerationCandidateRow[]
): GenerationCandidateRow => {
  const reales = rows.filter((r) => {
    const plano = typeof r.big_promise === 'string' ? r.big_promise : '';
    const c = r.content as Record<string, unknown> | null;
    const anidado =
      c && typeof c === 'object' && typeof c.big_promise === 'string'
        ? c.big_promise
        : '';
    return plano.trim().length > 0 || anidado.trim().length > 0;
  });
  assert.equal(
    reales.length,
    1,
    'el fixture debe tener UNA sola fila con contenido real'
  );
  return reales[0];
};

const maxPorUpdatedAt = (
  rows: readonly GenerationCandidateRow[]
): GenerationCandidateRow =>
  [...rows].sort((a, b) => (a.updated_at! < b.updated_at! ? 1 : -1))[0];

/** Las 2 permutaciones posibles del par de candidatos de JD Valley. */
const PERMUTACIONES: GenerationCandidateRow[][] = [
  [A6C66D5C, B106AD61],
  [B106AD61, A6C66D5C]
];

/* ================================================================== */
/*  ⭐⭐ R-34 / R-02 — EL ANTI-NO-OP                                    */
/* ================================================================== */

test('T-05 ⭐⭐ R-34/R-02 JD Valley: el seam elige `a6c66d5c` (la REAL), NUNCA `b106ad61` (la shadow vacía)', () => {
  const esperada = conContenidoReal([A6C66D5C, B106AD61]);
  assert.equal(
    esperada.id,
    'a6c66d5c-b7ac-4153-b056-eb0410ecc93c',
    'ancla documental: la fila real medida en §G-2'
  );
  for (const candidatos of PERMUTACIONES) {
    const r = resolveGenerationSource({
      artifact: 'offer',
      editable: { id: A6C66D5C.id }, // §G-3: la editable de JD Valley ES `a6c66d5c`
      approvedCandidates: candidatos
    });
    assert.equal(
      r.canonicalId,
      esperada.id,
      `orden de llegada [${candidatos.map((c) => c.id.slice(0, 8)).join(', ')}]: el ` +
        'resultado NO puede depender del orden en que la DB devuelva las filas'
    );
  }
});

test('T-05 ⭐⭐ R-34 anti-no-op: NO es la primera del array, NO es la última, NO es la de `updated_at` máximo', () => {
  const esperada = conContenidoReal([A6C66D5C, B106AD61]);

  // (1) "la primera fila que devuelva la DB" — la permutación con la shadow al frente.
  const shadowPrimero = [B106AD61, A6C66D5C];
  const r1 = resolveGenerationSource({
    artifact: 'offer',
    editable: { id: A6C66D5C.id },
    approvedCandidates: shadowPrimero
  });
  assert.notEqual(
    r1.canonicalId,
    shadowPrimero[0].id,
    'MUERDE contra `candidates[0]`: con la shadow al frente, elegir la primera devolvería ' +
      'la OFV VACÍA y la ficha aparecería prácticamente vacía'
  );

  // (2) "la última fila" — la permutación con la shadow al final.
  const shadowUltimo = [A6C66D5C, B106AD61];
  const r2 = resolveGenerationSource({
    artifact: 'offer',
    editable: { id: A6C66D5C.id },
    approvedCandidates: shadowUltimo
  });
  assert.notEqual(
    r2.canonicalId,
    shadowUltimo[shadowUltimo.length - 1].id,
    'MUERDE contra `candidates.at(-1)`'
  );

  // (3) "la más reciente" — el modo de fallo MÁS natural, y el que el fixture existe para matar.
  const masReciente = maxPorUpdatedAt([A6C66D5C, B106AD61]);
  assert.equal(
    masReciente.id,
    B106AD61.id,
    'el fixture sólo discrimina si la shadow ES la más reciente (§G-2: 2026-07-25 > 2026-07-09)'
  );
  assert.notEqual(
    r2.canonicalId,
    masReciente.id,
    'MUERDE contra `ORDER BY updated_at desc`: el criterio de F-109 gana por RIQUEZA ' +
      'antes que por FECHA — por eso funciona acá'
  );
  assert.equal(r2.canonicalId, esperada.id);
});

test('T-05 R-02 la fila que se muestra trae el CONTENIDO de `a6c66d5c` (no un id suelto)', () => {
  const r = resolveGenerationSource({
    artifact: 'offer',
    editable: { id: A6C66D5C.id },
    approvedCandidates: [B106AD61, A6C66D5C]
  });
  assert.ok(r.canonical, 'el seam devuelve la fila completa, no sólo su `id`');
  assert.equal(r.canonical!.version, 1);
  assert.equal(
    (r.canonical!.content as Record<string, unknown>).big_promise,
    A6C66D5C.big_promise
  );
  // §G-4 — `approved_at` es NULL ⇒ la vista NO puede prometer fecha de aprobación (R-07).
  assert.equal(r.canonical!.approved_at ?? null, null);
});

/* ================================================================== */
/*  R-14 / R-16 — los 3 estados sobre las mismas filas reales          */
/* ================================================================== */

test('T-05 R-14 JD Valley hoy es `aligned` (§G-3): la editable ES la canónica', () => {
  const r = resolveGenerationSource({
    artifact: 'offer',
    editable: { id: A6C66D5C.id },
    approvedCandidates: [A6C66D5C, B106AD61]
  });
  assert.equal(r.state, 'aligned');
  assert.equal(r.editableId, r.canonicalId);
});

test('T-05 ⭐ R-14 `diverged`: con un borrador más reciente, la ficha sigue mostrando `a6c66d5c`', () => {
  // Hoy NO existe ningún cliente con `offers` en `diverged` (§G-3) ⇒ la rama se cubre acá,
  // OFFLINE y de forma determinista; su observación LIVE es opcional y gateada (T-24).
  const borrador = { id: '9a5357b6-0000-0000-0000-000000000000' };
  const r = resolveGenerationSource({
    artifact: 'offer',
    editable: borrador,
    approvedCandidates: [B106AD61, A6C66D5C]
  });
  assert.equal(r.state, 'diverged');
  assert.equal(
    r.canonicalId,
    A6C66D5C.id,
    'divergir NO cambia cuál es la canónica: el borrador no alimenta la generación'
  );
  assert.equal(r.editableId, borrador.id);
});

test('T-05 R-36 SCS `e24ddff3…`: 1 approved, editable = la misma ⇒ `aligned`, sin divergencia', () => {
  assert.ok(SCS.length > 0);
  const r = resolveGenerationSource({
    artifact: 'offer',
    editable: { id: EE346C76.id },
    approvedCandidates: [EE346C76]
  });
  assert.equal(r.state, 'aligned');
  assert.equal(r.canonicalId, 'ee346c76-a306-400d-933a-b6ed11bbda1d');
});

/* ================================================================== */
/*  R-09 / R-10 / R-35 — la degradación y sus DOS sub-casos            */
/* ================================================================== */

test('T-05 ⭐ R-35/R-10 Customize It `b016f86b…`: 4 drafts / 0 approved ⇒ `none-approved` CON borradores', () => {
  assert.ok(CUSTOMIZE_IT.length > 0);
  const r = resolveGenerationSource({
    artifact: 'offer',
    editable: CUSTOMIZE_IT_EDITABLE,
    approvedCandidates: []
  });
  assert.equal(
    r.state,
    'none-approved',
    'sin fila `approved` el generador NO recibe el artefacto: los read-paths de contexto ' +
      'no tienen fallback (F-119 R-21)'
  );
  assert.equal(r.canonical, null, 'R-09: no hay contenido que mostrar');
  // R-10, sub-caso (i): la ficha debe poder decir "existen borradores sin aprobar".
  assert.notEqual(r.editableId, null);
  assert.equal(r.editableId, CUSTOMIZE_IT_EDITABLE.id);
});

test('T-05 ⭐ R-35/R-10 R & M QTB `4a59cbff…`: NINGUNA fila ⇒ `none-approved` SIN borradores', () => {
  assert.ok(RM_QTB.length > 0);
  for (const editable of [null, undefined]) {
    const r = resolveGenerationSource({
      artifact: 'offer',
      editable,
      approvedCandidates: []
    });
    assert.equal(r.state, 'none-approved');
    assert.equal(r.canonical, null);
    // R-10, sub-caso (ii): "este cliente no tiene ninguna OFV" — información distinta,
    // y colapsarla con el sub-caso (i) borra lo que le dice al operador qué hacer.
    assert.equal(r.editableId, null);
  }
});

test('T-05 R-10 los dos sub-casos de `none-approved` son DISTINGUIBLES por el resultado del seam', () => {
  const conBorradores = resolveGenerationSource({
    artifact: 'offer',
    editable: CUSTOMIZE_IT_EDITABLE,
    approvedCandidates: []
  });
  const sinNada = resolveGenerationSource({
    artifact: 'offer',
    editable: null,
    approvedCandidates: []
  });
  assert.equal(conBorradores.state, sinNada.state);
  assert.notEqual(
    conBorradores.editableId === null,
    sinNada.editableId === null,
    'si los dos sub-casos fueran indistinguibles, la degradación honesta sería imposible'
  );
});

/* ================================================================== */
/*  ⭐ R-17 — coherencia POR CONSTRUCCIÓN entre ficha y onboarding      */
/* ================================================================== */

/**
 * ⭐ **R-17.** Si la ficha y la superficie de onboarding pudieran computar estados distintos
 * para el mismo cliente, la señal sería **procedencia falsa** — la imagen especular del
 * defecto que F-120 vino a cerrar. Las dos superficies alimentan **el mismo seam** con **los
 * mismos filtros** y **la misma definición de fila editable**, así que su resultado es el
 * mismo **por construcción**, no por disciplina.
 *
 * Acá se modelan las DOS entradas por separado — la de la ficha (proyección
 * `id, version, updated_at, content, big_promise, approved_at`) y la del núcleo (idéntica,
 * F-119 `page.tsx:666-671`) — y se exige que el seam devuelva **exactamente lo mismo**. Que
 * ambos call-sites usen esta proyección y estos filtros lo fija el source-guard
 * `f120-ficha-source-guards` (R-04/R-15) y `f119-ui-source-guards` T-10 (R-25/R-26).
 */
test('T-05 ⭐ R-17 ficha y onboarding NO pueden clasificar distinto: mismo seam, mismos filtros, mismo resultado', () => {
  const escenarios: {
    nombre: string;
    editable: { id: string } | null;
    approved: GenerationCandidateRow[];
  }[] = [
    {
      nombre: `JD Valley ${JD_VALLEY}`,
      editable: { id: A6C66D5C.id },
      approved: [B106AD61, A6C66D5C]
    },
    {
      nombre: `SCS ${SCS}`,
      editable: { id: EE346C76.id },
      approved: [EE346C76]
    },
    {
      nombre: `Customize It ${CUSTOMIZE_IT}`,
      editable: CUSTOMIZE_IT_EDITABLE,
      approved: []
    },
    { nombre: `R & M QTB ${RM_QTB}`, editable: null, approved: [] },
    {
      nombre: 'JD Valley con borrador nuevo (diverged)',
      editable: { id: '9a5357b6-0000-0000-0000-000000000000' },
      approved: [B106AD61, A6C66D5C]
    }
  ];

  for (const e of escenarios) {
    // La ficha construye su entrada desde SUS dos consultas…
    const desdeLaFicha = resolveGenerationSource({
      artifact: 'offer',
      editable: e.editable,
      approvedCandidates: e.approved.map((r) => ({ ...r }))
    });
    // …y la superficie de onboarding desde LAS SUYAS, en otro orden de llegada.
    const desdeOnboarding = resolveGenerationSource({
      artifact: 'offer',
      editable: e.editable,
      approvedCandidates: [...e.approved].reverse().map((r) => ({ ...r }))
    });
    assert.equal(
      desdeLaFicha.state,
      desdeOnboarding.state,
      `${e.nombre}: los dos estados DEBEN coincidir — si no, la señal es procedencia falsa`
    );
    assert.equal(
      desdeLaFicha.canonicalId,
      desdeOnboarding.canonicalId,
      `${e.nombre}: las dos superficies DEBEN nombrar la misma fila canónica`
    );
    // El veredicto se deriva, no se declara: cuando hay candidatos, es la de contenido real.
    if (e.approved.length > 0) {
      assert.equal(desdeLaFicha.canonicalId, conContenidoReal(e.approved).id);
    } else {
      assert.equal(desdeLaFicha.state, 'none-approved');
    }
  }
});

test('T-05 R-03 el seam NO muta los candidatos que recibe (la ficha puede reusarlos para renderizar)', () => {
  const candidatos = [B106AD61, A6C66D5C];
  const antes = JSON.parse(JSON.stringify(candidatos));
  resolveGenerationSource({
    artifact: 'offer',
    editable: { id: A6C66D5C.id },
    approvedCandidates: candidatos
  });
  assert.deepEqual(JSON.parse(JSON.stringify(candidatos)), antes);
});
