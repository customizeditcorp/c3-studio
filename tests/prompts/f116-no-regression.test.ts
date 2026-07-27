/**
 * F-116 — T-11 — NO-REGRESIÓN de la feature de mayor riesgo del arco.
 *
 * F-114 tocó prompts **downstream**. F-116 toca los **3 del núcleo**, que alimentan
 * absolutamente todo lo demás. La edición es aditiva (una sección de contrato al
 * final de cada prompt) más el retiro puntual de R-24 — y esta es la red que lo
 * fija: la **sustancia afinada por F-104 (honestidad de la OFV), F-106 (inferencia
 * del buyer) y F-112 (mapeo persona→OFV) no se reescribe**, los 8 prompts de
 * contenido y los 11 `meta.json` quedan idénticos a `HEAD`, y el acoplamiento
 * prompt↔código queda amarrado por source-guards.
 *
 * Test puro: `fs`-read de prompts y fuente + import del mapeo de F-112. Sin LLM,
 * sin red, sin DB. Asserts **whitespace-tolerantes** sobre `.ts`/`.tsx` porque
 * `lint-staged` los reformatea con prettier al commit (los `.md` de `prompts/` NO
 * están cubiertos por `lint-staged`, así que allí el literal es estable).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// El mapeo de F-112 se IMPORTA (no se re-escribe como literal): recortarlo pone
// este test rojo, que es el freno que R-14 pide.
import { PERSONA_METHOD_LABELS } from '../../src/lib/personas/method-context.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

const prompt = (step: string) => read(`prompts/${step}/system_prompt.md`);

const PAGE = read('src/app/(app)/onboarding/brief/[clientId]/page.tsx');
const ROUTE = read('src/app/api/generate-content/route.ts');
const CONTEXT = read('src/lib/gbp-slice/context.ts');
const GBP_TYPES = read('src/lib/gbp-slice/types.ts');
const APPROVAL_GUARD = read('src/lib/onboarding/approval-guard.ts');

const CONTENT_STEPS = [
  'gbp_posts',
  'campaign_copy',
  'website_home',
  'website_service',
  'website_location',
  'nurturing',
  'social_content',
  'gbp_description'
] as const;

/* ================================================================== */
/*  (a) La SUSTANCIA de F-104 / F-106 / F-112 queda intacta (R-27)    */
/* ================================================================== */

test('T-11(a) ⭐ R-27 la OFV conserva TODAS las anclas de F-104 y F-112 (la honestidad no se reescribió)', () => {
  const OFV = prompt('ofv');
  for (const anchor of [
    'PRINCIPIO DE HONESTIDAD (transversal a las 8 secciones)',
    'JAMÁS fabricar hechos duros: testimonios, conteos de clientes, métricas antes/después',
    '8. SOCIAL PROOF',
    'PROHIBIDO fabricar testimonios, nombres de clientes, casos, conteos de clientes o métricas antes/después inexistentes',
    'La prueba social pública se construye con enlace a reseñas reales',
    'MAPEO CAMPO-A-CAMPO PERSONA→OFV',
    'DEGRADACIÓN HONESTA',
    'NO fabricar escasez falsa',
    'INTEGRACIÓN CON ARC7',
    'REGLAS ANTI-AI',
    '::ConsolidadoCanvas_C3 Value MethodARC7::'
  ]) {
    assert.ok(
      OFV.includes(anchor),
      `F-116 alteró la sustancia de la OFV: falta el ancla «${anchor}»`
    );
  }
  // Las 8 secciones siguen ahí, con su numeración.
  for (const section of [
    '1. BIG PROMISE',
    '2. VEHÍCULO ÚNICO',
    '3. QUICK WIN',
    '4. DECISION FRAME',
    '5. ENTREGABLES ESPECÍFICOS',
    '6. GARANTÍA / RISK REVERSAL',
    '7. URGENCIA / ESCASEZ',
    '8. SOCIAL PROOF'
  ]) {
    assert.match(
      OFV,
      new RegExp(`^${section.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`, 'm'),
      `F-116 alteró la Sección «${section}» de la OFV`
    );
  }
});

