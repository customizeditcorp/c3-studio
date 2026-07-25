/**
 * F-105 — Guard determinista de no-fabricación de prueba social en la OFV (backstop, inverso
 * de F-098). Runner: node:test + node:assert/strict (convención del repo).
 *
 * Cubre las seams PURAS (`src/lib/ofv/non-fabrication.ts`) + la decisión del retry-once
 * (réplica byte-a-byte del bloque de `route.ts`, patrón F-102) + source-guards estructurales
 * sobre la orquestación en la ruta. La confirmación LIVE (residuo + captura + no-FP) es
 * frontera del operador/Leader (T-10, §6.1) y NO se ejecuta acá.
 *
 *   T-03 — marcadores honestos → NO flag (R-01, R-09), la puerta rectora.
 *   T-04 — fabricación numérica sin grounding → flag; prosa blanda → NO flag (R-02, R-03).
 *   T-05 — señal CON grounding → NO flag (R-04), anti sobre-corrección.
 *   T-06 — robustez de shapes de social_proof (R-09).
 *   T-07 — retry-once dirigido + conservar-si-falla (R-05, R-06).
 *   T-08 — no-bloqueante + warning transitorio + shape persistido (R-07, R-08, R-11).
 *   T-09 — no-regresión / diff aislado (R-12).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  resolveSocialProofGrounding,
  stringifySocialProof,
  isHonestSocialProof,
  detectFabricationSignals,
  checkOfvNonFabrication,
  buildNonFabricationRetryDirective,
  formatNonFabricationWarning,
  type SocialProofGrounding
} from '../../src/lib/ofv/non-fabrication.ts';
import { parseGeneratedContent } from '../../src/lib/generate-content/parse.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/** Grounding vacío = sin prueba social en el contexto (el caso más común, R-10). */
const EMPTY_GROUNDING: SocialProofGrounding = {
  hasLexicalSocialProof: false,
  digitSet: new Set()
};

/* ============================ T-03 — marcadores honestos (R-01/R-09) ================= */

test('T-03 (R-01) [PENDIENTE] literal (v2 string) -> ok:true, fabricated:[] (puerta rectora)', () => {
  const res = checkOfvNonFabrication(
    '[PENDIENTE: provide real reviews/testimonials]',
    EMPTY_GROUNDING
  );
  assert.deepEqual(res, { ok: true, fabricated: [] });
});

test('T-03 (R-01) vacío / whitespace / null / clave ausente -> honesto (no flag)', () => {
  assert.equal(checkOfvNonFabrication('', EMPTY_GROUNDING).ok, true);
  assert.equal(checkOfvNonFabrication('   ', EMPTY_GROUNDING).ok, true);
  assert.equal(checkOfvNonFabrication(null, EMPTY_GROUNDING).ok, true);
  assert.equal(checkOfvNonFabrication(undefined, EMPTY_GROUNDING).ok, true); // clave ausente
});

test('T-03 (R-01/R-09) [PENDIENTE] es case/acento-insensitive y funciona anidado en array', () => {
  assert.equal(isHonestSocialProof('[pendiente]'), true);
  assert.equal(isHonestSocialProof('[PENDIENTE: algo]'), true);
  assert.equal(
    checkOfvNonFabrication(['[PENDIENTE]'], EMPTY_GROUNDING).ok,
    true
  );
});

test('T-03 (R-02) prosa sin números -> honesto (sin señales de fabricación)', () => {
  const res = checkOfvNonFabrication(
    'Nuestros clientes confían en la calidad de nuestro trabajo.',
    EMPTY_GROUNDING
  );
  assert.deepEqual(res, { ok: true, fabricated: [] });
});

test('T-03 (R-01) "pago pendiente" (prosa con la palabra, sin corchete) NO se toma como marcador', () => {
  // No es marcador honesto por la palabra suelta, PERO tampoco tiene señal numérica -> ok.
  assert.equal(isHonestSocialProof('el pago quedó pendiente'), false);
  assert.equal(
    checkOfvNonFabrication('el pago quedó pendiente', EMPTY_GROUNDING).ok,
    true
  );
});

/* ==================== T-04 — fabricación numérica sin grounding (R-02/R-03) ========== */

test('T-04 (R-03) porcentaje sin grounding -> flag percentage', () => {
  const res = checkOfvNonFabrication(
    'Aumentamos las ventas un 150%.',
    EMPTY_GROUNDING
  );
  assert.equal(res.ok, false);
  assert.equal(res.fabricated.length >= 1, true);
  const pct = res.fabricated.find((f) => f.kind === 'percentage');
  assert.ok(pct, 'debe marcar el porcentaje');
  assert.equal(pct!.digits, '150');
});

