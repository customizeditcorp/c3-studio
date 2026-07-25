/**
 * F-099 — Loop de revisión (surface del feedback + regenerar-con-feedback, Scope A).
 *
 * Runner: node:test + node:assert/strict (repo convention). Cubre las seams PURAS
 * (`feedback.ts`: pickPendingFeedback / buildFeedbackDirective), la no-regresión + orden
 * de directivas del user message (`prompt.ts`), y un source-guard estructural sobre la
 * ruta (`generate-gbp/route.ts`) + los writers intactos. El surface del banner + botón y
 * la orquestación live del regenerar se cierran autoritativamente LIVE (T-11, frontera).
 *
 *   T-12 — seams puras: pickPendingFeedback / buildFeedbackDirective
 *   T-13 — buildGbpUserMessage(ctx, {feedbackDirective[, complianceDirective]}) +
 *          no-regresión (sin option idéntico; compliance sola intacta) + source-guards
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  pickPendingFeedback,
  buildFeedbackDirective,
  type PreviewFeedbackRow
} from '../../src/lib/gbp-slice/feedback.ts';
import { readGbpContext } from '../../src/lib/gbp-slice/context.ts';
import { buildGbpUserMessage } from '../../src/lib/gbp-slice/prompt.ts';
import {
  CLIENT_WITH_CITY,
  REAL_OFFER,
  APPROVED_BRANDBOARD,
  APPROVED_BRIEF
} from './fixtures.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/** Markers usados en las aserciones de orden del user message. */
const JSON_LINE = 'Responde SOLO con JSON';
const FEEDBACK_HEADER = 'REVISIÓN DEL CLIENTE';
const LANG_MARKER = 'IDIOMA DE SALIDA (OBLIGATORIO)';
const COMPLIANCE_HEADER = 'CORRECCIÓN OBLIGATORIA';

/** ctx JD Valley WITH city=Buellton + approved brief (reusa fixtures de F-095/F-098). */
function ctxWithCity() {
  return readGbpContext({
    client: CLIENT_WITH_CITY,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: APPROVED_BRIEF
  });
}

/* ============================ T-12 — pickPendingFeedback ============================= */

test('T-12 (i) (R-02) approved=false + feedback -> devuelve el texto del pedido', () => {
  const preview: PreviewFeedbackRow = {
    approved: false,
    feedback: 'pinta la puerta'
  };
  assert.equal(pickPendingFeedback(preview), 'pinta la puerta');
});

test('T-12 (ii) (R-03) feedback en blanco (solo espacios) -> null; trim aplicado', () => {
  assert.equal(pickPendingFeedback({ approved: false, feedback: '   ' }), null);
  // trim de un feedback con padding -> texto limpio.
  assert.equal(
    pickPendingFeedback({ approved: false, feedback: '  cambiá el tono  ' }),
    'cambiá el tono'
  );
});

test('T-12 (iii) (R-03) preview null / undefined -> null (sin preview -> sin banner)', () => {
  assert.equal(pickPendingFeedback(null), null);
  assert.equal(pickPendingFeedback(undefined), null);
});

test('T-12 (iv) (R-04) approved=true con feedback -> null (aprobación fuera de scope)', () => {
  assert.equal(pickPendingFeedback({ approved: true, feedback: 'x' }), null);
});

test('T-12 (v) (R-05) preview nuevo tras regen (approved=false, feedback null) -> null (supersede)', () => {
  assert.equal(pickPendingFeedback({ approved: false, feedback: null }), null);
  // feedback no-string (defensivo) -> null.
  assert.equal(
    pickPendingFeedback({
      approved: false,
      feedback: 123 as unknown as string
    }),
    null
  );
});

/* ============================ T-12 — buildFeedbackDirective ========================== */