test('T-11(a) ⭐ R-27/R-15 el buyer conserva las anclas de F-106 Y las líneas de sustancia de los campos retirados', () => {
  const PERSONA = prompt('buyer_persona');
  for (const anchor of [
    'PRINCIPIO (transversal a los 12 bloques)',
    'INFERIR lo inferible-representativo',
    'JAMÁS fabricar hechos duros del negocio',
    'Inferencia-soft LEGÍTIMA',
    'Heurística: ¿el dato describe al cliente-ideal-representativo',
    'Una buyer persona ES una inferencia representativa'
  ]) {
    assert.ok(
      PERSONA.includes(anchor),
      `F-116 alteró la sustancia del buyer (F-106): falta el ancla «${anchor}»`
    );
  }
  // ⭐ R-15: se retiró la CLAVE, nunca el razonamiento. Estas 5 líneas de los 12
  // bloques siguen intactas — su sustancia viaja dentro de la clave de su bloque.
  for (const line of [
    'Valores familiares/personales',
    'Expansión deseada',
    'Impacto emocional del problema',
    'Qué le frustra de proveedores actuales',
    'Miedos específicos'
  ]) {
    assert.ok(
      PERSONA.includes(line),
      `R-15: se borró la línea de sustancia «${line}» — F-116 retira la clave, NO el razonamiento del bloque`
    );
  }
  // Los 12 bloques, con su numeración.
  for (let i = 1; i <= 12; i++) {
    assert.match(
      PERSONA,
      new RegExp(`^${i}\\. [A-ZÁÉÍÓÚÑ]`, 'm'),
      `falta el Bloque ${i} del buyer`
    );
  }
});

test('T-11(a) R-27 el brief conserva sus 5 bloques, su MISIÓN y su regla de no-invención', () => {
  const BRIEF = prompt('brief');
  assert.ok(BRIEF.includes('MISIÓN: Construir un brief completo'));
  assert.ok(BRIEF.includes('ESTRUCTURA DEL BRIEF (5 BLOQUES)'));
  assert.match(
    BRIEF,
    /NO inventes datos\. Si falta información, marca como \[PENDIENTE\]/
  );
  for (const block of [
    'BLOQUE 1 — INFORMACIÓN DEL NEGOCIO',
    'BLOQUE 2 — SITUACIÓN ACTUAL',
    'BLOQUE 3 — CLIENTE IDEAL DEL NEGOCIO',
    'BLOQUE 4 — DIFERENCIADORES',
    'BLOQUE 5 — OBJETIVOS'
  ]) {
    assert.match(BRIEF, new RegExp(`^${block}$`, 'm'), `falta «${block}»`);
  }
});

test('T-11(a) R-27 la línea OUTPUT: preexistente de los 3 sigue EXACTA (la edición es aditiva, no sustitutiva)', () => {
  // El contrato se AÑADE debajo; la promesa estructural previa no se reemplaza.
  assert.match(
    prompt('brief'),
    /^OUTPUT: JSON con los 5 bloques \+ raw_text en markdown\.$/m
  );
  assert.match(
    prompt('buyer_persona'),
    /^OUTPUT: JSON con 12 bloques \+ raw_text markdown\.$/m
  );
  assert.match(
    prompt('ofv'),
    /^OUTPUT: JSON con 8 secciones \+ raw_text markdown\.$/m
  );
});

/* ================================================================== */
/*  (b) Los 8 prompts de CONTENIDO, byte-intactos (R-28)              */
/* ================================================================== */

