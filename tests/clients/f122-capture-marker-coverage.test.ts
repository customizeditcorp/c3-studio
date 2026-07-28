/**
 * F-122 — **T-26** — ⭐⭐⭐ **R-33 ENDURECIDO: el marcador tecleado no entra por NINGUNA
 * columna de captura editable — `city` INCLUIDA** (R-33, R-40).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * EL AGUJERO QUE LA ENMIENDA ABRE, Y QUE ESTE TEST CIERRA
 * ─────────────────────────────────────────────────────────────────────────────────
 * En `86fae28` —el tramo offline aprobado 9/9— `diagnostic/page.tsx` enumeraba **siete**
 * campos a mano:
 *
 *     business_name · state · contact_first_name · phone · email · notes · industryOther
 *
 * **`city` NO estaba**, con un comentario que decía literalmente *"La ciudad ya no es
 * texto libre (R-21)"*. **Era CORRECTO bajo el spec original** —R-21 la había cerrado a
 * un `<select>`— y pasa a ser un **AGUJERO bajo el enmendado**, porque R-21 enmendado la
 * **reabre** como entrada libre.
 *
 * ⭐⭐ **Y ésta es la razón por la que el conjunto se DERIVA y no se enumera (R-40):**
 * *enumerar a mano es exactamente cómo se perdió `city`.* Un test que volviera a listar
 * los campos podría volver a olvidarse de uno, y estaría verde mientras el mundo está
 * mal — la firma de `feedback_guards_measure_index_not_world`.
 *
 * **Qué mide este archivo:** cruza `CAPTURE_COLUMNS` (la declaración de columnas de
 * captura) con los **campos editables** de cada formulario, **leídos del repo**, y exige
 * que el chequeo de marcador tecleado los cubra a TODOS. Un campo de captura editable
 * nuevo que quede sin chequear ⇒ **rojo**.
 *
 * **Anti-no-op con su forma específica:** el mismo derivador, corrido contra `86fae28`,
 * **debe reportar `city` como campo NO cubierto**. Es la prueba de que mide el mundo y
 * no a sí mismo.
 *
 * **Nota de capas (no se fusionan):** el guard de write-path (R-28/R-32) bloquearía el
 * valor igual, **pero en silencio para quien lo tecleó**. R-33 es la capa que **se lo
 * dice en el formulario**. Defensa en profundidad, propósitos distintos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  CAPTURE_COLUMNS,
  isCapturePlaceholder,
  stripPlaceholdersFromCapture
} from '../../src/lib/clients/capture-guard.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * ⭐ **Anclas declaradas, cada una con su rol (R-55). Ninguna es `HEAD`.**
 * · `9509f6f` — estado **previo a F-122**.
 * · `86fae28` — estado **posterior al tramo offline aprobado**: el único commit donde la
 *   omisión de `city` existe, y por eso el ancla del anti-no-op de esta tarea.
 */
const BASE = '9509f6f';
const POST_OFFLINE = '86fae28';
const desde = (commit: string, rel: string): string =>
  execFileSync('git', ['show', `${commit}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });

const ALTA_REL = 'src/app/(app)/diagnostic/page.tsx';
const FORM_REL = 'src/components/clients/ClientForm.tsx';

/** El estado editable de cada formulario, y el nombre de su rubro libre (H-6). */
const FORMULARIOS: { rel: string; estado: string }[] = [
  { rel: ALTA_REL, estado: 'newClientData' },
  { rel: FORM_REL, estado: 'formData' }
];

/* ================================================================== */
/*  Derivadores — el conjunto sale de la FUENTE, nunca de una lista     */
/* ================================================================== */

/**
 * Los **campos editables** del formulario: las claves del objeto de estado, leídas de su
 * inicializador (`useState({ … })`). Es la fuente de la que hay que derivar: si mañana
 * alguien agrega `website: ''` al estado, aparece acá solo.
 */
function camposEditables(code: string, estado: string): string[] {
  const marca = new RegExp(
    `\\[\\s*${estado}\\s*,\\s*set[A-Za-z]+\\s*\\]\\s*=\\s*useState`
  );
  const m = marca.exec(code);
  assert.ok(
    m,
    `no se encontró el estado \`${estado}\`: el derivador está roto`
  );
  const abre = code.indexOf('{', (m as RegExpExecArray).index);
  let nivel = 0;
  let cierra = -1;
  for (let i = abre; i < code.length; i++) {
    if (code[i] === '{') nivel++;
    else if (code[i] === '}') {
      nivel--;
      if (nivel === 0) {
        cierra = i;
        break;
      }
    }
  }
  assert.ok(cierra > abre, 'el inicializador del estado no cierra');
  const cuerpo = code.slice(abre + 1, cierra);
  return Array.from(
    cuerpo.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm),
    (x) => x[1]
  );
}

