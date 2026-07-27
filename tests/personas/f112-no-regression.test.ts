/**
 * F-112 — T-10 — Source-guards de NO-REGRESIÓN y anti-scope-creep.
 *
 * Inspección de fuente (`readFileSync` + `assert.match` **whitespace-tolerante**:
 * `\s*` entre tokens, nunca match de línea literal — el hook husky/prettier reformatea
 * `.ts/.tsx` al commit, lección F-107).
 *
 * Cubre: R-07 (fuente ÚNICA del criterio `[PENDIENTE]`), R-09 (write-path de persona y
 * UI intactos), R-13/R-18 (el blob de persona intacto, la llamada nueva DESPUÉS y
 * DENTRO del `if (persona)`, `needsPersona`/`select`/filtros sin cambios, bloque OFV de
 * F-110/F-111 intacto, `/api/generate-gbp` y `buildGbpUserMessage` sin tocar — CL-092),
 * R-19 (sin DDL ni delete).
 *
 * **Nota de modalidad (`docs/verification.md §6`):** la claim de byte-identidad NO se
 * verifica acá — un source-guard no puede probar que la SALIDA no cambió. Esa claim es
 * CONDUCTUAL y vive en `f112-method-context.test.ts` (`assert.equal(..., '')`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

const ROUTE = read('src/app/api/generate-content/route.ts');
const GBP_ROUTE = read('src/app/api/generate-gbp/route.ts');
const GBP_PROMPT = read('src/lib/gbp-slice/prompt.ts');
const BRIEF_WRITE_PATH = read('src/lib/briefs/write-path.ts');
const PAGE = read('src/app/(app)/onboarding/brief/[clientId]/page.tsx');
const OFFERS_METHOD_CONTEXT = read('src/lib/offers/method-context.ts');
const PERSONAS_METHOD_CONTEXT = read('src/lib/personas/method-context.ts');
const PENDING = read('src/lib/method-context/pending.ts');

/* ---- R-13/R-18: el blob de persona intacto y la llamada ANEXADA ---------------- */

