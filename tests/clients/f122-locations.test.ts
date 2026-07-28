/**
 * F-122 — T-06 / T-07 — **La ciudad tiene UNA sola superficie válida**
 * (R-21, R-22, R-23).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * QUÉ ESTABA MAL
 * ─────────────────────────────────────────────────────────────────────────────────
 * El mismo dato tenía **dos superficies con reglas distintas**: el Brief usaba un
 * `<select>` alimentado por `locations_reference` (57 filas) y el **alta** un `<input>`
 * de texto libre **sin validar nada**. Agregar ciudades al catálogo sin unificar las
 * superficies no alcanza: deja el alta aceptando cualquier string.
 *
 * ⚠️ **Y no es el sitio por el que entró el defecto verificado.** Las 2 filas con
 * marcador las escribió el ESPEJO del Brief (§0), no un formulario — eso lo cierra el
 * Slice C (T-09/T-10). El Slice B cierra la puerta que quedaba abierta, no la que se usó.
 *
 * Fixtures reales (R-36): `Buellton` y `Santa Maria` **están** en el catálogo (son las
 * ciudades reales de 2 clientes); `[PENDIENTE]` **no** está — es la deuda del operador en
 * SCS `e24ddff3` y Clara V `122f3593`, y R-23 la hace VISIBLE en vez de taparla.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  fetchLocations,
  isCityInCatalog,
  locationOptionLabel,
  LOCATIONS_TABLE,
  LOCATIONS_PROJECTION,
  LOCATIONS_STATE,
  LOCATIONS_ORDER,
  type LocationRef
} from '../../src/lib/clients/locations.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ALTA_REL = 'src/app/(app)/diagnostic/page.tsx';
const BRIEF_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const SELECT_REL = 'src/components/clients/CitySelect.tsx';

/** Fixture del catálogo, con los valores reales de producción (R-36). */
const CATALOGO: LocationRef[] = [
  { city: 'Buellton', county: 'Santa Barbara', region: 'Central Coast' },
  { city: 'Santa Maria', county: 'Santa Barbara', region: 'Central Coast' }
];

/* ================================================================== */
/*  ⭐⭐ R-22 — UNA sola consulta a `locations_reference` en el repo     */
/* ================================================================== */

test('T-06 ⭐⭐ R-22 `locations_reference` se consulta en UN solo sitio de todo `src/`', () => {
  const consultas: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(resolve(REPO, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (/\.tsx?$/.test(e.name)) {
        const code = stripComments(read(r));
        const n = (code.match(/locations_reference/g) ?? []).length;
        for (let i = 0; i < n; i++) consultas.push(r);
      }
    }
  };
  walk('src');
  assert.deepEqual(
    consultas,
    ['src/lib/clients/locations.ts'],
    'R-22: antes había exactamente UNA consulta (en el Brief) y el alta no consultaba ' +
      'nada. Tras F-122 debe seguir habiendo UNA, ahora COMPARTIDA. Dos consultas ' +
      'equivalentes-pero-separadas reproducen la clase de fallo de DT-05 en otro dato.'
  );
});

test('T-06 ⭐⭐ R-22 la proyección, el filtro y el orden se declaran una sola vez', () => {
  assert.equal(LOCATIONS_TABLE, 'locations_reference');
  assert.equal(
    LOCATIONS_PROJECTION,
    'city, county, zip_codes, region',
    'la proyección debe ser IDÉNTICA a la que el Brief usaba: cambiarla en silencio ' +
      'alteraría la forma de las opciones de una pantalla que el operador ya conoce'
  );
  assert.equal(LOCATIONS_STATE, 'CA');
  assert.deepEqual(LOCATIONS_ORDER, ['region', 'city']);
});

test('T-06 ⭐ la consulta declarada es la que se ejecuta (doble inyectado, sin red)', () => {
  const llamadas: string[] = [];
  const doble = {
    from(table: string) {
      llamadas.push(`from:${table}`);
      const chain = {
        select(p: string) {
          llamadas.push(`select:${p}`);
          return chain;
        },
        eq(col: string, val: string) {
          llamadas.push(`eq:${col}=${val}`);
          return chain;
        },
        order(col: string) {
          llamadas.push(`order:${col}`);
          return chain;
        },
        then: (res: (v: { data: unknown }) => unknown) =>
          Promise.resolve({ data: CATALOGO }).then(res)
      };
      return chain;
    }
  };
  return fetchLocations(doble as never).then((rows) => {
    assert.deepEqual(llamadas, [
      'from:locations_reference',
      'select:city, county, zip_codes, region',
      'eq:state=CA',
      'order:region',
      'order:city'
    ]);
    assert.deepEqual(rows, CATALOGO);
  });
});

test('T-06 ⭐ sin datos, el catálogo queda VACÍO — nunca "cualquier string vale"', () => {
  const doble = {
    from() {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        then: (res: (v: { data: unknown }) => unknown) =>
          Promise.resolve({ data: null }).then(res)
      };
      return chain;
    }
  };
  return fetchLocations(doble as never).then((rows) => {
    assert.deepEqual(rows, []);
  });
});

