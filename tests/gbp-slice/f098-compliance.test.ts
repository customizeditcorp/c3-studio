/**
 * F-098 — Compliance-guard de generación GBP (verificar hechos concretos + retry-once).
 *
 * Runner: node:test + node:assert/strict (repo convention). Cubre las seams PURAS
 * (`compliance.ts`) + las constraints estructurales del retry en la ruta y la no-regresión
 * del user message (`prompt.ts`). La orquestación live del retry y el surface del warning
 * en la UI se cierran autoritativamente LIVE (T-14, frontera del operador/Leader).
 *
 *   T-12 — seams puras: checkGbpFactCompliance / resolveComplianceFacts /
 *          buildComplianceRetryDirective / formatComplianceWarning
 *   T-13 — buildGbpUserMessage(ctx,{complianceDirective}) + source-guard de la ruta
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  resolveComplianceFacts,
  checkGbpFactCompliance,
  buildComplianceRetryDirective,
  formatComplianceWarning,
  type ComplianceFacts,
  type MissingFact
} from '../../src/lib/gbp-slice/compliance.ts';
import { readGbpContext } from '../../src/lib/gbp-slice/context.ts';
import { buildGbpUserMessage } from '../../src/lib/gbp-slice/prompt.ts';
import {
  CLIENT,
  CLIENT_WITH_CITY,
  REAL_OFFER,
  APPROVED_BRANDBOARD,
  APPROVED_BRIEF
} from './fixtures.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

/** ctx for JD Valley WITH city=Buellton + approved brief (license 1155610, years 20). */
function ctxWithCity() {
  return readGbpContext({
    client: CLIENT_WITH_CITY,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: APPROVED_BRIEF
  });
}

/* ============================ T-12 — checkGbpFactCompliance ========================== */

test('T-12 (i) (R-01) description with city + license + years -> ok:true, missing:[]', () => {
  const facts: ComplianceFacts = {
    city: 'Buellton',
    license: '1155610',
    years: '20'
  };
  const desc =
    'JD Valley Painting sirve a Buellton con licencia CSLB 1155610 y 20 años de experiencia.';
  const res = checkGbpFactCompliance(desc, facts);
  assert.equal(res.ok, true);
  assert.deepEqual(res.missing, []);
});

test('T-12 (ii) (R-01/R-04) description WITHOUT the license number -> ok:false, missing has license', () => {
  const facts: ComplianceFacts = {
    city: 'Buellton',
    license: '1155610',
    years: '20'
  };
  const desc =
    'JD Valley Painting sirve a Buellton con más de 20 años de experiencia.'; // license omitted
  const res = checkGbpFactCompliance(desc, facts);
  assert.equal(res.ok, false);
  const licenseMiss = res.missing.find((m) => m.kind === 'license');
  assert.ok(licenseMiss, 'missing must include the license');
  assert.equal(licenseMiss!.value, '1155610');
  assert.equal(licenseMiss!.label, 'número de licencia');
  // city + years present -> only license missing.
  assert.deepEqual(
    res.missing.map((m) => m.kind),
    ['license']
  );
});

test('T-12 (iii) (R-03) city match is case- AND accent-insensitive', () => {
  // lowercase in the description.
  assert.equal(
    checkGbpFactCompliance('trabajamos en buellton', { city: 'Buellton' }).ok,
    true
  );
  // accented ctx city vs unaccented description (and vice-versa).
  assert.equal(
    checkGbpFactCompliance('servicio en penasco', { city: 'Peñasco' }).ok,
    true
  );
  assert.equal(
    checkGbpFactCompliance('servicio en Peñasco', { city: 'penasco' }).ok,
    true
  );
  // genuinely absent -> missing.
  assert.equal(
    checkGbpFactCompliance('servicio en Los Angeles', { city: 'Buellton' }).ok,
    false
  );
});

test('T-12 (iv) (R-04) license/years match by DIGIT sequence, separators ignored', () => {
  // ctx value carries a prefix/format ('CSLB# 1155610') -> digits '1155610' matched.
  assert.equal(
    checkGbpFactCompliance('licencia 1155610 vigente', {
      license: 'CSLB# 1155610'
    }).ok,
    true
  );
  // separators inside the description number are ignored on both sides.
  assert.equal(
    checkGbpFactCompliance('lic. 1-155-610', { license: '1155610' }).ok,
    true
  );
  // years as a bare number.
  assert.equal(
    checkGbpFactCompliance('con 20 años en el rubro', { years: '20' }).ok,
    true
  );
  // wrong number -> missing.
  assert.equal(
    checkGbpFactCompliance('licencia 9999999', { license: '1155610' }).ok,
    false
  );
});

