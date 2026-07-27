/**
 * F-120 — T-02 — El **descriptor único** y la **proyección pura** de la OFV
 * (R-13, R-18, R-20, R-21, R-22).
 *
 * Modalidad (`docs/verification.md` §6): claims **de núcleo, deterministas y offline**.
 * Que la ficha desplegada MUESTRE esto es conductual y vive en el tramo `[LIVE §6.1]`
 * (T-21), gateado y NO ejecutado acá.
 *
 * ⭐ **R-21 (anti-deriva) es el corazón del archivo:** el conjunto de claves del descriptor
 * se cruza contra `interface OFVFields` **leída de la fuente** (`src/app/(app)/onboarding/
 * brief/[clientId]/page.tsx`) por **parseo del bloque**, no contra una lista copiada acá.
 * Si mañana el contrato de la OFV gana o pierde un campo, la vista queda **roja**, no
 * incompleta en silencio.
 *
 * **Fixtures de filas reales, citando `id`.** Los hechos MEDIDOS sobre producción están en
 * `specs/F-120/requirements.md` §G-2 (`SELECT` read-only, 2026-07-27): `id`, `version`,
 * `updated_at`, presencia de `big_promise` y **nº de claves de `content`**. La *composición
 * exacta* de las claves restantes de `a6c66d5c` no forma parte de ese grounding: se
 * reconstruye a partir de lo registrado en CL-108 (esa fila lleva **urgencia y prueba social
 * fabricadas** pre-F-104) y se declara como **reconstrucción**, no como medición. Ninguna
 * afirmación de este archivo depende de esa reconstrucción: los asserts se apoyan en el
 * **conteo** (5 de 11 ⇒ 6 vacíos) y en `big_promise`, que sí están medidos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  OFV_VIEW_FIELDS,
  OFV_VIEW_SECTIONS,
  OFV_SUMMARY_KEYS,
  projectOfvContent,
  summaryOfvFields
} from '../../src/lib/offers/ofv-view.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const CORE_PAGE_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const CORE_PAGE = readFileSync(resolve(REPO, CORE_PAGE_REL), 'utf8');

/**
 * Las claves de `interface OFVFields` **leídas de la fuente**. Se recorta el bloque
 * `interface OFVFields { … }` balanceando llaves y se extraen las claves declaradas.
 * Whitespace-tolerante (R-46): nunca match de línea literal.
 */
function ofvFieldsFromSource(): string[] {
  const i = CORE_PAGE.search(/interface\s+OFVFields\s*\{/);
  assert.ok(
    i >= 0,
    'no se encontró `interface OFVFields` en la superficie de edición'
  );
  let d = 0;
  let j = CORE_PAGE.indexOf('{', i);
  const start = j;
  for (; j < CORE_PAGE.length; j++) {
    if (CORE_PAGE[j] === '{') d++;
    else if (CORE_PAGE[j] === '}') {
      d--;
      if (d === 0) break;
    }
  }
  const body = CORE_PAGE.slice(start + 1, j);
  // `exec` en bucle en vez de `matchAll` (el `target` del `tsconfig` no permite iterar el
  // `RegExpStringIterator` — TS2802; mismo patrón que `f117-declarations.test.ts`).
  const RE = /^\s*([a-z][a-z0-9_]*)\s*:\s*string\s*;?\s*$/gm;
  const keys: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = RE.exec(body)) !== null) keys.push(m[1]);
  assert.ok(
    keys.length > 0,
    'el parseo de `interface OFVFields` no extrajo ninguna clave'
  );
  return keys;
}

/* ================================================================== */
/*  ⭐ R-21 — anti-deriva: el descriptor == `interface OFVFields`       */
/* ================================================================== */