/* ================================================================== */
/*  ⭐⭐ R-23 — el valor FUERA de catálogo se señala y NO se pierde      */
/* ================================================================== */

test('T-06 ⭐⭐ R-23 `Buellton` y `Santa Maria` están en catálogo; `[PENDIENTE]` no', () => {
  assert.equal(isCityInCatalog('Buellton', CATALOGO), true);
  assert.equal(isCityInCatalog('Santa Maria', CATALOGO), true);
  assert.equal(
    isCityInCatalog('[PENDIENTE]', CATALOGO),
    false,
    'la deuda de SCS `e24ddff3` y Clara V `122f3593` tiene que ser DETECTABLE'
  );
  // Ausencia ≠ fuera de catálogo: señalar un vacío como inválido sería inventar un defecto.
  assert.equal(isCityInCatalog('', CATALOGO), true);
  assert.equal(isCityInCatalog(null, CATALOGO), true);
  assert.equal(isCityInCatalog(undefined, CATALOGO), true);
});

test('T-06 ⭐⭐ R-23 el selector CONSERVA el valor fuera de catálogo y lo SEÑALA', () => {
  const src = stripComments(read(SELECT_REL));
  // El valor fuera de catálogo entra como opción propia ⇒ el `<select>` lo muestra.
  assert.match(
    src,
    /fueraDeCatalogo && \(\s*<option value=\{value\}>/,
    'R-23/R-04: hoy el `<select>` con `value="[PENDIENTE]"` y sin opción coincidente no ' +
      'muestra NADA: el operador no puede saber qué tiene guardado. Vaciarlo sería peor ' +
      '(F-121 R-29: el sistema no borra ni sobrescribe un valor).'
  );
  assert.match(src, /fuera de catálogo/, 'el valor debe SEÑALARSE como tal');
  // Y no hay ninguna ruta que lo vacíe.
  assert.ok(
    !/onChange=\{\(\) =>[\s\S]{0,40}''\)/.test(src),
    'el componente vacía el valor por su cuenta'
  );
});

test('T-06 ⭐ la forma de la opción es una sola: `Ciudad (Condado)`', () => {
  assert.equal(
    locationOptionLabel(CATALOGO[0]),
    'Buellton (Santa Barbara)',
    'misma forma que el `<select>` del Brief usaba'
  );
  assert.equal(locationOptionLabel({ city: 'X', county: '' }), 'X');
  // El componente NO reimplementa la forma: la importa.
  const src = stripComments(read(SELECT_REL));
  assert.match(src, /locationOptionLabel\(loc\)/);
  assert.ok(
    !/\{loc\.city\} \(\{loc\.county\}\)/.test(src),
    'la forma de la opción quedó reimplementada dentro del componente'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-21 / T-07 — el alta ya NO acepta texto libre para `city`     */
/* ================================================================== */

test('T-07 ⭐⭐⭐ R-21 en el alta NO queda un `<input>` libre para la ciudad', () => {
  const alta = stripComments(read(ALTA_REL));
  assert.ok(
    !/<Input[\s\S]{0,200}?value=\{newClientData\.city\}/.test(alta),
    'R-21: `diagnostic/page.tsx` era un `<input>` de texto libre — **la puerta que ' +
      'aceptaba cualquier string**. Agregar ciudades sin unificar no alcanza.'
  );
  assert.match(
    alta,
    /<CitySelect\s+value=\{newClientData\.city\}/,
    'el alta debe capturar la ciudad con el selector compartido'
  );
});

test('T-07 ⭐⭐⭐ R-21/R-22 las DOS superficies renderizan el MISMO selector, derivado de la declaración', () => {
  const alta = stripComments(read(ALTA_REL));
  const brief = stripComments(read(BRIEF_REL));
  for (const [rel, src] of [
    [ALTA_REL, alta],
    [BRIEF_REL, brief]
  ] as [string, string][]) {
    assert.match(
      src,
      /import \{ CitySelect \} from '@\/components\/clients\/CitySelect'/,
      `${rel}: no consume el selector compartido`
    );
    assert.match(
      src,
      /<CitySelect/,
      `${rel}: no renderiza el selector compartido`
    );
    // Y ninguna arma sus propias `<option>` de ciudad.
    assert.ok(
      !/<option key=\{loc\.city\}/.test(src),
      `${rel}: reapareció una lista de opciones propia ⇒ dos criterios sobre el mismo dato`
    );
  }
  // Las opciones salen de la declaración, no de una lista escrita en la pantalla.
  const sel = stripComments(read(SELECT_REL));
  assert.match(sel, /locations\.map\(\(loc\) =>/);
  assert.ok(
    !/'Santa Maria'|'Buellton'/.test(sel),
    'R-40: el catálogo está hardcodeado en el componente'
  );
});

test('T-07 ⭐ el Brief ya no declara su propio `LocationRef` ni su propia consulta', () => {
  const brief = stripComments(read(BRIEF_REL));
  assert.ok(
    !/interface LocationRef/.test(brief),
    'el tipo del catálogo se declara una sola vez, junto a la consulta'
  );
  assert.match(brief, /fetchLocations\(supabase\)/);
});