test('T-12 (v) (R-05) soft prose (differentiators) is NEVER verified / never in missing', () => {
  const ctx = ctxWithCity();
  // brief HAS differentiators ('Preparación profesional...') but it is NOT a compliance fact.
  assert.ok(ctx.briefFacts.differentiators, 'brief carries a differentiator');
  const facts = resolveComplianceFacts(ctx);
  assert.equal(
    (facts as Record<string, unknown>).differentiators,
    undefined,
    'differentiators must never become a compliance fact'
  );
  // A description with the concrete facts but WITHOUT the differentiator prose -> ok.
  const desc = 'JD Valley en Buellton, licencia 1155610, 20 años de trabajo.';
  const res = checkGbpFactCompliance(desc, facts);
  assert.equal(res.ok, true);
  assert.equal(
    res.missing.some((m) => /preparaci/i.test(m.value)),
    false
  );
});

test('T-12 (R-02/R-11) no facts present -> ok:true (never forces a retry without data)', () => {
  assert.deepEqual(checkGbpFactCompliance('anything at all', {}), {
    ok: true,
    missing: []
  });
});

/* ============================ T-12 — resolveComplianceFacts ========================== */

test('T-12 (vi) (R-02) empty / null city -> city absent (not a must-have)', () => {
  // base CLIENT has city:null -> resolved facts have no city.
  const ctxNoCity = readGbpContext({
    client: CLIENT,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: APPROVED_BRIEF
  });
  const facts = resolveComplianceFacts(ctxNoCity);
  assert.equal('city' in facts, false);
  // whitespace-only city -> also absent.
  const ctxBlank = readGbpContext({
    client: { ...CLIENT, city: '   ' },
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: APPROVED_BRIEF
  });
  assert.equal('city' in resolveComplianceFacts(ctxBlank), false);
});

test('T-12 (vii) (R-04) briefFacts.licenses without digits -> not included', () => {
  const ctx = readGbpContext({
    client: CLIENT_WITH_CITY,
    offer: REAL_OFFER,
    brandboard: APPROVED_BRANDBOARD,
    brief: {
      id: 'b',
      status: 'approved',
      content: { licenses: 'Licencia estatal', years_experience: 'veinte' }
    }
  });
  const facts = resolveComplianceFacts(ctx);
  assert.equal('license' in facts, false); // no digits -> not verifiable -> omit
  assert.equal('years' in facts, false); // 'veinte' no digits -> omit
  assert.equal(facts.city, 'Buellton'); // city still resolved
});

test('T-12 (viii) (R-15) facts derive ONLY from the ctx (city from client, license/years from briefFacts)', () => {
  const facts = resolveComplianceFacts(ctxWithCity());
  assert.deepEqual(facts, {
    city: 'Buellton',
    license: '1155610',
    years: '20'
  });
});

/* ==================== T-12 — buildComplianceRetryDirective / warning ================= */

test('T-12 (ix) (R-07) buildComplianceRetryDirective lists each missing fact with its value', () => {
  const missing: MissingFact[] = [
    { kind: 'city', label: 'ciudad', value: 'Buellton' },
    { kind: 'license', label: 'número de licencia', value: '1155610' },
    { kind: 'years', label: 'años de experiencia', value: '20' }
  ];
  const directive = buildComplianceRetryDirective(missing);
  assert.match(directive, /CORRECCIÓN OBLIGATORIA/);
  assert.match(directive, /- la ciudad: Buellton/);
  assert.match(directive, /- el número de licencia: 1155610/);
  assert.match(directive, /- los años de experiencia: 20/);
  assert.match(directive, /No inventes ningún otro dato/);
  // empty missing -> empty string (should not be called in that case).
  assert.equal(buildComplianceRetryDirective([]), '');
});

test('T-12 (x) (R-12) formatComplianceWarning -> readable ES phrase listing the missing facts', () => {
  const missing: MissingFact[] = [
    { kind: 'license', label: 'número de licencia', value: '1155610' }
  ];
  const msg = formatComplianceWarning(missing);
  assert.match(msg, /no incluyó/);
  assert.match(msg, /número de licencia \(1155610\)/);
  assert.match(msg, /Edítala y guarda antes de aprobar/);
  assert.equal(formatComplianceWarning([]), '');
});

/* ==================== T-13 — buildGbpUserMessage(ctx, {complianceDirective}) ========== */

test('T-13 (R-06/R-07) compliance directive appears and the language directive stays LAST', () => {
  const ctx = ctxWithCity();
  const directive = 'CORRECCIÓN OBLIGATORIA: __marker__';
  const msg = buildGbpUserMessage(ctx, { complianceDirective: directive });
  assert.ok(msg.includes(directive), 'directive present in the message');
  const iJson = msg.indexOf('Responde SOLO con JSON');
  const iDirective = msg.indexOf(directive);
  const iLang = msg.indexOf('IDIOMA DE SALIDA (OBLIGATORIO)');
  assert.ok(iJson >= 0 && iDirective >= 0 && iLang >= 0);
  assert.ok(iDirective > iJson, 'directive after the JSON instruction');
  assert.ok(
    iLang > iDirective,
    'language directive is the LAST block (after retry directive)'
  );
});

