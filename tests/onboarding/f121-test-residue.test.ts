/**
 * F-121 — T-08 / T-14 — `detectTestResidue` + aviso advisory (R-26, R-27, R-28, R-29).
 *
 * Fixture real (R-30): `differentiators = "TEST T-04"` — R & M QTB LLC, brief
 * `b56d1fa3`. Ese valor viajó al modelo como un hecho afirmado por el operador y fue
 * **re-inyectado** por el bucle post-generación.
 *
 * Incluye el test de inspección de **T-14 (R-26)**: el comentario que documenta el
 * mecanismo del residuo se queda **rojo** —no stale— si el mecanismo cambia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  detectTestResidue,
  detectTestResidueFields
} from '../../src/lib/onboarding/assembly-guard.ts';
import { assessApproval } from '../../src/lib/onboarding/approval-guard.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const PAGE_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const PAGE = read(PAGE_REL);
const PAGE_CODE = stripComments(PAGE);
const GUARD_REL = 'src/lib/onboarding/assembly-guard.ts';
const GUARD = read(GUARD_REL);

/** Cuerpo de una `function <nombre>(…) { … }`, balanceado por llaves. */
function cuerpoFuncion(src: string, nombre: string): string {
  const i = src.indexOf(`function ${nombre}`);
  assert.ok(i > 0, `no se encontró function ${nombre}`);
  let p = 0;
  let j = src.indexOf('(', i);
  for (; j < src.length; j++) {
    if (src[j] === '(') p++;
    else if (src[j] === ')') {
      p--;
      if (p === 0) break;
    }
  }
  let d = 0;
  let k = src.indexOf('{', j);
  for (; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') {
      d--;
      if (d === 0) break;
    }
  }
  return src.slice(src.indexOf('{', j), k + 1);
}

/* ================================================================== */
/*  ⭐⭐ R-27 — el fixture real, y sólo lo que ES un residuo            */
/* ================================================================== */

test('T-08 ⭐⭐ R-27 `TEST T-04` (R & M, `b56d1fa3`) se detecta', () => {
  assert.equal(detectTestResidue('TEST T-04'), true);
  assert.equal(detectTestResidue('  TEST T-04  '), true);
  assert.deepEqual(detectTestResidueFields({ differentiators: 'TEST T-04' }), [
    'differentiators'
  ]);
});

test('T-08 ⭐ R-27 otras formas de marcador de prueba también se detectan', () => {
  for (const v of [
    'TEST',
    'PRUEBA',
    'PRUEBA 2',
    'DUMMY',
    'FOO',
    'ASDF',
    'XXX',
    'LOREM'
  ]) {
    assert.equal(detectTestResidue(v), true, `\`${v}\` es un residuo`);
  }
});

test('T-08 ⭐⭐ R-27 contenido de negocio LEGÍTIMO no se marca (postura conservadora, DT-04)', () => {
  const legitimos = [
    // «test»/«prueba» son vocabulario normal de estas industrias.
    'Test de presión certificado en cada instalación',
    'Prueba de carga y certificado de seguridad incluidos',
    'Realizamos pruebas de humedad antes de pintar',
    'TEST Kitchen Remodeling LLC',
    'Garantía escrita de mano de obra',
    '[PENDIENTE]',
    '',
    '   '
  ];
  for (const v of legitimos) {
    assert.equal(
      detectTestResidue(v),
      false,
      `falso positivo sobre «${v}»: frenaría a un operador que hoy no está frenado`
    );
  }
  for (const v of [null, undefined, 42, {}, []]) {
    assert.equal(detectTestResidue(v), false);
  }
  assert.deepEqual(detectTestResidueFields(null), []);
  assert.deepEqual(detectTestResidueFields(undefined), []);
});

/* ================================================================== */
/*  ⭐⭐ R-28 / R-29 — AVISA, no bloquea; no muta, no borra             */
/* ================================================================== */

test('T-08 ⭐⭐ R-28 el aviso existe, está montado ANTES de generar/aprobar, y con 0 residuos NO renderiza nada', () => {
  const comp = cuerpoFuncion(PAGE_CODE, 'TestResidueNotice');
  assert.match(
    comp,
    /if\s*\(\s*residuos\.length\s*===\s*0\s*\)\s*return\s+null/,
    'R-28: sin residuos el delta visual debe ser CERO (patrón F-119 R-28)'
  );
  // Montado, y por delante del botón de generar.
  const iAviso = PAGE_CODE.indexOf('<TestResidueNotice');
  const iGenerar = PAGE_CODE.indexOf('onClick={handleGenerateBrief}');
  assert.ok(iAviso > 0, 'el aviso no está montado en la pantalla');
  assert.ok(
    iGenerar > iAviso,
    'el aviso debe verse ANTES de generar: avisar después es no avisar'
  );
  // Y se alimenta de los campos manuales que realmente viajan.
  assert.match(PAGE_CODE, /<TestResidueNotice\s+fields=\{briefFields\}/);
});

