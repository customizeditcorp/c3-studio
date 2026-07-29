/**
 * F-123 — **T-08** — Los invariantes que este frente NO puede romper (R-03, R-05, R-06).
 *
 * Bloque 0 del spec: si algo de acá se pone rojo, **el arreglo está mal, no el test**.
 * F-123 corrige **la SEÑAL de procedencia**. No toca el generador, ni los prompts, ni el
 * contrato de campos, ni la aprobación, ni una sola fila de `briefs`.
 *
 * ⚠️ Ancla FIJA `3be506d`, jamás `HEAD`. Comparaciones **whitespace-tolerantes**: husky y
 * prettier reformatean al commitear, y un guard que sólo pasa antes del commit no pasa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BASE = '3be506d';
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');
const git = (...a: string[]): string =>
  execFileSync('git', a, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
const desde = (rel: string): string => git('show', `${BASE}:${rel}`);
/** Whitespace-tolerante (R-39, lección heredada de F-122). */
const plano = (s: string): string => s.replace(/\s+/g, ' ').trim();

const BRIEF = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';

/** El perímetro TOCADO, derivado del diff contra el ancla + los untracked (CL-109). */
const ALCANCE = ['src', 'tests', 'prompts', 'scripts', 'supabase'];
const tocados = (): string[] =>
  [
    ...git('diff', '--name-only', '-M', BASE, '--', ...ALCANCE).split('\n'),
    ...git(
      'ls-files',
      '--others',
      '--exclude-standard',
      '--',
      ...ALCANCE
    ).split('\n')
  ]
    .filter(Boolean)
    .filter((p) => !p.startsWith('supabase/.temp/'))
    .filter((p, i, a) => a.indexOf(p) === i)
    .sort();

/* ================================================================== */
/*  ⭐⭐⭐ R-06 — lo que F-123 NO puede haber tocado                     */
/* ================================================================== */

test('T-08 ⭐⭐⭐ R-06 el generador, los prompts y el write-path NO aparecen en el diff', () => {
  const intocables = [
    'prompts/',
    'src/app/api/generate-content/route.ts',
    'src/lib/briefs/write-path.ts',
    'src/lib/onboarding/assembly-guard.ts',
    'src/lib/onboarding/approval-guard.ts',
    'src/lib/ofv/non-fabrication.ts'
  ];
  const violaciones = tocados().filter((f) =>
    intocables.some((i) => f.startsWith(i))
  );
  assert.deepEqual(
    violaciones,
    [],
    'R-06: F-123 corrige la SEÑAL de procedencia. Tocar el generador o los prompts sería ' +
      'el eje (C) —cablear los botones al modelo—, que el operador dejó explícitamente ' +
      'FUERA de este frente.'
  );
  // Anti-no-op: si el perímetro saliera vacío, el assert pasaría por vacío.
  assert.ok(
    tocados().length >= 4,
    `el perímetro medido tiene ${tocados().length} archivos`
  );
});

test('T-08 ⭐⭐ R-06 `approval-guard.ts` es BYTE-IDÉNTICO al del ancla (DT-02: advisory)', () => {
  const rel = 'src/lib/onboarding/approval-guard.ts';
  assert.equal(
    read(rel),
    desde(rel),
    'DT-02: el operador decidió ADVISORY — «no cambiar todavía la autoridad de ' +
      'aprobación en este frente». Si este archivo cambió, F-123 se pasó de alcance.'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-05 — el contrato de campos del Brief no se movió            */
/* ================================================================== */

test('T-08 ⭐⭐⭐ R-05 las claves de `BriefFields` son EXACTAMENTE las del ancla', () => {
  const claves = (src: string): string[] => {
    const i = src.indexOf('interface BriefFields {');
    assert.ok(i > 0, 'no se encontró `BriefFields`');
    const bloque = src.slice(i, src.indexOf('}', i));
    return Array.from(
      bloque.matchAll(/^\s*([a-z0-9_]+)\s*:/gm),
      (m) => m[1]
    ).sort();
  };
  assert.deepEqual(
    claves(read(BRIEF)),
    claves(desde(BRIEF)),
    'R-05: F-123 no agrega, quita ni renombra campos del Brief. El contrato de 29 claves ' +
      'de F-116 y el payload que viaja al modelo quedan intactos.'
  );
});

test('T-08 ⭐⭐ R-05 el payload que se escribe no cambió de forma', () => {
  const payload = (src: string): string => {
    const i = src.indexOf('buildBriefWritePayload');
    return i < 0 ? '' : plano(src.slice(i, i + 400));
  };
  assert.equal(
    payload(read(BRIEF)),
    payload(desde(BRIEF)),
    'R-05: el write-path del Brief no es sujeto de F-123'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-03 — la industria sigue entrando ya resuelta                  */
/* ================================================================== */

test('T-08 ⭐⭐ R-03 `ind` sigue saliendo de la declaración única y el catálogo no la lee cruda', () => {
  assert.match(
    read(BRIEF).replace(/\/\/[^\n]*/g, ''),
    /const ind = toIndustryLabel\(/,
    'R-03: la industria debe seguir resolviéndose por la declaración única (F-121/F-122)'
  );
  const catalogo = read('src/lib/onboarding/field-templates.ts');
  assert.ok(
    !/\.industry\b/.test(catalogo.replace(/\/\*[\s\S]*?\*\//g, '')),
    'R-03: el catálogo recibe `industry_label` YA RESUELTO. Si leyera `clients.industry`, ' +
      'F-122 R-18 ganaría un sujeto nuevo que vigilar y el guard de la declaración única ' +
      'tendría que crecer para cubrirlo.'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-02 — ni una escritura, ni una fila tocada                     */
/* ================================================================== */

test('T-08 ⭐⭐ R-02 F-123 no agrega ninguna escritura a la base', () => {
  const nuevos = tocados().filter((f) => f.startsWith('src/'));
  const antes = (rel: string): string => {
    try {
      return desde(rel);
    } catch {
      return '';
    }
  };
  for (const rel of nuevos) {
    const escrituras = (s: string): number =>
      (s.match(/\.(insert|update|delete)\(/g) ?? []).length;
    assert.ok(
      escrituras(read(rel)) <= escrituras(antes(rel)),
      `${rel}: F-123 agregó una escritura. Las 8 filas contaminadas se SEÑALAN, no se ` +
        'corrigen: F-121 R-04 / F-122 R-35 — el sistema no sobrescribe lo que puso el humano.'
    );
  }
});
