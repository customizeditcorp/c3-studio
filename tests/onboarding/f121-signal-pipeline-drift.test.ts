/**
 * F-121 — T-05 — **Source-guard ANTI-DERIVA señal ↔ pipeline** (R-12).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE GUARD ES LA FEATURE, NO UN EXTRA
 * ─────────────────────────────────────────────────────────────────────────────────
 * La razón por la que la señal mintió **no es** que alguien escribiera un booleano mal:
 * es que **nadie ató la promesa al pipeline**. `hasDiagnostic: !!diagnosticData` y el
 * `userMessageBase` del step `brief` vivían en dos archivos que nada obligaba a estar
 * de acuerdo. Sin este test, F-121 arregla el síntoma de julio y reabre el mismo
 * agujero mañana (design.md §2.1, opción 1a vs 1b).
 *
 * El guard lee **de disco** las DOS fuentes y exige correspondencia **en los dos
 * sentidos**:
 *   · agregar una fuente al `userMessageBase` del step `brief` sin declararla en
 *     `brief-inputs.ts` ⇒ **rojo**;
 *   · declarar una que no se inyecta ⇒ **rojo**.
 *
 * ⛔ **Prohibido hardcodear la lista acá** (precedente F-116 R-32): las dos listas se
 * EXTRAEN de sus archivos. Una lista escrita en el test sería una tercera copia — y
 * tres copias es exactamente la causa raíz que F-121 vino a eliminar.
 *
 * Ancla FIJA `cb3302d` para los asserts contra la baseline (R-33), nunca `HEAD`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const BASE = 'cb3302d';

const ROUTE_REL = 'src/app/api/generate-content/route.ts';
const DECL_REL = 'src/lib/onboarding/brief-inputs.ts';
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const ROUTE = read(ROUTE_REL);
const ROUTE_CODE = stripComments(ROUTE);
const DECL = read(DECL_REL);
const DECL_CODE = stripComments(DECL);

/* ================================================================== */
/*  Extracción — de disco, en los dos lados. Cero listas hardcodeadas  */
/* ================================================================== */

/**
 * ⭐ LADO PIPELINE. La sentencia `const userMessageBase = … ;` recortada del `route.ts`
 * REAL, y los campos de `client` que inyecta.
 *
 * El corte va desde la declaración hasta su `;` final. Se toma la ocurrencia de
 * `const userMessageBase` (la DECLARACIÓN), no la primera aparición del identificador
 * — que en este archivo es un comentario de F-105 (constricción H-1 del spec).
 */
function ensamblado(src: string): string {
  const i = src.indexOf('const userMessageBase');
  assert.ok(i > 0, '`route.ts` ya no declara `userMessageBase` (R-12)');
  const fin = src.indexOf(';', src.indexOf('backticks', i));
  assert.ok(fin > i, 'no se encontró el cierre de `userMessageBase`');
  return src.slice(i, fin + 1);
}

const ENSAMBLADO = ensamblado(ROUTE_CODE);

/** Los campos de `clients` que el ensamblado real inyecta, leídos de la fuente. */
function camposInyectados(bloque: string): string[] {
  return Array.from(
    new Set(Array.from(bloque.matchAll(/client\.(\w+)/g), (m) => m[1]))
  ).sort();
}

/** ⭐ LADO DECLARACIÓN. El array `BRIEF_CLIENT_INPUT_FIELDS`, leído de su archivo. */
function camposDeclarados(src: string): string[] {
  const m = /BRIEF_CLIENT_INPUT_FIELDS\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(
    src
  );
  assert.ok(
    m,
    '`brief-inputs.ts` ya no declara `BRIEF_CLIENT_INPUT_FIELDS` (R-12)'
  );
  return Array.from(m[1].matchAll(/'([^']+)'/g), (x) => x[1]).sort();
}

/** Las fuentes declaradas del contexto (`BRIEF_INPUT_SOURCES`). */
function fuentesDeclaradas(src: string): string[] {
  const m = /BRIEF_INPUT_SOURCES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(src);
  assert.ok(m, '`brief-inputs.ts` ya no declara `BRIEF_INPUT_SOURCES` (R-12)');
  return Array.from(m[1].matchAll(/'([^']+)'/g), (x) => x[1]).sort();
}

/* ================================================================== */
/*  ⭐⭐ R-12 — correspondencia EN LOS DOS SENTIDOS                     */
/* ================================================================== */