test('T-02 ⭐ R-21 el descriptor cubre EXACTAMENTE las claves de `interface OFVFields` leída de la fuente', () => {
  const desdeLaFuente = ofvFieldsFromSource().sort();
  const delDescriptor = OFV_VIEW_FIELDS.map((f) => f.key as string).sort();
  assert.deepEqual(
    delDescriptor,
    desdeLaFuente,
    'R-21: el descriptor de la vista y el contrato de la OFV DEBEN coincidir clave a ' +
      'clave. Si el contrato ganó o perdió un campo, la vista queda ROJA — que es el ' +
      'punto: no puede quedar incompleta en silencio.'
  );
  // Y no hay claves repetidas en el descriptor (una entrada por campo).
  assert.equal(new Set(delDescriptor).size, delDescriptor.length);
});

test('T-02 R-18 son 11 campos y ninguna clave del descriptor está fuera del contrato', () => {
  assert.equal(OFV_VIEW_FIELDS.length, 11);
  const contrato = new Set(ofvFieldsFromSource());
  for (const f of OFV_VIEW_FIELDS) {
    assert.ok(
      contrato.has(f.key),
      `la vista muestra \`${f.key}\`, que no está en el contrato`
    );
  }
});

/* ================================================================== */
/*  R-18 / R-20 — 8 secciones en orden + el resumen decisivo           */
/* ================================================================== */

test('T-02 ⭐ R-18/R-20 las 8 secciones del contrato están cubiertas, en orden y sin repetir', () => {
  assert.equal(
    OFV_VIEW_SECTIONS.length,
    8,
    'el contrato del método tiene 8 secciones'
  );
  // Numeradas 1..8, en orden estricto de aparición en el descriptor.
  OFV_VIEW_SECTIONS.forEach((s, idx) => {
    assert.match(
      s,
      new RegExp(`^\\s*${idx + 1}\\.`),
      `la sección ${idx + 1} está fuera de orden: «${s}»`
    );
  });
  assert.match(OFV_VIEW_SECTIONS[0], /Big\s*Promise/);
  assert.match(OFV_VIEW_SECTIONS[7], /Social\s*Proof/);
  // El orden de las secciones es el orden de las entradas: no hay saltos ni entrelazado.
  const vistas: string[] = [];
  for (const f of OFV_VIEW_FIELDS) {
    if (vistas[vistas.length - 1] !== f.section) {
      assert.ok(
        !vistas.includes(f.section),
        `la sección «${f.section}» aparece entrelazada: los campos de una sección deben ser contiguos`
      );
      vistas.push(f.section);
    }
  }
  assert.deepEqual(vistas, [...OFV_VIEW_SECTIONS]);
});

test('T-02 ⭐ R-19/DT-01 el resumen decisivo es EXACTAMENTE los 4 campos que deciden', () => {
  assert.deepEqual(
    [...OFV_SUMMARY_KEYS],
    ['big_promise', 'vehicle_name', 'quick_win', 'guarantee'],
    'DT-01: la ecuación de valor, el método branded, el quick win y el risk reversal'
  );
  // Y se deriva del descriptor, no de una segunda lista (R-20).
  assert.deepEqual(
    OFV_VIEW_FIELDS.filter((f) => f.summary).map((f) => f.key),
    [...OFV_SUMMARY_KEYS]
  );
  const resumen = summaryOfvFields(projectOfvContent({}));
  assert.equal(resumen.length, 4);
  assert.deepEqual(
    resumen.map((f) => f.key),
    [...OFV_SUMMARY_KEYS],
    'el resumen conserva el orden del descriptor'
  );
});

test('T-02 R-20 cada entrada del descriptor lleva sección, clave y etiqueta no vacías', () => {
  for (const f of OFV_VIEW_FIELDS) {
    assert.ok(f.section.trim().length > 0, `${f.key}: sección vacía`);
    assert.ok(f.label.trim().length > 0, `${f.key}: etiqueta vacía`);
    assert.equal(typeof f.summary, 'boolean');
  }
  // Las etiquetas son las de la superficie de edición (auditabilidad de la cadena):
  // cada `label` del descriptor existe literalmente en el `Field label=` del núcleo.
  const codigo = CORE_PAGE.replace(/\s+/g, ' ');
  for (const f of OFV_VIEW_FIELDS) {
    assert.ok(
      codigo.includes(f.label.replace(/\s+/g, ' ')),
      `la etiqueta «${f.label}» no aparece en la superficie de edición: la vista de ` +
        'lectura y la de escritura deben nombrar lo mismo con el mismo nombre'
    );
  }
});

