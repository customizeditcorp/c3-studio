/**
 * F-113 — T-07 / T-08 — Selector puro `pickCanonicalContentRow` + `contentRichness`.
 *
 * Unit tests framework-free (`node --test`) del seam puro. Verifica el criterio
 * DT-01(a) (`version desc → riqueza desc → updated_at desc → id asc`), la noción de
 * riqueza (R-03/R-04), la pureza y el determinismo total (R-05..R-07) y —lo decisivo—
 * el **criterio anti-no-op anclado en las filas REALES de producción citadas por su
 * `id`** (R-26/R-27/R-28/R-29, lección CL-096: una feature con forma inventada puede
 * quedar INERTE con todos sus tests en verde).
 *
 * El selector NO borra ni muta filas (R-23, espejo de R-16 de F-109).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentRichness,
  pickCanonicalContentRow,
  type CanonicalContentRow
} from '../../src/lib/onboarding/select-canonical-row.ts';
import { cleanScalar } from '../../src/lib/method-context/pending.ts';

/* ================================================================== */
/*  T-08 ⭐ ANTI-NO-OP — filas REALES de producción (R-26..R-29)       */
/* ================================================================== */

/**
 * (a) `buyer_personas` / SCS Cleaning — las **3 filas reales** `approved`, todas
 * `version = 1`. Fixtures derivados de las filas de producción citando su `id`
 * (R-29); el contenido está reducido a su forma y su CONTEO de claves útiles, que es
 * lo que el criterio mide (2 vs 23 vs 26).
 *
 * `e8e8c500` es la que gana HOY el empate arbitrario, y es la que dejó la §6.1 de
 * F-112 sin poder ser positiva (CL-098): 2 claves útiles y un `raw_text` LARGO (el
 * volcado del prompt-contexto) — la prueba viva de que "`raw_text` no vacío" NO
 * discrimina.
 */
function scsPersonas(): CanonicalContentRow[] {
  const many = (n: number, prefix: string): Record<string, unknown> =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`${prefix}_${i}`, `valor real ${i}`])
    );
  return [
    {
      // e8e8c500 — 2 claves útiles, `raw_text` LARGO (volcado del prompt-contexto)
      id: 'e8e8c500',
      version: 1,
      updated_at: '2026-07-22T10:00:00.000Z', // la pobre es la MÁS reciente
      content: {
        ...many(2, 'k'),
        raw_text: 'CONTEXTO DEL CLIENTE\n'.repeat(400)
      }
    },
    {
      // 3c62c1e6 — 23 claves útiles
      id: '3c62c1e6',
      version: 1,
      updated_at: '2026-07-19T10:00:00.000Z',
      content: many(23, 'k')
    },
    {
      // 76b1f28e — 26 claves útiles, incluye las objeciones reales
      id: '76b1f28e',
      version: 1,
      updated_at: '2026-07-21T10:00:00.000Z',
      content: {
        ...many(24, 'k'),
        objection_price:
          'Teme pagar de más por un servicio que no cumpla sus expectativas',
        status_quo:
          'Sigue dependiendo de proveedores inconsistentes y arriesga su reputación'
      }
    }
  ];
}

test('T-08(a) ⭐ ANTI-NO-OP personas SCS (e8e8c500 vs 3c62c1e6 vs 76b1f28e, las 3 approved v1) → elige 76b1f28e, NUNCA e8e8c500 (R-26)', () => {
  const rows = scsPersonas();
  // La riqueza medida es la que el grounding reportó: 2 / 23 / 26.
  assert.equal(contentRichness(rows[0]), 2, 'e8e8c500 debe medir 2 claves');
  assert.equal(contentRichness(rows[1]), 23, '3c62c1e6 debe medir 23 claves');
  assert.equal(contentRichness(rows[2]), 26, '76b1f28e debe medir 26 claves');

  const picked = pickCanonicalContentRow(rows);
  assert.equal(picked?.id, '76b1f28e');
  assert.notEqual(picked?.id, 'e8e8c500');
});

