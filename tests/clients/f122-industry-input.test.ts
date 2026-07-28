/**
 * F-122 — T-01 — `src/lib/clients/industry-input.ts`: seam puro del **rubro libre**
 * (R-10, R-11, R-12, R-13).
 *
 * Seam puro: `node --test` directo, sin montar React ni Supabase.
 *
 * Fixtures = **valores reales observados** en producción (R-36), citados con su fila:
 *   · `other`                          → Clara V Decor `122f3593`
 *   · `''`                             → Customize It `b016f86b`
 *   · `portable_toilet_rental_service` → R & M QTB LLC `4a59cbff`
 *   · `cleaning`                       → SCS Cleaning Service `e24ddff3`
 *   · `Decoración de interiores`       → el rubro REAL de Clara V Decor, el caso que
 *     motiva el Slice A (hoy guardado como `other`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  validateFreeIndustry,
  resolveIndustryForPersist,
  normalizeIndustryText
} from '../../src/lib/clients/industry-input.ts';
import { INDUSTRIES } from '../../src/lib/clients/industry-label.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const MODULO = 'src/lib/clients/industry-input.ts';

/* ================================================================== */
/*  ⭐⭐ R-12 — los 9 rubros del vocabulario cerrado se RECHAZAN        */
/* ================================================================== */

test('T-01 ⭐⭐ R-12 tecleado, cada `value` del vocabulario cerrado colisiona y se rechaza', () => {
  // La lista se DERIVA de la declaración única (R-40): si mañana entra un rubro nuevo,
  // este test lo cubre solo.
  const cerrados = INDUSTRIES.map((i) => i.value).filter((v) => v !== 'other');
  assert.equal(
    cerrados.length,
    9,
    'el vocabulario cerrado dejó de tener 9 rubros'
  );
  for (const value of cerrados) {
    const r = validateFreeIndustry(value);
    assert.equal(
      r.ok,
      false,
      `\`${value}\` es una categoría de la lista: tecleada como rubro libre crearía DOS ` +
        'representaciones del mismo rubro (la causa raíz que DT-05 de F-121 eliminó)'
    );
    assert.equal(r.reason, 'collision');
    assert.equal(r.collidesWith, value);
  }
});

test('T-01 ⭐ R-12 la colisión NO depende de mayúsculas, espacios ni acentos', () => {
  for (const variante of ['Cleaning', '  cleaning  ', 'CLEANING', 'cleáning']) {
    const r = validateFreeIndustry(variante);
    assert.equal(
      r.ok,
      false,
      `\`${variante}\` debe colisionar con \`cleaning\``
    );
    assert.equal(r.reason, 'collision');
  }
  // Y la ETIQUETA visible también colisiona: el operador ve "Limpieza" en el desplegable.
  assert.equal(validateFreeIndustry('Limpieza').reason, 'collision');
  assert.equal(normalizeIndustryText('  Decoración  '), 'decoracion');
});

/* ================================================================== */
/*  ⭐⭐ R-13 — los tokens de AUSENCIA se rechazan                      */
/* ================================================================== */