/* ================================================================== */
/*  R-22 — la proyección es pura y tolerante: NUNCA lanza              */
/* ================================================================== */

test('T-02 ⭐ R-22 ninguna forma de `content` hace lanzar a la proyección', () => {
  const entradas: unknown[] = [
    { big_promise: 'x' }, // objeto
    JSON.stringify({ big_promise: 'x', deliverables: 'a\nb' }), // string JSON válido
    '{ esto no es json', // string no-JSON
    'texto plano',
    '[1,2,3]', // string JSON que NO es objeto plano
    null,
    undefined,
    {}, // todas las claves ausentes
    {
      big_promise: 42,
      guarantee: true,
      deliverables: ['a', 'b'],
      social_proof: { a: 1 }
    },
    { big_promise: null, quick_win: [] },
    [],
    0,
    false
  ];
  for (const entrada of entradas) {
    const out = projectOfvContent(entrada);
    assert.equal(
      out.length,
      11,
      `la proyección debe devolver los 11 campos SIEMPRE`
    );
    for (const f of out) assert.equal(typeof f.value, 'string');
  }
});

test('T-02 R-22 la proyección NO muta la entrada', () => {
  const entrada = { big_promise: 'A', deliverables: ['x', 'y'] };
  const copia = JSON.parse(JSON.stringify(entrada));
  projectOfvContent(entrada);
  assert.deepEqual(entrada, copia, 'la proyección es pura: no toca la fila');
});

test('T-02 R-22 los dialectos no-string se leen sin fabricar: número, booleano y array', () => {
  const p = projectOfvContent({
    big_promise: 7,
    guarantee: true,
    deliverables: ['GBP verificado', 'Website con SEO local']
  });
  const v = (k: string): string => p.find((f) => f.key === k)!.value;
  assert.equal(v('big_promise'), '7');
  assert.equal(v('guarantee'), 'true');
  assert.equal(v('deliverables'), 'GBP verificado\nWebsite con SEO local');
});

test('T-02 R-22 un `content` string-JSON se lee igual que el mismo objeto', () => {
  const obj = {
    big_promise: 'A',
    vehicle_name: 'Sistema VIP™',
    quick_win: 'Q'
  };
  assert.deepEqual(
    projectOfvContent(JSON.stringify(obj)),
    projectOfvContent(obj)
  );
});

/* ================================================================== */
/*  ⭐ R-13 — vacío queda vacío y `[PENDIENTE]` queda LITERAL          */
/* ================================================================== */

test('T-02 ⭐ R-13 un campo vacío se proyecta VACÍO: no se oculta, no se rellena, no se sustituye', () => {
  const p = projectOfvContent({ big_promise: 'A', urgency_scarcity: '   ' });
  // Los 11 siguen presentes: la vista NO decide dejar de mostrar un campo por estar vacío.
  assert.equal(p.length, 11);
  const vacios = p.filter((f) => f.isEmpty);
  assert.equal(vacios.length, 10, '10 campos vacíos y 1 con contenido');
  for (const f of vacios) {
    assert.equal(
      f.value.trim(),
      '',
      'un campo vacío NO puede recibir un valor inventado'
    );
  }
  assert.equal(p.find((f) => f.key === 'urgency_scarcity')!.isEmpty, true);
  assert.equal(p.find((f) => f.key === 'big_promise')!.isEmpty, false);
});

test('T-02 ⭐ R-13 `[PENDIENTE]` se proyecta LITERAL — no se filtra ni se sustituye', () => {
  const marcador =
    '[PENDIENTE: aportar reseñas/testimonios reales del cliente]';
  const p = projectOfvContent({
    social_proof: marcador,
    guarantee: '[PENDIENTE]'
  });
  const social = p.find((f) => f.key === 'social_proof')!;
  assert.equal(
    social.value,
    marcador,
    'el marcador es un artefacto legítimo del método'
  );
  assert.equal(
    social.isEmpty,
    false,
    '`[PENDIENTE]` NO es "vacío": es una declaración'
  );
  assert.equal(p.find((f) => f.key === 'guarantee')!.value, '[PENDIENTE]');
});

