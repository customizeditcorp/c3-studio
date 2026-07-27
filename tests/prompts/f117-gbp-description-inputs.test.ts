/**
 * F-117 — T-03 — La línea `INPUTS:` de `prompts/gbp_description/system_prompt.md`
 * deja de prometer la buyer persona (R-06/R-07).
 *
 * **Por qué existe este test.** F-114 (R-08/R-11) instituyó que un `INPUTS:` no puede
 * declarar una fuente que el route NO inyecta. F-117 R-01 saca `gbp_description` de
 * `needsPersona` (CL-092): dejar la línea intacta recrearía **exactamente** el defecto
 * que F-114 eliminó — un prompt que promete un input inexistente.
 *
 * **Nota de modalidad (`docs/verification.md §6`).** Esto es inspección de FUENTE: prueba
 * qué dice el archivo en disco, no qué recibe el modelo en producción. La claim de que
 * el prompt aplicado en `prompt_versions` coincide con el archivo es del tramo LIVE
 * (`sync-prompts check` → `apply` → re-`check`, T-16), no de acá.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const REL = 'prompts/gbp_description/system_prompt.md';
const PROMPT = readFileSync(resolve(REPO, REL), 'utf8');

/** La línea `INPUTS:` del prompt (única). */
function inputsLine(text: string): string {
  const lines = text.split('\n').filter((l) => /^\s*INPUTS\s*:/.test(l));
  assert.equal(lines.length, 1, 'debe haber exactamente 1 línea `INPUTS:`');
  return lines[0];
}

/* ---- R-06: el `INPUTS:` ya no nombra la persona, y sigue nombrando lo que sí llega -- */

test('T-03 ⭐ R-06 el `INPUTS:` de `gbp_description` NO nombra la buyer persona (CL-092)', () => {
  assert.doesNotMatch(
    inputsLine(PROMPT),
    /buyer[_\s]?persona/i,
    'CL-092: `gbp_description` ya no recibe la persona (F-117 R-01 la sacó de ' +
      '`needsPersona`); un `INPUTS:` que la prometa recrea el defecto de F-114 R-11'
  );
});

test('T-03 R-06 el `INPUTS:` sigue declarando las fuentes que el route SÍ inyecta (brief + OFV)', () => {
  const line = inputsLine(PROMPT);
  assert.match(line, /brief/i, 'el route inyecta el brief (`needsBrief`)');
  assert.match(line, /ofv/i, 'el route inyecta la OFV (`needsOffer`)');
  assert.match(line, /aprobad/i, 'ambas fuentes son las `approved`');
});

/* ---- R-07: el resto del archivo, byte-idéntico a HEAD ------------------------- */

test('T-03 ⭐ R-07 el resto del archivo es BYTE-IDÉNTICO a `HEAD`: el diff es esa única línea', () => {
  const head = execFileSync('git', ['show', `HEAD:${REL}`], {
    cwd: REPO,
    encoding: 'utf8'
  });
  const strip = (t: string): string =>
    t
      .split('\n')
      .filter((l) => !/^\s*INPUTS\s*:/.test(l))
      .join('\n');
  assert.equal(
    strip(PROMPT),
    strip(head),
    'F-117 sólo puede tocar la línea `INPUTS:` de este prompt (R-07)'
  );
  // Y el conteo de líneas no cambia: no se agregó ni se borró ninguna.
  assert.equal(PROMPT.split('\n').length, head.split('\n').length);
});

/* ---- R-07: las anclas de F-114 siguen vivas ---------------------------------- */

test('T-03 R-07 las restricciones de canal de F-114 siguen presentes (no se degradó el prompt)', () => {
  assert.match(
    PROMPT,
    /-\s*NO incluir URLs, precios, ni promociones \(política de Google\)/,
    'F-114: la restricción de canal de GBP no se toca'
  );
  assert.match(
    PROMPT,
    /PRINCIPIO DE HONESTIDAD[\s\S]*JAMÁS fabricar hechos duros/,
    'F-114/F-104: el principio de honestidad sigue íntegro'
  );
});

test('T-03 R-07 `gbp_description` sigue SIN el `ANCLAJE DEL ELEMENTO PROMOCIONAL` (F-114 R-19)', () => {
  assert.doesNotMatch(
    PROMPT,
    /ANCLAJE DEL ELEMENTO PROMOCIONAL/,
    'F-114 R-19: ese anclaje es de `gbp_posts`, no de `gbp_description` ' +
      '(que tiene prohibidas las promociones por política de Google)'
  );
});
