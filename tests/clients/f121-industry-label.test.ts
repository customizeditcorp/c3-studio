/**
 * F-121 — T-01 — `src/lib/clients/industry-label.ts`: declaración ÚNICA industria→etiqueta
 * (R-13, R-14, R-15, R-16).
 *
 * Seam puro: `node --test` directo, sin montar React ni Supabase.
 *
 * Los 4 casos de borde usan los **valores REALES observados** en producción el
 * 2026-07-27 (R-30), no paráfrasis:
 *   · `other`                          → Clara V Decor `122f3593` (brief `e1ad789c`)
 *   · `''`                             → clientes sin industria declarada
 *   · `portable_toilet_rental_service`  → R & M QTB LLC (brief `b56d1fa3`)
 *   · `cleaning`                        → SCS Cleaning Service (brief `be43470f`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  INDUSTRIES,
  toIndustryLabel,
  isIndustryCodeToken
} from '../../src/lib/clients/industry-label.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

/** La fuente SIN comentarios: «esta fuente no declara X» mira el CÓDIGO. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ================================================================== */
/*  R-14 — la tabla COMPLETA, y una sola vez                          */
/* ================================================================== */

test('T-01 ⭐ R-14 la tabla resuelve las 10 industrias declaradas, valor por valor', () => {
  const esperado: Record<string, string> = {
    landscaping: 'Landscaping',
    roofing: 'Roofing',
    plumbing: 'Plomería',
    hvac: 'HVAC',
    painting: 'Pintura',
    cleaning: 'Limpieza',
    fencing: 'Cercas',
    electrical: 'Electricidad',
    general_contractor: 'Contratista General'
  };
  // `other` NO está acá: es ausencia, no etiqueta (R-15). Se verifica abajo.
  assert.equal(INDUSTRIES.length, 10, 'la tabla perdió o ganó una industria');
  for (const [value, label] of Object.entries(esperado)) {
    assert.equal(
      toIndustryLabel(value),
      label,
      `\`${value}\` no resuelve a su etiqueta declarada`
    );
    assert.ok(
      INDUSTRIES.some((i) => i.value === value && i.label === label),
      `la tabla perdió la entrada \`${value}\``
    );
  }
  assert.ok(INDUSTRIES.some((i) => i.value === 'other'));
});

test('T-01 ⭐ R-14 la tabla `INDUSTRIES` está declarada UNA sola vez en todo `src/`', () => {
  const hits: string[] = [];
  const walk = (dir: string, rel = ''): void => {
    for (const e of readdirSync(resolve(REPO, dir), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(`${dir}/${e.name}`, r);
      else if (/\.tsx?$/.test(e.name)) {
        const code = stripComments(read(`${dir}/${e.name}`));
        // Una DECLARACIÓN es `const INDUSTRIES =` / `export const INDUSTRIES`.
        // Un `INDUSTRIES.map(...)` (consumo) no cuenta.
        const n = (code.match(/const\s+INDUSTRIES\s*(?::[^=]*)?=/g) ?? [])
          .length;
        for (let k = 0; k < n; k++) hits.push(r);
      }
    }
  };
  walk('src');
  assert.deepEqual(
    hits,
    ['lib/clients/industry-label.ts'],
    'reapareció una copia de la tabla: mientras haya más de un criterio, uno seguirá ' +
      'emitiendo el código crudo (DT-05). Copias: ' +
      hits.join(', ')
  );
});

test('T-01 ⭐ R-14 los dos formularios CONSUMEN la declaración compartida', () => {
  for (const rel of [
    'src/components/clients/ClientForm.tsx',
    'src/app/(app)/diagnostic/page.tsx'
  ]) {
    const src = read(rel);
    assert.match(
      src,
      /import\s*\{[\s\S]*?INDUSTRIES[\s\S]*?\}\s*from\s*'@\/lib\/clients\/industry-label'/,
      `${rel}: debe importar la tabla, no redeclararla`
    );
    assert.match(
      stripComments(src),
      /INDUSTRIES\.map\s*\(/,
      `${rel}: el \`<select>\` sigue renderizándose desde la tabla`
    );
  }
});

/* ================================================================== */
/*  R-15 / R-16 — los 4 casos de borde, con los valores REALES        */
/* ================================================================== */

test('T-01 ⭐ R-15 `other` NO es un rubro: es ausencia explícita de industria declarada', () => {
  // Caso Clara V Decor literal: el brief salió con "Top 3 en Google Maps para other".
  assert.equal(toIndustryLabel('other'), null);
  assert.equal(toIndustryLabel('OTHER'), null);
  assert.equal(toIndustryLabel('  other  '), null);
  // Y jamás devuelve el token, ni siquiera des-tokenizado.
  assert.notEqual(toIndustryLabel('other'), 'other');
  assert.notEqual(toIndustryLabel('other'), 'Otro');
});

test('T-01 ⭐ R-15 vacío / null / undefined → ausencia, nunca un string de relleno', () => {
  assert.equal(toIndustryLabel(''), null);
  assert.equal(toIndustryLabel('   '), null);
  assert.equal(toIndustryLabel(null), null);
  assert.equal(toIndustryLabel(undefined), null);
});

test('T-01 ⭐ R-16 `portable_toilet_rental_service` (R & M, real) sale DES-TOKENIZADO, nunca crudo', () => {
  const out = toIndustryLabel('portable_toilet_rental_service');
  assert.equal(out, 'portable toilet rental service');
  assert.ok(
    out !== null && !out.includes('_'),
    'un valor fuera de tabla no puede viajar con sus separadores: viajó literal al ' +
      'prompt y al `raw_text` de `b56d1fa3`'
  );
});

test('T-01 ⭐ R-16/R-13 `cleaning` (SCS, real) resuelve a su etiqueta, no al código', () => {
  // El defecto de SCS es el MISMO que el de Clara V con un token que casualmente se
  // lee como palabra: "…encontrar SCS en Google para cleaning en la zona" (DT-02).
  assert.equal(toIndustryLabel('cleaning'), 'Limpieza');
  assert.notEqual(toIndustryLabel('cleaning'), 'cleaning');
});

/* ================================================================== */
/*  isIndustryCodeToken — vocabulario cerrado sin duplicar la tabla    */
/* ================================================================== */

test('T-01 R-13 `isIndustryCodeToken` reconoce el vocabulario cerrado y NO la prosa', () => {
  for (const code of [
    'other',
    'cleaning',
    'landscaping',
    'general_contractor',
    'portable_toilet_rental_service'
  ]) {
    assert.equal(
      isIndustryCodeToken(code),
      true,
      `\`${code}\` es token-código`
    );
  }
  for (const prosa of [
    'Limpieza',
    'Contratista General',
    'decoración de interiores',
    '',
    'Portable Toilet Rental'
  ]) {
    assert.equal(
      isIndustryCodeToken(prosa),
      false,
      `\`${prosa}\` NO es token-código`
    );
  }
});

/* ================================================================== */
/*  Pureza del seam                                                   */
/* ================================================================== */

test('T-01 el módulo es un seam PURO: sin I/O, sin React, sin Supabase', () => {
  const CODE = stripComments(read('src/lib/clients/industry-label.ts'));
  for (const prohibido of ['supabase', 'react', 'fetch(', 'import ']) {
    assert.ok(
      !CODE.includes(prohibido),
      `\`industry-label.ts\` contiene «${prohibido}»: debe ser \`node --test\`-able sin montar nada`
    );
  }
});
