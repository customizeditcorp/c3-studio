/**
 * F-102 T-04c — Lógica de decisión del retry-once (unidad, SIN next/server).
 *
 * Runner: node:test + node:assert/strict. La orquestación vive inline en `route.ts`
 * (importa next/server → no `node --test`-able). Aquí se ejercita la MISMA regla
 * componiendo el seam puro `parseGeneratedContent` + la decisión `!ok` (réplica byte-a-byte
 * del bloque de `route.ts §1.3`). Cubre R-06/R-07/R-08/R-09/R-10/R-11.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGeneratedContent,
  type ParsedGeneratedContent
} from '../../src/lib/generate-content/parse.ts';

interface Decision {
  result: ParsedGeneratedContent;
  retried: boolean;
  generationWarning:
    | { reason: 'empty_response' | 'unparseable_json'; retried: boolean }
    | undefined;
  calls: number;
}

/**
 * Réplica exacta de la orquestación de `route.ts`: 1 call inicial + a lo sumo 1 retry con
 * params idénticos; si el retry es usable se adopta, si no se conserva el primero; warning
 * transitorio derivado del PRIMER texto. `retryText` undefined = "no debería haber retry".
 */
function decide(firstText: string, retryText?: string): Decision {
  let calls = 1;
  let result = parseGeneratedContent(firstText);
  let retried = false;
  if (!result.ok) {
    retried = true;
    calls += 1;
    const retryResult = parseGeneratedContent(retryText ?? '');
    if (retryResult.ok) result = retryResult;
    // else: conservar `result` (la 1ª generación).
  }
  const generationWarning = result.ok
    ? undefined
    : {
        reason: (firstText.trim().length === 0
          ? 'empty_response'
          : 'unparseable_json') as 'empty_response' | 'unparseable_json',
        retried
      };
  return { result, retried, generationWarning, calls };
}

/* ---- R-11: camino feliz — first usable, sin retry ni warning ---------------------- */

test('R-11 first usable -> sin retry, sin warning, 1 call', () => {
  const d = decide(JSON.stringify({ headline: 'Hola', raw_text: 'X' }));
  assert.equal(d.result.ok, true);
  assert.equal(d.retried, false);
  assert.equal(d.generationWarning, undefined);
  assert.equal(d.calls, 1);
});

/* ---- R-06: first no-usable + retry usable -> adopta retry, sin warning ------------- */

test('R-06 first no-usable + retry usable -> adopta retry, sin warning', () => {
  const good = JSON.stringify({ headline: 'Bien', raw_text: 'Y' });
  const d = decide('', good);
  assert.equal(d.result.ok, true);
  assert.equal(d.retried, true);
  assert.equal(d.generationWarning, undefined);
  assert.equal(d.calls, 2);
  assert.equal((d.result.content as { headline: string }).headline, 'Bien');
});

test('R-06 first parse-fail + retry usable -> adopta retry', () => {
  const good = JSON.stringify({ a: 1 });
  const d = decide('no-json', good);
  assert.equal(d.result.ok, true);
  assert.equal(d.retried, true);
  assert.equal(d.generationWarning, undefined);
  assert.equal(d.calls, 2);
});

/* ---- R-07/R-08/R-09/R-10: first no-usable + retry no-usable ----------------------- */

test('R-08/R-09 first empty + retry empty -> conserva first, warning empty_response, máx 2 calls', () => {
  const d = decide('', '');
  assert.equal(d.result.ok, false);
  assert.equal(d.retried, true);
  assert.deepEqual(d.result.content, { generated_text: '' }); // R-09: la 1ª generación
  assert.deepEqual(d.generationWarning, {
    reason: 'empty_response',
    retried: true
  });
  assert.equal(d.calls, 2); // R-07: máximo 1 retry, nunca loop/backoff
});

test('R-08/R-10 first parse-fail + retry parse-fail -> conserva first, reason unparseable_json', () => {
  const d = decide('garbage-1', 'garbage-2');
  assert.equal(d.result.ok, false);
  assert.equal(d.retried, true);
  // R-09: conserva EXACTAMENTE la primera generación, no la del retry.
  assert.deepEqual(d.result.content, { generated_text: 'garbage-1' });
  assert.deepEqual(d.generationWarning, {
    reason: 'unparseable_json',
    retried: true
  });
  assert.equal(d.calls, 2);
});

test('R-10 reason se deriva del PRIMER texto (empty), aunque el retry sea parse-fail', () => {
  const d = decide('', 'still-not-json');
  assert.equal(d.result.ok, false);
  assert.equal(d.generationWarning?.reason, 'empty_response');
});
