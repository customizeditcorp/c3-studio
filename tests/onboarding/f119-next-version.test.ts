/**
 * F-119 — T-02 — Unitarios del seam de versión `nextVersion` + invariante duro (R-01..R-06).
 *
 * Unit tests framework-free (`node --test`) del seam puro que cierra la mitad en ESCRITURA
 * del defecto de CL-099 (F-113 §12.bis R-34). Verifica:
 *   - el contrato de `max(version)+1` y el caso vacío ⇒ `1` (R-01/R-02);
 *   - ⭐ el **invariante de no-empate** como PROPIEDAD sobre una batería de conjuntos (R-03);
 *   - la tolerancia a dialectos de datos con piso `1` (R-04);
 *   - ⭐ que el máximo NO se particiona por `status` (R-05) — particionarlo reintroduce el
 *     empate por la puerta de atrás, porque aprobar es un flip in-place que conserva la versión;
 *   - la pureza (R-06) y que **el seam nunca lanza** (R-42).
 *
 * **Anti-no-op:** el fixture central son las **4 filas reales `approved` de `briefs` de SCS
 * CLeaning Service** (`e24ddff3-4cf3-4e74-b9e6-3f2bc007a600`), todas en `version = 1`, citadas
 * por su `id` (medidas por `SELECT` read-only el 2026-07-27). El seam debe devolver **2** —
 * el número que el criterio anti-no-op live de R-31 va a confirmar en producción.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  nextVersion,
  type VersionedRow
} from '../../src/lib/onboarding/next-version.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ================================================================== */
/*  R-02 — el caso vacío ⇒ 1 (byte-identidad con el comportamiento de hoy) */
/* ================================================================== */

test('T-02 R-02 conjunto vacío / null / undefined ⇒ 1 (el único caso en que hoy inserta la UI)', () => {
  assert.equal(nextVersion([]), 1);
  assert.equal(nextVersion(null), 1);
  assert.equal(nextVersion(undefined), 1);
});

/* ================================================================== */
/*  R-01 — max(version) + 1                                            */
/* ================================================================== */

test('T-02 R-01 una sola fila en v1 ⇒ 2', () => {
  assert.equal(nextVersion([{ version: 1 }]), 2);
});

test('T-02 R-01 el máximo manda, no el orden de llegada ni el conteo', () => {
  assert.equal(
    nextVersion([{ version: 1 }, { version: 5 }, { version: 3 }]),
    6
  );
  assert.equal(
    nextVersion([{ version: 5 }, { version: 1 }, { version: 3 }]),
    6
  );
  assert.equal(nextVersion([{ version: 12 }]), 13);
});

/* ================================================================== */
/*  ⭐ ANTI-NO-OP — las 4 filas REALES de `briefs` de SCS (R-31 offline) */
/* ================================================================== */

/**
 * `briefs` / **SCS CLeaning Service** `e24ddff3-4cf3-4e74-b9e6-3f2bc007a600` — las **4 filas
 * reales `approved`, todas `version = 1`** (medición read-only 2026-07-27, §G-4 de
 * `requirements.md`). Es exactamente el conjunto sobre el que hoy `route.ts:667` insertaría
 * una QUINTA fila en `v1`: el empate que F-119 viene a cortar.
 */
const SCS_BRIEFS_APPROVED: (VersionedRow & { id: string; status: string })[] = [
  { id: '874bf5b6', status: 'approved', version: 1 }, // 25 claves
  { id: 'bde29cca', status: 'approved', version: 1 }, // 25 claves
  { id: '73a3f894', status: 'approved', version: 1 }, // 25 claves
  { id: '99748e46', status: 'approved', version: 1 } //  6 claves
];

test('T-02 ⭐ ANTI-NO-OP las 4 filas approved de SCS (todas v1) ⇒ la nueva nace en 2, NO en 1', () => {
  assert.equal(
    nextVersion(SCS_BRIEFS_APPROVED),
    2,
    'con las 4 filas reales de SCS en v1, una fila nueva DEBE nacer en v2: ' +
      'si el seam devolviera 1, F-119 sería un no-op y el empate se seguiría creando'
  );
});

