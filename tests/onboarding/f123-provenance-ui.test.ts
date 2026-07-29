/**
 * F-123 — **T-05 / T-06** — La señal en la UI: marca derivada + aviso al aprobar
 * (R-14, R-15, R-16, R-18, R-19, R-20, R-21).
 *
 * La pantalla es un componente de página; siguiendo el patrón establecido del repo
 * (f080/f081/f084/f121/f122) el wiring se verifica sobre el **código fuente**, y el
 * **comportamiento** se verifica sobre el seam puro que lo alimenta. El cierre autoritativo
 * es LIVE (§6.1, T-10, gateada por F-074).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  buildTemplate,
  detectTemplateFields,
  templateFor,
  type TemplateCtx
} from '../../src/lib/onboarding/field-templates.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BRIEF = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const SRC = readFileSync(resolve(REPO, BRIEF), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /(^|[^:])\/\/[^\n]*/g,
  '$1'
);

const CTX: TemplateCtx = {
  business_name: 'SCS CLeaning Service',
  industry_label: 'Limpieza',
  city: 'Buellton'
};

/* ================================================================== */
/*  ⭐⭐⭐ R-14 — la marca se DERIVA DEL VALOR, no de un flag de sesión  */
/* ================================================================== */

test('T-05 ⭐⭐⭐ R-14 `provenanceOf` deriva del VALOR actual, no de un flag de sesión', () => {
  // Ésta es la decisión que sostiene el frente: derivar del valor es lo que hace que las 8
  // filas YA contaminadas queden señaladas SIN TOCARLAS, y que la marca se apague sola.
  assert.match(
    CODE,
    /const tplHits = detectTemplateFields\(briefFields, tplCtx\)/,
    'R-14: la procedencia debe derivarse de `briefFields` con el detector. Un flag de ' +
      'sesión no señalaría los briefs ya guardados y se perdería al recargar.'
  );
  assert.match(
    CODE,
    /const provenanceOf = \([\s\S]{0,120}?tplHits\.some/,
    '`provenanceOf` debe consultar el resultado del detector'
  );
  // Y NO existe ningún estado que "recuerde" el click: eso sería el flag prohibido.
  assert.ok(
    !/useState[^\n]*(tplClicked|templateUsed|clickedTemplate)/.test(CODE),
    'apareció un flag de sesión de plantilla: se pierde al recargar y no ve lo ya guardado'
  );
});

test('T-05 ⭐⭐⭐ R-15 la marca SE APAGA SOLA al editar o al sobrescribir con el modelo', () => {
  const campo = 'psychographics';
  const tpl = templateFor(campo)!;
  const valorPlantilla = buildTemplate(tpl, CTX);

  // (1) Con el valor de plantilla ⇒ detectado ⇒ la marca sería `tpl`.
  assert.equal(
    detectTemplateFields({ [campo]: valorPlantilla }, CTX).length,
    1
  );

  // (2) El operador lo edita de verdad ⇒ deja de detectarse, SIN llamada de limpieza.
  const editado =
    'Valora que le respondan rápido y que el equipo sea el mismo cada semana.';
  assert.deepEqual(
    detectTemplateFields({ [campo]: editado }, CTX),
    [],
    'R-15: la marca debe apagarse SOLA cuando el operador escribe lo suyo. Si hiciera ' +
      'falta una llamada explícita para limpiarla, alguien se la va a olvidar.'
  );

  // (3) El modelo sobrescribe el campo al generar ⇒ tampoco se detecta.
  const delModelo =
    'Propietarios de multipropiedad que priorizan continuidad de servicio y trato directo.';
  assert.deepEqual(detectTemplateFields({ [campo]: delModelo }, CTX), []);
});

/* ================================================================== */
/*  ⭐⭐ R-16 — la leyenda declara las 5 procedencias                    */
/* ================================================================== */

test('T-05 ⭐⭐ R-16 `FieldDot` soporta 5 tipos y la leyenda los declara', () => {
  assert.match(
    CODE,
    /type:\s*'auto'\s*\|\s*'manual'\s*\|\s*'ai'\s*\|\s*'diag'\s*\|\s*'tpl'/,
    'R-16: `FieldDot` debe aceptar `tpl`'
  );
  assert.match(
    CODE,
    /tpl:\s*'bg-[a-z]+-\d+'/,
    '`tpl` necesita color propio, distinguible'
  );
  assert.match(
    CODE,
    /<FieldDot type='tpl' \/>/,
    'R-16: sin entrada en la leyenda, la marca nueva es un punto que nadie sabe leer'
  );
  // Las 5 entradas de la leyenda existen.
  for (const t of ['auto', 'diag', 'ai', 'manual', 'tpl']) {
    assert.ok(
      new RegExp(`<FieldDot type='${t}' />`).test(CODE),
      `falta la entrada \`${t}\` en la leyenda`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ R-18..R-21 — el aviso: advisory, con delta cero y límite dicho */
/* ================================================================== */

const AVISO = CODE.slice(
  CODE.indexOf('function TemplateProvenanceNotice'),
  CODE.indexOf('function TemplateProvenanceNotice') + 1600
);

test('T-06 ⭐⭐⭐ R-18 el aviso se monta ANTES de generar y de aprobar', () => {
  assert.match(
    CODE,
    /<TemplateProvenanceNotice fields=\{briefFields\} ctx=\{tplCtx\} \/>/,
    'R-18: el aviso debe estar montado y alimentado por el estado real'
  );
  // Y montado junto a `TestResidueNotice`, es decir ENCIMA de la fila de acciones.
  const iAviso = CODE.indexOf('<TemplateProvenanceNotice');
  const iResiduo = CODE.indexOf('<TestResidueNotice');
  const iAcciones = CODE.indexOf('handleGenerateBrief}');
  assert.ok(
    iResiduo > 0 && iAviso > iResiduo,
    'el aviso va junto a `TestResidueNotice`'
  );
  assert.ok(
    iAviso < iAcciones,
    'R-18: el aviso debe verse ANTES de «Generar» y «Aprobar». El dato que lo puso ahí: 6 ' +
      'de los 8 briefs contaminados ya estaban `approved` ⇒ el punto de fuga es la aprobación.'
  );
});

test('T-06 ⭐⭐⭐ R-19 el aviso NO bloquea, NO muta y NO escribe (DT-02: advisory)', () => {
  for (const prohibido of [
    'disabled',
    'onClick',
    'updateBrief',
    'setBriefFields',
    'delete '
  ]) {
    assert.ok(
      !AVISO.includes(prohibido),
      `R-19: el aviso contiene \`${prohibido}\`. El operador decidió ADVISORY: «no cambiar ` +
        'todavía la autoridad de aprobación en este frente». `assessApproval` no se toca.'
    );
  }
  // Y `assessApproval` efectivamente no ganó una condición nueva.
  assert.ok(
    !/assessApproval[\s\S]{0,200}(template|tpl|plantilla)/i.test(CODE),
    'DT-02: la aprobación no puede ganar una condición nueva en este frente'
  );
});

test('T-06 ⭐⭐ R-20 sin detección ⇒ `return null` ⇒ delta visual CERO', () => {
  assert.match(
    AVISO,
    /if \(hits\.length === 0\) return null;/,
    'R-20: un brief sin texto de plantilla no debe ver NADA nuevo. Sin esto, F-123 ' +
      'cambiaría la pantalla para todos y no sólo para los casos que lo necesitan.'
  );
  // Comprobación de comportamiento sobre el insumo: un brief limpio no produce hits.
  assert.deepEqual(
    detectTemplateFields(
      {
        psychographics: 'Texto propio del operador',
        goal_90: 'Cerrar 3 cuentas'
      },
      CTX
    ),
    []
  );
});

test('T-06 ⭐⭐⭐ R-21 el aviso DECLARA el límite de su propia medición', () => {
  assert.match(
    AVISO,
    /puede no reconocerse|puede quedarse corta/,
    'R-21: el aviso debe decir que su detección es incompleta. Un aviso que se presenta ' +
      'como exhaustivo sin serlo repite —en chico— el defecto que F-123 vino a cerrar: ' +
      'afirmar más certeza de la que hay.'
  );
  assert.match(
    AVISO,
    /no lo infirió la IA|no generado por el modelo/,
    'R-21/R-01: el aviso debe decir explícitamente que ese texto NO lo generó el modelo'
  );
  assert.match(
    AVISO,
    /la corrección es tuya/,
    'R-02: corregir es del operador, no del sistema'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-17 — la marca vive en la UI, JAMÁS en el valor persistido     */
/* ================================================================== */

test('T-05 ⭐⭐ R-17 al insertar, el valor NO recibe ningún prefijo ni marcador', () => {
  // `applyTemplate` escribe exactamente lo que construye el catálogo.
  assert.match(
    CODE,
    /updateBrief\(\s*field as keyof BriefFields,\s*buildTemplate\(templateFor\(field\)!, tplCtx\)\s*\)/,
    'R-17: el valor escrito debe ser el del catálogo, sin envoltura. Prefijar el texto ' +
      'inyectaría un marcador en captura (F-122 R-28..R-32) y viajaría al modelo como si ' +
      'fuera parte del negocio.'
  );
  // Y el texto construido no lleva ninguna marca.
  const v = buildTemplate(templateFor('goal_90')!, CTX);
  assert.ok(
    !/^\[|^\(ejemplo|^EJEMPLO/i.test(v),
    'el valor insertado lleva una marca'
  );
});
