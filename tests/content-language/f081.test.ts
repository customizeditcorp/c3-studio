/**
 * F-081 — Idioma por-cliente. Tests del helper puro (T-05) + wiring real de
 * `generate-content/route.ts` (T-06 userMessage, T-08 tag) verificado sobre el
 * código fuente real (no re-implementación; lección §6.1 F-078/F-080).
 *
 * Nota §6.1: estos tests verifican la FORMA (la directiva se inyecta con el idioma
 * del cliente; el tag usa client.content_language). El CIERRE AUTORITATIVO es LIVE
 * (R-09, T-14/T-15): la corrida real de JD Valley debe SALIR EN INGLÉS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildLanguageDirective,
  normalizeContentLanguage
} from '../../src/lib/content-language.ts';

// ------------------------------------------------------------------
// T-05 — buildLanguageDirective: label correcto por idioma (R-03/R-06)
// ------------------------------------------------------------------
test("T-05 lang 'en' → la directiva nombra inglés (English)", () => {
  const d = buildLanguageDirective('en');
  assert.match(d, /English/);
  assert.match(d, /inglés/);
  assert.doesNotMatch(d, /español/);
});

test("T-05 lang 'es' → la directiva nombra español", () => {
  const d = buildLanguageDirective('es');
  assert.match(d, /español/);
  assert.doesNotMatch(d, /English/);
});

test('T-05 NULL/undefined/valor desconocido → español (default R-03)', () => {
  for (const lang of [null, undefined, 'fr', 'pt', '', 'EN', 'ES']) {
    const d = buildLanguageDirective(lang as string | null | undefined);
    assert.match(d, /español/, 'esperaba español para ' + JSON.stringify(lang));
    assert.doesNotMatch(d, /English/);
  }
});

test('T-05 la directiva es imperativa y cubre TODO el output (incl. raw_text)', () => {
  const d = buildLanguageDirective('en');
  assert.match(d, /IDIOMA DE SALIDA \(OBLIGATORIO\)/);
  assert.match(d, /TODO el output/);
  assert.match(d, /raw_text/);
});

// ------------------------------------------------------------------
// T-05 (tag) — normalizeContentLanguage: default 'es' (R-03/R-07)
// ------------------------------------------------------------------
test("T-05 normalizeContentLanguage: 'en'→'en'; todo lo demás→'es'", () => {
  assert.equal(normalizeContentLanguage('en'), 'en');
  assert.equal(normalizeContentLanguage('es'), 'es');
  assert.equal(normalizeContentLanguage(null), 'es');
  assert.equal(normalizeContentLanguage(undefined), 'es');
  assert.equal(normalizeContentLanguage('fr'), 'es');
  assert.equal(normalizeContentLanguage('EN'), 'es');
});

// ------------------------------------------------------------------
// T-06 / T-08 — wiring REAL de generate-content/route.ts (código fuente)
// Se verifica sobre el archivo real que el route (a) anexa la directiva al
// CIERRE del userMessage tras la instrucción de formato JSON, y (b) fija el tag
// con client.content_language, NO con parsedContent.language. Es verificación del
// code-path real (no re-implementación): si alguien remueve el wiring, falla.
// ------------------------------------------------------------------
const routeSrc = readFileSync(
  fileURLToPath(
    new URL('../../src/app/api/generate-content/route.ts', import.meta.url)
  ),
  'utf8'
);

test('T-06 generate-content importa y anexa buildLanguageDirective(client.content_language) al userMessage', () => {
  assert.match(
    routeSrc,
    /import\s*\{[^}]*buildLanguageDirective[^}]*\}\s*from\s*'@\/lib\/content-language'/,
    'debe importar buildLanguageDirective del helper F-081'
  );
  assert.match(
    routeSrc,
    /buildLanguageDirective\(client\.content_language/,
    'debe anexar la directiva driven por client.content_language'
  );
  // La directiva se anexa DESPUÉS de la instrucción de formato JSON (recency).
  const jsonInstrIdx = routeSrc.indexOf('Responde SOLO con JSON valido');
  const directiveIdx = routeSrc.indexOf('buildLanguageDirective(client');
  assert.ok(jsonInstrIdx > -1 && directiveIdx > -1);
  assert.ok(
    directiveIdx > jsonInstrIdx,
    'la directiva debe anexarse al CIERRE del userMessage (tras el JSON instr.)'
  );
});

test('T-08 generate-content fija generated_outputs.language con client.content_language, no parsedContent.language', () => {
  // El tag del insert usa el helper normalizeContentLanguage sobre client.content_language.
  assert.match(
    routeSrc,
    /language:\s*normalizeContentLanguage\(\s*client\.content_language/,
    'el tag debe derivar de client.content_language (R-07)'
  );
  // Ya no debe usarse parsedContent.language como tag de idioma.
  assert.doesNotMatch(
    routeSrc,
    /language:\s*\(parsedContent\?\.language/,
    'el tag NO debe seguir usando parsedContent.language (R-07)'
  );
});