test('T-08(a) el resultado no depende del orden de llegada de las 3 personas reales (R-05)', () => {
  const rows = scsPersonas();
  const [a, b, c] = rows;
  for (const perm of [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a]
  ]) {
    assert.equal(pickCanonicalContentRow(perm)?.id, '76b1f28e');
  }
});

/**
 * (b) `briefs` / SCS Cleaning — las **4 filas reales** `approved`, todas `version = 1`.
 * `99748e46` es el MÁS VIEJO (2026-04-11) y el más pobre (6 claves, formato
 * `# Bloque 1 — …`); los otros tres tienen 25 claves cada uno (formato
 * `- business_name: …`). Hoy la generación entera de SCS corre sobre `99748e46`.
 */
function scsBriefs(): CanonicalContentRow[] {
  const many = (n: number): Record<string, unknown> =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [`field_${i}`, `dato real ${i}`])
    );
  return [
    // 99748e46 — 2026-04-11, 6 claves, formato viejo `# Bloque 1 — …`
    {
      id: '99748e46',
      version: 1,
      updated_at: '2026-04-11T12:00:00.000Z',
      content: {
        ...many(6),
        raw_text: '# Bloque 1 — Información del Negocio\n'.repeat(50)
      }
    },
    // 73a3f894 — 2026-04-14, 25 claves
    {
      id: '73a3f894',
      version: 1,
      updated_at: '2026-04-14T12:00:00.000Z',
      content: many(25)
    },
    // bde29cca — 2026-04-19, 25 claves
    {
      id: 'bde29cca',
      version: 1,
      updated_at: '2026-04-19T12:00:00.000Z',
      content: many(25)
    },
    // 874bf5b6 — 2026-06-22, 25 claves (el más reciente entre los igualmente ricos)
    {
      id: '874bf5b6',
      version: 1,
      updated_at: '2026-06-22T12:00:00.000Z',
      content: many(25)
    }
  ];
}

test('T-08(b) ⭐ ANTI-NO-OP briefs SCS (99748e46 vs 73a3f894/bde29cca/874bf5b6, los 4 approved v1) → elige 874bf5b6, NUNCA 99748e46 (R-27)', () => {
  const rows = scsBriefs();
  assert.equal(contentRichness(rows[0]), 6, '99748e46 debe medir 6 claves');
  for (const r of rows.slice(1)) {
    assert.equal(contentRichness(r), 25, `${r.id} debe medir 25 claves`);
  }

  const picked = pickCanonicalContentRow(rows);
  // Entre los tres igualmente ricos (25) decide `updated_at desc` → el más reciente.
  assert.equal(picked?.id, '874bf5b6');
  assert.notEqual(picked?.id, '99748e46');
  // Y en ninguna permutación de llegada gana el pobre.
  assert.equal(pickCanonicalContentRow([...rows].reverse())?.id, '874bf5b6');
});

test('T-08(c) ⭐ robustez futura: fila MÁS RECIENTE pero vacía / toda `[PENDIENTE]` vs fila más vieja y RICA → gana la rica (R-28)', () => {
  // Éste es el caso que DISTINGUE el criterio recomendado (riqueza) del criterio
  // simple `version desc → updated_at desc → id asc`, y el que la causa raíz en
  // escritura (`version: opts.version ?? 1`) hace probable: cada insert nace en el
  // mismo empate y puede nacer pobre.
  const nuevaVacia: CanonicalContentRow = {
    id: 'aaaa0001',
    version: 1,
    updated_at: '2026-07-25T23:59:00.000Z',
    content: {}
  };
  const nuevaPendiente: CanonicalContentRow = {
    id: 'aaaa0002',
    version: 1,
    updated_at: '2026-07-25T23:58:00.000Z',
    // Forma REAL: JD Valley `400dbe18`, todos los canónicos en `[PENDIENTE]` (pre-F-106)
    content: {
      main_pain: '[PENDIENTE]',
      objection_price: '  [pendiente]  ',
      dream_result: '[PENDIENTE]',
      raw_text: 'volcado largo que NO cuenta'
    }
  };
  const viejaRica: CanonicalContentRow = {
    id: 'zzzz9999', // id asc la perjudicaría: NO debe llegar a ese desempate
    version: 1,
    updated_at: '2026-01-01T00:00:00.000Z',
    content: {
      main_pain: 'No consigue personal de limpieza confiable',
      objection_price: 'Teme pagar de más por un servicio que no cumpla',
      dream_result: 'Instalaciones impecables sin supervisar a nadie'
    }
  };
  assert.equal(contentRichness(nuevaVacia), 0);
  assert.equal(contentRichness(nuevaPendiente), 0);
  assert.equal(contentRichness(viejaRica), 3);

  assert.equal(
    pickCanonicalContentRow([nuevaVacia, nuevaPendiente, viejaRica])?.id,
    'zzzz9999'
  );
  assert.equal(
    pickCanonicalContentRow([viejaRica, nuevaPendiente, nuevaVacia])?.id,
    'zzzz9999'
  );
});