/**
 * ⭐ Los campos que el chequeo de marcador tecleado **cubre de verdad**, derivados de la
 * FORMA del chequeo:
 *
 *  · si delega en `stripPlaceholdersFromCapture(<estado>)` ⇒ cubre **todas** las columnas
 *    de captura presentes en el estado, por construcción;
 *  · si enumera `<estado>.<campo>` a mano ⇒ cubre **exactamente los que nombró** — y ahí
 *    es donde `city` se perdió.
 */
function camposCubiertos(
  code: string,
  estado: string,
  editables: string[]
): string[] {
  const i = code.indexOf('const capturaConMarcador');
  assert.ok(i > 0, 'la pantalla ya no declara el chequeo de marcador tecleado');
  const cuerpo = code.slice(
    i,
    code.indexOf(';', code.indexOf('=>', i) + 1) + 1
  );
  const delega = new RegExp(
    `stripPlaceholdersFromCapture\\(\\s*${estado}\\s*\\)`
  ).test(cuerpo);
  if (delega) return editables.filter((c) => CAPTURE_COLUMNS.includes(c));
  const enumerados = Array.from(
    cuerpo.matchAll(new RegExp(`${estado}\\.([A-Za-z_$][\\w$]*)`, 'g')),
    (m) => m[1]
  );
  return enumerados.filter((c) => CAPTURE_COLUMNS.includes(c));
}

/** Los campos de captura EXIGIBLES: los editables que son columnas de captura. */
const exigibles = (editables: string[]): string[] =>
  editables.filter((c) => CAPTURE_COLUMNS.includes(c)).sort();

/* ================================================================== */
/*  ⭐⭐⭐ R-33/R-40 — cobertura DERIVADA, no enumerada                  */
/* ================================================================== */

test('T-26 ⭐⭐⭐ R-33/R-40 el chequeo de marcador tecleado cubre TODAS las columnas de captura editables', () => {
  for (const { rel, estado } of FORMULARIOS) {
    const code = stripComments(read(rel));
    const editables = camposEditables(code, estado);
    // Anti-no-op del propio derivador: un estado vacío pondría todo verde solo.
    assert.ok(
      editables.length >= 5,
      `${rel}: el derivador sólo encontró ${editables.length} campos editables`
    );
    const requeridos = exigibles(editables);
    const cubiertos = camposCubiertos(code, estado, editables).sort();
    assert.deepEqual(
      cubiertos,
      requeridos,
      `${rel}: quedaron columnas de captura EDITABLES sin chequeo de marcador. ` +
        'Enumerar el conjunto a mano es exactamente cómo se perdió `city` cuando R-21 ' +
        'enmendado la devolvió a entrada libre (R-40).'
    );
  }
});

test('T-26 ⭐⭐⭐ R-33 `city` está entre los campos EXIGIDOS del alta (si no, el test es un no-op)', () => {
  const code = stripComments(read(ALTA_REL));
  const requeridos = exigibles(camposEditables(code, 'newClientData'));
  assert.ok(
    requeridos.includes('city'),
    '⭐ El punto crítico de la enmienda: con R-21 enmendado la ciudad VUELVE al conjunto ' +
      'de entrada libre. Si el derivador no la encuentra entre los campos exigidos, no ' +
      'está midiendo nada y el guard es un adorno.'
  );
  assert.ok(
    camposCubiertos(
      code,
      'newClientData',
      camposEditables(code, 'newClientData')
    ).includes('city'),
    'la ciudad quedó fuera del chequeo de marcador tecleado (R-33)'
  );
});