test('T-01 ⭐⭐ R-13 `other` y `otro` se rechazan como AUSENCIA, no como colisión', () => {
  for (const token of ['other', 'otro', 'Otro', 'OTHER', '  other ']) {
    const r = validateFreeIndustry(token);
    assert.equal(
      r.ok,
      false,
      `\`${token}\`: «Otro» + escribir "otro" reproduciría el defecto de Clara V ` +
        '(`122f3593`) con un carácter de diferencia'
    );
    assert.equal(
      r.reason,
      'absence_token',
      'el motivo honesto es «es la ausencia», no «ya existe esa categoría»'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ R-10 — vacío / sólo espacios: «Otro» deja de ser un sumidero    */
/* ================================================================== */

test('T-01 ⭐⭐ R-10 vacío y sólo-espacios se rechazan', () => {
  for (const vacio of ['', '   ', '\t\n ']) {
    const r = validateFreeIndustry(vacio);
    assert.equal(
      r.ok,
      false,
      `\`${JSON.stringify(vacio)}\` no puede persistirse`
    );
    assert.equal(r.reason, 'empty');
  }
  // Tipos no-string tampoco: el campo puede venir `undefined` de un estado sin inicializar.
  assert.equal(validateFreeIndustry(undefined).ok, false);
  assert.equal(validateFreeIndustry(null).ok, false);
  assert.equal(validateFreeIndustry(42).ok, false);
});

/* ================================================================== */
/*  ⭐⭐ R-11 — el rubro válido se persiste VERBATIM (trim)             */
/* ================================================================== */

test('T-01 ⭐⭐ R-11 un rubro real fuera de la lista se acepta y se devuelve VERBATIM', () => {
  const r = validateFreeIndustry('Decoración de interiores');
  assert.equal(
    r.ok,
    true,
    'el rubro REAL de Clara V Decor debe poder capturarse'
  );
  assert.equal(
    r.value,
    'Decoración de interiores',
    'verbatim: ni capitalizado, ni des-acentuado, ni traducido (R-11)'
  );

  const r2 = validateFreeIndustry('  portable toilet rental service  ');
  assert.equal(r2.ok, true);
  assert.equal(r2.value, 'portable toilet rental service', 'sólo trim');
});

/* ================================================================== */
/*  ⭐⭐ H-6 / R-07 — el rubro se RESUELVE a `industry` antes del write  */
/* ================================================================== */

test('T-01 ⭐⭐ H-6 `resolveIndustryForPersist` colapsa (código, rubro libre) en UN valor', () => {
  // Rubro de la lista: no cambia nada.
  assert.equal(resolveIndustryForPersist('cleaning', ''), 'cleaning');
  assert.equal(resolveIndustryForPersist('cleaning', 'lo que sea'), 'cleaning');
  // «Otro» + rubro válido: el rubro libre, verbatim.
  assert.equal(
    resolveIndustryForPersist('other', 'Decoración de interiores'),
    'Decoración de interiores'
  );
  // «Otro» + rubro inválido o ausente: NO hay valor que persistir (R-10) y `other`
  // NUNCA se persiste (R-07).
  for (const malo of ['', '   ', 'other', 'otro', 'cleaning']) {
    assert.equal(
      resolveIndustryForPersist('other', malo),
      null,
      `\`other\` + \`${malo}\` no puede resolverse a un valor persistible`
    );
  }
  assert.equal(resolveIndustryForPersist('', 'algo'), null);
});

test('T-01 ⭐⭐ R-07 `other` NUNCA sale de `resolveIndustryForPersist`', () => {
  const salidas: (string | null)[] = [];
  for (const code of [...INDUSTRIES.map((i) => i.value), '', null, undefined]) {
    for (const libre of ['', 'Decoración de interiores', 'other', 'cleaning']) {
      salidas.push(resolveIndustryForPersist(code, libre));
    }
  }
  assert.ok(salidas.length > 0, 'barrido vacío: guard no-op');
  assert.equal(
    salidas.filter((s) => s === 'other' || s === 'otro').length,
    0,
    'R-07: `other` = ausencia de industria declarada (F-121 R-15). El Slice A captura ' +
      'el rubro REAL; no rehabilita el token.'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-08 — el módulo NO re-declara la tabla: la IMPORTA            */
/* ================================================================== */

test('T-01 ⭐⭐ R-08 `industry-input.ts` importa la declaración única y no la copia', () => {
  const code = stripComments(read(MODULO));
  assert.match(
    code,
    /import\s*\{[^}]*INDUSTRIES[^}]*\}\s*from\s*'\.\/industry-label\.ts'/,
    'la tabla se lee de la declaración única'
  );
  // Ni una copia de la lista: ningún `value:`/`label:` propio, ningún rubro hardcodeado.
  assert.doesNotMatch(
    code,
    /\bvalue:\s*'/,
    'una copia de la tabla acá sería el quinto criterio sobre el mismo dato (R-08)'
  );
  for (const v of INDUSTRIES.map((i) => i.value)) {
    if (v === 'other') continue; // `other` es token de ausencia, no una copia de la tabla
    assert.ok(
      !code.includes(`'${v}'`),
      `\`${v}\` está hardcodeado en el módulo: la tabla debe derivarse, no enumerarse`
    );
  }
});

test('T-01 ⭐ el seam es PURO: sin I/O, sin red, sin Supabase, sin React', () => {
  const code = stripComments(read(MODULO));
  for (const prohibido of [
    'supabase',
    'fetch(',
    'require(',
    'node:fs',
    'react',
    'process.env'
  ]) {
    assert.ok(
      !code.toLowerCase().includes(prohibido.toLowerCase()),
      `${MODULO} dejó de ser puro: menciona \`${prohibido}\``
    );
  }
});