/* ================================================================== */
/*  T-07 — orden de criterios DT-01(a): cada nivel decide SOLO si el   */
/*         anterior empata (R-01, R-02)                               */
/* ================================================================== */

test('T-07 (1) `version` desc es el criterio PRIMARIO (la mayor versión gana aunque sea pobre)', () => {
  const v2pobre: CanonicalContentRow = {
    id: 'a',
    version: 2,
    content: {},
    updated_at: '2020-01-01T00:00:00.000Z'
  };
  const v1rica: CanonicalContentRow = {
    id: 'b',
    version: 1,
    content: { a: '1', b: '2', c: '3' },
    updated_at: '2030-01-01T00:00:00.000Z'
  };
  assert.equal(pickCanonicalContentRow([v1rica, v2pobre])?.id, 'a');
});

test('T-07 (2) a igualdad de `version`, la RIQUEZA decide (aunque la pobre sea más reciente)', () => {
  const pobreReciente: CanonicalContentRow = {
    id: 'a',
    version: 1,
    content: { x: 'algo' },
    updated_at: '2030-01-01T00:00:00.000Z'
  };
  const ricaVieja: CanonicalContentRow = {
    id: 'b',
    version: 1,
    content: { x: 'algo', y: 'otra', z: 'tercera' },
    updated_at: '2020-01-01T00:00:00.000Z'
  };
  assert.equal(pickCanonicalContentRow([pobreReciente, ricaVieja])?.id, 'b');
});

test('T-07 (3) a igualdad de `version` y riqueza, `updated_at` desc decide (colapsa al criterio simple)', () => {
  const vieja: CanonicalContentRow = {
    id: 'a', // id asc la favorecería: NO debe llegar a ese desempate
    version: 1,
    content: { x: 'algo', y: 'otra' },
    updated_at: '2020-01-01T00:00:00.000Z'
  };
  const reciente: CanonicalContentRow = {
    id: 'z',
    version: 1,
    content: { x: 'algo', y: 'otra' },
    updated_at: '2026-06-22T00:00:00.000Z'
  };
  assert.equal(pickCanonicalContentRow([vieja, reciente])?.id, 'z');
});

test('T-07 (4) a igualdad de todo lo anterior, `id` asc cierra el orden TOTAL', () => {
  const base = {
    version: 1,
    content: { x: 'algo' },
    updated_at: '2026-01-01T00:00:00.000Z'
  };
  assert.equal(
    pickCanonicalContentRow([
      { id: 'ccc', ...base },
      { id: 'aaa', ...base },
      { id: 'bbb', ...base }
    ])?.id,
    'aaa'
  );
});

test('T-07 `updated_at` ausente no rompe el orden (se trata como el más viejo)', () => {
  const sinFecha: CanonicalContentRow = {
    id: 'a',
    version: 1,
    content: { x: 'algo' }
  };
  const conFecha: CanonicalContentRow = {
    id: 'z',
    version: 1,
    content: { x: 'algo' },
    updated_at: '2020-01-01T00:00:00.000Z'
  };
  assert.equal(pickCanonicalContentRow([sinFecha, conFecha])?.id, 'z');
  assert.equal(pickCanonicalContentRow([conFecha, sinFecha])?.id, 'z');
});