test('T-10 R-13 el blob `## BUYER PERSONA (APROBADO)` sigue INTACTO (no se reemplazó)', () => {
  assert.match(
    ROUTE,
    /contextChain\s*\+=\s*['"]\\n\\n## BUYER PERSONA \(APROBADO\)\\n['"]\s*\+\s*\(\s*persona\.raw_text\s*\|\|\s*JSON\.stringify\(\s*persona\.content\s*\)\s*\)/
  );
});

test('T-10 R-11/R-13 la llamada nueva va DESPUÉS del blob y DENTRO del `if (persona)`', () => {
  const iIfPersona = ROUTE.search(/if\s*\(\s*persona\s*\)\s*\{/);
  const iBlob = ROUTE.indexOf('## BUYER PERSONA (APROBADO)');
  const iCall = ROUTE.search(/contextChain\s*\+=\s*buildPersonaMethodBlock/);
  assert.ok(iIfPersona >= 0, 'no se encontró el `if (persona) {` con llaves');
  assert.ok(iBlob >= 0, 'no se encontró el blob de persona');
  assert.ok(iCall >= 0, 'no se encontró la llamada a buildPersonaMethodBlock');
  assert.ok(iCall > iBlob, 'F-112 debe ANEXAR, no anteponerse al blob');
  assert.ok(iIfPersona < iCall, 'la llamada debe ir dentro del `if (persona)`');

  // Y DENTRO del bloque `if (needsPersona) { ... }`, antes de que empiece needsOffer.
  const iNeedsPersonaBlock = ROUTE.search(/if\s*\(\s*needsPersona\s*\)\s*\{/);
  const iNeedsOfferBlock = ROUTE.search(/if\s*\(\s*needsOffer\s*\)\s*\{/);
  assert.ok(iNeedsPersonaBlock >= 0 && iNeedsOfferBlock > iNeedsPersonaBlock);
  assert.ok(iCall > iNeedsPersonaBlock && iCall < iNeedsOfferBlock);
});

test('T-10 R-11 la llamada usa el seam puro con el `step` y la fila `persona`', () => {
  assert.match(
    ROUTE,
    /buildPersonaMethodBlock\s*\(\s*\{[\s\S]*?step[\s\S]*?persona:\s*persona\s+as\s+RawPersonaRow[\s\S]*?\}\s*\)/
  );
  assert.match(
    ROUTE,
    /import\s*\{[\s\S]*?buildPersonaMethodBlock[\s\S]*?\}\s*from\s*['"]@\/lib\/personas\/method-context['"]/
  );
});

/* ---- R-18: consulta, gating y resto del contextChain sin cambios --------------- */

/**
 * **F-117 (R-24) — GUARD PREEXISTENTE CRUZADO POR DISEÑO. Reescrito preservando la
 * intención, NO borrado ni vaciado.** *(Mismo patrón e idéntica autorización que el
 * cruce de F-113 R-21 sobre los marcadores de F-112, documentado más abajo.)*
 *
 * Este guard nació en F-112 para fijar que **la lista de persona no cambia por
 * accidente**: sus 9 steps eran `ofv` + los 8 de contenido, sin altas ni bajas.
 *
 * **F-117 hace una BAJA DELIBERADA, y es el objeto mismo de la feature:**
 * `gbp_description` sale de `needsPersona` por **CL-092** — la decisión del operador de
 * que el GBP se queda con **brief + OFV** y la buyer persona **no entra**.
 * `gbp_description` produce la descripción del **mismo perfil público de Google** que
 * `/api/generate-gbp` (que ya cumplía: 0 referencias a `buyer_personas`), así que este
 * segundo camino estaba violando la decisión **en silencio**.
 *
 * **La intención se preserva y se REFUERZA:** el guard sigue exigiendo conteo exacto,
 * sigue exigiendo que `buyer_persona` no entre, y ahora exige además que
 * `gbp_description` esté **AUSENTE**. Pasa de "no se pierda ningún step" a "no se
 * pierda ninguno de los 8 **y** no vuelva el noveno". Es más fuerte, no más débil.
 */
test('T-10 R-18 (⤫ F-117 R-24) `needsPersona` conserva sus 8 steps, con `gbp_description` AUSENTE por CL-092', () => {
  const i = ROUTE.search(/const\s+needsPersona\s*=/);
  assert.ok(i >= 0);
  const block = ROUTE.slice(i, ROUTE.indexOf('.includes(step)', i));
  // Los 8 steps reales tras F-117: `ofv` + los 7 de contenido que SÍ consumen persona.
  // `buyer_persona` NO está (se GENERA la persona, no se consume).
  for (const step of [
    'ofv',
    'gbp_posts',
    'campaign_copy',
    'website_home',
    'website_service',
    'website_location',
    'nurturing',
    'social_content'
  ]) {
    assert.ok(
      block.includes(`'${step}'`),
      `needsPersona perdió el step ${step}`
    );
  }
  assert.ok(
    !block.includes("'buyer_persona'"),
    'needsPersona ganó un step nuevo'
  );
  assert.ok(
    !block.includes("'gbp_description'"),
    'CL-092 (decisión del operador): el GBP se queda con brief + OFV; la buyer ' +
      'persona NO entra. Reintroducir `gbp_description` acá vuelve a violar la ' +
      'decisión en silencio — es el defecto que F-117 vino a cerrar.'
  );
  assert.equal((block.match(/'/g) ?? []).length / 2, 8);
});

/**
 * **F-113 (R-21) — MARCADOR FORWARD-DECLARADO CRUZADO POR DISEÑO. Reescrito
 * preservando la intención, NO borrado ni vaciado.**
 *
 * Este guard nació en F-112 para fijar que *la consulta de persona no cambió*, y
 * aseveraba `.select('content, raw_text')` + `.order('version', desc)` + `.limit(1)` +
 * `.maybeSingle()`. **F-113 cruza esa frontera a propósito** (CL-099): SCS Cleaning
 * tiene **3 personas `approved`, todas `version = 1`**, y `limit(1)` dejaba la elección
 * en manos de Postgres — ganaba `e8e8c500`, la persona SIN campos canónicos. Ése es
 * exactamente el motivo por el que la §6.1 de F-112 no pudo ser positiva (CL-098): el
 * helper de F-112 emitía `''` **correctamente**, sobre la fila equivocada. Precedente
 * del mismo tipo de cruce: F-109 reescribió los marcadores de F-107/F-108.
 * **Nota explícita para el reviewer (CP-04): este cruce está autorizado por R-21 de
 * F-113.**
 *
 * **Qué se preserva** (la intención original, intacta): los filtros que definen QUÉ
 * filas son elegibles (`client_id`, `status='approved'`), que el `select` sigue
 * trayendo `content` y `raw_text` —ahora como **SUPERSET**, no se perdió ninguna
 * columna— y que la fila se resuelve de forma **inequívoca**.
 * **Qué se sustituye:** `order('version') + limit(1)` (elección ARBITRARIA ante empate)
 * por **selección DETERMINISTA** vía `pickCanonicalContentRow` — una aserción
 * estrictamente más fuerte que la anterior, no una relajación.
 */
test('T-10 R-18 los filtros de la consulta de persona sin cambios; el `select` es SUPERSET y la fila se elige de forma determinista (F-113 R-21)', () => {
  const i = ROUTE.indexOf("from('buyer_personas')");
  assert.ok(i >= 0);
  const end = ROUTE.indexOf(';', i);
  assert.ok(end > i, 'la consulta de persona debe terminar en `;`');
  const query = ROUTE.slice(i, end + 1);

  // --- INTENCIÓN PRESERVADA: qué filas son elegibles (byte-idéntico) ---------------
  assert.match(query, /\.eq\(\s*['"]client_id['"],\s*client_id\s*\)/);
  assert.match(query, /\.eq\(\s*['"]status['"],\s*['"]approved['"]\s*\)/);
  assert.match(
    query,
    /\.order\(\s*['"]version['"],\s*\{\s*ascending:\s*false\s*\}\s*\)/
  );

  // --- INTENCIÓN PRESERVADA: el `select` no perdió ninguna columna (SUPERSET) ------
  const cols = (query.match(/\.select\(\s*['"]([^'"]*)['"]\s*\)/)?.[1] ?? '')
    .split(',')
    .map((c) => c.trim());
  for (const c of ['content', 'raw_text']) {
    assert.ok(
      cols.includes(c),
      `el select de persona perdió la columna \`${c}\``
    );
  }

  // --- CRUCE DECLARADO: de `limit(1)` arbitrario a selección determinista ----------
  assert.doesNotMatch(query, /\.limit\(\s*1\s*\)/);
  assert.doesNotMatch(query, /\.maybeSingle\(\)/);
  assert.match(
    ROUTE,
    /const\s+persona\s*=\s*pickCanonicalContentRow\s*\(\s*\(\s*personaRows\s*\?\?/
  );
  assert.match(
    ROUTE,
    /import\s*\{[\s\S]*?pickCanonicalContentRow[\s\S]*?\}\s*from\s*['"]@\/lib\/onboarding\/select-canonical-row['"]/
  );
});

test('T-10 R-18 el bloque OFV de F-110/F-111 sigue intacto', () => {
  assert.match(ROUTE, /contextChain\s*\+=\s*['"]\\nEntregables:/); // F-110
  assert.match(ROUTE, /contextChain\s*\+=\s*['"]\\nPrueba social:/); // F-110
  assert.match(ROUTE, /contextChain\s*\+=\s*buildOfvMethodLines/); // F-111
  assert.match(ROUTE, /pickCanonicalOffer\s*\(/); // F-109
});

/* ---- R-09: write-path de persona y UI intactos --------------------------------- */

test('T-10 R-09 `fieldsToContent` / `parseContentToFields` (page.tsx) sin cambios', () => {
  assert.match(PAGE, /function\s+parseContentToFields\s*</);
  assert.match(PAGE, /function\s+fieldsToContent\s*</);
  assert.match(
    PAGE,
    /\.map\(\s*\(\s*\[\s*k\s*,\s*v\s*\]\s*\)\s*=>\s*`- \$\{k\}: \$\{v\}`\s*\)\s*\n?\s*\.join\(\s*['"]\\n['"]\s*\)/
  );
  assert.doesNotMatch(PAGE, /buildPersonaMethodBlock|personas\/method-context/);
});

test('T-10 R-09 `buildBriefWritePayload` (briefs/write-path.ts) sin cambios', () => {
  assert.match(
    BRIEF_WRITE_PATH,
    /export\s+function\s+buildBriefWritePayload\s*\(/
  );
  assert.match(
    BRIEF_WRITE_PATH,
    /const\s+raw_text\s*=\s*\n?\s*typeof\s+content\.raw_text\s*===\s*['"]string['"]\s*\?\s*content\.raw_text\s*:\s*null/
  );
  assert.doesNotMatch(
    BRIEF_WRITE_PATH,
    /buildPersonaMethodBlock|method-context/
  );
});

/* ---- CL-092: persona NO entra al GBP ------------------------------------------- */

test('T-10 CL-092 `gbp-slice/prompt.ts` sin persona/objeciones/escenarios', () => {
  assert.doesNotMatch(GBP_PROMPT, /persona|objection_|if_nothing/i);
});

test('T-10 CL-092 `/api/generate-gbp` no consume el módulo de persona', () => {
  assert.doesNotMatch(
    GBP_ROUTE,
    /buildPersonaMethodBlock|personas\/method-context|PERSONA_METHOD/
  );
});

/* ---- R-07: fuente ÚNICA del criterio `[PENDIENTE]` ----------------------------- */

test('T-10 R-07 ambos extractores IMPORTAN el criterio compartido `method-context/pending`', () => {
  assert.match(
    OFFERS_METHOD_CONTEXT,
    /import\s*\{[^}]*cleanScalar[^}]*\}\s*from\s*['"][^'"]*method-context\/pending(\.ts)?['"]/
  );
  assert.match(
    PERSONAS_METHOD_CONTEXT,
    /import\s*\{[^}]*cleanScalar[^}]*\}\s*from\s*['"][^'"]*method-context\/pending(\.ts)?['"]/
  );
  // Y ninguno conserva una copia privada del predicado.
  for (const [name, src] of [
    ['offers/method-context.ts', OFFERS_METHOD_CONTEXT],
    ['personas/method-context.ts', PERSONAS_METHOD_CONTEXT]
  ] as const) {
    assert.doesNotMatch(src, /const\s+PENDING_MARKER\s*=/, name);
    assert.doesNotMatch(src, /function\s+cleanScalar\s*\(/, name);
  }
  assert.match(
    PENDING,
    /export\s+const\s+PENDING_MARKER\s*=\s*'\[pendiente\]'/
  );
  assert.match(PENDING, /export\s+function\s+isPendingMarker\s*\(/);
  assert.match(PENDING, /export\s+function\s+cleanScalar\s*\(/);
});

test('T-10 ⭐ R-07 el literal del marcador está definido UNA sola vez en todo `src/lib`', () => {
  const files = readdirSync(resolve(REPO, 'src/lib'), {
    recursive: true,
    encoding: 'utf8'
  }).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const hits: string[] = [];
  for (const f of files) {
    const src = readFileSync(resolve(REPO, 'src/lib', f), 'utf8');
    const n = (src.match(/'\[pendiente\]'/g) ?? []).length;
    for (let i = 0; i < n; i++) hits.push(f);
  }
  assert.deepEqual(hits, ['method-context/pending.ts']);
});

/* ---- R-19: sin DDL ni delete --------------------------------------------------- */

test('T-10 R-19 ninguna fuente tocada introduce DDL ni delete', () => {
  for (const [name, src] of [
    ['route.ts', ROUTE],
    ['offers/method-context.ts', OFFERS_METHOD_CONTEXT],
    ['personas/method-context.ts', PERSONAS_METHOD_CONTEXT],
    ['method-context/pending.ts', PENDING]
  ] as const) {
    assert.doesNotMatch(
      src,
      /alter table|create table|create index|drop |delete from/i,
      name
    );
  }
});
