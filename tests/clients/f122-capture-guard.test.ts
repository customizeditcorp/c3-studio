/**
 * F-122 — T-09 — **`src/lib/clients/capture-guard.ts`: el seam puro del Slice C**
 * (R-28, R-29, R-30).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * EL CRITERIO, Y LA LÍNEA QUE NO SE CRUZA
 * ─────────────────────────────────────────────────────────────────────────────────
 * *"El valor **ES** el marcador"*, **nunca** *"contiene algún `[PENDIENTE]`"*. R-01 lo
 * prohíbe explícitamente: un marcador que ocupa la **ranura completa** de un campo de un
 * artefacto **generado** es degradación honesta LEGÍTIMA (F-104/F-106) y F-122 no puede
 * introducir ninguna regla que lo trate como defecto.
 *
 * Lo que este guard prohíbe es **el CRUCE** de espacio-generación a espacio-captura:
 * `briefs.content.city = "[PENDIENTE]"` sigue siendo válido; `clients.city =
 * "[PENDIENTE]"` no. Es una regla sobre **dónde** puede estar el marcador.
 *
 * Fixtures reales (R-36): `clients.city = "[PENDIENTE]"` en SCS `e24ddff3` y Clara V
 * `122f3593`; `briefs.content.city = "[PENDIENTE]"` en `be43470f` y `e1ad789c`;
 * `Santa Maria`, `CA`, `SCS CLeaning Service` (con la mayúscula tal cual está en la fila).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  isCapturePlaceholder,
  isCaptureColumn,
  stripPlaceholdersFromCapture,
  CAPTURE_COLUMNS
} from '../../src/lib/clients/capture-guard.ts';
import { assessApproval } from '../../src/lib/onboarding/approval-guard.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const GUARD_REL = 'src/lib/clients/capture-guard.ts';

/** El marcador, armado en tiempo de test para no escribir el literal en `src/`. */
const MARCADOR = '[' + 'PENDIENTE' + ']';

/* ================================================================== */
/*  ⭐⭐⭐ R-28 — el valor ES el marcador ⇒ bloqueado                    */
/* ================================================================== */

test('T-09 ⭐⭐⭐ R-28 el marcador como valor COMPLETO se detecta', () => {
  for (const v of [MARCADOR, '  ' + MARCADOR + '  ', MARCADOR.toLowerCase()]) {
    assert.equal(
      isCapturePlaceholder(v),
      true,
      `\`${v}\` es el valor que quedó en \`clients.city\` de SCS \`e24ddff3\` y ` +
        'Clara V `122f3593` — un HECHO FALSO del home canónico'
    );
  }
  // La variante en otro idioma también, sin enumerarla ni escribir el literal (H-3).
  assert.equal(isCapturePlaceholder('[' + 'PENDING' + ']'), true);
});

test('T-09 ⭐⭐⭐ R-01 un marcador EMBEBIDO en prosa NO se bloquea', () => {
  const prosa =
    'No aparece en el top 3 de Google Maps; su presencia digital está en ' +
    MARCADOR +
    ' y depende de referidos';
  assert.equal(
    isCapturePlaceholder(prosa),
    false,
    'R-01: el criterio "contiene algún [PENDIENTE]" está PROHIBIDO. Es exactamente la ' +
      'regla que rompería F-104/F-106.'
  );
  assert.equal(isCapturePlaceholder(MARCADOR + ' y algo más'), false);
  assert.equal(isCapturePlaceholder('Notas: ver ' + MARCADOR), false);
});

test('T-09 ⭐⭐ los valores REALES y legítimos no se bloquean', () => {
  for (const v of [
    'Santa Maria',
    'Buellton',
    'CA',
    'SCS CLeaning Service',
    'Clara V Decor',
    'Decoración de interiores',
    'cleaning',
    'portable_toilet_rental_service',
    '(805) 555-1234',
    ''
  ]) {
    assert.equal(
      isCapturePlaceholder(v),
      false,
      `\`${v}\` es un valor legítimo y quedaría bloqueado: el espacio de falsos ` +
        'positivos tiene que ser VACÍO (DT-03 arg. 3)'
    );
  }
  // Tipos no-string: nunca lanza, nunca bloquea.
  for (const v of [null, undefined, 42, {}, [], true]) {
    assert.equal(isCapturePlaceholder(v), false);
  }
});

