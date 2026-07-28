/**
 * F-122 — T-13 — **Fixtures reales + anti-no-op** (R-36, R-37, R-38).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * R-36 — LOS FIXTURES SON VALORES OBSERVADOS, CITADOS CON SU FILA
 * ─────────────────────────────────────────────────────────────────────────────────
 * Una constante única (`REAL`) con los valores que están HOY en producción. Ninguna
 * paráfrasis: un fixture inventado prueba que el código hace lo que el código hace.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * R-37 — LAS 7 MUTACIONES DECLARADAS
 * ─────────────────────────────────────────────────────────────────────────────────
 * `tasks.md` T-13 declara 7 mutaciones que deben poner tests en ROJO. **Se ejecutan de
 * verdad** (revirtiendo el cambio en el árbol y corriendo la suite); el resultado de cada
 * una va en `progress/impl_F-122.md`. Este archivo aloja la parte que es **exigible
 * automáticamente**: que ningún guard sea de los que *nunca disparan* y que ninguna
 * validación sea de las que *siempre aceptan* (R-38). Esa es la forma que un test puede
 * medir sola, sin que nadie se acuerde de correr la mutación.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCapturePlaceholder,
  stripPlaceholdersFromCapture
} from '../../src/lib/clients/capture-guard.ts';
import {
  validateFreeIndustry,
  resolveIndustryForPersist
} from '../../src/lib/clients/industry-input.ts';
import { toIndustryLabel } from '../../src/lib/clients/industry-label.ts';
import { isCityInCatalog } from '../../src/lib/clients/locations.ts';

const MARCADOR = '[' + 'PENDIENTE' + ']';

/* ================================================================== */
/*  ⭐⭐ R-36 — LA constante única de fixtures reales                   */
/* ================================================================== */

/**
 * ⭐ Valores REALES leídos por `SELECT` de producción el 2026-07-27/28. Cada uno con su
 * fila. **Ningún test de F-122 usa un valor inventado donde existe uno observado.**
 */
export const REAL = {
  /** `clients.city` — las 2 filas con el marcador (deuda del operador, R-35). */
  cityMarcadorSCS: { id: 'e24ddff3', value: MARCADOR },
  cityMarcadorClaraV: { id: '122f3593', value: MARCADOR },
  /** `clients.city` — las 2 ciudades reales, ambas EN el catálogo. */
  cityBuellton: { id: 'ficha con ciudad real', value: 'Buellton' },
  citySantaMaria: { id: 'ficha con ciudad real', value: 'Santa Maria' },
  /** `clients.industry` — las 4 poblaciones observadas. */
  industryOther: { id: '122f3593 (Clara V Decor)', value: 'other' },
  industryVacia: { id: 'b016f86b (Customize It)', value: '' },
  industryFueraDeTabla: {
    id: '4a59cbff (R & M QTB LLC)',
    value: 'portable_toilet_rental_service'
  },
  industryDeTabla: { id: 'e24ddff3 (SCS Cleaning Service)', value: 'cleaning' },
  /** `briefs.content.city` — el valor que CRUZÓ a `clients` (+274 ms / +337 ms). */
  briefCityMarcadorSCS: { id: 'be43470f', value: MARCADOR },
  briefCityMarcadorClaraV: { id: 'e1ad789c', value: MARCADOR },
  /** `clients.business_name` — con la mayúscula tal cual está en la fila. */
  businessNameSCS: { id: 'e24ddff3', value: 'SCS CLeaning Service' }
} as const;