/* ================================================================== */
/*  ⭐ R-05 — el máximo NO se particiona por `status`                   */
/* ================================================================== */

/**
 * El escenario que hace de R-05 un requerimiento duro y no una preferencia: aprobar es un
 * **flip in-place del mismo `id` que conserva la `version`**. Si el máximo se calculara sólo
 * sobre los `draft`, el draft nuevo nacería en `v2` y, al aprobarse, colisionaría con el
 * `approved` que YA está en `v2`. Draft y approved son un único espacio de numeración.
 */
const MIXED_STATUS: (VersionedRow & { id: string; status: string })[] = [
  { id: 'a', status: 'approved', version: 2 },
  { id: 'b', status: 'draft', version: 1 }
];

test('T-02 ⭐ R-05 el máximo se toma sobre TODOS los `status` (particionar reintroduce el empate)', () => {
  assert.equal(
    nextVersion(MIXED_STATUS),
    3,
    'particionar por (client_id, status) daría 2 y colisionaría con el approved v2 ' +
      'apenas el draft se apruebe (el flip in-place conserva la versión)'
  );
  // El seam es ciego al `status`: mismas versiones, distinta etiqueta ⇒ mismo resultado.
  const todosDraft = MIXED_STATUS.map((r) => ({ ...r, status: 'draft' }));
  const todosApproved = MIXED_STATUS.map((r) => ({ ...r, status: 'approved' }));
  assert.equal(nextVersion(todosDraft), 3);
  assert.equal(nextVersion(todosApproved), 3);
  assert.equal(nextVersion(todosDraft), nextVersion(todosApproved));
});

/* ================================================================== */
/*  R-04 — dialectos de datos: basura ignorada, piso 1                 */
/* ================================================================== */

test('T-02 R-04 `version` no numérica / null / no finita / ≤ 0 se ignora para el máximo', () => {
  assert.equal(nextVersion([{ version: null }]), 1);
  assert.equal(nextVersion([{ version: '2' }]), 1); // string: dialecto, NO se coacciona
  assert.equal(nextVersion([{ version: Number.NaN }]), 1);
  assert.equal(nextVersion([{ version: Number.POSITIVE_INFINITY }]), 1);
  assert.equal(nextVersion([{ version: -3 }]), 1);
  assert.equal(nextVersion([{ version: 0 }]), 1);
  assert.equal(nextVersion([{}]), 1); // clave ausente
  assert.equal(nextVersion([{ version: undefined }]), 1);
  assert.equal(nextVersion([{ version: true }]), 1);
  assert.equal(nextVersion([{ version: { n: 4 } }]), 1);
  assert.equal(nextVersion([{ version: [4] }]), 1);
});

test('T-02 R-04 la basura convive con filas buenas sin bajar el máximo ni el piso', () => {
  assert.equal(
    nextVersion([
      { version: null },
      { version: 4 },
      { version: '9' },
      { version: -7 },
      {}
    ]),
    5
  );
  assert.equal(nextVersion([{ version: null }, { version: -7 }, {}]), 1);
});

test('T-02 R-04 el resultado NUNCA es menor que 1', () => {
  const basuras: VersionedRow[][] = [
    [],
    [{}],
    [{ version: 0 }],
    [{ version: -100 }],
    [{ version: Number.NEGATIVE_INFINITY }],
    [{ version: null }, { version: 'x' }, { version: false }]
  ];
  for (const rows of basuras) {
    assert.ok(
      nextVersion(rows) >= 1,
      `piso 1 violado para ${JSON.stringify(rows)}`
    );
  }
});

/* ================================================================== */
/*  ⭐ R-03 — el invariante de no-empate, como PROPIEDAD                */
/* ================================================================== */

/**
 * Éste es el requerimiento que convierte al desempate de F-113 en **red de seguridad** en vez
 * de prótesis: el resultado del seam es **estrictamente mayor** que TODA `version` presente.
 * Se prueba como propiedad sobre una batería de conjuntos generados deterministamente
 * (sin aleatoriedad: un test que falla un día de cada mil no es un guard).
 */