test('T-11(b) ⭐ R-28 los 8 prompts de contenido conservan las anclas de F-114 (F-116 es núcleo, no downstream)', () => {
  for (const step of CONTENT_STEPS) {
    const src = prompt(step);
    assert.ok(
      src.includes('PRINCIPIO DE HONESTIDAD'),
      `${step}: perdió el PRINCIPIO DE HONESTIDAD de F-114`
    );
    assert.match(
      src,
      /^INPUTS:/m,
      `${step}: perdió su declaración de INPUTS (F-114)`
    );
    assert.match(
      src,
      /^OUTPUT:/m,
      `${step}: perdió su contrato de OUTPUT preexistente`
    );
    // Ninguno recibe el contrato del núcleo: eso es Fase C (R-28/CL-102).
    assert.ok(
      !src.includes('CONTRATO DE SALIDA — CLAVES EXACTAS DEL JSON'),
      `${step}: F-116 le metió el contrato del NÚCLEO a un prompt DOWNSTREAM (R-28)`
    );
  }
});

test('T-11(b) R-28 el anclaje promocional de F-114 sigue apuntando a las etiquetas que el código emite', () => {
  // Ancla de los 7 (todos menos gbp_description, R-19 de F-114).
  for (const step of CONTENT_STEPS.filter((s) => s !== 'gbp_description')) {
    assert.ok(
      prompt(step).includes('## OFERTA DE VALOR (APROBADA)'),
      `${step}: perdió el anclaje a la OFV aprobada (F-114 R-30)`
    );
  }
  assert.ok(ROUTE.includes('## OFERTA DE VALOR (APROBADA)'));
});

/* ================================================================== */
/*  (c) Los 11 `meta.json` sin bump ni cambios (R-29, DT-9)           */
/* ================================================================== */

/**
 * ⚠️ **CORRECCIÓN DE GROUNDING (2026-07-26, verificada contra el repo).** El spec de
 * F-116 (R-29 / DT-9) asume que **los 11 `meta.json` están en `version: 1`**. En el
 * repo real **NO es así**: `buyer_persona` y `ofv` están en `version: 2` desde
 * F-106 (`432b5c9`) y la línea F-104/F-112. Asertar el literal `1` habría dado un
 * rojo que NO corresponde a ninguna regresión de F-116.
 *
 * Lo que R-29 realmente pide es **que F-116 no los toque**, así que el assert se
 * ancla en la verdad del repo en vez de en un literal: cada `meta.json` debe ser
 * **idéntico a `HEAD`**. Es más fuerte (cubre `version` Y los 5 campos) y no puede
 * quedar desactualizado.
 */
test('T-11(c) ⭐ R-29/DT-9 los 11 meta.json son IDÉNTICOS a HEAD (F-116 no bumpea ni edita ninguno)', () => {
  const steps = readdirSync(resolve(ROOT, 'prompts'), {
    withFileTypes: true
  })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  assert.equal(steps.length, 11, 'el número de steps con prompt en git cambió');

  for (const step of steps) {
    const working = JSON.parse(read(`prompts/${step}/meta.json`));
    const head = JSON.parse(
      execFileSync('git', ['show', `HEAD:prompts/${step}/meta.json`], {
        cwd: ROOT,
        encoding: 'utf8'
      })
    );
    assert.deepEqual(
      working,
      head,
      `${step}: meta.json difiere de HEAD — F-116 no toca ningún meta.json (R-29). El runtime desempata por \`version\` desc y el \`apply\` hace UPDATE by id: bumpear altera el dato de desempate de un mecanismo cerrado en otra feature (DT-9).`
    );
    // Y los 6 campos que el sync de F-101 serializa siguen presentes.
    assert.equal(working.step, step);
    for (const field of [
      'methodology',
      'vertical',
      'validation_rules',
      'version',
      'tenant'
    ]) {
      assert.ok(
        field in working,
        `${step}: meta.json perdió el campo ${field}`
      );
    }
  }
});