test('T-13 (R-14) buildGbpUserMessage without option is byte-identical (no-regression F-095)', () => {
  const ctx = ctxWithCity();
  const base = buildGbpUserMessage(ctx);
  assert.equal(
    buildGbpUserMessage(ctx, {}),
    base,
    'empty options -> identical'
  );
  assert.equal(
    buildGbpUserMessage(ctx, { complianceDirective: '' }),
    base,
    'empty directive -> no insertion -> identical'
  );
  assert.equal(
    buildGbpUserMessage(ctx, { complianceDirective: '   ' }),
    base,
    'blank directive -> no insertion -> identical'
  );
  assert.ok(
    !base.includes('CORRECCIÓN OBLIGATORIA'),
    'base message carries no retry directive'
  );
});

/* ==================== T-13 — source-guard on generate-gbp/route.ts =================== */

const ROUTE = readFileSync(
  resolve(REPO, 'src/app/api/generate-gbp/route.ts'),
  'utf8'
);

test('T-13 (R-06/R-08) exactly ONE retry re-call, bound by !compliance.ok (no loop)', () => {
  const calls = (ROUTE.match(/openai\.chat\.completions\.create/g) || [])
    .length;
  assert.equal(calls, 2, 'exactly 2 completions: the initial + a single retry');
  assert.match(
    ROUTE,
    /if \(!compliance\.ok\)/,
    'retry gated by !compliance.ok'
  );
  // no while/for loop around the compliance retry.
  const block = ROUTE.slice(
    ROUTE.indexOf('resolveComplianceFacts(ctx)'),
    ROUTE.indexOf('const complianceWarning')
  );
  assert.ok(block.length > 0, 'compliance block located');
  assert.doesNotMatch(
    block,
    /\bwhile\s*\(/,
    'no while loop in the compliance block'
  );
  assert.doesNotMatch(
    block,
    /\bfor\s*\(/,
    'no for loop in the compliance block'
  );
});

test('T-13 (R-01/R-15) the guard runs BETWEEN guardGbpDescription and the gbp_profiles upsert; resolveComplianceFacts(ctx)', () => {
  const iGuard = ROUTE.indexOf('profileRow.description = descGuard.value');
  const iCompliance = ROUTE.indexOf('resolveComplianceFacts(ctx)');
  const iUpsert = ROUTE.indexOf(".from('gbp_profiles')");
  assert.ok(iGuard >= 0 && iCompliance >= 0 && iUpsert >= 0);
  assert.ok(iGuard < iCompliance, 'compliance runs after the F-084 guard');
  assert.ok(iCompliance < iUpsert, 'compliance runs before the upsert');
  assert.match(
    ROUTE,
    /resolveComplianceFacts\(ctx\)/,
    'facts derived from ctx (R-15)'
  );
});

test('T-13 (R-10/R-13) no NEW write (insert/update/upsert) for compliance — warning is transitory', () => {
  const block = ROUTE.slice(
    ROUTE.indexOf('resolveComplianceFacts(ctx)'),
    ROUTE.indexOf('const complianceWarning')
  );
  assert.doesNotMatch(
    block,
    /\.insert\(/,
    'no insert inside the compliance/retry block'
  );
  assert.doesNotMatch(
    block,
    /\.update\(/,
    'no update inside the compliance/retry block'
  );
  assert.doesNotMatch(
    block,
    /\.upsert\(/,
    'no upsert inside the compliance/retry block'
  );
  // the warning field is optional (spread-guarded), success stays true.
  assert.match(
    ROUTE,
    /compliance_warning\s*:\s*complianceWarning/,
    'warning surfaced conditionally in the response'
  );
});

test('T-13 (R-09) retry adoption is guarded (guard.ok) and wrapped in try/catch (blob/malformed -> keep original)', () => {
  assert.match(
    ROUTE,
    /const retryGuard = guardGbpDescription\(/,
    'retry re-runs the F-084 guard'
  );
  assert.match(
    ROUTE,
    /if \(retryGuard\.ok\)/,
    'retry adopted only if the guard passes'
  );
  // the retry parse/adoption is inside a try/catch (malformed retry -> keep original).
  const block = ROUTE.slice(
    ROUTE.indexOf('if (!compliance.ok)'),
    ROUTE.indexOf('const complianceWarning')
  );
  assert.match(block, /try \{/, 'retry parse wrapped in try');
  assert.match(
    block,
    /\} catch/,
    'retry parse has a catch (malformed -> keep original)'
  );
});
