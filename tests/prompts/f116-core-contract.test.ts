/**
 * F-116 — T-09 — CONTRATO DE CLAVES de los 3 prompts del NÚCLEO
 * (`brief` / `buyer_persona` / `ofv`).
 *
 * ⚠️ **LÍMITE DE LA CLAIM** (precedente literal en `f104-ofv-honesty.test.ts` y
 * `f114-content-honesty.test.ts`). Un test offline SOLO puede afirmar que **los
 * prompts declaran el contrato**. **NO prueba que el modelo lo emita**: que el
 * `brief` deje de inventar `BLOQUE 1`, que la persona produzca `dream_result` y
 * que la OFV abandone `vehicle_unique` NO es decidible estáticamente — es la
 * **verificación LIVE §6.1** (R-01..R-08, T-15, tramo gateado por F-074/CL-103).
 * Este test es condición **NECESARIA pero NO SUFICIENTE**.
 *
 * ⭐ **Lo que SÍ decide, y es el criterio anti-no-op de la feature (R-32):** que el
 * conjunto de claves declarado en cada prompt sea **exactamente igual**, en los dos
 * sentidos, al de su interfaz en `page.tsx` ∪ `{raw_text}`. Ambos conjuntos se
 * **extraen de los archivos** — está PROHIBIDO hardcodear las listas acá. Un prompt
 * que diga "usa snake_case" sin enumerar, o que enumere claves "razonables", queda
 * ROJO. Un rename en el front sin tocar el prompt, también.
 *
 * Test puro: `fs`-read de los 3 prompts + de `page.tsx`. Sin LLM, sin red, sin DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

const PAGE = readFileSync(
  resolve(ROOT, 'src/app/(app)/onboarding/brief/[clientId]/page.tsx'),
  'utf8'
);

/** Los 3 del núcleo y la interfaz de `page.tsx` que fija su contrato (CL-102). */
const CORE = [
  { step: 'brief', iface: 'BriefFields' },
  { step: 'buyer_persona', iface: 'PersonaFields' },
  { step: 'ofv', iface: 'OFVFields' }
] as const;

const PROMPT: Record<string, string> = {};
for (const { step } of CORE) {
  PROMPT[step] = readFileSync(
    resolve(ROOT, 'prompts', step, 'system_prompt.md'),
    'utf8'
  );
}

/** Encabezado que abre la sección de contrato en los 3 prompts. */
const CONTRACT_HEADER = 'CONTRATO DE SALIDA — CLAVES EXACTAS DEL JSON:';
const EXAMPLE_HEADER = 'EJEMPLO DE LA FORMA EXACTA';
const CLOSING_HEADER = 'REGLA DE CIERRE DEL CONTRATO:';

/** La sección de contrato completa (del encabezado al final del archivo). */
function contractSection(step: string): string {
  const at = PROMPT[step].indexOf(CONTRACT_HEADER);
  assert.ok(
    at >= 0,
    `${step}: el prompt no declara la sección "${CONTRACT_HEADER}" (R-12)`
  );
  return PROMPT[step].slice(at);
}

/** Solo la región de la LISTA canónica (encabezado → ejemplo JSON). */
function listRegion(step: string): string {
  const section = contractSection(step);
  const end = section.indexOf(EXAMPLE_HEADER);
  assert.ok(end > 0, `${step}: la sección de contrato no trae ejemplo JSON`);
  return section.slice(0, end);
}

/**
 * ⭐ Las claves DECLARADAS, extraídas del propio archivo de prompt (nunca
 * hardcodeadas). Forma de la declaración: ``- `clave` — descripción``.
 */
function declaredKeys(step: string): string[] {
  return Array.from(
    listRegion(step).matchAll(/^-\s+`([a-z0-9_]+)`\s+—/gm),
    (m) => m[1]
  );
}

/** El ejemplo JSON de la sección de contrato, ya parseado (R-33). */
function exampleObject(step: string): Record<string, unknown> {
  const m = /```json\n([\s\S]*?)\n```/.exec(contractSection(step));
  assert.ok(m, `${step}: la sección de contrato no trae un bloque \`\`\`json`);
  return JSON.parse(m[1]) as Record<string, unknown>;
}