test('T-26 ⭐⭐⭐ ANTI-NO-OP: contra `86fae28` el MISMO derivador reporta `city` como NO cubierta', () => {
  const code = stripComments(desde(POST_OFFLINE, ALTA_REL));
  const editables = camposEditables(code, 'newClientData');
  const requeridos = exigibles(editables);
  const cubiertos = camposCubiertos(code, 'newClientData', editables);
  assert.ok(
    requeridos.includes('city'),
    'en `86fae28` la ciudad ya era una columna de captura editable del estado'
  );
  assert.ok(
    !cubiertos.includes('city'),
    '⛔ Si el derivador diera `city` como CUBIERTA en `86fae28`, estaría midiéndose a sí ' +
      'mismo: ahí la función enumeraba 7 campos y la ciudad NO era uno de ellos.'
  );
  // Y la enumeración del estado aprobado era exactamente ésa: 6 columnas de captura.
  assert.deepEqual(
    cubiertos.sort(),
    ['business_name', 'contact_first_name', 'email', 'notes', 'phone', 'state'],
    'el retrato del agujero: 6 columnas cubiertas, `city` afuera'
  );
});

test('T-26 ⭐⭐ el rubro libre sigue cubierto aunque viva FUERA del estado (H-6)', () => {
  for (const { rel } of FORMULARIOS) {
    const code = stripComments(read(rel));
    const i = code.indexOf('const capturaConMarcador');
    const cuerpo = code.slice(
      i,
      code.indexOf(';', code.indexOf('=>', i) + 1) + 1
    );
    assert.match(
      cuerpo,
      /isCapturePlaceholder\(industryOther\)/,
      `${rel}: el rubro libre vive fuera del objeto de estado a propósito (H-6) ⇒ no ` +
        'lo alcanza la derivación y hay que nombrarlo. Abrir una puerta mientras se ' +
        'cierra otra sería el defecto de F-122 sobre sí misma (R-33).'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ Conducta: el marcador tecleado en `city` se RECHAZA             */
/* ================================================================== */

test('T-26 ⭐⭐ R-33 CONDUCTA: `city = [PENDIENTE]` bloquea el avance del alta', () => {
  const MARCADOR = '[' + 'PENDIENTE' + ']';
  const estado = {
    business_name: 'SCS CLeaning Service',
    industry: 'cleaning',
    contact_first_name: 'Ana',
    phone: '',
    email: '',
    city: MARCADOR,
    state: 'CA',
    disc_profile: '',
    notes: ''
  };
  const { blocked } = stripPlaceholdersFromCapture(estado);
  assert.deepEqual(
    blocked,
    ['city'],
    'la ciudad tecleada con el marcador se bloquea'
  );
  // Y el chequeo del formulario —el que AVISA— da positivo por esa sola clave.
  assert.equal(blocked.length > 0 || isCapturePlaceholder(''), true);
  // Un valor real no bloquea nada: el criterio es «el valor ES el marcador» (R-01).
  assert.deepEqual(
    stripPlaceholdersFromCapture({ ...estado, city: 'Santa Maria' }).blocked,
    []
  );
  // Y una ciudad FUERA de catálogo tampoco: R-21 enmendado la permite, R-33 sólo prohíbe
  // el marcador. Confundirlas convertiría el guard en la cerradura que la enmienda quitó.
  assert.deepEqual(
    stripPlaceholdersFromCapture({ ...estado, city: 'Lompoc' }).blocked,
    []
  );
});

test('T-26 ⭐ el ancla `9509f6f` sigue siendo lo que dice ser (R-55)', () => {
  assert.equal(
    execFileSync('git', ['cat-file', '-t', BASE], {
      cwd: REPO,
      encoding: 'utf8'
    }).trim(),
    'commit'
  );
  assert.equal(
    execFileSync('git', ['cat-file', '-t', POST_OFFLINE], {
      cwd: REPO,
      encoding: 'utf8'
    }).trim(),
    'commit'
  );
});