test('T-12 (vi) (R-07/R-13) incluye el texto del pedido + encabezado + "sin inventar datos"', () => {
  const directive = buildFeedbackDirective('menos formal y más corto');
  assert.match(directive, /REVISIÓN DEL CLIENTE/);
  assert.match(directive, /menos formal y más corto/);
  assert.match(directive, /sin inventar datos que no estén ya provistos/);
});

test('T-12 (vii) (R-07) feedback vacío / no-string -> string vacío', () => {
  assert.equal(buildFeedbackDirective(''), '');
  assert.equal(buildFeedbackDirective('    '), '');
  assert.equal(buildFeedbackDirective(undefined as unknown as string), '');
  // trim aplicado en el cuerpo de la directiva.
  assert.match(buildFeedbackDirective('  arreglá X  '), /\narreglá X\n/);
});

/* ==================== T-13 — buildGbpUserMessage(ctx, {feedbackDirective}) =========== */

test('T-13 (R-07/R-08) feedbackDirective aparece y el idioma sigue siendo el ÚLTIMO bloque', () => {
  const ctx = ctxWithCity();
  const feedbackDirective = buildFeedbackDirective(
    'cambiá la ciudad de servicio'
  );
  const msg = buildGbpUserMessage(ctx, { feedbackDirective });
  assert.ok(
    msg.includes(FEEDBACK_HEADER),
    'la directiva de feedback está presente'
  );
  const iJson = msg.indexOf(JSON_LINE);
  const iFeedback = msg.indexOf(FEEDBACK_HEADER);
  const iLang = msg.indexOf(LANG_MARKER);
  assert.ok(iJson >= 0 && iFeedback >= 0 && iLang >= 0);
  assert.ok(iFeedback > iJson, 'feedback tras la instrucción de JSON');
  assert.ok(iLang > iFeedback, 'idioma es el ÚLTIMO bloque (tras el feedback)');
});

test('T-13 (R-08/R-09) ambas directivas: feedback ANTES de compliance, idioma al cierre', () => {
  const ctx = ctxWithCity();
  const feedbackDirective = buildFeedbackDirective('sé más específico');
  const complianceDirective = 'CORRECCIÓN OBLIGATORIA: __marker__';
  const msg = buildGbpUserMessage(ctx, {
    feedbackDirective,
    complianceDirective
  });
  const iFeedback = msg.indexOf(FEEDBACK_HEADER);
  const iCompliance = msg.indexOf(COMPLIANCE_HEADER);
  const iLang = msg.indexOf(LANG_MARKER);
  assert.ok(iFeedback >= 0 && iCompliance >= 0 && iLang >= 0);
  assert.ok(iFeedback < iCompliance, 'feedback antes de compliance');
  assert.ok(
    iCompliance < iLang,
    'idioma es el ÚLTIMO bloque (tras ambas directivas)'
  );
});

test('T-13 (R-10/R-15) sin option -> idéntico a F-095/F-098; compliance sola no incluye feedback', () => {
  const ctx = ctxWithCity();
  const base = buildGbpUserMessage(ctx);
  // Sin option / options vacío / directivas vacías -> byte-idéntico (no-regresión).
  assert.equal(buildGbpUserMessage(ctx, {}), base, 'options vacío -> idéntico');
  assert.equal(
    buildGbpUserMessage(ctx, { feedbackDirective: '' }),
    base,
    'feedbackDirective vacío -> sin inserción -> idéntico'
  );
  assert.equal(
    buildGbpUserMessage(ctx, { feedbackDirective: '   ' }),
    base,
    'feedbackDirective en blanco -> sin inserción -> idéntico'
  );
  assert.equal(
    buildGbpUserMessage(ctx, {
      feedbackDirective: undefined,
      complianceDirective: undefined
    }),
    base,
    'ambas undefined -> idéntico'
  );
  assert.ok(
    !base.includes(FEEDBACK_HEADER),
    'el base no lleva directiva de feedback'
  );
  // complianceDirective sola: NO debe arrastrar la directiva de feedback (intacta F-098).
  const complianceOnly = buildGbpUserMessage(ctx, {
    complianceDirective: 'CORRECCIÓN OBLIGATORIA: __c__'
  });
  assert.ok(
    !complianceOnly.includes(FEEDBACK_HEADER),
    'compliance sola no inyecta feedback (F-098 intacta)'
  );
  const iCompliance = complianceOnly.indexOf(COMPLIANCE_HEADER);
  const iLang = complianceOnly.indexOf(LANG_MARKER);
  assert.ok(
    iCompliance > 0 && iLang > iCompliance,
    'compliance antes del idioma'
  );
});

