/**
 * F-122 — T-02 / T-11 — **«Otro» deja de ser un sumidero, en las DOS superficies**
 * (R-07, R-09, R-10, R-11, R-33).
 *
 * Las dos superficies son componentes de página/React; siguiendo el patrón establecido
 * del repo (f080/f081/f084/f121), el wiring se verifica sobre el **código fuente** y el
 * cierre autoritativo es LIVE (§6.1, T-19, gateada).
 *
 * ⭐ **H-6 — lo que este test realmente vigila:** el alta hace `insert({...newClientData})`
 * y la ficha hace `update({...formData})`, **ambos con spread**. Una clave nueva del
 * estado local entraría a `clients` **automáticamente**. Por eso se asserta que el rubro
 * libre vive FUERA de esos objetos y que se resuelve a `industry` **antes** del write:
 * sin eso, R-11 se cumpliría por accidente y un error de nombre crearía una columna
 * fantasma en el payload.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ALTA_REL = 'src/app/(app)/diagnostic/page.tsx';
const FORM_REL = 'src/components/clients/ClientForm.tsx';
const ALTA = stripComments(read(ALTA_REL));
const FORM = stripComments(read(FORM_REL));

/** Las dos superficies que consumen `INDUSTRIES`, medidas con el MISMO criterio. */
const SUPERFICIES: [string, string][] = [
  [ALTA_REL, ALTA],
  [FORM_REL, FORM]
];

/* ================================================================== */
/*  ⭐⭐ R-09 — «Otro» abre el campo de rubro libre, en las DOS          */
/* ================================================================== */