/**
 * **F-117 (R-06/R-07) y F-118 (R-19/R-29/R-31) — GUARD PREEXISTENTE CRUZADO POR DISEÑO.
 * Reescrito preservando la intención, NO borrado ni vaciado.** *(Cuarto cruce del arco;
 * mismo patrón que los tres que F-117 R-24 autoriza en `f112-no-regression`,
 * `f113-source-guards` y este archivo, y que a su vez copian el precedente de F-113 R-21.)*
 *
 * **La intención de este guard es "ningún prompt de contenido se modifica fuera de lo
 * AUTORIZADO"**, y eso sigue cumpliéndose. Lo que cambia es el conjunto autorizado.
 *
 * **⤫ F-118 — DOS correcciones, y la segunda importa más que la primera:**
 *
 * 1. *El alcance autorizado crece.* F-118 (Fase D, CL-101) edita **una línea del PRINCIPIO
 *    DE HONESTIDAD en los 8** —generalizar la prohibición del marcador de faltante a
 *    cualquier idioma, porque el modelo emitió `[PENDING]` en copy publicable— y, sólo en
 *    `gbp_posts`, **añade** la condición de `EVENT` y **subordina** la línea de variedad.
 *
 * 2. *El ancla deja de ser `HEAD`.* Este guard comparaba contra `git show HEAD:`, así que
 *    en el árbol de trabajo del implementer daba rojo **por estar sin commitear**, y
 *    volvía a verde con el commit **diciendo algo que ya era falso** (*"siguen
 *    byte-idénticos"*, cuando F-118 tocó los 8). Un assert que sobrevive **vaciándose de
 *    contenido** no es un guard: es la misma familia que un alias que engaña a un grep.
 *    ⇒ el ancla pasa a ser el **commit fijo `4ca1b96`** (`main` antes de F-118). Ahora el
 *    guard mide **alcance autorizado**, no *ausencia de cambios*: es verde sin commit y
 *    rojo ante cualquier edición no declarada.
 *
 * **El guard queda MÁS fuerte, no más débil:** todo lo que NO sea una de las líneas
 * autorizadas debe ser byte-idéntico a `4ca1b96` en los 8 prompts — ni un carácter de más.
 * Y el CONTENIDO de las líneas autorizadas no queda sin cubrir: lo fijan
 * `f114-content-honesty` T-11(f) (la sub-frase preservada verbatim + la negación cercana),
 * `f118-gbp-posts-event` T-12 (la generalización, la condición de `EVENT`, la variedad
 * subordinada) y este mismo archivo para `INPUTS:`.
 */