/* ================================================================== */
/*  ⭐⭐ Columnas de CAPTURA vs columnas de ESTADO                      */
/* ================================================================== */

test('T-09 ⭐⭐ el guard distingue columnas de captura de columnas de estado', () => {
  for (const col of ['business_name', 'industry', 'city', 'state', 'notes']) {
    assert.equal(
      isCaptureColumn(col),
      true,
      `\`${col}\` es columna de captura`
    );
  }
  for (const col of [
    'status',
    'tier',
    'deliverable_token',
    'tenant_id',
    'created_by',
    'updated_at'
  ]) {
    assert.equal(
      isCaptureColumn(col),
      false,
      `\`${col}\` es estado del sistema: nadie la declara y no puede llevar un marcador`
    );
  }
  assert.ok(CAPTURE_COLUMNS.length >= 10, 'la lista de captura quedó anémica');
});

/* ================================================================== */
/*  ⭐⭐⭐ R-28 — `stripPlaceholdersFromCapture`                         */
/* ================================================================== */

test('T-09 ⭐⭐⭐ R-28 el patch pierde SÓLO la clave de captura cuyo valor es el marcador', () => {
  const { patch, blocked } = stripPlaceholdersFromCapture({
    city: MARCADOR,
    state: 'CA',
    business_name: 'SCS CLeaning Service'
  });
  assert.deepEqual(patch, {
    state: 'CA',
    business_name: 'SCS CLeaning Service'
  });
  assert.deepEqual(blocked, ['city']);
  // La clave bloqueada se OMITE — no se reemplaza por `''`, `null` ni un default: eso SÍ
  // sería sobrescribir un valor del operador (R-04).
  assert.ok(
    !('city' in patch),
    'la clave bloqueada debe AUSENTARSE, no vaciarse'
  );
});

test('T-09 ⭐⭐ las columnas que NO son de captura pasan siempre, aunque valgan el marcador', () => {
  const { patch, blocked } = stripPlaceholdersFromCapture({
    status: MARCADOR,
    tier: MARCADOR,
    deliverable_token: MARCADOR
  });
  assert.deepEqual(blocked, []);
  assert.deepEqual(patch, {
    status: MARCADOR,
    tier: MARCADOR,
    deliverable_token: MARCADOR
  });
});

test('T-09 ⭐ el seam es PURO: no muta la entrada y es determinista', () => {
  const entrada = { city: MARCADOR, state: 'CA' };
  const copia = { ...entrada };
  stripPlaceholdersFromCapture(entrada);
  assert.deepEqual(entrada, copia, 'el guard mutó el objeto de entrada');
  assert.deepEqual(
    stripPlaceholdersFromCapture(entrada),
    stripPlaceholdersFromCapture(entrada)
  );
  // Patch sin nada que bloquear: sale idéntico.
  const limpio = { city: 'Santa Maria', state: 'CA' };
  const r = stripPlaceholdersFromCapture(limpio);
  assert.deepEqual(r.patch, limpio);
  assert.deepEqual(r.blocked, []);
});

/* ================================================================== */
/*  ⭐⭐⭐ R-30 — el guard NO toca los artefactos generados              */
/* ================================================================== */