/** La regla de cierre (R-12), del encabezado al final del archivo. */
function closingRules(step: string): string {
  const section = contractSection(step);
  const at = section.indexOf(CLOSING_HEADER);
  assert.ok(at > 0, `${step}: falta la "${CLOSING_HEADER}" (R-12)`);
  return section.slice(at);
}

/**
 * ⭐ Las claves de la INTERFAZ, extraídas de `page.tsx` (nunca hardcodeadas). Es
 * el otro lado del invariante: la fuente única del contrato del front (R-31).
 */
function interfaceKeys(name: string): string[] {
  const m = new RegExp(`interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(PAGE);
  assert.ok(m, `page.tsx ya no declara \`interface ${name}\` (R-31)`);
  return Array.from(
    m[1].matchAll(/^\s*([a-zA-Z0-9_]+):\s*string;/gm),
    (x) => x[1]
  );
}

/* ================================================================== */
/*  (a) ⭐ ANTI-NO-OP — prompt ≡ interfaz ∪ {raw_text} (R-32, R-31)    */
/* ================================================================== */

CORE.forEach(({ step, iface }) => {
  test(`T-09(a) ⭐ R-32 ${step}: el contrato declarado === ${iface} ∪ {raw_text}, en los DOS sentidos`, () => {
    const declared = declaredKeys(step);
    const expected = interfaceKeys(iface).concat('raw_text');

    // El prompt tiene que ENUMERAR: una lista vacía o simbólica es un no-op.
    assert.ok(
      declared.length > 0,
      `${step}: el prompt no enumera NINGUNA clave — contrato no-op (R-32)`
    );
    // Sin duplicados: un contrato que repite una clave no es un conjunto cerrado.
    assert.equal(
      new Set(declared).size,
      declared.length,
      `${step}: el contrato declara claves duplicadas: ${declared.filter((k, i) => declared.indexOf(k) !== i).join(', ')}`
    );

    const declaredSet = new Set(declared);
    const expectedSet = new Set(expected);

    // Sentido 1 — ninguna clave INVENTADA (declarada y que el front no parsea).
    assert.deepEqual(
      declared.filter((k) => !expectedSet.has(k)).sort(),
      [],
      `${step}: el prompt declara claves que ${iface} no parsea (clave inventada, R-32)`
    );
    // Sentido 2 — ninguna clave HUÉRFANA (del front y sin declarar).
    assert.deepEqual(
      expected.filter((k) => !declaredSet.has(k)).sort(),
      [],
      `${step}: ${iface} tiene claves que el prompt NO declara (clave huérfana, R-32)`
    );
    // Y la igualdad dura de conjuntos, por si acaso.
    assert.deepEqual(declared.slice().sort(), expected.slice().sort());
  });
});

test('T-09(a) R-09/R-10/R-11 los tres contratos tienen el tamaño que el spec fija (28+1 / 26+1 / 11+1)', () => {
  assert.equal(declaredKeys('brief').length, 29);
  assert.equal(declaredKeys('buyer_persona').length, 27);
  assert.equal(declaredKeys('ofv').length, 12);
});

/* ================================================================== */
/*  (b) Ejemplo JSON coherente con la lista (R-33, DT-1)              */
/* ================================================================== */

CORE.forEach(({ step }) => {
  test(`T-09(b) R-33 ${step}: el ejemplo PARSEA como JSON y sus claves === la lista declarada`, () => {
    const example = exampleObject(step);
    const exampleKeys = Object.keys(example);
    // Todos los valores son string (contrato "todas string", R-09/R-10/R-11).
    for (const [k, v] of Object.entries(example)) {
      assert.equal(
        typeof v,
        'string',
        `${step}: el ejemplo da a \`${k}\` un valor que no es string`
      );
    }
    assert.deepEqual(
      exampleKeys.slice().sort(),
      declaredKeys(step).slice().sort(),
      `${step}: el ejemplo JSON y la lista canónica DIVERGEN — el prompt se contradice a sí mismo (R-33)`
    );
  });
});

/* ================================================================== */
/*  (c) Regla de cierre presente en los 3 (R-12)                      */
/* ================================================================== */