test('T-08 ⭐⭐ R-28/R-29 el aviso NO bloquea, NO escribe y NO muta ningún valor', () => {
  const comp = cuerpoFuncion(PAGE_CODE, 'TestResidueNotice');
  assert.doesNotMatch(
    comp,
    /disabled/,
    'R-28: advisory, no gate. Bloquear colisiona con R-02 y podría regresar a SCS'
  );
  assert.doesNotMatch(comp, /onClick|onChange/);
  assert.doesNotMatch(
    comp,
    /supabase|\.insert\(|\.update\(|\.upsert\(|\.delete\(/
  );
  assert.doesNotMatch(
    comp,
    /setBriefFields|updateBrief/,
    'R-29: el sistema NO puede borrar, vaciar ni sobrescribir un valor del operador'
  );
  // El módulo del detector tampoco muta: no hay asignación a la entrada.
  const GUARD_CODE = stripComments(GUARD);
  assert.doesNotMatch(GUARD_CODE, /fields\[[^\]]+\]\s*=/);
  assert.doesNotMatch(GUARD_CODE, /\.delete\(|delete\s+\w+\[/);
});

test('T-08 ⭐⭐ R-28 detectar un residuo NO cambia la aprobabilidad del contenido', () => {
  // El brief de R & M, con su residuo real, sigue siendo aprobable exactamente igual.
  const campos = {
    business_name: 'R & M QTB LLC',
    differentiators: 'TEST T-04',
    licenses: '[PENDIENTE]'
  };
  assert.deepEqual(detectTestResidueFields(campos), ['differentiators']);
  assert.equal(
    assessApproval(campos).ok,
    true,
    'R-02/R-28: nada nuevo impide aprobar'
  );
});

test('T-08 R-29 el aviso NO añade gates a la superficie: cero `disabled` nuevos', () => {
  // Guard espejo del de `f119-ui-source-guards` R-29, acotado al aviso de F-121.
  assert.doesNotMatch(
    PAGE_CODE,
    /disabled=\{[^}]*(residuo|TestResidue|detectTestResidue)/i,
    'R-28/R-29: el residuo lo introdujo el operador y la corrección es suya; ' +
      'castigarlo con un gate es peor que el defecto (AGENTS.md §8.2)'
  );
});

/* ================================================================== */
/*  ⭐⭐ T-14 / R-26 — el MECANISMO documentado, y verificado en disco  */
/* ================================================================== */

test('T-14 ⭐⭐ R-26 el comentario de `assembly-guard.ts` documenta el mecanismo con sus 4 eslabones', () => {
  for (const pieza of [
    'created_at desc',
    'CUALQUIER status',
    'parseContentToFields',
    'structured_fields',
    're-inyección post-generación'
  ]) {
    assert.ok(
      GUARD.includes(pieza),
      `la cabecera de \`assembly-guard.ts\` dejó de documentar «${pieza}» (R-26)`
    );
  }
  assert.match(
    GUARD,
    /No hay bug: hay ausencia de señal|no hubo un bug|faltó una señal|NO hay un bug|No hubo un bug/i,
    'el diagnóstico del mecanismo es que los 4 eslabones son legítimos por separado'
  );
});

test('T-14 ⭐⭐ R-26 las 3 referencias del mecanismo SIGUEN EXISTIENDO en `page.tsx` (si cambia, esto queda ROJO, no stale)', () => {
  // (1) La carga de `briefs` es `created_at desc` y SIN filtro de `status`.
  const iBriefs = PAGE_CODE.indexOf(".from('briefs')");
  assert.ok(iBriefs > 0);
  const carga = PAGE_CODE.slice(iBriefs, PAGE_CODE.indexOf(';', iBriefs) + 1);
  assert.match(
    carga,
    /\.order\(\s*'created_at',\s*\{\s*ascending:\s*false\s*\}\s*\)/,
    'eslabón 1: la carga dejó de ser `created_at desc`'
  );
  assert.doesNotMatch(
    carga,
    /\.eq\(\s*'status'/,
    'eslabón 1: la carga NO filtra por `status` — intencional desde F-113 R-35 ' +
      '(filtrarla borraría el borrador vivo del operador)'
  );
  // (2) `handleGenerateBrief` manda `briefFields` VERBATIM como `structured_fields`.
  assert.match(
    PAGE_CODE,
    /inputData:\s*\{\s*structured_fields:\s*briefFields\s*\}/,
    'eslabón 3: el envío verbatim de los campos manuales cambió'
  );
  // (3) El bucle de RE-INYECCIÓN post-generación sigue ahí.
  assert.match(
    PAGE_CODE,
    /for\s*\(\s*const\s+k\s+of\s+Object\.keys\(briefFields\)[\s\S]{0,200}?if\s*\(\s*!parsed\[k\]\s*&&\s*briefFields\[k\]\s*\)\s*parsed\[k\]\s*=\s*briefFields\[k\]/,
    'eslabón 4: el bucle que RE-INYECTA el valor manual si el modelo lo omitió cambió ' +
      '⇒ el comentario de `assembly-guard.ts` quedaría stale (R-26)'
  );
});