test('T-05 ⭐⭐ R-12 los campos de `clients` inyectados === los declarados, en los DOS sentidos', () => {
  const inyectados = camposInyectados(ENSAMBLADO);
  const declarados = camposDeclarados(DECL_CODE);

  // Anti-no-op: si alguna de las dos extracciones devolviera vacío, la igualdad de
  // abajo pasaría sola. Las dos tienen que traer algo.
  assert.ok(inyectados.length > 0, 'la extracción del pipeline salió vacía');
  assert.ok(
    declarados.length > 0,
    'la extracción de la declaración salió vacía'
  );

  // Sentido 1 — INYECTADA Y NO DECLARADA: alguien agregó una fuente al contexto del
  // step `brief` y la señal de progreso no se enteró. Es EXACTAMENTE el modo de fallo
  // que produjo «Diagnóstico completado ✓» sobre un Brief con 23/29 [PENDIENTE].
  assert.deepEqual(
    inyectados.filter((f) => declarados.indexOf(f) < 0),
    [],
    'el `userMessageBase` inyecta un campo de `clients` que `BRIEF_CLIENT_INPUT_FIELDS` ' +
      'NO declara ⇒ la señal de progreso vuelve a prometer distinto de lo que el ' +
      'pipeline entrega. Declaralo en `src/lib/onboarding/brief-inputs.ts` (R-12).'
  );
  // Sentido 2 — DECLARADA Y NO INYECTADA: la señal promete un insumo que el generador
  // no recibe. La misma mentira, en el otro sentido.
  assert.deepEqual(
    declarados.filter((f) => inyectados.indexOf(f) < 0),
    [],
    '`BRIEF_CLIENT_INPUT_FIELDS` declara un campo que el `userMessageBase` NO inyecta ⇒ ' +
      'la señal promete un insumo que el generador no va a recibir (R-12).'
  );
  assert.deepEqual(inyectados, declarados);
});