test('T-02 ⭐ R-03 INVARIANTE: el resultado es ESTRICTAMENTE mayor que toda `version` de entrada', () => {
  const conjuntos: VersionedRow[][] = [];
  // Batería determinista: tamaños 1..6 × versiones derivadas de dos progresiones.
  for (let n = 1; n <= 6; n++) {
    conjuntos.push(
      Array.from({ length: n }, (_, i) => ({ version: (i % 3) + 1 }))
    );
    conjuntos.push(
      Array.from({ length: n }, (_, i) => ({ version: i * 7 + 1 }))
    );
    conjuntos.push(Array.from({ length: n }, () => ({ version: 1 })));
    // Con basura intercalada: el invariante sigue valiendo sobre las usables.
    conjuntos.push(
      Array.from({ length: n }, (_, i) =>
        i % 2 === 0 ? { version: i + 2 } : { version: null }
      )
    );
  }
  conjuntos.push(SCS_BRIEFS_APPROVED, MIXED_STATUS);
  for (const rows of conjuntos) {
    const v = nextVersion(rows);
    for (const row of rows) {
      const existing = row.version;
      if (typeof existing === 'number' && Number.isFinite(existing)) {
        assert.ok(
          v > existing,
          `EMPATE: nextVersion devolvió ${v} con una fila en ${existing} — ` +
            `el conjunto era ${JSON.stringify(rows)}`
        );
      }
    }
  }
});

/* ================================================================== */
/*  R-06 — pureza                                                      */
/* ================================================================== */

test('T-02 R-06 el seam es PURO: no muta la entrada', () => {
  const rows = [{ version: 1 }, { version: 3 }];
  const antes = JSON.stringify(rows);
  nextVersion(rows);
  assert.equal(JSON.stringify(rows), antes);
  assert.equal(rows.length, 2);
});

test('T-02 R-06 mismo input ⇒ mismo output (determinista, sin estado)', () => {
  const rows = [{ version: 2 }, { version: 5 }, { version: 1 }];
  const a = nextVersion(rows);
  const b = nextVersion(rows);
  const c = nextVersion([...rows].reverse());
  assert.equal(a, 6);
  assert.equal(a, b);
  assert.equal(a, c);
});

test('T-02 R-06 el módulo es puro por construcción: sin I/O, sin Supabase, sin red', () => {
  // La fuente del seam no puede tener dependencias: es la condición de que sea
  // `node --test`-able y de que viva fuera de `briefs/write-path.ts` (H-1).
  const src = readFileSync(
    resolve(HERE, '../../src/lib/onboarding/next-version.ts'),
    'utf8'
  );
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.doesNotMatch(code, /supabase|createClient|fetch\(|readFileSync/i);
  assert.deepEqual(code.match(/from\s*'([^']+)'/g) ?? [], []);
});

/* ================================================================== */
/*  ⭐ R-42 — el seam NUNCA lanza (no puede costarle un save al operador) */
/* ================================================================== */

test('T-02 ⭐ R-42 ninguna entrada produce excepción — ni siquiera basura total', () => {
  const entradas: unknown[] = [
    [],
    null,
    undefined,
    [{ version: 1 }],
    [{}],
    [{ version: null }],
    [{ version: 'no soy un número' }],
    [{ version: Number.NaN }],
    [{ version: Symbol('x') }],
    [{ version: () => 1 }],
    [null],
    [undefined],
    [{ version: 1 }, null, undefined, {}],
    Array.from({ length: 200 }, (_, i) => ({ version: i }))
  ];
  for (const entrada of entradas) {
    assert.doesNotThrow(
      () => nextVersion(entrada as VersionedRow[]),
      `el seam lanzó con ${String(entrada && JSON.stringify(entrada))} — ` +
        'R-42: el invariante se enforcea en el contrato + tests, NUNCA abortando escrituras'
    );
    assert.ok(Number.isInteger(nextVersion(entrada as VersionedRow[])));
  }
});