test('T-11(c) R-28 (⤫ F-117 R-06/R-07, ⤫ F-118 R-19/R-29/R-31) los prompts de contenido no cambian fuera del alcance AUTORIZADO (ancla: `4ca1b96`)', () => {
  /** `main` antes de F-118 — ancla FIJA: el guard no depende de si ya se commiteó. */
  const BASE = '4ca1b96';
  /** Líneas cuyo cambio está autorizado, con la feature que lo autoriza. */
  const esInputs = (l: string): boolean => /^\s*INPUTS\s*:/.test(l); // F-117 (CL-092)
  const esMarcador = (l: string): boolean =>
    /NO\s+escribas\s+marcadores\s+de\s+faltante/.test(l); // F-118 R-19 (los 8)
  const esCondEvent = (l: string): boolean => /Condición\s+de\s+EVENT/.test(l); // F-118 R-29 (sólo gbp_posts, línea NUEVA)
  const esVariedad = (l: string): boolean =>
    /^- Variedad de tipos de posts/.test(l); // F-118 R-31 (sólo gbp_posts)

  for (const step of CONTENT_STEPS) {
    const working = read(`prompts/${step}/system_prompt.md`);
    const base = execFileSync(
      'git',
      ['show', `${BASE}:prompts/${step}/system_prompt.md`],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const autorizada = (l: string): boolean =>
      esMarcador(l) ||
      (step === 'gbp_description' && esInputs(l)) ||
      (step === 'gbp_posts' && (esCondEvent(l) || esVariedad(l)));
    const strip = (t: string): string =>
      t
        .split('\n')
        .filter((l) => !autorizada(l))
        .join('\n');
    assert.equal(
      strip(working),
      strip(base),
      `${step}: prompt de CONTENIDO modificado FUERA del alcance autorizado (R-28 / CL-102). ` +
        'Autorizado: la línea del marcador de faltante (F-118 R-19) en los 8; ' +
        'la línea `INPUTS:` de `gbp_description` (F-117 R-06/R-07); ' +
        'la condición de `EVENT` y la línea de variedad de `gbp_posts` (F-118 R-29/R-31).'
    );
    // El conteo de líneas sólo puede crecer donde F-118 AÑADE una línea (la condición
    // aditiva de `EVENT`, que H-2 obliga a que sea una línea nueva y no una reescritura).
    const delta = working.split('\n').length - base.split('\n').length;
    assert.equal(
      delta,
      step === 'gbp_posts' ? 1 : 0,
      `${step}: se agregaron o borraron líneas fuera de lo autorizado (delta=${delta})`
    );
  }
  // CL-092 sigue vigente: el `INPUTS:` de `gbp_description` no vuelve a prometer la persona.
  assert.doesNotMatch(
    read('prompts/gbp_description/system_prompt.md')
      .split('\n')
      .find(esInputs) ?? '',
    /buyer[_\s]?persona/i,
    'CL-092: el `INPUTS:` de `gbp_description` ya no puede prometer la persona'
  );
});

/* ================================================================== */
/*  (d) SOURCE-GUARDS del acoplamiento prompt↔código (R-31, R-22)     */
/* ================================================================== */

test('T-11(d) ⭐ R-31 `page.tsx` sigue siendo la fuente única del contrato: las 3 interfaces + parse/fields', () => {
  // Si alguien renombra una interfaz, el test anti-no-op (R-32) no puede
  // extraer su lado del invariante ⇒ acá se ve el rename explícitamente.
  for (const iface of ['BriefFields', 'PersonaFields', 'OFVFields']) {
    assert.match(
      PAGE,
      new RegExp(`interface\\s+${iface}\\s*\\{`),
      `page.tsx dejó de declarar \`interface ${iface}\` — el contrato del prompt quedaría divergiendo en silencio (R-31)`
    );
  }
  assert.match(
    PAGE,
    /function\s+parseContentToFields</,
    'page.tsx dejó de leer el `content` del núcleo con parseContentToFields (R-31)'
  );
  assert.match(
    PAGE,
    /function\s+fieldsToContent</,
    'page.tsx dejó de escribir el `content` del núcleo con fieldsToContent (R-31)'
  );
});

test('T-11(d) R-22 el route sigue invocando el write-path igual (F-107 R-10/R-11, F-109, F-113)', () => {
  assert.match(
    ROUTE,
    /buildOfvWritePayload\([\s\S]{0,80}?\)[\s\S]{0,40}?columns/,
    'el route dejó de proyectar columnas con buildOfvWritePayload (R-22)'
  );
  assert.match(
    ROUTE,
    /Object\.assign\(\s*insertData\s*,/,
    'el route dejó de aplicar las columnas con Object.assign(insertData, …) (R-22)'
  );
  assert.match(
    ROUTE,
    /attachValidation/,
    'el route perdió attachValidation (R-22)'
  );
  assert.match(
    ROUTE,
    /attachMethodGrounding/,
    'el route perdió attachMethodGrounding (R-22)'
  );
  assert.match(ROUTE, /persona_id/, 'el route perdió persona_id (F-113, R-22)');
});

test('T-11(d) R-17 la UI de Social Proof ya NO invita a fabricar (contraparte de F-104/F-105)', () => {
  // Los 3 strings que pedían exactamente lo que el guard de F-105 bloquea.
  assert.doesNotMatch(
    PAGE,
    /label='Testimonios\s+con\s+métricas\s+antes\/después'/,
    'la UI sigue pidiendo testimonios con métricas antes/después (R-17)'
  );
  assert.doesNotMatch(
    PAGE,
    /amplía\s+con\s+métricas/,
    'la UI sigue invitando a "ampliar con métricas" (R-17)'
  );
  assert.doesNotMatch(
    PAGE,
    /placeholder='Nombre\s+del\s+cliente,\s+industria,\s+resultado\.\.\.'/,
    'la UI sigue pidiendo nombres de clientes en el placeholder (R-17, conventions §12.7)'
  );
  // Y el reemplazo dice lo que F-104/F-105 sí permiten.
  assert.match(
    PAGE,
    /Prueba\s+social\s+real\s+y\s+verificable/,
    'la UI no declara la prueba social como real y verificable (R-17)'
  );
  assert.match(
    PAGE,
    /\[PENDIENTE:\s*aportar\s+reseñas\/testimonios\s+reales\s+del\s+cliente\]/,
    'la UI no ofrece el marcador accionable [PENDIENTE] de F-104 (R-17)'
  );
});

test('T-11(d) R-18 el tab de persona ya NO promete un prefill inexistente, y conserva el texto verdadero', () => {
  assert.doesNotMatch(
    PAGE,
    /Buyer\s+Persona\s+completa\s+\(construida\s+desde\s+el\s+Brief\)/,
    'el tab sigue prometiendo que la persona se construye (prefilla) desde el Brief (R-18)'
  );
  // `:1594-1597` describe el uso del brief POR EL AI EN LA GENERACIÓN: es verdadero
  // y se preserva.
  assert.match(
    PAGE,
    /El\s+AI\s+usará\s+el\s+perfil\s+del\s+cliente\s+ideal\s+del\s+Brief\s+como\s+punto\s+de\s+partida/,
    'se borró el texto VERDADERO sobre el uso del brief por el AI (R-18)'
  );
});

test('T-11(d) R-25 el fallback global `tenant_id IS NULL` sigue vivo Y ahora está DECLARADO (DT-5)', () => {
  assert.match(
    ROUTE,
    /\.is\('tenant_id',\s*null\)/,
    'se retiró el fallback global: DT-5 lo conserva a propósito (R-25)'
  );
  assert.match(
    ROUTE,
    /DEFENSA\s+MULTI-TENANT\s+DELIBERADA/,
    'el fallback global sigue sin declarar por qué existe — parece código olvidado (R-25)'
  );
});

/* ================================================================== */
/*  (e) F-112 intacto: los 10 campos, con `dream_result` (R-14)       */
/* ================================================================== */

test('T-11(e) ⭐ R-14 `PERSONA_METHOD_LABELS` conserva sus 10 campos, incluido `dream_result`', () => {
  const fields = PERSONA_METHOD_LABELS.map(([f]) => f);
  assert.equal(
    fields.length,
    10,
    'el mapeo canónico persona→OFV de F-112 cambió de tamaño'
  );
  assert.ok(
    fields.includes('dream_result'),
    'se retiró `dream_result` del mapeo de F-112: es un HUECO que F-116 repara, no un adicional (CL-094/CL-104)'
  );
  // Y sigue en el tipo del front, que es lo que hace que el round-trip lo preserve.
  assert.match(
    PAGE,
    /dream_result:\s*string;/,
    '`dream_result` salió de PersonaFields: rompe el round-trip y deja F-112 inerte (R-14)'
  );
  assert.match(
    PAGE,
    /dream_result:\s*''/,
    '`dream_result` salió de emptyPersona (R-14)'
  );
});

test('T-11(e) R-13 las 5 claves fantasma salieron de `PersonaFields` Y de `emptyPersona`, y de ningún otro sitio', () => {
  for (const ghost of [
    'values',
    'expansion',
    'emotional_impact',
    'provider_frustrations',
    'fears'
  ]) {
    assert.doesNotMatch(
      PAGE,
      new RegExp(`^\\s*${ghost}:\\s*(string;|'')`, 'm'),
      `\`${ghost}\` sigue declarada en PersonaFields/emptyPersona (R-13)`
    );
  }
  // `provider_values` NO es una de las 5: se queda (tiene campo de UI y lo usa el tab).
  assert.match(PAGE, /provider_values:\s*string;/);
  assert.match(PAGE, /updatePersona\('provider_values'/);
});

/* ================================================================== */
/*  (f) Guard de aprobación intacto (R-16)                            */
/* ================================================================== */

test('T-11(f) R-16 `approval-guard.ts` sin tocar: el umbral sigue siendo meaningfulFieldCount > 0', () => {
  assert.match(
    APPROVAL_GUARD,
    /meaningfulFieldCount\s*>\s*0/,
    'cambió el umbral del guard de aprobación (F-109): retirar 5 campos siempre vacíos no puede alterar ningún veredicto (R-16)'
  );
});

/* ================================================================== */
/*  (g) `normalizeOffer`: fallback conservado, `raw_text` retirado    */
/* ================================================================== */

test('T-11(g) R-21 `normalizeOffer` CONSERVA el fallback `content.urgency_scarcity` (compat de las 16 filas históricas)', () => {
  assert.match(
    CONTEXT,
    /urgency_scarcity/,
    'se perdió el fallback de urgencia de `normalizeOffer`: F-111 lo fija por test y las 16 filas live dependen de él (R-21)'
  );
  assert.match(CONTEXT, /export function normalizeOffer/);
});

test('T-11(g) R-23 `NormalizedOffer.raw_text` retirado del TIPO y de su cómputo (el dato en `content` sigue)', () => {
  assert.doesNotMatch(
    GBP_TYPES,
    /raw_text/,
    '`NormalizedOffer` sigue declarando `raw_text`: 0 lectores en src/, 0 asserts en tests/ (R-23)'
  );
  assert.doesNotMatch(
    CONTEXT,
    /raw_text/,
    '`normalizeOffer` sigue computando `raw_text` (R-23)'
  );
});

/* ================================================================== */
/*  (h) Frontera: sin DDL, sin delete, sin tocar `tokens_used`        */
/* ================================================================== */

test('T-11(h) R-30 F-116 no introduce migración ni DDL', () => {
  const migDir = resolve(ROOT, 'supabase/migrations');
  if (existsSync(migDir)) {
    const f116 = readdirSync(migDir).filter((f) => /f[-_]?116/i.test(f));
    assert.deepStrictEqual(
      f116,
      [],
      `F-116 no debe añadir migraciones; encontradas: ${f116.join(', ')}`
    );
  }
});

test('T-11(h) R-30 los archivos que F-116 toca no introducen `delete(` ni DDL', () => {
  for (const [name, src] of [
    ['page.tsx', PAGE],
    ['generate-content/route.ts', ROUTE],
    ['gbp-slice/context.ts', CONTEXT],
    ['offers/write-path.ts', read('src/lib/offers/write-path.ts')]
  ] as const) {
    assert.doesNotMatch(
      src,
      /CREATE TABLE|ALTER TABLE|DROP COLUMN/i,
      `${name}: F-116 introdujo DDL (R-30 / CL-103 límite 2)`
    );
    assert.doesNotMatch(
      src,
      /\.delete\(\)/,
      `${name}: F-116 introdujo un delete (R-30 / CL-103)`
    );
  }
});

test('T-11(h) R-26 `tokens_used` NO se tocó: sigue declarada en los 3 tipos de dominio (borrarla exige DDL)', () => {
  const domain = read('src/types/c3-domain.ts');
  assert.equal(
    (domain.match(/tokens_used/g) ?? []).length,
    3,
    '`tokens_used` cambió en c3-domain.ts: queda documentada como columna muerta, su retiro exige DDL (R-26)'
  );
});