test('T-05 ⭐ R-12 el guard MUERDE: una lista alterada en cualquiera de los dos lados lo pone rojo', () => {
  // Mutación simulada sobre la fuente leída (no se toca ningún archivo): el criterio
  // del guard es el mismo que arriba, aplicado a un texto mutado.
  const declaradosReales = camposDeclarados(DECL_CODE);

  // (a) el pipeline gana una fuente no declarada.
  const conFuenteExtra = ENSAMBLADO + "\n'\\nNotas: ' + client.notes";
  const inyectadosMutados = camposInyectados(conFuenteExtra);
  assert.ok(
    inyectadosMutados.filter((f) => declaradosReales.indexOf(f) < 0).length > 0,
    'el guard NO detecta una fuente agregada al contexto sin declarar: sería un no-op'
  );

  // (b) la declaración gana un campo que no se inyecta.
  const declMutada = DECL_CODE.replace(
    /BRIEF_CLIENT_INPUT_FIELDS\s*=\s*\[/,
    "BRIEF_CLIENT_INPUT_FIELDS = [\n  'notes',"
  );
  assert.notEqual(declMutada, DECL_CODE, 'la mutación de prueba no se aplicó');
  const declMutados = camposDeclarados(declMutada);
  assert.ok(
    declMutados.filter((f) => camposInyectados(ENSAMBLADO).indexOf(f) < 0)
      .length > 0,
    'el guard NO detecta un insumo declarado que no se inyecta: sería un no-op'
  );
});

/* ================================================================== */
/*  ⭐ R-12 — el step `brief` NO recibe contextChain, y está declarado  */
/* ================================================================== */

test('T-05 ⭐ R-12 `brief` sigue FUERA de `needsBrief`/`needsPersona`/`needsOffer` ⇒ `contextChain` vacío', () => {
  for (const lista of ['needsBrief', 'needsPersona', 'needsOffer']) {
    const i = ROUTE_CODE.indexOf(`const ${lista} = [`);
    assert.ok(i > 0, `\`route.ts\` ya no declara \`${lista}\``);
    const bloque = ROUTE_CODE.slice(
      i,
      ROUTE_CODE.indexOf('].includes(step)', i)
    );
    assert.ok(
      !/'brief'/.test(bloque),
      `\`brief\` entró en \`${lista}\`: su \`contextChain\` deja de ser vacío y la ` +
        'declaración de insumos de `brief-inputs.ts` queda desactualizada (R-12)'
    );
  }
  // Y la declaración lo dice explícitamente: `contextChain` NO es una fuente del brief.
  const fuentes = fuentesDeclaradas(DECL_CODE);
  assert.deepEqual(fuentes, ['clients', 'input_data.structured_fields']);
  assert.ok(fuentes.indexOf('contextChain') < 0);
});

test('T-05 ⭐ R-12 la OTRA fuente declarada (`input_data.structured_fields`) SÍ se inyecta', () => {
  assert.match(
    ENSAMBLADO,
    /## INPUT ADICIONAL DEL OPERADOR/,
    'el bloque del operador desapareció del `userMessageBase`'
  );
  assert.match(
    ENSAMBLADO,
    /input_data\s*\?\s*JSON\.stringify\(input_data/,
    '`input_data` ya no viaja: la declaración lo promete y el pipeline no lo entrega'
  );
  // Y `structured_fields` es lo que la pantalla manda como `inputData`.
  assert.match(
    stripComments(read('src/app/(app)/onboarding/brief/[clientId]/page.tsx')),
    /inputData:\s*\{\s*structured_fields:\s*briefFields\s*\}/
  );
});

/* ================================================================== */
/*  ⭐⭐ FRONTERA — `diagnostics` NO es una fuente del pipeline         */
/* ================================================================== */

test('T-05 ⭐⭐ FRONTERA ni el ensamblado ni la declaración incorporan `diagnostics` (GATE-D1 pendiente)', () => {
  assert.ok(
    !/diagnostic/i.test(ENSAMBLADO),
    'el `userMessageBase` incorporó el diagnóstico: eso es la RAMA (2), elevada al ' +
      'operador (GATE-D1) y NO implementada. Cablearlo re-clasifica `diagnostics` de ' +
      'FRONTERA a NÚCLEO (`docs/c3-studio-core-downstream-boundary.md` §5.2, RD-05).'
  );
  assert.ok(fuentesDeclaradas(DECL_CODE).indexOf('diagnostics') < 0);
});

/* ================================================================== */
/*  R-13 — la industria ya no viaja CRUDA (y el ancla lo prueba)       */
/* ================================================================== */

test('T-05 ⭐ R-13 `Industria: ` pasa por `toIndustryLabel`, y en `cb3302d` viajaba CRUDA', () => {
  const base = execFileSync('git', ['show', `${BASE}:${ROUTE_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  // El defecto, tal como vivía en el ancla: si esto falla, el ancla está mal.
  assert.match(
    ensamblado(stripComments(base)),
    /'\\nIndustria: '\s*\+\s*client\.industry\b/,
    'en `cb3302d` la ruta inyectaba `client.industry` crudo'
  );
  // Y ya no.
  assert.doesNotMatch(
    ENSAMBLADO,
    /'\\nIndustria: '\s*\+\s*client\.industry\b/,
    'volvió el token crudo al contexto de los 11 steps'
  );
  assert.match(ENSAMBLADO, /toIndustryLabel\(\s*client\.industry\s*\)/);
  assert.match(
    ROUTE,
    /import\s*\{[\s\S]*?toIndustryLabel[\s\S]*?\}\s*from\s*'@\/lib\/clients\/industry-label'/,
    'la ruta debe IMPORTAR la declaración única, no re-implementar el criterio'
  );
  // La ausencia se expresa como ausencia, no como token ni como `N/A` mudo (R-15).
  assert.match(ENSAMBLADO, /\?\?\s*'Sin industria declarada'/);
});

/* ================================================================== */
/*  H-1 — la rebanada de `f110-context-alignment` sigue siendo válida  */
/* ================================================================== */

test('T-05 H-1 el primer `userMessageBase` del archivo sigue siendo el comentario de F-105', () => {
  // `f110-context-alignment.test.ts:26` recorta `ROUTE` hasta `indexOf('userMessageBase')`.
  // Si una edición de F-121 metiera una referencia ANTES de ese comentario, la rebanada
  // del bloque OFV se acortaría y los asserts de presencia de F-110 podrían caer.
  const primera = ROUTE.indexOf('userMessageBase');
  const comentarioF105 = ROUTE.indexOf('// F-105 (R-05): `userMessageBase`');
  assert.ok(comentarioF105 > 0, 'desapareció el comentario ancla de F-105');
  assert.ok(
    primera >= comentarioF105 && primera < comentarioF105 + 80,
    'F-121 introdujo una referencia a `userMessageBase` ANTES del comentario de F-105: ' +
      'eso mueve la rebanada de `f110-context-alignment` (constricción H-1)'
  );
  assert.ok(
    ROUTE.indexOf('## OFERTA DE VALOR (APROBADA)') < primera,
    'el bloque OFV debe seguir ANTES del corte que usa f110'
  );
});