/* ==================== T-13 — source-guard on generate-gbp/route.ts =================== */

const ROUTE = readFileSync(
  resolve(REPO, 'src/app/api/generate-gbp/route.ts'),
  'utf8'
);

test('T-13 (R-07/R-10) la ruta lee body?.feedback y computa la directiva condicionalmente', () => {
  assert.match(ROUTE, /body\?\.feedback/, 'lee el feedback del body');
  assert.match(
    ROUTE,
    /buildFeedbackDirective\(feedbackRaw\)/,
    'construye la directiva desde el feedback del body'
  );
  // La 1ª generación pasa el feedback solo si presente (undefined en el camino normal).
  assert.match(
    ROUTE,
    /feedbackDirective \? \{ feedbackDirective \} : undefined/,
    'camino normal (sin feedback) -> llamada idéntica a hoy (R-10)'
  );
});

test('T-13 (R-09) el retry-once de compliance pasa AMBAS directivas (feedback no se pierde)', () => {
  const retryRegion = ROUTE.slice(
    ROUTE.indexOf('buildComplianceRetryDirective(compliance.missing)'),
    ROUTE.indexOf('retryCompletion')
  );
  assert.ok(retryRegion.length > 0, 'región del retry localizada');
  assert.match(
    retryRegion,
    /feedbackDirective/,
    'el retry incluye la directiva de feedback'
  );
  assert.match(
    retryRegion,
    /complianceDirective: directive/,
    'el retry incluye la directiva de compliance'
  );
});

test('T-13 (R-05/R-14) supersede sin DDL: sin columna de "consumo" y sin persistir feedback', () => {
  // No flag/columna de "consumo" del feedback en ninguna parte de la ruta (el token de
  // dominio "CONSUMES the approved OFV" es legítimo; lo prohibido es un estado consumed).
  assert.doesNotMatch(
    ROUTE,
    /consumed|feedback_consumed/i,
    'sin flag de consumo'
  );
  // El INSERT del preview nuevo NO persiste un campo `feedback` (queda null -> supersede).
  const previewInsert = ROUTE.slice(
    ROUTE.indexOf(".from('previews')"),
    ROUTE.indexOf('if (previewErr)')
  );
  assert.ok(
    previewInsert.length > 0,
    'bloque del insert de preview localizado'
  );
  assert.doesNotMatch(
    previewInsert,
    /feedback/,
    'el preview nuevo no escribe feedback (supersede por recencia, R-05)'
  );
  // `feedback_regen` (log-only) es la ÚNICA huella de feedback en un write, y va en metadata.
  assert.match(
    ROUTE,
    /feedback_regen: !!feedbackDirective/,
    'observabilidad log-only en activity_log.metadata (R-14)'
  );
});

test('T-13 (R-15) los writers del preview público (preview-approve/preview-feedback) NO se modifican', () => {
  // No-regresión estructural: F-099 no cablea sus símbolos en los writers del flujo público.
  for (const rel of [
    'src/app/api/preview-approve/route.ts',
    'src/app/api/preview-feedback/route.ts'
  ]) {
    const src = readFileSync(resolve(REPO, rel), 'utf8');
    assert.doesNotMatch(
      src,
      /pickPendingFeedback|buildFeedbackDirective/,
      rel + ' no referencia símbolos de F-099'
    );
  }
});