test('T-09 ⭐⭐⭐ R-30 el guard es de `clients`: no se aplica a briefs/personas/ofertas', () => {
  const code = stripComments(read(GUARD_REL));
  for (const tabla of ['briefs', 'buyer_personas', 'offers', 'diagnostics']) {
    assert.ok(
      !new RegExp(`from\\(['"\`]${tabla}`).test(code),
      `el guard toca \`${tabla}\`: R-30 lo acota a writes a \`clients\``
    );
  }
  // Las claves de un artefacto generado NO son columnas de captura ⇒ el guard las ignora
  // aunque el valor sea el marcador. `briefs.content.city` es la excepción interesante:
  // la clave se llama igual, pero el guard **nunca ve** ese objeto — sólo patches de
  // `clients`. Se comprueba que el módulo no exporta ningún camino hacia esas tablas.
  for (const clave of [
    'main_problem',
    'pain_1',
    'psychographics',
    'goal_12m',
    'licenses'
  ]) {
    assert.equal(
      isCaptureColumn(clave),
      false,
      `\`${clave}\` es una clave de artefacto GENERADO y no puede estar en la lista de ` +
        'captura: el marcador ahí es degradación honesta legítima (R-01/R-30)'
    );
  }
});

test('T-09 ⭐⭐⭐ R-30/R-02 lo que hoy es APROBABLE sigue siéndolo (conducta, no fuente)', () => {
  // El blindaje real de R-01/R-30: no basta con que el guard no mencione `briefs`; el
  // contenido con marcador tiene que seguir pasando `assessApproval` sin cambios.
  const aprobables = [
    { licenses: MARCADOR, business_name: 'SCS Cleaning Service' },
    { city: MARCADOR, main_problem: 'Sin presencia digital en Google Maps' },
    {
      goal_12m: 'Top 3 en Google Maps para ' + MARCADOR + ' + 15-20 leads/mes'
    }
  ];
  for (const campos of aprobables) {
    assert.equal(
      assessApproval(campos).ok,
      true,
      `F-122 volvió INAPROBABLE algo que hoy es aprobable: ${JSON.stringify(campos)}`
    );
  }
  // Y el umbral no se movió en el otro sentido.
  assert.equal(assessApproval({}).ok, false);
  assert.equal(assessApproval({ a: MARCADOR }).reason, 'all_placeholder');
});

/* ================================================================== */
/*  ⭐⭐⭐ H-3 / R-29 — el literal NO se escribe en `src/lib`            */
/* ================================================================== */

test('T-09 ⭐⭐⭐ R-29 el guard REUSA el marcador exportado y no escribe su literal', () => {
  const code = stripComments(read(GUARD_REL));
  assert.match(
    code,
    /import \{[\s\S]{0,80}?isPendingMarker[\s\S]{0,80}?\} from '\.\.\/method-context\/pending\.ts'/,
    'R-29: el marcador se reusa de su fuente única, no se redefine'
  );
  assert.doesNotMatch(
    code,
    /'\[pendiente\]'/i,
    'H-3: `f112-no-regression` y `f113-source-guards` exigen que el literal aparezca UNA ' +
      'sola vez en todo `src/lib` (`method-context/pending.ts`)'
  );
});

test('T-09 ⭐⭐⭐ H-3 el literal del marcador SIGUE apareciendo una sola vez en `src/lib`', () => {
  // Se re-verifica acá, con el barrido propio de F-122: el guard nuevo es justamente el
  // tipo de módulo que tentaría a escribirlo otra vez.
  let total = 0;
  const walk = (rel: string): void => {
    for (const e of readdirSync(resolve(REPO, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (/\.tsx?$/.test(e.name)) {
        total += (stripComments(read(r)).match(/'\[pendiente\]'/gi) ?? [])
          .length;
      }
    }
  };
  walk('src/lib');
  assert.equal(
    total,
    1,
    `el literal del marcador aparece ${total} veces en \`src/lib\`: debe ser exactamente 1`
  );
});

test('T-09 ⭐ el seam es PURO: sin I/O, sin red, sin Supabase, sin React', () => {
  const code = stripComments(read(GUARD_REL));
  for (const prohibido of [
    'supabase',
    'fetch(',
    'node:fs',
    'react',
    'process.env'
  ]) {
    assert.ok(
      !code.toLowerCase().includes(prohibido.toLowerCase()),
      `${GUARD_REL} dejó de ser puro: menciona \`${prohibido}\``
    );
  }
});
