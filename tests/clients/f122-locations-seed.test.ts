/**
 * F-122 — T-08 — **La carga de `locations_reference`: idempotente, sólo `INSERT`, con
 * procedencia declarada** (R-24, R-25, R-26).
 *
 * El archivo se **escribe** acá y se **ejecuta** en T-18 (`[LIVE⛔]`, acción de frontera
 * gateada por F-074). Este test verifica offline **todo lo que se puede verificar sin
 * tocar producción**: que la sentencia sea la que dice ser.
 *
 * ⚠️ **Por qué no hay `ON CONFLICT` (E-4 / H-1):** `locations_reference` **no tiene
 * unique constraint** sobre `(city, state)` — `pg_constraint` devuelve exactamente una
 * fila, la PK sobre `id`. `ON CONFLICT` no es aplicable y **crear la constraint sería
 * DDL** (R-05, prohibido). Sin la guarda `WHERE NOT EXISTS`, una segunda corrida
 * duplicaría filas, y un duplicado además rompe `key={loc.city}` en el `<select>` del
 * Brief (H-2) ⇒ R-27 (i) no es cosmético.
 *
 * **Nota de método:** las prohibiciones se miden sobre el **SQL**, con los comentarios
 * (`--`) removidos. La cabecera NOMBRA lo prohibido para explicar por qué está
 * prohibido; medirla como si fuera código sería la forma degenerada de un guard que se
 * encuentra a sí mismo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const SEED_REL = 'supabase/seed/locations_ca.sql';
const SEED = readFileSync(resolve(REPO, SEED_REL), 'utf8');

/** El SQL sin comentarios de línea: lo que Postgres realmente ejecuta. */
const SQL = SEED.split('\n')
  .filter((l) => !/^\s*--/.test(l))
  .join('\n')
  .trim();

/** Las sentencias reales, separadas por `;`. */
const SENTENCIAS = SQL.split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

/* ================================================================== */
/*  ⭐⭐⭐ R-26 — SÓLO `INSERT`: ni un `UPDATE`, ni un `DELETE`, ni DDL   */
/* ================================================================== */

