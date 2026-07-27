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

/* ---- R-07: el resto del archivo, byte-idéntico al ancla FIJA ------------------ */

/**
 * **⤫ F-118 (R-19) — guard preexistente cruzado, reescrito preservando la intención.**
 *
 * Dos correcciones, por el mismo motivo que en `f116-no-regression` T-11(c):
 *
 * 1. *El alcance autorizado crece.* F-118 generaliza en los 8 prompts de contenido —éste
 *    incluido— la línea del `PRINCIPIO DE HONESTIDAD` que prohibía el marcador de faltante
 *    nombrando sólo `[PENDIENTE]`, para que cubra cualquier idioma y cualquier forma
 *    (CL-101 hallazgo 1: el modelo emitió `[PENDING]` en copy publicable).
 * 2. *El ancla deja de ser `HEAD`.* Comparar contra `git show HEAD:` hacía que este guard
 *    diera rojo por estar sin commitear y volviera a verde tras el commit **afirmando algo
 *    ya falso** ("el diff es esa única línea"). Un assert que sobrevive vaciándose de
 *    contenido no protege nada. ⇒ el ancla pasa a ser el commit fijo `4ca1b96` (`main`
 *    antes de F-118): el guard mide **alcance autorizado**, no ausencia de cambios.
 *
 * Sigue siendo estricto: fuera de esas DOS líneas, el archivo es byte-idéntico a `4ca1b96`,
 * y el conteo de líneas no cambia (F-118 no agrega ni borra ninguna en este prompt). El
 * CONTENIDO de la línea del marcador lo fijan `f114-content-honesty` T-11(f) y
 * `f118-gbp-posts-event` T-12.
 */
test('T-03 ⭐ R-07 (⤫ F-118 R-19) el resto del archivo es BYTE-IDÉNTICO al ancla `4ca1b96`: el diff son esas dos líneas', () => {
  /** `main` antes de F-118 — ancla FIJA: no depende de si ya se commiteó. */
  const BASE = '4ca1b96';
  const base = execFileSync('git', ['show', `${BASE}:${REL}`], {
    cwd: REPO,
    encoding: 'utf8'
  });
  const autorizada = (l: string): boolean =>
    /^\s*INPUTS\s*:/.test(l) || // F-117 R-06/R-07 (CL-092)
    /NO\s+escribas\s+marcadores\s+de\s+faltante/.test(l); // F-118 R-19 (CL-101)
  const strip = (t: string): string =>
    t
      .split('\n')
      .filter((l) => !autorizada(l))
      .join('\n');
  assert.equal(
    strip(PROMPT),
    strip(base),
    'este prompt se modificó FUERA del alcance autorizado: sólo la línea `INPUTS:` ' +
      '(F-117 R-07) y la línea del marcador de faltante (F-118 R-19)'
  );
  // Y el conteo de líneas no cambia: no se agregó ni se borró ninguna.
  assert.equal(PROMPT.split('\n').length, base.split('\n').length);
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