/* ================================================================== */
/*  T-07 — `contentRichness` (R-03, R-04)                             */
/* ================================================================== */

test('T-07 riqueza: cuenta strings no vacíos, números finitos y arrays con ≥1 escalar útil (R-03)', () => {
  assert.equal(
    contentRichness({
      content: {
        s: 'texto',
        n: 0, // el número 0 SÍ es un valor útil
        neg: -3.5,
        arr: ['a', 'b'],
        arrMixta: ['', '   ', 'útil']
      }
    }),
    5
  );
});

test('T-07 riqueza: NO cuentan ausente/null/vacío/whitespace/objeto/booleano/array vacío (R-03)', () => {
  assert.equal(
    contentRichness({
      content: {
        nulo: null,
        indef: undefined,
        vacio: '',
        espacios: '   \n\t ',
        obj: { a: 1 },
        boolT: true,
        boolF: false,
        arrVacio: [],
        arrInutil: ['', '  ', null, {}, false],
        nan: Number.NaN,
        inf: Number.POSITIVE_INFINITY
      }
    }),
    0
  );
});

test('T-07 ⭐ riqueza: la clave `raw_text` está EXCLUIDA — es justo lo que NO discrimina (R-03)', () => {
  // `e8e8c500` es la prueba viva: `raw_text` largo y `content` casi vacío.
  const soloRawText = { content: { raw_text: 'x'.repeat(9000) } };
  assert.equal(contentRichness(soloRawText), 0);
  // Y no resta ni suma cuando conviven con claves reales.
  assert.equal(
    contentRichness({ content: { a: 'real', raw_text: 'largo' } }),
    1
  );
});

test('T-07 riqueza: `[PENDIENTE]`-only NO cuenta, ni en clave ni en ítem de array (R-04)', () => {
  assert.equal(
    contentRichness({
      content: {
        a: '[PENDIENTE]',
        b: '[pendiente]', // case-insensitive
        c: '  [PENDIENTE]  ', // tras trim()
        d: ['[PENDIENTE]', '  [pendiente]']
      }
    }),
    0
  );
  // Residual DECLARADO: embebido en una frase más larga SÍ cuenta como útil.
  assert.equal(
    contentRichness({
      content: { a: 'Objeciones: [PENDIENTE] y falta de tiempo' }
    }),
    1
  );
});

test('T-07 riqueza: `content` no-objeto (null / string / array / número / ausente) → 0 (R-03)', () => {
  assert.equal(contentRichness({ content: null }), 0);
  assert.equal(contentRichness({ content: 'un string suelto' }), 0);
  assert.equal(contentRichness({ content: ['a', 'b'] }), 0);
  assert.equal(contentRichness({ content: 42 }), 0);
  assert.equal(contentRichness({ content: undefined }), 0);
  assert.equal(contentRichness({}), 0);
});

test('T-07 el criterio de escalar útil COINCIDE con `cleanScalar` del módulo `pending` (fuente única, R-08)', () => {
  // Ancla de equivalencia conductual: `isUsefulScalar` (privado) debe coincidir con
  // `cleanScalar(v) !== null` del módulo `method-context/pending.ts`. Se ejercita a
  // través de `contentRichness` (1 clave útil ⇒ 1) para que una deriva futura de
  // cualquiera de los dos lados rompa acá y no en producción.
  const casos: unknown[] = [
    'texto',
    '',
    '   ',
    '[PENDIENTE]',
    '[pendiente]',
    '  [PENDIENTE] ',
    'contiene [PENDIENTE] embebido',
    0,
    -1,
    3.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    null,
    undefined,
    true,
    false,
    { a: 1 }
  ];
  for (const v of casos) {
    assert.equal(
      contentRichness({ content: { k: v } }),
      cleanScalar(v) !== null ? 1 : 0,
      `divergencia con cleanScalar para ${JSON.stringify(v) ?? String(v)}`
    );
  }
});