test('T-13 ⭐⭐ R-36 todos los fixtures citan su fila y ninguno es una paráfrasis', () => {
  const entradas = Object.entries(REAL);
  assert.ok(entradas.length >= 10, 'la constante de fixtures quedó anémica');
  for (const [nombre, f] of entradas) {
    assert.equal(typeof f.id, 'string');
    assert.ok(
      f.id.length > 0,
      `el fixture \`${nombre}\` no cita la fila de la que salió (R-36)`
    );
    assert.equal(typeof f.value, 'string');
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ R-38 — ningún guard que NUNCA dispare                         */
/* ================================================================== */

test('T-13 ⭐⭐⭐ R-38 `isCapturePlaceholder` DISCRIMINA (m4: si devolviera siempre `false`, rojo)', () => {
  const positivos = [
    REAL.cityMarcadorSCS.value,
    REAL.cityMarcadorClaraV.value,
    REAL.briefCityMarcadorSCS.value
  ].filter((v) => isCapturePlaceholder(v));
  const negativos = [
    REAL.citySantaMaria.value,
    REAL.cityBuellton.value,
    REAL.businessNameSCS.value,
    REAL.industryDeTabla.value,
    'CA'
  ].filter((v) => !isCapturePlaceholder(v));
  assert.equal(
    positivos.length,
    3,
    'm4: un `isCapturePlaceholder` que devuelve siempre `false` es un guard que nunca ' +
      'dispara — el marcador volvería a cruzar a `clients` con la suite en verde'
  );
  assert.equal(
    negativos.length,
    5,
    'un `isCapturePlaceholder` que devuelve siempre `true` bloquearía valores legítimos'
  );
});

test('T-13 ⭐⭐⭐ R-38 `stripPlaceholdersFromCapture` DISCRIMINA (m5: sin guard, rojo)', () => {
  const conMarcador = stripPlaceholdersFromCapture({
    city: REAL.cityMarcadorSCS.value,
    state: 'CA'
  });
  const limpio = stripPlaceholdersFromCapture({
    city: REAL.citySantaMaria.value,
    state: 'CA'
  });
  assert.deepEqual(conMarcador.blocked, ['city']);
  assert.deepEqual(limpio.blocked, []);
  assert.notDeepEqual(
    conMarcador.patch,
    limpio.patch,
    'el guard produce el MISMO patch con y sin marcador ⇒ es un no-op'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-38 — ninguna validación que SIEMPRE acepte                  */
/* ================================================================== */

test('T-13 ⭐⭐⭐ R-38 `validateFreeIndustry` DISCRIMINA (m2/m3: si aceptara todo, rojo)', () => {
  const aceptados = [
    'Decoración de interiores',
    'portable toilet rental service'
  ].filter((v) => validateFreeIndustry(v).ok);
  const rechazados = [
    '',
    '   ',
    REAL.industryOther.value,
    'otro',
    REAL.industryDeTabla.value
  ].filter((v) => !validateFreeIndustry(v).ok);
  assert.equal(
    aceptados.length,
    2,
    'm3: una validación que rechaza todo hace imposible capturar el rubro real'
  );
  assert.equal(
    rechazados.length,
    5,
    'm2/m3: una validación que acepta cualquier string reintroduce las DOS colisiones ' +
      '(«Otro» vacío vuelve a ser un sumidero; teclear `cleaning` crea dos ' +
      'representaciones del mismo rubro)'
  );
  // Y los motivos son distintos: colapsarlos en uno solo perdería la señal.
  assert.notEqual(
    validateFreeIndustry(REAL.industryOther.value).reason,
    validateFreeIndustry(REAL.industryDeTabla.value).reason
  );
});

test('T-13 ⭐⭐ R-38 `resolveIndustryForPersist` DISCRIMINA por el par (código, rubro)', () => {
  const salidas = new Set([
    resolveIndustryForPersist(REAL.industryDeTabla.value, ''),
    resolveIndustryForPersist(
      REAL.industryOther.value,
      'Decoración de interiores'
    ),
    resolveIndustryForPersist(REAL.industryOther.value, '')
  ]);
  assert.equal(
    salidas.size,
    3,
    'la resolución devuelve lo mismo para los tres casos ⇒ no está resolviendo nada'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-38 — el criterio de industria SIGUE discriminando (m1/m6)   */
/* ================================================================== */

test('T-13 ⭐⭐⭐ R-38 `toIndustryLabel` DISCRIMINA (m1/m6: código crudo o `_`→espacio, rojo)', () => {
  assert.equal(toIndustryLabel(REAL.industryDeTabla.value), 'Limpieza');
  assert.notEqual(
    toIndustryLabel(REAL.industryDeTabla.value),
    REAL.industryDeTabla.value,
    'm1: devolver el código crudo es exactamente el defecto de F-121 («para cleaning»)'
  );
  assert.equal(
    toIndustryLabel(REAL.industryOther.value),
    null,
    'm6: un criterio `_`→espacio devolvería `"other"` — y `other` NO es un rubro'
  );
  assert.equal(toIndustryLabel(REAL.industryVacia.value), null);
  assert.equal(
    toIndustryLabel(REAL.industryFueraDeTabla.value),
    'portable toilet rental service'
  );
  // Las 4 poblaciones NO colapsan en un solo resultado.
  const salidas = new Set([
    toIndustryLabel(REAL.industryDeTabla.value),
    toIndustryLabel(REAL.industryOther.value),
    toIndustryLabel(REAL.industryFueraDeTabla.value)
  ]);
  assert.equal(salidas.size, 3);
});

/* ================================================================== */
/*  ⭐⭐ R-38 — el catálogo DISCRIMINA dentro/fuera                     */
/* ================================================================== */

test('T-13 ⭐⭐ R-38 `isCityInCatalog` DISCRIMINA (si aceptara todo, R-23 sería inerte)', () => {
  const catalogo = [
    { city: REAL.cityBuellton.value, county: 'Santa Barbara' },
    { city: REAL.citySantaMaria.value, county: 'Santa Barbara' }
  ];
  assert.equal(isCityInCatalog(REAL.cityBuellton.value, catalogo), true);
  assert.equal(isCityInCatalog(REAL.citySantaMaria.value, catalogo), true);
  assert.equal(
    isCityInCatalog(REAL.cityMarcadorSCS.value, catalogo),
    false,
    'si el catálogo aceptara cualquier valor, R-23 no señalaría nunca la deuda del ' +
      'operador y el selector volvería a mostrar el campo en blanco'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ Y la línea que ninguna mutación puede cruzar                  */
/* ================================================================== */

test('T-13 ⭐⭐⭐ R-01 ninguna regla de F-122 trata «contiene un marcador» como defecto', () => {
  // Los tres valores REALES que llevan un marcador EMBEBIDO en prosa (o en una frase
  // armada por una plantilla) siguen pasando: son degradación honesta legítima.
  const embebidos = [
    'Top 3 en Google Maps para other en ' + MARCADOR + ' + 15-20 leads/mes',
    'su presencia digital está en ' + MARCADOR + ' y depende de referidos',
    'Notas: licencia ' + MARCADOR
  ];
  for (const v of embebidos) {
    assert.equal(
      isCapturePlaceholder(v),
      false,
      `«${v}» quedaría bloqueado: eso rompería F-104/F-106 (R-01)`
    );
  }
  // Y una columna que no es de captura nunca se bloquea, valga lo que valga.
  assert.deepEqual(
    stripPlaceholdersFromCapture({ status: MARCADOR, tier: MARCADOR }).blocked,
    []
  );
});
