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
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  canonicalizeCity,
  fetchLocations,
  isCityInCatalog,
  locationOptionLabel,
  normalizeCityKey,
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

/**
 * ⭐ **Anclas declaradas (R-55).** `9509f6f` = estado **previo a F-122** — el que este
 * archivo necesita para el anti-no-op de R-49: ahí vivían las DOS superficies divergentes
 * que el Slice B unificó. **Nunca `HEAD`.**
 */
const BASE = '9509f6f';
const desdeElAncla = (rel: string): string =>
  execFileSync('git', ['show', `${BASE}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });

/** Todo `src/` en memoria, sin comentarios: la fuente de la que se DERIVA (R-40). */
function fuentesDeSrc(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (rel: string): void => {
    for (const e of readdirSync(resolve(REPO, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (/\.tsx?$/.test(e.name)) out.set(r, stripComments(read(r)));
    }
  };
  walk('src');
  return out;
}

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
  // ⚠️ [ENMIENDA 2026-07-28 · ruptura mecánica declarada] El assert anterior exigía
  // `fueraDeCatalogo && (<option value={value}>…)`: era la ÚNICA forma que tenía un
  // `<select>` de mostrar un valor sin opción coincidente. Con el COMBOBOX (R-21
  // enmendado) el valor está **en el control mismo**, y una `<option>` fantasma en el
  // `<datalist>` sería teatro. **Lo que el assert protegía —que el operador VEA lo que
  // tiene guardado, esté o no en catálogo— se exige acá, más directo, no más flojo.**
  assert.match(
    src,
    /<input[\s\S]{0,400}?value=\{value\}/,
    'R-23/R-04: antes de F-122 el `<select>` con `value="[PENDIENTE]"` y sin opción ' +
      'coincidente no mostraba NADA: el operador no podía saber qué tenía guardado. El ' +
      'control debe RENDERIZAR el valor actual. Vaciarlo sería peor (F-121 R-29: el ' +
      'sistema no borra ni sobrescribe un valor).'
  );
  // [ENMIENDA] La señal ya no es el rótulo de una `<option>` fantasma: es el texto que
  // acompaña al control. Se exige el MISMO hecho —que el valor externo se señale— sobre
  // la forma que el combobox tiene de hacerlo.
  assert.match(
    src,
    /fueraDeCatalogo && \([\s\S]{0,300}?no está en el catálogo de ciudades/,
    'el valor debe SEÑALARSE como tal'
  );
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
/*  ⭐⭐⭐ R-49 / T-27 — UNA sola SUPERFICIE de captura de ciudad         */
/*  (reemplaza, sin debilitarlo, el assert que la enmienda dejó obsoleto)*/
/* ================================================================== */

/**
 * ⚠️ **RUPTURA MECÁNICA PREVISTA Y DECLARADA (H-10).** Este test afirmaba
 * *"en el alta **NO** queda un `<input>` libre para la ciudad"*. Con **R-21 enmendado**
 * (el catálogo es AYUDA, no cerradura) eso **deja de ser cierto por diseño**.
 *
 * ⭐ **Lo que ese assert protegía nunca fue «que no haya input»: era «que no haya un
 * SEGUNDO criterio sobre el mismo dato».** Ése era el defecto del Slice B —dos
 * superficies con dos reglas—, y **sigue cerrado**. R-49 mide exactamente eso, derivado
 * del repo (R-40): un solo componente de captura, una sola consulta, las dos superficies
 * consumiéndolo, ninguna con lista/control/consulta propios.
 *
 * ⛔ **Prohibido borrar el assert viejo sin poner éste en su lugar** — sería aflojar un
 * guard aprovechando una enmienda de alcance.
 */

/**
 * ¿Este archivo RENDERIZA la lista de ciudades del catálogo? Se deriva de la forma de la
 * lista, no de una lista de archivos: opciones construidas sobre filas de ubicación o un
 * `<datalist>`. **Debe haber exactamente uno** — el control compartido.
 */
function renderizanElCatalogo(fuentes: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [rel, code] of Array.from(fuentes)) {
    if (/<datalist/.test(code) || /<option[^>]*key=\{loc\.city\}/.test(code))
      out.push(rel);
  }
  return out.sort();
}

/**
 * ¿Este archivo **captura la ciudad de un cliente**? Dos condiciones, las dos derivadas:
 * (i) escribe en `clients` y (ii) tiene un control ligado a ese `city`.
 *
 * La condición (i) es la que separa una superficie de captura de un campo homónimo que
 * **no se persiste** (`nap/[clientId]` arma una URL de búsqueda con una ciudad de
 * pantalla; `credentials/[clientId]` edita una *licencia municipal*). Medir sin ella
 * pondría rojo un archivo que no tiene nada que ver con `clients.city`.
 */
function superficiesQueCapturanCiudad(fuentes: Map<string, string>): string[] {
  const out: string[] = [];
  for (const [rel, code] of Array.from(fuentes)) {
    if (rel === SELECT_REL) continue;
    const escribeClients =
      /from\('clients'\)[\s\S]{0,160}?\.(?:insert|update|upsert)\(/.test(code);
    const controlDeCiudad =
      /<CitySelect/.test(code) ||
      /value=\{(?:[A-Za-z_$][\w$]*\.)?city\}/.test(code);
    if (escribeClients && controlDeCiudad) out.push(rel);
  }
  return out.sort();
}

test('T-27 ⭐⭐⭐ R-49 hay UNA sola superficie de captura de ciudad, y las dos pantallas la consumen', () => {
  const fuentes = fuentesDeSrc();
  assert.deepEqual(
    renderizanElCatalogo(fuentes),
    [SELECT_REL],
    'R-49: apareció una SEGUNDA lista de ciudades. Ésa —y no «que exista un input»— era ' +
      'la forma del defecto del Slice B: dos superficies con dos criterios sobre el ' +
      'MISMO dato. El vocabulario abierto levanta la cerradura, NO la unificación.'
  );
  const superficies = superficiesQueCapturanCiudad(fuentes);
  assert.deepEqual(
    superficies,
    [ALTA_REL, BRIEF_REL].sort(),
    'las superficies que capturan la ciudad cambiaron: el guard debe medirlas a todas'
  );
  for (const rel of superficies) {
    const code = fuentes.get(rel) as string;
    assert.match(
      code,
      /import \{ CitySelect \} from '@\/components\/clients\/CitySelect'/,
      `${rel}: captura la ciudad SIN el control compartido`
    );
    assert.ok(
      !/locations_reference/.test(code),
      `${rel}: declaró su propia consulta al catálogo (R-22/R-49)`
    );
    assert.ok(
      !/<option[^>]*\bkey=\{loc\.city\}/.test(code) && !/<datalist/.test(code),
      `${rel}: declaró su propia lista de opciones de ciudad (R-49)`
    );
  }
});

test('T-27 ⭐⭐⭐ R-49 ANTI-NO-OP: contra `9509f6f` el guard ENCUENTRA las dos superficies divergentes', () => {
  const antes = new Map<string, string>();
  for (const rel of [ALTA_REL, BRIEF_REL]) {
    antes.set(rel, stripComments(desdeElAncla(rel)));
  }
  // En el ancla, el alta tenía su `<Input>` libre y el Brief su `<select>` propio con su
  // propia consulta: DOS superficies, DOS criterios. El guard tiene que verlas.
  assert.deepEqual(
    superficiesQueCapturanCiudad(antes),
    [ALTA_REL, BRIEF_REL].sort(),
    'si el derivador no encuentra las DOS superficies divergentes del ancla, no está ' +
      'midiendo el mundo: está pasando por construcción (CL-109)'
  );
  // Y ahí la lista de ciudades la renderizaba el Brief POR SU CUENTA — el segundo
  // criterio sobre el mismo dato, que es exactamente lo que R-49 prohíbe.
  assert.deepEqual(
    renderizanElCatalogo(antes),
    [BRIEF_REL],
    'en el ancla el Brief armaba su propia lista de opciones de ciudad'
  );
  assert.match(
    antes.get(BRIEF_REL) as string,
    /locations_reference/,
    'en el ancla, el Brief consultaba el catálogo por su cuenta'
  );
  assert.ok(
    !/import \{ CitySelect \}/.test(antes.get(ALTA_REL) as string),
    'en el ancla no existía ningún control compartido'
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

/* ================================================================== */
/*  ⭐⭐⭐ T-24 / R-21 enmendado — COMBOBOX: la lista es AYUDA           */
/* ================================================================== */

test('T-24 ⭐⭐⭐ R-21 enmendado el control ofrece el catálogo Y permite ESCRIBIR una ciudad ausente', () => {
  const src = stripComments(read(SELECT_REL));
  // Combobox nativo: un `<input list>` alimentado por un `<datalist>` derivado del
  // catálogo. La lista se ofrece; el texto libre es la salida.
  assert.match(
    src,
    /<input[\s\S]{0,300}?list=\{listId\}/,
    'R-21 enmendado: el control debe aceptar TEXTO, no sólo elegir de una lista cerrada'
  );
  assert.match(
    src,
    /<datalist id=\{listId\}>[\s\S]*?locations\.map\(\(loc\) =>/,
    'las opciones deben salir de la declaración única, no de una lista escrita acá'
  );
  assert.ok(
    !/<select/.test(src),
    'un `<select>` no puede aceptar una ciudad ausente: la cerradura se levantó'
  );
  // Y sigue siendo UN control, no dos (R-49).
  assert.equal(
    (src.match(/<input/g) ?? []).length,
    1,
    'R-49: un solo control de captura dentro del componente compartido'
  );
});

test('T-24 ⭐⭐⭐ R-47 la colisión de tipeo se cierra contra el catálogo, en el seam', () => {
  // Las tres formas de la MISMA ciudad aterrizan en la forma canónica del catálogo.
  for (const escrito of [
    'santa maria',
    'Santa María',
    '  SANTA MARIA  ',
    'SaNtA   maria'
  ]) {
    assert.equal(
      canonicalizeCity(escrito, CATALOGO),
      'Santa Maria',
      `«${escrito}» debía resolverse a la forma canónica del catálogo (R-47)`
    );
  }
  assert.equal(canonicalizeCity('buellton', CATALOGO), 'Buellton');
  // La clave normaliza para COMPARAR, nunca para persistir.
  assert.equal(normalizeCityKey('  Santa María  '), 'santa maria');
  assert.equal(normalizeCityKey(null), '');
});

test('T-24 ⭐⭐⭐ R-48 una ciudad AUSENTE se persiste VERBATIM (trim), sin inventar forma', () => {
  assert.equal(canonicalizeCity('Lompoc', CATALOGO), 'Lompoc');
  assert.equal(canonicalizeCity('  los alamos ', CATALOGO), 'los alamos');
  assert.equal(
    canonicalizeCity('lompoc', CATALOGO),
    'lompoc',
    'R-48: no se capitaliza ni se corrige — inventaría una forma que nadie declaró. ' +
      'Éste es el residuo DECLARADO de DT-04(2): dos ciudades ausentes tipeadas ' +
      'distinto no tienen contra qué compararse.'
  );
  // La ausencia sigue siendo ausencia.
  assert.equal(canonicalizeCity('', CATALOGO), '');
  assert.equal(canonicalizeCity(null, CATALOGO), '');
  // Y el marcador NO es una ciudad: se preserva tal cual para que el guard de captura
  // lo bloquee más adelante (R-28); canonicalizar no es sanear.
  assert.equal(
    canonicalizeCity('[' + 'PENDIENTE' + ']', CATALOGO),
    '[PENDIENTE]'
  );
});

test('T-24 ⭐⭐ R-23 la señal de «fuera de catálogo» se CONSERVA y no se vuelve un reproche', () => {
  const src = stripComments(read(SELECT_REL));
  assert.match(
    src,
    /no está en el catálogo de ciudades/,
    'la señal debe seguir existiendo'
  );
  assert.match(
    src,
    /Se conserva tal cual/,
    'R-23: sobre un valor deliberado la señal es INFORMACIÓN, no error'
  );
  assert.ok(
    !/(?:Error|inválid|corregi|no permitid)/i.test(src),
    'R-23: tras la enmienda «fuera de catálogo» puede ser una ciudad escrita A ' +
      'PROPÓSITO. La señal informa; no reprocha.'
  );
  // Y no se rotula como fuera de catálogo lo que va a persistirse como ciudad del
  // catálogo: `santa maria` canonicaliza a `Santa Maria` ⇒ no es un valor externo.
  assert.match(
    src,
    /isCityInCatalog\(\s*canonicalizeCity\(value, locations\)/,
    'la señal debe medirse sobre lo que se VA A PERSISTIR'
  );
  assert.equal(
    isCityInCatalog(canonicalizeCity('santa maria', CATALOGO), CATALOGO),
    true
  );
  assert.equal(
    isCityInCatalog(canonicalizeCity('Lompoc', CATALOGO), CATALOGO),
    false
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ T-25 / R-24…R-27, R-48 — la CARGA se retiró: cero writes      */
/* ================================================================== */

test('T-25 ⭐⭐⭐ R-24 no queda NINGÚN archivo de carga de `locations_reference` en `supabase/`', () => {
  const encontrados: string[] = [];
  const walk = (rel: string): void => {
    let entradas;
    try {
      entradas = readdirSync(resolve(REPO, rel), { withFileTypes: true });
    } catch {
      return; // el directorio puede no existir: eso es exactamente lo deseado
    }
    for (const e of entradas) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (/\.sql$/.test(e.name)) {
        if (/locations_reference/i.test(read(r))) encontrados.push(r);
      }
    }
  };
  walk('supabase');
  assert.deepEqual(
    encontrados,
    [],
    'DT-07(b): un `.sql` de carga en `supabase/` **no es documentación, es un ' +
      'ejecutable**, y marcarlo «no usado» con un comentario sería una convención sin ' +
      'enforcement — la tesis que R-18/R-34 dedican dos requerimientos a refutar. ' +
      'Recuperación en un comando: `git show 86fae28:supabase/seed/locations_ca.sql`.'
  );
});

test('T-25 ⭐⭐⭐ R-48 NINGÚN sitio del repo escribe en `locations_reference` (derivado, no enumerado)', () => {
  const escrituras: string[] = [];
  for (const [rel, code] of Array.from(fuentesDeSrc())) {
    const i = code.indexOf('locations_reference');
    if (i < 0) continue;
    // Toda mención se inspecciona: lo prohibido es que la tabla aparezca cerca de una
    // escritura, no que se la nombre.
    if (/\.(insert|update|upsert|delete)\s*\(/.test(code))
      escrituras.push(`${rel} (cliente)`);
  }
  const walkSql = (rel: string): void => {
    let entradas;
    try {
      entradas = readdirSync(resolve(REPO, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walkSql(r);
      else if (/\.sql$/.test(e.name)) {
        const sql = read(r);
        if (
          /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+locations_reference/i.test(
            sql
          )
        )
          escrituras.push(`${r} (sql)`);
      }
    }
  };
  walkSql('supabase');
  assert.deepEqual(
    escrituras,
    [],
    '⭐ CERO escrituras a producción. Dar de alta la ciudad escrita reintroduciría por ' +
      'la puerta de atrás la escritura que R-24 acaba de retirar, y sin ninguna ' +
      'revisión humana de por medio: el catálogo es CURADO, la captura es del cliente.'
  );
});

test('T-25 ⭐⭐ ANTI-NO-OP: contra `86fae28` el mismo derivador SÍ encuentra la carga', () => {
  const enPostOffline = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', '86fae28', 'supabase/'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  )
    .split('\n')
    .filter((p) => /\.sql$/.test(p))
    .filter((p) =>
      /\bINSERT\s+INTO\s+locations_reference/i.test(
        execFileSync('git', ['show', `86fae28:${p}`], {
          cwd: REPO,
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024
        })
      )
    );
  assert.deepEqual(
    enPostOffline,
    ['supabase/seed/locations_ca.sql'],
    'si el derivador no encontrara la carga donde SÍ estaba, el verde de T-25 sería ' +
      'verde por no mirar (CL-109)'
  );
});