test('T-02 ⭐⭐ R-09 las DOS superficies piden el rubro libre cuando se elige «Otro»', () => {
  for (const [rel, src] of SUPERFICIES) {
    assert.match(
      src,
      /industry === 'other'/,
      `${rel}: no hay rama de UI para «Otro» ⇒ el rubro real no se puede capturar (R-09)`
    );
    assert.match(
      src,
      /industryOther/,
      `${rel}: no existe el campo del rubro libre`
    );
    assert.match(
      src,
      /setIndustryOther\(e\.target\.value\)/,
      `${rel}: el campo del rubro libre no está cableado a su estado`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ H-6 — el rubro NO entra a `clients` por el spread             */
/* ================================================================== */

test('T-02 ⭐⭐⭐ H-6 el rubro libre vive FUERA del objeto que se spreadea al write', () => {
  // El estado que se spreadea (`newClientData` / `formData`) NO declara la clave.
  const bloqueEstado = (src: string, nombre: string): string => {
    const re = new RegExp(
      `const \\[${nombre}, set[A-Za-z]+\\] = useState(?:<[^>]+>)?\\(\\{`
    );
    const m = re.exec(src);
    assert.ok(m, `no se encontró el estado \`${nombre}\``);
    const i = m.index;
    return src.slice(i, src.indexOf('});', i));
  };
  assert.ok(
    !bloqueEstado(ALTA, 'newClientData').includes('industryOther'),
    'ALTA: `industryOther` dentro de `newClientData` entraría a `clients` por el spread ' +
      '(H-6) y crearía una columna fantasma en el payload'
  );
  assert.ok(
    !bloqueEstado(FORM, 'formData').includes('industryOther'),
    'FICHA: `industryOther` dentro de `formData` entraría a `clients` por el spread (H-6)'
  );
  // Y es un `useState` propio en cada superficie.
  for (const [rel, src] of SUPERFICIES) {
    assert.match(
      src,
      /const \[industryOther, setIndustryOther\] = useState\(''\)/,
      `${rel}: el rubro libre debe ser estado PROPIO, fuera del objeto que se spreadea`
    );
  }
});

test('T-02 ⭐⭐⭐ R-07/R-11 el rubro se RESUELVE a `industry` ANTES del write', () => {
  for (const [rel, src] of SUPERFICIES) {
    assert.match(
      src,
      /resolveIndustryForPersist\(/,
      `${rel}: el par (código, rubro libre) debe colapsar en el valor de \`industry\` ` +
        'por el seam, no por una regla propia de la pantalla'
    );
    // ⭐ El valor resuelto es el que ENTRA al payload que se escribe: no basta con
    // calcularlo, tiene que ser el que viaja (ordenación por construcción — un valor no
    // puede entrar a un objeto antes de existir).
    assert.match(
      src,
      /stripPlaceholdersFromCapture\(\{[\s\S]{0,200}?industry: resolvedIndustry/,
      `${rel}: el payload que se escribe no toma \`industry\` del valor RESUELTO ⇒ ` +
        '`other` (o el código crudo) llegaría a la tabla'
    );
  }
});

test('T-02 ⭐⭐⭐ H-6 lo que llega al write es el objeto GUARDADO, no el estado crudo', () => {
  assert.match(
    ALTA,
    /\.insert\(\{\s*\.\.\.newClientDataSafe/,
    'ALTA: el insert debe llevar el payload ya resuelto y saneado, no `newClientData`'
  );
  assert.ok(
    !/\.insert\(\{\s*\.\.\.newClientData,/.test(ALTA),
    'ALTA: el estado CRUDO sigue llegando al insert ⇒ el guard no impide nada'
  );
  assert.match(
    FORM,
    /\.update\(\{\s*\.\.\.formDataSafe/,
    'FICHA: el update debe llevar el payload saneado'
  );
  assert.match(
    FORM,
    /clientInsertPayload\(formDataSafe,/,
    'FICHA: el insert debe construirse sobre el payload saneado'
  );
  assert.ok(
    !/\.update\(\{\s*\.\.\.formData,/.test(FORM),
    'FICHA: el estado CRUDO sigue llegando al update'
  );
});

test('T-02 ⭐⭐ R-10 con «Otro» + rubro vacío NO se emite ningún write', () => {
  // ALTA: el botón de avance está gobernado por `canProceed()`, y `canProceed()` exige
  // que la resolución no sea `null`.
  const canProceed = ALTA.slice(
    ALTA.indexOf('const canProceed = ()'),
    ALTA.indexOf('const canProceed = ()') + 900
  );
  assert.match(
    canProceed,
    /resolveIndustryForPersist\([\s\S]*?\) !==\s*null/,
    'ALTA R-10: `canProceed` no exige el rubro libre ⇒ «Otro» sigue siendo un sumidero ' +
      'y Clara V Decor vuelve a pasar'
  );
  assert.match(
    ALTA,
    /disabled=\{!canProceed\(\)\}/,
    'ALTA: el avance debe estar gobernado por `canProceed()`'
  );

  // FICHA: el submit corta antes de tocar Supabase.
  const submit = FORM.slice(
    FORM.indexOf('const handleSubmit'),
    FORM.indexOf(".from('clients')")
  );
  assert.match(
    submit,
    /if \(!resolvedIndustry\) \{[\s\S]*?return;/,
    'FICHA R-10: sin rubro resoluble el submit debe cortar ANTES del write'
  );
  assert.match(
    FORM,
    /id='industry_other'[\s\S]*?required/,
    'FICHA R-10: el campo del rubro libre debe ser `required` en el form'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-07 — `other` NUNCA se persiste                               */
/* ================================================================== */

test('T-02 ⭐⭐ R-07 ninguna superficie escribe `other` como valor de `clients.industry`', () => {
  for (const [rel, src] of SUPERFICIES) {
    assert.ok(
      !/industry:\s*'other'/.test(src),
      `${rel}: \`other\` = ausencia de industria declarada (F-121 R-15). El Slice A ` +
        'captura el rubro REAL; no rehabilita el token (R-07).'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ R-33 / T-11 — el marcador TECLEADO no entra a captura           */
/* ================================================================== */

test('T-11 ⭐⭐ R-33 las dos superficies rechazan el marcador tecleado, INCLUIDO el rubro libre', () => {
  for (const [rel, src] of SUPERFICIES) {
    assert.match(
      src,
      /isCapturePlaceholder/,
      `${rel}: ninguna columna de captura puede aceptar el marcador tecleado (R-33)`
    );
    const chequeo = src.slice(
      src.indexOf('const capturaConMarcador'),
      src.indexOf('const capturaConMarcador') + 600
    );
    assert.ok(
      chequeo.includes('industryOther'),
      `${rel}: el RUBRO LIBRE queda sin guard. Abrir una puerta mientras se cierra otra ` +
        'sería el defecto de F-122 sobre sí misma (R-33).'
    );
    assert.ok(
      chequeo.includes('notes'),
      `${rel}: \`notes\` es entrada libre y queda sin guard`
    );
  }
  // ALTA: bloquea el avance. FICHA: corta el submit.
  assert.match(ALTA, /!capturaConMarcador\(\)/);
  assert.match(FORM, /if \(capturaConMarcador\(\)\) \{[\s\S]*?return;/);
});

/* ================================================================== */
/*  ⭐⭐ R-28/R-34 — el write de captura pasa por el guard               */
/* ================================================================== */

test('T-02 ⭐⭐ R-28 los DOS writes de captura pasan por `stripPlaceholdersFromCapture`', () => {
  for (const [rel, src] of SUPERFICIES) {
    assert.match(
      src,
      /stripPlaceholdersFromCapture\(/,
      `${rel}: el write lleva columnas de captura y no pasa por el guard (R-34)`
    );
    // Y lo que se bloquea se AVISA (R-31): se bloquea el valor, no al operador.
    assert.match(
      src,
      /blocked\.length > 0/,
      `${rel}: el guard bloquea en silencio; R-31 exige aviso visible`
    );
  }
});

/* ================================================================== */
/*  ⭐ Ninguna superficie re-declara la tabla ni el criterio            */
/* ================================================================== */

test('T-02 ⭐ R-08 las superficies siguen IMPORTANDO la declaración única, sin copias', () => {
  for (const [rel, src] of SUPERFICIES) {
    assert.match(
      src,
      /import \{ INDUSTRIES \} from '@\/lib\/clients\/industry-label'/,
      `${rel}: la tabla debe venir de la declaración única (F-121 DT-05)`
    );
    assert.ok(
      !/value:\s*'landscaping'/.test(src),
      `${rel}: reapareció una COPIA de la tabla de industrias`
    );
  }
});
