/**
 * F-119 — T-11 — NO-REGRESIÓN y límites de alcance
 * (R-11, R-13, R-14, R-15, R-17, R-38, R-39, R-43).
 *
 * Lo que este archivo protege es, sobre todo, **una decisión de diseño que se puede malleer**:
 * cortar la fuente de empates **no** vuelve prescindible el desempate de F-113/F-109. Lo
 * convierte en lo que debe ser — **red de seguridad para las filas históricas**, que no se
 * regeneran — y en el amortiguador de la carrera que F-119 declara abierta (R-41 / DT-06).
 *
 * Todas las anclas de byte-identidad apuntan a un **commit FIJO** (`2c072b6`, `main` antes de
 * F-119), **nunca a `HEAD`**: un guard que sólo puede estar verde después del commit está mal
 * anclado (lección F-118 H-5).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  pickCanonicalContentRow,
  contentRichness
} from '../../src/lib/onboarding/select-canonical-row.ts';
import { pickCanonicalOffer } from '../../src/lib/offers/select-canonical.ts';
import { resolveWriteMode } from '../../src/lib/briefs/write-path.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BASE = '2c072b6'; // `main` antes de F-119 — ancla FIJA, no `HEAD`
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');
const enBase = (rel: string): string =>
  execFileSync('git', ['show', `${BASE}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });

const ROUTE = read('src/app/api/generate-content/route.ts');
const GBP_ROUTE = read('src/app/api/generate-gbp/route.ts');

/* ================================================================== */
/*  ⭐ R-14 — EL TIE-BREAK NO SE RETIRA                                 */
/* ================================================================== */

/**
 * **Por qué se quedan, escrito para el lector futuro que vea "la fuente ya está cortada" y
 * piense en simplificar:**
 *
 *   1. **Las filas históricas no se regeneran.** Al 2026-07-27 hay 16 `briefs`, 8
 *      `buyer_personas` y 18 `offers`, **todas en `version = 1`** — con empates reales entre
 *      `approved` en las tres tablas (SCS: 4 briefs y 3 personas; JD Valley: 2 offers). F-119
 *      corta la PRODUCCIÓN de empates nuevos; **no repara el pasado** (R-43).
 *   2. **La carrera queda abierta** (R-41 / DT-06): dos escrituras concurrentes pueden calcular
 *      el mismo `max+1`. Degrada al empate previo a F-119 — y quien lo resuelve es esta red.
 *
 * Retirarla dejaría a los dos casos sin respuesta determinista.
 */