test('T-04 (R-03) conteo de clientes sin grounding -> flag client_count', () => {
  for (const s of [
    '50 clientes atendidos',
    '50 clients served',
    '50 customers'
  ]) {
    const res = checkOfvNonFabrication(s, EMPTY_GROUNDING);
    assert.equal(res.ok, false, s);
    assert.ok(
      res.fabricated.some((f) => f.kind === 'client_count'),
      'client_count en: ' + s
    );
  }
});

test('T-04 (R-03, DT-01) métrica antes/después estrecha -> flag before_after', () => {
  assert.equal(
    detectFabricationSignals('pasamos de 100 a 150 pedidos').some(
      (f) => f.kind === 'before_after'
    ),
    true
  );
  assert.equal(
    detectFabricationSignals('100 → 150 leads').some(
      (f) => f.kind === 'before_after'
    ),
    true
  );
});

test('T-04 (R-02) prosa blanda / adjetivos / nombre propio suelto (sin número) -> NO flag', () => {
  for (const s of [
    'Excelente servicio, muy recomendado.',
    'Juan Pérez quedó muy satisfecho con el resultado.',
    'Casa Pintura confió en nosotros.', // nombre propio, sin número
    'Los mejores del rubro, sin duda.'
  ]) {
    assert.deepEqual(
      detectFabricationSignals(s),
      [],
      'sin señales numéricas en: ' + s
    );
    assert.equal(checkOfvNonFabrication(s, EMPTY_GROUNDING).ok, true, s);
  }
});

/* ==================== T-05 — señal CON grounding -> NO flag (R-04) =================== */

test('T-05 (R-04) número presente en el contexto (digit-match) -> grounded, no flag', () => {
  const grounding = resolveSocialProofGrounding(
    '## BRIEF\nEl negocio reporta un crecimiento del 150% verificado.'
  );
  assert.equal(grounding.digitSet.has('150'), true);
  const res = checkOfvNonFabrication('+150%', grounding);
  assert.equal(res.ok, true, 'la señal grounded pasa (anti sobre-corrección)');
});

test('T-05 (R-04, DT-02) contexto declara prueba social (lexical) -> supresor, no flag', () => {
  const grounding = resolveSocialProofGrounding(
    '## BRIEF\nContamos con múltiples reseñas y testimonios reales de clientes.'
  );
  assert.equal(grounding.hasLexicalSocialProof, true);
  // aun un número no presente literal en el contexto queda suprimido por la señal lexical.
  assert.equal(
    checkOfvNonFabrication('90% de satisfacción', grounding).ok,
    true
  );
});

test('T-05 (R-10) sin contexto -> grounding vacío (el core NO inventa grounding)', () => {
  const g = resolveSocialProofGrounding('');
  assert.equal(g.hasLexicalSocialProof, false);
  assert.equal(g.digitSet.size, 0);
  assert.equal(resolveSocialProofGrounding(null).hasLexicalSocialProof, false);
});

/* ==================== T-06 — robustez de shapes (R-09) ============================== */

test('T-06 (R-09) todos los shapes se inspeccionan sin lanzar; el 150% anidado se detecta', () => {
  // string v2
  assert.equal(stringifySocialProof('[PENDIENTE]'), '[PENDIENTE]');
  // array de strings
  assert.match(stringifySocialProof(['muy bueno', '150%']), /150%/);
  // array de objetos v1 [{cliente,resultado}]
  const v1 = [{ cliente: 'Casa Pintura', resultado: 'aumentó 150%' }];
  assert.match(stringifySocialProof(v1), /150%/);
  assert.equal(checkOfvNonFabrication(v1, EMPTY_GROUNDING).ok, false); // detecta el 150%
  // objeto suelto
  assert.match(stringifySocialProof({ nota: '50 clientes' }), /50 clientes/);
  // null / ausente -> ''
  assert.equal(stringifySocialProof(null), '');
  assert.equal(stringifySocialProof(undefined), '');
});

test('T-06 (R-09) shape inesperado (number/boolean/función) -> honesto, nunca error', () => {
  assert.doesNotThrow(() => stringifySocialProof(42));
  assert.doesNotThrow(() => stringifySocialProof(true));
  assert.doesNotThrow(() => stringifySocialProof(() => 'x'));
  // number 42 stringifica a '42' pero sin %/clientes -> no es señal -> honesto.
  assert.equal(checkOfvNonFabrication(42, EMPTY_GROUNDING).ok, true);
  // función -> leaves vacías -> '' -> honesto.
  assert.equal(checkOfvNonFabrication(() => 'x', EMPTY_GROUNDING).ok, true);
});

/* ==================== T-07 — retry-once dirigido + conservar (R-05/R-06) ============= */