test('T-08 ⭐⭐⭐ R-26 el archivo no contiene `DELETE`, `UPDATE`, `ALTER`, `CREATE` ni `DROP`', () => {
  for (const prohibido of [
    /\bDELETE\b/i,
    /\bUPDATE\b/i,
    /\bALTER\b/i,
    /\bCREATE\b/i,
    /\bDROP\b/i,
    /\bTRUNCATE\b/i
  ]) {
    assert.doesNotMatch(
      SQL,
      prohibido,
      `la carga ejecuta \`${prohibido.source}\`: R-26 la limita a INSERT. Las 57 filas ` +
        'actuales quedan intactas, incluidas `Buellton` y `Santa Maria`, que son las ' +
        'ciudades reales de dos clientes (E-1).'
    );
  }
  assert.ok(
    SENTENCIAS.length > 0,
    'el archivo no tiene ninguna sentencia: guard no-op'
  );
  for (const s of SENTENCIAS) {
    assert.match(
      s,
      /^INSERT INTO locations_reference/i,
      `sentencia que no es un INSERT a \`locations_reference\`: «${s.slice(0, 60)}…»`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ R-25 — idempotencia por GUARDA DE EXISTENCIA, no `ON CONFLICT` */
/* ================================================================== */

test('T-08 ⭐⭐⭐ R-25 CADA sentencia lleva su `WHERE NOT EXISTS` sobre `(city, state)`', () => {
  for (const s of SENTENCIAS) {
    assert.match(
      s,
      /WHERE NOT EXISTS\s*\(\s*SELECT 1\s+FROM locations_reference l\s+WHERE l\.city = c\.city\s+AND l\.state = 'CA'/i,
      'R-25: sin la guarda de existencia, correr la carga dos veces DUPLICA filas — y no ' +
        'hay unique constraint que lo impida (E-4)'
    );
  }
});

test('T-08 ⭐⭐⭐ R-25 la carga NO usa `ON CONFLICT` (no es aplicable: no hay constraint)', () => {
  assert.doesNotMatch(
    SQL,
    /ON\s+CONFLICT/i,
    'E-4/H-1: `locations_reference` sólo tiene PK sobre `id`. Un `ON CONFLICT (city, ' +
      'state)` fallaría en ejecución, y crear la constraint sería DDL (R-05).'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-24 — la forma del INSERT y sus defaults                       */
/* ================================================================== */

test('T-08 ⭐⭐ R-24 el INSERT escribe `city`, `county`, `state` y deja el resto en su default', () => {
  assert.match(SQL, /INSERT INTO locations_reference \(city, county, state\)/i);
  assert.match(SQL, /SELECT c\.city, c\.county, 'CA'/i);
  // `zip_codes` (default `'{}'`), `active` (default `true`) y `region` no se tocan.
  for (const col of ['zip_codes', 'active', 'region', 'population', 'id']) {
    assert.ok(
      !new RegExp(`\\b${col}\\b`).test(SQL),
      `la carga escribe \`${col}\`: R-24 dice qué columnas se pueblan; el resto queda en ` +
        'su default declarado por la tabla'
    );
  }
});

test('T-08 ⭐⭐ R-24 la lista trae las ciudades reales de la cartera y bastantes más', () => {
  const filas = Array.from(SQL.matchAll(/\('([^']+)', '([^']+)'\)/g), (m) => ({
    city: m[1],
    county: m[2]
  }));
  assert.ok(
    filas.length > 57,
    `sólo ${filas.length} ciudades: la tabla ya tiene 57 y R-27 (ii) exige que crezca`
  );
  // Cero duplicados en la FUENTE (la verificación en la tabla es R-27, tarea T-18).
  const vistas = new Set<string>();
  const dupes: string[] = [];
  for (const f of filas) {
    if (vistas.has(f.city)) dupes.push(f.city);
    vistas.add(f.city);
  }
  assert.deepEqual(
    dupes,
    [],
    'la propia lista trae duplicados: la guarda `WHERE NOT EXISTS` no los detiene ' +
      'DENTRO de una misma sentencia (el `NOT EXISTS` mira la tabla, no las filas ' +
      'candidatas) ⇒ entrarían las dos'
  );
  // Las ciudades reales de la cartera (E-1) están cubiertas: R-27 (iii).
  for (const real of ['Buellton', 'Santa Maria']) {
    assert.ok(
      vistas.has(real),
      `\`${real}\` es la ciudad real de un cliente y falta en la lista (R-27 iii)`
    );
  }
  // Y el padrón cubre bastante más que los 2 condados con clientes (DT-04, opción b
  // frente a la (a)): el próximo cliente de otro condado tiene que encontrar su ciudad.
  const condados = new Set(filas.map((f) => f.county));
  assert.ok(
    condados.size >= 40,
    `sólo ${condados.size} condados: la opción (a) de DT-04 —"sólo los condados con ` +
      'clientes"— reproduce el fallo exacto que estamos cerrando'
  );
});

/* ================================================================== */
/*  ⭐⭐ La PROCEDENCIA está declarada — y sus límites también           */
/* ================================================================== */

test('T-08 ⭐⭐ la cabecera declara fuente, fecha y criterio de inclusión', () => {
  const cabecera = SEED.split('INSERT INTO')[0];
  assert.match(
    cabecera,
    /Fuente/i,
    'la cabecera no declara la FUENTE de la lista'
  );
  assert.match(cabecera, /2026-07-28/, 'la cabecera no declara la FECHA');
  assert.match(
    cabecera,
    /Criterio de inclusion/i,
    'la cabecera no declara el CRITERIO de inclusión'
  );
  assert.match(
    cabecera,
    /INCORPORADOS/i,
    'el criterio debe ser explícito: municipios incorporados, no CDPs'
  );
  // ⭐ Y declara lo que NO promete: la completitud de un padrón externo no es auditable
  // desde este repo, y prometerla sería falsa nitidez.
  assert.match(
    cabecera,
    /NO una prueba de completitud|NO \*\*PROMETE\*\*/i,
    'la cabecera promete completitud sin poder demostrarla (R-27)'
  );
  assert.match(
    cabecera,
    /NO se descargo ni se verifico contra un padron oficial/i,
    'la cabecera debe declarar que la lista NO se verificó contra un padrón oficial: es ' +
      'la condición honesta bajo la que el operador decide ejecutarla'
  );
});

test('T-08 ⭐ la ejecución queda declarada como acción de FRONTERA gateada', () => {
  const cabecera = SEED.split('INSERT INTO')[0];
  assert.match(cabecera, /F-074/, 'la cabecera no declara el gate de frontera');
  assert.match(cabecera, /T-18/, 'la cabecera no dice en qué tarea se ejecuta');
  assert.match(
    cabecera,
    /DOS VECES/i,
    'la prueba real de la idempotencia sin unique constraint es correrla dos veces'
  );
});