CORE.forEach(({ step }) => {
  test(`T-09(c) R-12 ${step}: la regla de cierre es CERRADA (exactamente esas claves, sin wrapper, sin renombrar)`, () => {
    const rules = closingRules(step);
    assert.match(
      rules,
      /EXACTAMENTE\s+esas/,
      `${step}: la regla de cierre no exige EXACTAMENTE esas claves`
    );
    assert.match(
      rules,
      /Ninguna\s+más/,
      `${step}: la regla de cierre no cierra el conjunto ("ninguna más")`
    );
    assert.match(
      rules,
      /NO\s+anides\s+la\s+salida/,
      `${step}: la regla de cierre no prohíbe el wrapper anidado`
    );
    assert.match(
      rules,
      /NO\s+renombres\s+las\s+claves/,
      `${step}: la regla de cierre no prohíbe renombrar`
    );
    assert.match(
      rules,
      /nunca\s+en\s+MAYÚSCULAS/,
      `${step}: la regla de cierre no prohíbe el dialecto en MAYÚSCULAS`
    );
    // R-07: la clave sin material se marca, NO se omite (asimetría con F-114 R-06).
    assert.match(
      rules,
      /\[PENDIENTE\][\s\S]*?Nunca\s+la\s+omitas/,
      `${step}: la regla de cierre no exige emitir la clave con [PENDIENTE] en vez de omitirla (R-07)`
    );
  });
});

/* ================================================================== */
/*  (d) `dream_result` declarado · las 5 retiradas, fuera (R-10/R-13) */
/* ================================================================== */

test('T-09(d) ⭐ R-10 el contrato del buyer DECLARA `dream_result` (repara el eslabón inerte de F-112)', () => {
  assert.ok(
    declaredKeys('buyer_persona').includes('dream_result'),
    'el prompt del buyer no declara `dream_result`: F-112 seguiría mapeando un campo que nada produce (CL-104)'
  );
  // Y en su bloque canónico (8. MOTIVACIONES — "Qué resultado lo emocionaría").
  assert.match(
    listRegion('buyer_persona'),
    /8\.\s+MOTIVACIONES[\s\S]*?`dream_result`/,
    '`dream_result` no está declarado bajo el Bloque 8 MOTIVACIONES'
  );
});

test('T-09(d) R-13 el contrato del buyer NO declara las 5 claves fantasma retiradas', () => {
  const declared = new Set(declaredKeys('buyer_persona'));
  for (const ghost of [
    'values',
    'expansion',
    'emotional_impact',
    'provider_frustrations',
    'fears'
  ]) {
    assert.ok(
      !declared.has(ghost),
      `el contrato del buyer declara \`${ghost}\`, que se retiró de PersonaFields (R-13)`
    );
  }
});

/* ================================================================== */
/*  (e) Dialecto de formulario de la OFV (R-11, DT-2)                 */
/* ================================================================== */

test('T-09(e) R-11 el contrato de la OFV usa el DIALECTO DE FORMULARIO, no el de schema', () => {
  const declared = new Set(declaredKeys('ofv'));
  // Presentes: las claves que `page.tsx` (`OFVFields`) realmente parsea.
  for (const k of [
    'vehicle_name',
    'vehicle_steps',
    'urgency_scarcity',
    'option_a',
    'option_b',
    'option_c'
  ]) {
    assert.ok(k, k);
    assert.ok(
      declared.has(k),
      `el contrato de la OFV no declara \`${k}\` (dialecto de formulario, R-11)`
    );
  }
  // Ausentes como CLAVE DE SALIDA: son nombres de COLUMNA, y el puente es R-19.
  for (const k of ['vehicle_description', 'urgency', 'decision_frame']) {
    assert.ok(
      !declared.has(k),
      `el contrato de la OFV declara \`${k}\`, que es una COLUMNA, no una clave del formulario (DT-2/R-11)`
    );
  }
});

test('T-09(e) R-11 la OFV declara sus 3 claves multi-ítem como texto de UNA LÍNEA POR ÍTEM', () => {
  const list = listRegion('ofv');
  for (const k of ['vehicle_steps', 'deliverables', 'social_proof']) {
    const line = new RegExp(`^-\\s+\`${k}\`\\s+—.*$`, 'm').exec(list);
    assert.ok(line, `la OFV no declara \`${k}\``);
    assert.match(
      line[0],
      /UN(O|A)?\s+(paso|ítem|por)/i,
      `\`${k}\`: el contrato no fija "un ítem por línea" (R-11) — sin eso el modelo elige array y la forma falla en silencio`
    );
  }
  // Y el contrato declara explícitamente que NO hay objetos ni arrays.
  assert.match(
    contractSection('ofv'),
    /nunca\s+objetos,\s+nunca\s+arrays/,
    'el contrato de la OFV no prohíbe objetos/arrays como valor (DT-2)'
  );
});