/**
 * Réplica EXACTA de la decisión del bloque `ofv` de `route.ts`: check → si fabrica, 1 retry
 * con params idénticos; adopta el retry SOLO si es usable Y ya no fabrica; si no, conserva el
 * original. `calls` cuenta la generación inicial + a lo sumo 1 retry. `retryText` undefined =
 * "no debería haber retry".
 */
function decideNonFab(
  firstContent: Record<string, unknown>,
  grounding: SocialProofGrounding,
  retryText?: string
) {
  let parsedContent = firstContent;
  let calls = 1;
  let nf = checkOfvNonFabrication(parsedContent['social_proof'], grounding);
  let nfRetried = false;
  if (!nf.ok) {
    nfRetried = true;
    calls += 1;
    const retryResult = parseGeneratedContent(retryText ?? '');
    if (retryResult.ok) {
      const retryNf = checkOfvNonFabrication(
        retryResult.content['social_proof'],
        grounding
      );
      if (retryNf.ok) {
        parsedContent = retryResult.content;
        nf = retryNf;
      }
    }
  }
  const warning = nf.ok
    ? undefined
    : { fabricated: nf.fabricated, retried: nfRetried };
  return { parsedContent, nfRetried, warning, calls };
}

test('T-07 (i) (R-05/R-06) 1ª fabrica, retry devuelve [PENDIENTE] -> adopta retry, 1 solo retry', () => {
  const first = { social_proof: '150%', raw_text: 'A' };
  const retry = JSON.stringify({
    social_proof: '[PENDIENTE: proveer reseñas reales]',
    raw_text: 'B'
  });
  const d = decideNonFab(first, EMPTY_GROUNDING, retry);
  assert.equal(d.nfRetried, true);
  assert.equal(d.calls, 2, 'exactamente 1 retry (nunca loop)');
  assert.equal(
    d.warning,
    undefined,
    'tras adoptar el retry honesto, sin warning'
  );
  assert.equal(
    d.parsedContent['social_proof'],
    '[PENDIENTE: proveer reseñas reales]'
  );
});

test('T-07 (ii) (R-06) retry sigue fabricando -> conserva el original + warning retried:true', () => {
  const first = { social_proof: '150%', raw_text: 'A' };
  const retry = JSON.stringify({ social_proof: 'ahora 200%', raw_text: 'B' });
  const d = decideNonFab(first, EMPTY_GROUNDING, retry);
  assert.equal(d.calls, 2);
  assert.equal(
    d.parsedContent['social_proof'],
    '150%',
    'conserva el original (R-06)'
  );
  assert.ok(d.warning, 'warning presente');
  assert.equal(d.warning!.retried, true);
});

test('T-07 (iii) (R-06) retry inválido / no-parseable -> conserva el original', () => {
  const first = { social_proof: '50 clientes', raw_text: 'A' };
  const d = decideNonFab(first, EMPTY_GROUNDING, 'no-es-json');
  assert.equal(d.calls, 2);
  assert.equal(d.parsedContent['social_proof'], '50 clientes');
  assert.ok(d.warning);
  assert.equal(d.warning!.retried, true);
});

test('T-07 (iv) (R-01) 1ª generación honesta -> sin retry, sin warning, 1 call', () => {
  const first = { social_proof: '[PENDIENTE]', raw_text: 'A' };
  const d = decideNonFab(first, EMPTY_GROUNDING);
  assert.equal(d.nfRetried, false);
  assert.equal(d.calls, 1);
  assert.equal(d.warning, undefined);
});

