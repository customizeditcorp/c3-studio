/**
 * F-120 — T-13 — **`dream_result`: el campo que se produce, viaja y no se veía**
 * (R-30, R-31, R-32, R-33, R-38, R-46).
 *
 * ## Por qué (c) es PURO RENDER
 *
 * En `76e7637`, `dream_result` está **declarado en el prompt** (`buyer_persona/
 * system_prompt.md` bajo `8. MOTIVACIONES`, fijado por `f116-core-contract` T-09(d)),
 * **mapeado persona→OFV** con la etiqueta canónica `Resultado soñado`
 * (`PERSONA_METHOD_LABELS`, F-112), **presente en `interface PersonaFields` y en
 * `emptyPersona`**, y con el **round-trip ya cableado** (`parseContentToFields` /
 * `fieldsToContent` iteran sobre las claves del tipo). Lo único que faltaba era **el
 * render**: `grep -rn dream_result src/` no devolvía ninguna línea de JSX.
 *
 * ⇒ El costo real es **una `<Field>`**. Cero cambio de tipo, de `emptyPersona`, de parser,
 * de serializador, de write-path y de prompt. **R-32 lo vuelve estructural**: el núcleo no
 * gana campos, y el guard H-2 (`f117-no-regression` T-09 R-20) queda verde **por mérito, no
 * por evasión**.
 *
 * **Nota de modalidad (`docs/verification.md` §6):** que el campo se VEA, se EDITE y
 * PERSISTA tras "Guardar borrador" sobre la MISMA fila es conductual y vive en T-23
 * `[LIVE §6.1]`, gateado y NO ejecutado en este tramo. Acá se prueba el render (inspección
 * de fuente) y el round-trip (conductual, offline, reimplementando NADA: se ejerce el
 * contrato observable de las dos funciones tal como están escritas en la fuente).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

const CORE_PAGE_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const METHOD_CONTEXT_REL = 'src/lib/personas/method-context.ts';
const CORE_PAGE = read(CORE_PAGE_REL);
const METHOD_CONTEXT = read(METHOD_CONTEXT_REL);

/** Ancla FIJA, nunca `HEAD` (CL-107 / F-118 H-5 / F-119 R-37). */
const BASE = '76e7637';
const desde = (rel: string): string =>
  execFileSync('git', ['show', `${BASE}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });

/** Bloque `<decl> … {` … `}` balanceado por llaves. */
function bloque(src: string, marcador: string): string {
  const i = src.indexOf(marcador);
  assert.ok(i > 0, `no se encontró ${marcador}`);
  let d = 0;
  let j = src.indexOf('{', i);
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') {
      d--;
      if (d === 0) break;
    }
  }
  return src.slice(i, j + 1);
}

/**
 * El recorte del `BlockCard` de motivaciones: desde su apertura hasta su `</BlockCard>`
 * (patrón de `f043` T-03 — validar la UBICACIÓN de un campo dentro de su bloque).
 */
function blockCardMotivaciones(src: string): string {
  const i = src.search(/<BlockCard\s+title='7-8\.\s*Dolores y motivaciones'/);
  assert.ok(
    i > 0,
    'no se encontró el `BlockCard` `7-8. Dolores y motivaciones`'
  );
  const fin = src.indexOf('</BlockCard>', i);
  assert.ok(fin > i);
  return src.slice(i, fin);
}

/* ================================================================== */
/*  R-30 / R-31 — existe, está cableado, y está EN SU BLOQUE           */
/* ================================================================== */

test('T-13 ⭐ R-30 existe un control VISIBLE y EDITABLE cableado a `personaFields.dream_result`', () => {
  assert.match(
    CORE_PAGE,
    /value=\{\s*personaFields\.dream_result\s*\}/,
    'el control debe leer del estado de la persona'
  );
  assert.match(
    CORE_PAGE,
    /updatePersona\(\s*'dream_result'\s*,\s*e\.target\.value\s*\)/,
    'y escribir en él: sin `onChange` el campo se vería pero no se editaría'
  );
  // En `76e7637` NO existía ningún render: si esto no fuera cierto, el test no probaría (c).
  assert.ok(
    !/value=\{\s*personaFields\.dream_result\s*\}/.test(desde(CORE_PAGE_REL)),
    'ancla de sentido: en la baseline `dream_result` se producía, viajaba y NO se veía'
  );
});

test('T-13 ⭐ R-31 el campo está DENTRO del `BlockCard` `7-8. Dolores y motivaciones`', () => {
  const bloqueMotivaciones = blockCardMotivaciones(CORE_PAGE);
  assert.match(
    bloqueMotivaciones,
    /personaFields\.dream_result/,
    'R-31: el prompt lo declara bajo `8. MOTIVACIONES` y el guard `f116-core-contract` ' +
      'T-09(d) fija esa ubicación en el contrato ⇒ la UI queda alineada con el prompt sin ' +
      'inventar un bloque nuevo'
  );
  // Y NO está en ningún otro bloque: una sola aparición en todo el archivo.
  assert.equal(
    (CORE_PAGE.match(/personaFields\.dream_result/g) ?? []).length,
    1,
    'un solo control por campo'
  );
  // Junto a `action_trigger`, como fija DT-04.
  assert.match(bloqueMotivaciones, /personaFields\.action_trigger/);
});

test('T-13 ⭐ R-31 la etiqueta es `Resultado soñado` y COINCIDE con `PERSONA_METHOD_LABELS` leída de la fuente', () => {
  // ⚠️ La etiqueta NO se hardcodea acá: se EXTRAE de `src/lib/personas/method-context.ts`.
  // Si mañana el mapeo canónico la renombra, este test queda rojo — que es el punto: prompt,
  // mapeo y UI deben nombrar lo mismo con el mismo nombre (es lo que hace auditable la cadena).
  const m = METHOD_CONTEXT.match(/\[\s*'dream_result'\s*,\s*'([^']+)'\s*\]/);
  assert.ok(m, '`PERSONA_METHOD_LABELS` perdió la entrada de `dream_result`');
  const etiquetaCanonica = m[1];
  assert.equal(
    etiquetaCanonica,
    'Resultado soñado',
    'ancla documental: la etiqueta canónica de F-112'
  );
  const bloqueMotivaciones = blockCardMotivaciones(CORE_PAGE);
  assert.match(
    bloqueMotivaciones,
    new RegExp(`<Field\\s+label='${etiquetaCanonica}'`),
    `la UI debe rotular el campo con la etiqueta canónica «${etiquetaCanonica}»`
  );
  // `dot='ai'`: el prompt lo produce (DT-04).
  assert.match(
    bloqueMotivaciones,
    new RegExp(`<Field\\s+label='${etiquetaCanonica}'\\s+dot='ai'`)
  );
});

/* ================================================================== */
/*  ⭐ R-32 — el NÚCLEO no gana campos                                  */
/* ================================================================== */

test('T-13 ⭐ R-32 `interface PersonaFields` y `emptyPersona` son BYTE-IDÉNTICOS a `76e7637`', () => {
  const base = desde(CORE_PAGE_REL);
  assert.equal(
    bloque(CORE_PAGE, 'interface PersonaFields'),
    bloque(base, 'interface PersonaFields'),
    'R-32/CL-105: `dream_result` YA estaba en el tipo ⇒ (c) es puro render y el núcleo no ' +
      'gana ni un campo. El guard H-2 queda verde por MÉRITO, no por evasión.'
  );
  assert.equal(
    bloque(CORE_PAGE, 'const emptyPersona'),
    bloque(base, 'const emptyPersona')
  );
  // Y `dream_result` estaba en ambos desde antes.
  assert.match(
    bloque(base, 'interface PersonaFields'),
    /dream_result:\s*string;/
  );
  assert.match(bloque(base, 'const emptyPersona'), /dream_result:\s*''/);
});

test('T-13 R-32 el write-path tampoco cambia: `parseContentToFields`/`fieldsToContent` byte-idénticos', () => {
  const base = desde(CORE_PAGE_REL);
  for (const fn of [
    'function parseContentToFields',
    'function fieldsToContent'
  ]) {
    const i = CORE_PAGE.indexOf(fn);
    const iBase = base.indexOf(fn);
    assert.ok(i > 0 && iBase > 0);
    // Cuerpo balanceado desde la llave de apertura del cuerpo (tras la firma).
    const cuerpo = (src: string, desdeIdx: number): string => {
      let p = 0;
      let j = src.indexOf('(', desdeIdx);
      for (; j < src.length; j++) {
        if (src[j] === '(') p++;
        else if (src[j] === ')') {
          p--;
          if (p === 0) break;
        }
      }
      let d = 0;
      const inicio = src.indexOf('{', j);
      let k = inicio;
      for (; k < src.length; k++) {
        if (src[k] === '{') d++;
        else if (src[k] === '}') {
          d--;
          if (d === 0) break;
        }
      }
      return src.slice(inicio, k + 1);
    };
    assert.equal(
      cuerpo(CORE_PAGE, i),
      cuerpo(base, iBase),
      `${fn}: el round-trip YA existía — F-120 no lo construye ni lo toca (R-33)`
    );
  }
});

/* ================================================================== */
/*  R-33 — el round-trip, CONDUCTUAL y offline                         */
/* ================================================================== */

/**
 * Las dos funciones viven inline en un `.tsx` con JSX ⇒ no se pueden importar desde
 * `node --test`. Se **extraen de la fuente** y se evalúan tal cual están escritas: no se
 * re-implementan ni se copian a mano, así que si su cuerpo cambiara, este test ejercería
 * el cuerpo NUEVO (patrón anti-hardcodeo de F-116 R-32).
 */
function cargarRoundTrip(): {
  parseContentToFields: (
    c: unknown,
    d: Record<string, string>
  ) => Record<string, string>;
  fieldsToContent: (f: Record<string, string>) => Record<string, unknown>;
} {
  const recorte = (nombre: string): string => {
    const i = CORE_PAGE.indexOf(`function ${nombre}`);
    assert.ok(i > 0, `no se encontró function ${nombre}`);
    let d = 0;
    let j = CORE_PAGE.indexOf('{', CORE_PAGE.indexOf(')', i));
    // La firma genérica lleva `<T extends Record<string, string>>`: se busca la llave del
    // CUERPO, es decir la que sigue al cierre de la lista de parámetros.
    let p = 0;
    let k = CORE_PAGE.indexOf('(', i);
    for (; k < CORE_PAGE.length; k++) {
      if (CORE_PAGE[k] === '(') p++;
      else if (CORE_PAGE[k] === ')') {
        p--;
        if (p === 0) break;
      }
    }
    j = CORE_PAGE.indexOf('{', k);
    let fin = j;
    for (; fin < CORE_PAGE.length; fin++) {
      if (CORE_PAGE[fin] === '{') d++;
      else if (CORE_PAGE[fin] === '}') {
        d--;
        if (d === 0) break;
      }
    }
    return CORE_PAGE.slice(i, fin + 1);
  };
  // Se borran las anotaciones de tipo de TS para poder evaluarlo como JS puro.
  const aJs = (src: string): string =>
    src
      .replace(/<T extends Record<string, string>>/g, '')
      .replace(/:\s*Record<string,\s*unknown>\s*\|\s*string\s*\|\s*null/g, '')
      .replace(/:\s*Record<string,\s*unknown>/g, '')
      .replace(/:\s*T\b/g, '')
      .replace(/\(result as Record<string, string>\)/g, 'result')
      .replace(/as Record<string, string>/g, '');
  const fuente = `${aJs(recorte('parseContentToFields'))}\n${aJs(recorte('fieldsToContent'))}\nreturn { parseContentToFields, fieldsToContent };`;
  return new Function(fuente)() as ReturnType<typeof cargarRoundTrip>;
}

test('T-13 ⭐ R-33 round-trip: `dream_result` se carga desde `content` y se persiste en `content`', () => {
  const { parseContentToFields, fieldsToContent } = cargarRoundTrip();
  const emptyPersona: Record<string, string> = {
    main_pain: '',
    action_trigger: '',
    dream_result: ''
  };

  // (1) carga: `content` → campos.
  const cargado = parseContentToFields(
    { main_pain: 'no aparece en Google', dream_result: 'X' },
    emptyPersona
  );
  assert.equal(cargado.dream_result, 'X');

  // (2) guardado: campos → `content`.
  const contenido = fieldsToContent({ ...emptyPersona, dream_result: 'X' });
  assert.equal(contenido.dream_result, 'X');

  // (3) `dream_result` aparece en el `raw_text` derivado.
  assert.match(String(contenido.raw_text), /- dream_result: X/);

  // (4) no se pierde al re-guardar (round-trip completo).
  const revuelta = parseContentToFields(contenido, emptyPersona);
  assert.equal(revuelta.dream_result, 'X');
  assert.equal(fieldsToContent(revuelta).dream_result, 'X');
});

test('T-13 R-33 un valor VACÍO no crea la clave (comportamiento actual, sin cambio)', () => {
  const { fieldsToContent } = cargarRoundTrip();
  const contenido = fieldsToContent({
    main_pain: 'algo',
    action_trigger: '',
    dream_result: ''
  });
  assert.ok(
    !Object.prototype.hasOwnProperty.call(contenido, 'dream_result'),
    'R-33 fija que el round-trip SIGA siendo como es, no que se construya uno nuevo'
  );
  assert.ok(!String(contenido.raw_text).includes('dream_result'));
});

/* ================================================================== */
/*  R-46 — el resto del bloque de motivaciones no se tocó              */
/* ================================================================== */

test('T-13 R-46/R-41 el `BlockCard` de motivaciones conserva sus 4 campos previos', () => {
  const bloqueMotivaciones = blockCardMotivaciones(CORE_PAGE);
  for (const campo of [
    'main_pain',
    'secondary_pains',
    'hidden_costs',
    'action_trigger'
  ]) {
    assert.match(
      bloqueMotivaciones,
      new RegExp(`personaFields\\.${campo}`),
      `el bloque perdió \`${campo}\``
    );
  }
  // Y el badge del bloque sigue siendo el que era.
  assert.match(
    CORE_PAGE,
    /title='7-8\.\s*Dolores y motivaciones'\s*badge='Clave para ARC7'/
  );
});