/* ================================================================== */
/*  T-07 — pureza, contrato vacío y caso trivial (R-05, R-06, R-07)   */
/* ================================================================== */

test('T-07 pureza: NO muta el array de entrada ni las filas (R-05, R-23)', () => {
  const rows = scsPersonas();
  const antesOrden = rows.map((r) => r.id);
  const antesJson = JSON.stringify(rows);

  pickCanonicalContentRow(rows);

  assert.deepEqual(
    rows.map((r) => r.id),
    antesOrden,
    'el selector reordenó el array de ENTRADA (debe ordenar sobre una copia)'
  );
  assert.equal(JSON.stringify(rows), antesJson, 'el selector mutó alguna fila');
  assert.equal(rows.length, 3, 'el selector eliminó filas (PROHIBIDO, R-23)');
});

test('T-07 pureza: devuelve la MISMA referencia de fila, no una copia', () => {
  const rows = scsPersonas();
  const picked = pickCanonicalContentRow(rows);
  assert.equal(picked, rows[2]);
});

test('T-07 conjunto vacío / null / undefined → `null` (R-06)', () => {
  assert.equal(pickCanonicalContentRow([]), null);
  assert.equal(pickCanonicalContentRow(null), null);
  assert.equal(pickCanonicalContentRow(undefined), null);
});

test('T-07 una sola fila → ESA fila, sin condicionales (R-07: no-regresión por construcción)', () => {
  const unica: CanonicalContentRow = { id: 'u', version: 1, content: {} };
  assert.equal(pickCanonicalContentRow([unica]), unica);
  // Incluso si es pobre, vacía o toda `[PENDIENTE]`: el criterio NO filtra, desempata.
  const pendiente: CanonicalContentRow = {
    id: '400dbe18',
    version: 1,
    content: { main_pain: '[PENDIENTE]' }
  };
  assert.equal(pickCanonicalContentRow([pendiente])?.id, '400dbe18');
});

/* ================================================================== */
/*  T-07 — coherencia contexto ↔ FK (R-14)                            */
/* ================================================================== */

test('T-07 ⭐ coherencia contexto↔FK: la proyección de CONTEXTO y la de FK eligen la MISMA fila (R-14)', () => {
  // El punto de contexto trae `id, version, updated_at, content, raw_text`; el de
  // FK-linking trae `id, version, updated_at, content` (sin `raw_text`). Como la
  // riqueza EXCLUYE `raw_text`, ambas proyecciones deben converger a la misma fila —
  // si divergieran, el `persona_id`/`brief_id` persistido apuntaría a una fila
  // DISTINTA de la que alimentó el prompt: procedencia falsa y silenciosa.
  for (const set of [scsPersonas(), scsBriefs()]) {
    const contexto = set; // ya incluye `raw_text` dentro de `content`
    const fk = set.map((r) => {
      const { raw_text: _omitido, ...sinRaw } = (r.content ?? {}) as Record<
        string,
        unknown
      >;
      return {
        id: r.id,
        version: r.version,
        updated_at: r.updated_at,
        content: sinRaw
      };
    });
    assert.equal(
      pickCanonicalContentRow(contexto)?.id,
      pickCanonicalContentRow(fk)?.id,
      'contexto y FK-linking eligieron filas DISTINTAS (R-14 violado)'
    );
  }
});

test('T-07 coherencia contexto↔FK: se sostiene aunque la columna `raw_text` viva FUERA de `content`', () => {
  // Forma real de `briefs`/`buyer_personas`: existe además una COLUMNA `raw_text`.
  // El selector no la mira en ningún caso ⇒ traerla o no traerla es indiferente.
  const conColumna = scsPersonas().map((r) => ({
    ...r,
    raw_text: 'volcado del prompt-contexto '.repeat(100)
  }));
  assert.equal(
    pickCanonicalContentRow(conColumna)?.id,
    pickCanonicalContentRow(scsPersonas())?.id
  );
});