test('T-11 ⭐ R-14 el tie-break sigue EXPORTADO y con el mismo criterio (protege lo histórico y la carrera de DT-06)', () => {
  assert.equal(typeof pickCanonicalContentRow, 'function');
  assert.equal(typeof contentRichness, 'function');
  assert.equal(typeof pickCanonicalOffer, 'function');
  const SELECTOR = read('src/lib/onboarding/select-canonical-row.ts');
  const OFFERS = read('src/lib/offers/select-canonical.ts');
  // Firma y criterio: `version desc → riqueza/no-vacío → updated_at desc → id asc`.
  assert.match(
    SELECTOR,
    /export\s+function\s+pickCanonicalContentRow<\s*T\s+extends\s+CanonicalContentRow\s*>/
  );
  assert.match(SELECTOR, /export\s+function\s+contentRichness\s*\(/);
  assert.match(
    OFFERS,
    /export\s+function\s+pickCanonicalOffer<\s*T\s+extends\s+CanonicalOfferRow\s*>/
  );
  for (const src of [SELECTOR, OFFERS]) {
    assert.match(src, /if\s*\(\s*a\.version\s*!==\s*b\.version\s*\)/);
    assert.match(src, /a\.updated_at\s*\?\?\s*''/);
    assert.match(src, /a\.id\s*<\s*b\.id\s*\?\s*-1\s*:\s*1/);
  }
  // ⭐ Y quedan BYTE-IDÉNTICOS a `2c072b6`: F-119 no los toca (R-14).
  for (const rel of [
    'src/lib/onboarding/select-canonical-row.ts',
    'src/lib/offers/select-canonical.ts'
  ]) {
    assert.equal(
      read(rel),
      enBase(rel),
      `${rel}: cortar la fuente NO retira la red — protege las filas históricas (que no ` +
        'se regeneran) y la carrera declarada en R-41/DT-06'
    );
  }
});

test('T-11 ⭐ R-14 los 5 read-paths siguen cableados: 4 en `generate-content` + 1 en `generate-gbp`', () => {
  assert.equal(
    (ROUTE.match(/pickCanonicalContentRow\s*\(/g) ?? []).length,
    4,
    'contexto + FK-linking × 2 tablas (F-113 R-10..R-14)'
  );
  assert.match(ROUTE, /pickCanonicalOffer\s*\(/);
  assert.equal(
    (GBP_ROUTE.match(/pickCanonicalContentRow\s*\(/g) ?? []).length,
    1,
    'el 5.º read-path (F-113 DT-05) sigue vivo en `generate-gbp`'
  );
  for (const src of [ROUTE, GBP_ROUTE]) {
    assert.match(
      src,
      /import\s*\{[\s\S]*?pickCanonicalContentRow[\s\S]*?\}\s*from\s*'@\/lib\/onboarding\/select-canonical-row'/
    );
  }
});

/* ================================================================== */
/*  ⭐ R-15 — el selector elige EXACTAMENTE las mismas filas            */
/* ================================================================== */

/** Fixtures de las filas reales de producción (§G-4/G-5), citadas por su `id`. */
const contenido = (n: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: n }, (_, i) => [`k_${i}`, `valor real ${i}`])
  );

test('T-11 ⭐ R-15 sobre las filas de HOY el canónico es el mismo que antes de F-119', () => {
  // (a) `briefs` / SCS `e24ddff3…` — 4 approved en v1: gana la de 25 claves más reciente.
  const scsBriefs = [
    {
      id: '99748e46',
      version: 1,
      content: contenido(6),
      updated_at: '2026-04-11T09:00:00Z'
    },
    {
      id: '73a3f894',
      version: 1,
      content: contenido(25),
      updated_at: '2026-04-14T09:00:00Z'
    },
    {
      id: 'bde29cca',
      version: 1,
      content: contenido(25),
      updated_at: '2026-04-19T09:00:00Z'
    },
    {
      id: '874bf5b6',
      version: 1,
      content: contenido(25),
      updated_at: '2026-06-22T09:00:00Z'
    }
  ];
  assert.equal(pickCanonicalContentRow(scsBriefs)?.id, '874bf5b6');

  // (b) `buyer_personas` / SCS — 3 approved en v1: gana la de 26 claves.
  const scsPersonas = [
    {
      id: 'e8e8c500',
      version: 1,
      content: contenido(2),
      updated_at: '2026-04-11T09:30:00Z'
    },
    {
      id: '3c62c1e6',
      version: 1,
      content: contenido(23),
      updated_at: '2026-04-19T09:30:00Z'
    },
    {
      id: '76b1f28e',
      version: 1,
      content: contenido(26),
      updated_at: '2026-06-22T09:30:00Z'
    }
  ];
  assert.equal(pickCanonicalContentRow(scsPersonas)?.id, '76b1f28e');

  // (c) `offers` / JD Valley `1d3b28b1…` — la REAL gana a la vacía-shadow, aun siendo
  //     MÁS VIEJA: el criterio es `big_promise` no vacío, no la recencia (F-109).
  const jdOffers = [
    {
      id: 'b106ad61',
      version: 1,
      content: {},
      big_promise: '',
      updated_at: '2026-06-30T08:00:00Z'
    },
    {
      id: 'a6c66d5c',
      version: 1,
      content: { big_promise: 'Pintura exterior que dura 10 años' },
      big_promise: 'Pintura exterior que dura 10 años',
      updated_at: '2026-05-15T08:00:00Z'
    }
  ];
  assert.equal(pickCanonicalOffer(jdOffers)?.id, 'a6c66d5c');
});

test('T-11 R-15 con una sola fila (los clientes SIN empate) el resultado es la fila misma', () => {
  const una = [
    {
      id: '45b77a71',
      version: 1,
      content: contenido(7),
      updated_at: '2026-05-02T10:00:00Z'
    }
  ];
  assert.equal(pickCanonicalContentRow(una), una[0]);
  assert.equal(pickCanonicalContentRow([]), null);
  assert.equal(pickCanonicalOffer([]), null);
});

/* ================================================================== */
/*  ⭐ R-11 — `briefs/write-path.ts` BYTE-IDÉNTICO                      */
/* ================================================================== */

test('T-11 ⭐ R-11 `src/lib/briefs/write-path.ts` es BYTE-IDÉNTICO a `2c072b6` (ancla FIJA, no `HEAD`)', () => {
  const rel = 'src/lib/briefs/write-path.ts';
  assert.equal(
    read(rel),
    enBase(rel),
    'la `version` calculada viaja por `opts.version` — el parámetro que F-097 DT-04 ya ' +
      'había reservado. F-119 no inventa una puerta: usa la que estaba abierta.'
  );
  // Y el `?? 1` sigue ahí, ahora como default del caso "cliente sin filas" (R-02).
  assert.match(read(rel), /version:\s*opts\.version\s*\?\?\s*1/);
});

/* ================================================================== */
/*  R-17 — `resolveWriteMode` conserva su tabla de verdad              */
/* ================================================================== */

test('T-11 R-17 `resolveWriteMode`: draft→update(id) · approved→insert · null→insert (idempotente)', () => {
  assert.deepEqual(resolveWriteMode({ id: 'a', status: 'draft' }), {
    mode: 'update',
    id: 'a'
  });
  assert.deepEqual(resolveWriteMode({ id: 'a', status: 'approved' }), {
    mode: 'insert'
  });
  assert.deepEqual(resolveWriteMode(null), { mode: 'insert' });
  // Idempotencia (F-097 R-08): el mismo draft se reusa siempre ⇒ no se acumulan filas.
  const latest = { id: 'draft-vivo', status: 'draft' };
  assert.deepEqual(resolveWriteMode(latest), resolveWriteMode(latest));
  // Su entrada sigue siendo la fila más reciente por `created_at`, cualquier `status`.
  assert.match(
    ROUTE,
    /\.from\(\s*table\s*\)\s*\.select\(\s*'id, status'\s*\)[\s\S]{0,200}?\.order\(\s*'created_at',\s*\{\s*ascending:\s*false\s*\}\s*\)/
  );
});

/* ================================================================== */
/*  R-13 / R-43 — F-119 no repara, no renumera y no borra              */
/* ================================================================== */

test('T-11 ⭐ R-13/R-43 el diff de F-119 no trae DDL, `delete`, dedup ni renumeración', () => {
  const diff = execFileSync('git', ['diff', BASE], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
  const agregadas = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .join('\n');
  for (const prohibido of [
    /delete\s+from/i,
    /alter\s+table/i,
    /create\s+table/i,
    /create\s+index/i,
    /drop\s+(table|index|column)/i,
    /\.delete\(\s*\)/
  ]) {
    assert.doesNotMatch(
      agregadas,
      prohibido,
      `F-119 introdujo \`${prohibido}\`: PROHIBIDO (CL-103 límite 2 · R-13)`
    );
  }
  // Ningún `UPDATE` de `version` sobre filas existentes: la única escritura de `version`
  // que F-119 añade ocurre en el `INSERT` (fila nueva), nunca sobre filas ya guardadas.
  assert.doesNotMatch(
    agregadas,
    /\.update\(\s*\{[^}]*version\s*:/,
    'renumerar filas históricas es mutación de datos del operador — tan prohibida como ' +
      'el `delete` (R-13 · F-113 R-23 · F-109 R-16)'
  );
});

test('T-11 R-43 F-119 no introduce ninguna migración nueva', () => {
  const dir = resolve(REPO, 'supabase/migrations');
  if (!existsSync(dir)) return;
  const ahora = readdirSync(dir).sort();
  const antes = execFileSync(
    'git',
    ['ls-tree', '--name-only', BASE, 'supabase/migrations/'],
    { cwd: REPO, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
    .map((p) => p.split('/').pop() as string)
    .sort();
  assert.deepEqual(ahora, antes);
  assert.deepEqual(
    ahora.filter((f) => /f-?119/i.test(f)),
    []
  );
});

/* ================================================================== */
/*  R-38 / R-39 — prompts y copia edge intactos                        */
/* ================================================================== */

test('T-11 ⭐ R-38 `prompts/**` sin ningún cambio y los `meta.json` sin bump de versión', () => {
  /**
   * ⤫ **F-121 — RE-ANCLAJE DECLARADO DE UN SOLO `assert` (no debilitado). CRUCE NO
   * PREVISTO por el spec de F-121 — declarado, no silenciado.**
   *
   * El diff se medía `2c072b6 → WORKING TREE`. Su intención, dicha en el mensaje, es
   * *«**F-119** no toca prompts»* — y eso sigue siendo cierto y verificable. Lo que dejó
   * de ser cierto es que el working tree SEA F-119: F-121 edita
   * `prompts/brief/system_prompt.md` por diseño (R-19/R-21/R-22/R-25), de forma
   * **ADITIVA** y **sin bump de `meta.json`** (H-4), y su propio guard
   * `f121-brief-assembly-rules` T-10 verifica ese perímetro.
   *
   * Re-anclado al **rango congelado** `2c072b6 → 76e7637` (`main` con F-119 integrada,
   * PR #46): la afirmación sobre F-119 queda comprobada para siempre y no puede volverse
   * verde por movimiento del ancla (nunca `HEAD`, CL-107). La segunda mitad del test
   * —ningún `meta.json` menciona F-119— sigue leyendo el **disco actual** y por tanto
   * sigue mordiendo sobre F-121.
   */
  const F119_TIP = '76e7637';
  const tocados = execFileSync(
    'git',
    ['diff', '--name-only', BASE, F119_TIP, '--', 'prompts'],
    {
      cwd: REPO,
      encoding: 'utf8'
    }
  )
    .split('\n')
    .filter(Boolean);
  assert.deepEqual(
    tocados,
    [],
    'F-119 no toca prompts ⇒ no hay nada que sincronizar y `sync-prompts.mjs` NO corre ' +
      '(ni `check` ni `apply`)'
  );
  // Y ningún `meta.json` menciona F-119.
  const dir = resolve(REPO, 'prompts');
  if (!existsSync(dir)) return;
  for (const step of readdirSync(dir, { withFileTypes: true }).filter((e) =>
    e.isDirectory()
  )) {
    const meta = resolve(dir, step.name, 'meta.json');
    if (!existsSync(meta)) continue;
    assert.doesNotMatch(readFileSync(meta, 'utf8'), /F-?119/i);
  }
});

test('T-11 R-39 la copia edge `supabase/functions/generate-content/index.ts` NO se tocó', () => {
  const rel = 'supabase/functions/generate-content/index.ts';
  assert.equal(
    read(rel),
    enBase(rel),
    'sigue derivada; su backport-o-retiro es deuda abierta registrada, no scope de F-119'
  );
  // Declaración explícita del residual: la copia edge NO recibe el seam de versión.
  assert.doesNotMatch(read(rel), /nextVersion/);
});

/* ================================================================== */
/*  R-43 — los datos existentes quedan como están                      */
/* ================================================================== */

test('T-11 ⭐ R-43 F-119 no sanea datos: ninguna fuente intenta reparar, promover ni deduplicar', () => {
  const fuentes = [
    'src/lib/onboarding/next-version.ts',
    'src/lib/onboarding/generation-source.ts',
    'src/app/api/generate-content/route.ts',
    'src/app/(app)/onboarding/brief/[clientId]/page.tsx'
  ];
  for (const rel of fuentes) {
    const src = read(rel);
    assert.doesNotMatch(
      src,
      /\.delete\(\s*\)/,
      `${rel} introdujo un \`delete\``
    );
    assert.doesNotMatch(src, /\.upsert\(/, `${rel} introdujo un \`upsert\``);
  }
  // Los 4 briefs y 3 personas de SCS, los 2 offers en tie de JD Valley, las personas huecas
  // (`400dbe18`, `e8e8c500`) y los drafts duplicados QUEDAN. Deuda del operador (CL-098/099).
  assert.ok(true);
});