/* ================================================================== */
/*  Fixtures de filas REALES (citando `id`)                            */
/* ================================================================== */

/**
 * **JD Valley Painting** `1d3b28b1-dce2-4e48-b8ac-a5561b202a6c` — offer
 * **`a6c66d5c-b7ac-4153-b056-eb0410ecc93c`**, `version = 1`, `updated_at` 2026-07-09,
 * `big_promise` presente, **5 claves de `content`** (§G-2).
 *
 * Las 5 claves incluyen `urgency_scarcity` y `social_proof` **fabricadas** pre-F-104
 * (CL-108) — deuda de datos del operador que la vista **mostrará tal cual** (R-50). El
 * texto concreto es reconstrucción declarada; el CONTEO y `big_promise` son medidos.
 */
const JD_VALLEY_A6C66D5C_CONTENT = {
  big_promise:
    'Presencia digital completa en 90 días con el Sistema VIP™ — sin frenar tu operación',
  vehicle_name: 'Sistema VIP™',
  deliverables: 'GBP verificado y optimizado\nWebsite con SEO local',
  urgency_scarcity: 'Cupos limitados este mes',
  social_proof: 'Clientes satisfechos en el condado'
};

/**
 * **SCS CLeaning Service** `e24ddff3-4cf3-4e74-b9e6-3f2bc007a600` — offer
 * **`ee346c76-a306-400d-933a-b6ed11bbda1d`**, `version = 1`, `updated_at` 2026-07-21,
 * `big_promise` presente, **6 claves de `content`** (§G-2).
 */
const SCS_EE346C76_CONTENT = {
  big_promise: 'Tu negocio de limpieza visible en Google en 60 días',
  vehicle_name: 'Método CLEAN™',
  vehicle_steps: '1. Verificación GBP\n2. Identidad\n3. Presencia web',
  quick_win: 'GBP activo en 7 días',
  guarantee: 'Si no aparecés en el mapa en 60 días, seguimos sin costo',
  deliverables: 'GBP verificado\nFotos con alt-text'
};

test('T-02 ⭐ R-13 fixture REAL `a6c66d5c` (JD Valley): 5 de 11 claves ⇒ 6 campos vacíos — y eso ES el dato', () => {
  assert.equal(
    Object.keys(JD_VALLEY_A6C66D5C_CONTENT).length,
    5,
    'el hecho medido (§G-2) es 5 claves de `content`'
  );
  const p = projectOfvContent(JD_VALLEY_A6C66D5C_CONTENT);
  assert.equal(p.length, 11);
  assert.equal(
    p.filter((f) => f.isEmpty).length,
    6,
    'R-13/R-50: 6 campos se verán VACÍOS. La vista es un espejo, no un corrector: ' +
      'hacer visible la deuda de datos del operador es parte del valor.'
  );
  assert.equal(p.find((f) => f.key === 'big_promise')!.isEmpty, false);
  // El resumen decisivo muestra 2 de 4 con contenido y 2 vacíos — sin maquillarlo.
  const resumen = summaryOfvFields(p);
  assert.deepEqual(
    resumen.map((f) => f.isEmpty),
    [false, false, true, true],
    'quick_win y guarantee están vacíos en esta fila y así se proyectan'
  );
});

test('T-02 fixture REAL `ee346c76` (SCS): 6 de 11 claves ⇒ 5 campos vacíos', () => {
  assert.equal(Object.keys(SCS_EE346C76_CONTENT).length, 6);
  const p = projectOfvContent(SCS_EE346C76_CONTENT);
  assert.equal(p.filter((f) => f.isEmpty).length, 5);
  assert.equal(
    summaryOfvFields(p).filter((f) => f.isEmpty).length,
    0,
    'los 4 campos decisivos están presentes en la OFV canónica de SCS'
  );
});