/* ================================================================== */
/*  (f) Brief: Bloque 3 vigente · single-shot en vez de "3 preguntas" */
/* ================================================================== */

test('T-09(f) R-09 el contrato del brief SIGUE declarando las 6 claves del Bloque 3 (fuera de scope retirarlo, CL-103 límite 3)', () => {
  const declared = new Set(declaredKeys('brief'));
  for (const k of [
    'demo_age',
    'demo_occupation',
    'demo_income',
    'demo_language',
    'psychographics',
    'search_behavior'
  ]) {
    assert.ok(
      declared.has(k),
      `el contrato del brief dejó de declarar \`${k}\`: el Bloque 3 sigue vigente (R-09)`
    );
  }
});

test('T-09(f) ⭐ R-24 el brief ya NO trae la regla interactiva de las 3 preguntas, y SÍ el modo single-shot', () => {
  assert.doesNotMatch(
    PROMPT['brief'],
    /Máximo\s+3\s+preguntas/,
    'el prompt del brief conserva la regla interactiva que produce claves de preguntas en un pipeline single-shot (R-24)'
  );
  assert.match(
    PROMPT['brief'],
    /Modo\s+single-shot\s+no-interactivo/,
    'el prompt del brief no declara el modo single-shot no-interactivo (R-24)'
  );
  // Paridad con la redacción ya viva en los otros dos del núcleo.
  assert.match(PROMPT['brief'], /nunca\s+preguntes,\s+nunca\s+bloquees/);
  assert.match(PROMPT['buyer_persona'], /Modo\s+single-shot\s+no-interactivo/);
  assert.match(PROMPT['ofv'], /Modo\s+single-shot\s+no-interactivo/);
});

/* ================================================================== */
/*  (g) Los dialectos LIVE quedan FUERA del contrato (R-34a)          */
/* ================================================================== */

/**
 * Fixture con ORIGEN CITADO: censo `SELECT jsonb_object_keys` (read-only) sobre
 * `briefs` (16 filas), `buyer_personas` (8) y `offers` (16) del **2026-07-26**
 * — tabla de evidencia de `specs/F-116/requirements.md`. NO son claves
 * inventadas para el test: son las que hoy conviven en producción.
 */
const LIVE_DIALECT_KEYS = [
  'vehicle_unique', // offers.content, 7 filas (objeto {name, steps[]})
  'BLOQUE 1', // briefs.content
  'bloque_1', // briefs.content
  'bloque_1_informacion_del_negocio', // briefs.content
  'información_del_negocio', // briefs.content
  'preguntas_faltantes', // briefs.content, 2 filas
  'buyer_persona', // buyer_personas.content, wrapper en 2 filas
  'DATOS DEMOGRÁFICOS', // buyer_personas.content, 1 fila
  'BARRERAS DE COMPRA' // buyer_personas.content, 1 fila
] as const;

test('T-09(g) R-34a NINGÚN dialecto del censo live 2026-07-26 pertenece al contrato de los 3 prompts', () => {
  for (const { step } of CORE) {
    const declared = new Set(declaredKeys(step));
    for (const dialect of LIVE_DIALECT_KEYS) {
      assert.ok(
        !declared.has(dialect),
        `${step}: el contrato declara el dialecto live \`${dialect}\` como clave válida (R-34a)`
      );
    }
  }
});

test('T-09(g) R-12/DT-6 el contrato NO ceba las claves prohibidas nombrándolas', () => {
  // DT-6: nombrar una clave prohibida dentro del prompt la mete en el contexto del
  // modelo. La regla de cierre las excluye SIN enumerarlas.
  assert.doesNotMatch(
    PROMPT['brief'],
    /preguntas_faltantes/,
    'el prompt del brief nombra `preguntas_faltantes` — DT-6 lo prohíbe (nombrarla la ceba)'
  );
  assert.doesNotMatch(
    PROMPT['ofv'],
    /vehicle_unique/,
    'el prompt de la OFV nombra `vehicle_unique` — DT-6 lo prohíbe'
  );
});