test('T-07 (R-05) la directiva de retry lista las señales + ordena usar [PENDIENTE]', () => {
  const nf = checkOfvNonFabrication('150%', EMPTY_GROUNDING);
  const directive = buildNonFabricationRetryDirective(nf.fabricated);
  assert.match(directive, /CORRECCIÓN OBLIGATORIA/);
  assert.match(directive, /150%/);
  assert.match(directive, /\[PENDIENTE/);
  assert.match(directive, /NO inventes prueba social/);
  assert.equal(buildNonFabricationRetryDirective([]), ''); // vacío -> ''
});

test('T-07 (R-08) formatNonFabricationWarning -> frase ES legible; vacío -> ""', () => {
  const nf = checkOfvNonFabrication('50 clientes', EMPTY_GROUNDING);
  const msg = formatNonFabricationWarning(nf.fabricated);
  assert.match(msg, /prueba social/i);
  assert.match(msg, /conteo de clientes/);
  assert.equal(formatNonFabricationWarning([]), '');
});

/* ==================== T-08 / T-09 — source-guards sobre la ruta ===================== */

const ROUTE = readFileSync(
  resolve(REPO, 'src/app/api/generate-content/route.ts'),
  'utf8'
);

/** El bloque F-105 en la ruta: desde el marcador del guard hasta `let savedRecord`. */
const F105_BLOCK = ROUTE.slice(
  ROUTE.indexOf('// --- F-105: guard'),
  ROUTE.indexOf('let savedRecord')
);

test('T-08 (R-11) el guard está gateado por step === "ofv" y usa el contextChain', () => {
  assert.ok(F105_BLOCK.length > 0, 'bloque F-105 localizado');
  assert.match(F105_BLOCK, /if \(step === 'ofv'\)/, 'gateado a step ofv');
  assert.match(
    F105_BLOCK,
    /resolveSocialProofGrounding\(contextChain\)/,
    'grounding present-only desde contextChain'
  );
  assert.match(
    F105_BLOCK,
    /checkOfvNonFabrication\(parsedContent\['social_proof'\]/,
    'acotado a la clave social_proof'
  );
});

test('T-08 (R-05) el retry inserta la directiva ANTES del cierre de idioma (F-081 último)', () => {
  // userMessagebase + directiva + languageDirective, en ese orden.
  assert.match(
    F105_BLOCK,
    /userMessageBase \+ '\\n\\n' \+ directive \+ languageDirective/,
    'directiva entre la base y el idioma'
  );
  // refactor F-081-safe: languageDirective se extrae y el userMessage feliz es base+idioma.
  assert.match(
    ROUTE,
    /const userMessage = userMessageBase \+ languageDirective;/,
    'camino feliz byte-idéntico (base + idioma)'
  );
  // el retry reusa los MISMOS params (spread de callParams).
  assert.match(F105_BLOCK, /\.\.\.callParams/, 'retry con los mismos params');
});

test('T-08 (R-07/R-08) sin write nuevo en el bloque F-105; warning transitorio y no persistido', () => {
  assert.doesNotMatch(
    F105_BLOCK,
    /\.insert\(/,
    'sin insert en el bloque F-105'
  );
  assert.doesNotMatch(
    F105_BLOCK,
    /\.update\(/,
    'sin update en el bloque F-105'
  );
  assert.doesNotMatch(
    F105_BLOCK,
    /\.upsert\(/,
    'sin upsert en el bloque F-105'
  );
  // el warning se emite condicional en la respuesta (spread-guard), success sigue true.
  assert.match(
    ROUTE,
    /social_proof_warning: nonFabWarning/,
    'warning emitido en la respuesta HTTP'
  );
  assert.match(
    ROUTE,
    /\.\.\.\(nonFabWarning \? \{ social_proof_warning: nonFabWarning \} : \{\}\)/,
    'campo opcional spread-guarded (omitido en camino feliz)'
  );
  // el warning NUNCA entra en insertData (no aparece la clave en el bloque persistido).
  const saveBlock = ROUTE.slice(
    ROUTE.indexOf('if (save) {'),
    ROUTE.indexOf('return NextResponse.json(')
  );
  assert.doesNotMatch(
    saveBlock,
    /nonFabWarning|social_proof_warning/,
    'el warning no se persiste (ausente del bloque de guardado)'
  );
});

test('T-08 (R-07) exactamente UN retry re-call de no-fabricación, gateado por !nf.ok (no loop)', () => {
  assert.match(F105_BLOCK, /if \(!nf\.ok\)/, 'retry gateado por !nf.ok');
  const recalls = (F105_BLOCK.match(/openai\.chat\.completions\.create/g) || [])
    .length;
  assert.equal(recalls, 1, 'un solo re-call en el bloque F-105');
  assert.doesNotMatch(F105_BLOCK, /\bwhile\s*\(/, 'sin while loop');
  assert.doesNotMatch(F105_BLOCK, /\bfor\s*\(/, 'sin for loop');
});

test('T-09 (R-12) el bloque F-105 NO toca el validador anti-AI / method-grounding / retry F-102', () => {
  for (const symbol of [
    'validate(',
    'attachValidation',
    'attachMethodGrounding',
    'ANTI_AI_RULES',
    'extractOffersFields'
  ]) {
    assert.equal(
      F105_BLOCK.includes(symbol),
      false,
      'el bloque F-105 no referencia ' + symbol + ' (R-12, diff aislado)'
    );
  }
  // esos símbolos siguen presentes en la ruta (intactos, en el bloque de guardado).
  assert.match(
    ROUTE,
    /attachValidation\(/,
    'attachValidation sigue en la ruta'
  );
  assert.match(
    ROUTE,
    /attachMethodGrounding\(/,
    'attachMethodGrounding sigue en la ruta'
  );
});
