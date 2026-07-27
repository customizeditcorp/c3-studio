/**
 * F-117 — T-09/T-10 — Source-guards de NO-REGRESIÓN, anti-scope-creep y
 * **anti-regresión de CL-092**.
 *
 * Inspección de fuente (`readFileSync` + `assert.match` **whitespace-tolerante**:
 * `\s*` entre tokens, nunca match de línea literal — el hook husky/prettier reformatea
 * `.ts/.tsx` al commit, lección F-107 · R-34).
 *
 * ⚠️ **NOTA DE MODALIDAD (`docs/verification.md` §6).** Acá NO se prueba byte-identidad
 * de SALIDA: un source-guard no puede hacerlo, y F-117 sí reescribió el interior de
 * `src/lib/personas/method-context.ts` (extracción del núcleo de normalización, T-05).
 * La claim conductual vive en `f117-downstream-context.test.ts` (`assert.equal`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');
const head = (rel: string): string =>
  execFileSync('git', ['show', `HEAD:${rel}`], { cwd: REPO, encoding: 'utf8' });

const ROUTE_REL = 'src/app/api/generate-content/route.ts';
const EDGE_REL = 'supabase/functions/generate-content/index.ts';
const CORE_PAGE_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';

const ROUTE = read(ROUTE_REL);
const EDGE = read(EDGE_REL);
const GBP_ROUTE = read('src/app/api/generate-gbp/route.ts');
const PERSONAS_METHOD_CONTEXT = read('src/lib/personas/method-context.ts');
const OFFERS_METHOD_CONTEXT = read('src/lib/offers/method-context.ts');

/** El bloque `const <nombre> = [ … ].includes(step)` de la route. */
const listaDeSteps = (nombre: string): string => {
  const i = ROUTE.search(new RegExp(`const\\s+${nombre}\\s*=`));
  assert.ok(i >= 0, `no se encontró ${nombre}`);
  return ROUTE.slice(i, ROUTE.indexOf('.includes(step)', i));
};

/* ================================================================== */
/*  R-04 — GUARD ANTI-REGRESIÓN DE CL-092 (el corazón del ítem (a))    */
/* ================================================================== */

const CL092 =
  'CL-092 — DECISIÓN DEL OPERADOR (2026-07-25): el GBP se queda con brief + OFV; ' +
  'la buyer persona NO entra. `gbp_description` produce la descripción del MISMO ' +
  'perfil público de Google que `/api/generate-gbp` (que ya cumplía, 0 referencias a ' +
  '`buyer_personas`). Reintroducirlo en la lista de persona vuelve a violar la ' +
  'decisión EN SILENCIO, que es exactamente lo que F-117 vino a cerrar.';

test('T-09 ⭐ R-04/R-01 `needsPersona` (route) NO contiene `gbp_description` — CL-092', () => {
  const persona = listaDeSteps('needsPersona');
  assert.ok(!persona.includes("'gbp_description'"), CL092);
});

test('T-09 ⭐ R-04/R-05 la copia EDGE tampoco contiene `gbp_description` en su lista de persona — CL-092', () => {
  // La lista de persona de la Edge Function es el array que precede a la consulta a
  // `buyer_personas`; se acota entre el inicio del archivo y esa consulta.
  const iQuery = EDGE.indexOf("from('buyer_personas')");
  assert.ok(
    iQuery >= 0,
    'no se encontró la consulta a `buyer_personas` en la copia edge'
  );
  const iArray = EDGE.lastIndexOf("'ofv'", iQuery);
  assert.ok(iArray >= 0, 'no se encontró la lista de persona de la copia edge');
  const lista = EDGE.slice(iArray, iQuery);
  assert.ok(!lista.includes("'gbp_description'"), CL092);
});

test('T-09 ⭐ R-01 `needsPersona` conserva EXACTAMENTE los otros 8 steps, sin altas ni bajas', () => {
  const persona = listaDeSteps('needsPersona');
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
      persona.includes(`'${step}'`),
      `needsPersona perdió el step ${step}`
    );
  }
  assert.ok(
    !persona.includes("'buyer_persona'"),
    'needsPersona ganó un step nuevo (se GENERA la persona, no se consume)'
  );
  assert.equal((persona.match(/'/g) ?? []).length / 2, 8);
});

test('T-09 R-05 la copia edge conserva sus otros 8 steps de persona (la baja es SÓLO `gbp_description`)', () => {
  const iQuery = EDGE.indexOf("from('buyer_personas')");
  const iArray = EDGE.lastIndexOf("'ofv'", iQuery);
  const lista = EDGE.slice(iArray, iQuery);
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
    assert.ok(lista.includes(`'${step}'`), `la copia edge perdió ${step}`);
  }
});

test('T-09 ⭐ R-05.1 la copia edge DECLARA su deriva y que no es el path vivo (no se finge paridad)', () => {
  const iQuery = EDGE.indexOf("from('buyer_personas')");
  const bloque = EDGE.slice(Math.max(0, iQuery - 2500), iQuery);
  assert.match(bloque, /deriva/i, 'la deriva debe estar declarada por escrito');
  assert.match(bloque, /F-110/);
  assert.match(bloque, /F-111/);
  assert.match(bloque, /F-112/);
  assert.match(bloque, /F-113/);
  assert.match(bloque, /F-116/);
  assert.match(bloque, /CL-092/);
  assert.match(
    bloque,
    /no\s+es\s+el\s+path\s+vivo/i,
    'debe decir que la UI llama a `/api/generate-content`, no a esta función'
  );
});

test('T-09 R-05 la copia edge NO recibió ninguna otra modificación funcional (sigue a la deriva)', () => {
  // Su lectura de persona sigue siendo la vieja: `.limit(1).single()`, sin selector
  // canónico y sin ningún helper de método. Si esto cambiara, el comentario de deriva
  // pasaría a ser falso.
  assert.match(
    EDGE,
    /from\(\s*'buyer_personas'\s*\)[\s\S]{0,300}?\.limit\(\s*1\s*\)/
  );
  // Se busca la INVOCACIÓN (`nombre(`), no la mención: el comentario de deriva de
  // R-05.1 nombra estos helpers justamente para decir que NO están cableados.
  for (const helper of [
    'pickCanonicalContentRow',
    'pickCanonicalOffer',
    'buildPersonaMethodBlock',
    'buildPersonaDownstreamBlock',
    'buildOfvMethodLines'
  ]) {
    assert.doesNotMatch(
      EDGE,
      new RegExp(`${helper}\\s*\\(`),
      `la copia edge sigue a la deriva: ${helper} NO está cableado ahí`
    );
  }
});

test('T-09 R-01 el sitio de `needsPersona` nombra CL-092 (la baja es una decisión, no un descuido)', () => {
  const i = ROUTE.search(/const\s+needsPersona\s*=/);
  const contexto = ROUTE.slice(Math.max(0, i - 1200), i);
  assert.match(contexto, /CL-092/);
  assert.match(contexto, /gbp_description/);
});

/* ================================================================== */
/*  R-19 — El cableado nuevo ANEXA, no reordena                        */
/* ================================================================== */

test('T-09 ⭐ R-19 la llamada de F-117 va DESPUÉS de la de F-112, dentro del mismo `if (persona)`', () => {
  const iIfPersona = ROUTE.search(/if\s*\(\s*persona\s*\)\s*\{/);
  const iBlob = ROUTE.indexOf('## BUYER PERSONA (APROBADO)');
  const iF112 = ROUTE.search(/contextChain\s*\+=\s*buildPersonaMethodBlock/);
  const iF117 = ROUTE.search(
    /contextChain\s*\+=\s*buildPersonaDownstreamBlock/
  );
  assert.ok(iIfPersona >= 0 && iBlob >= 0 && iF112 >= 0);
  assert.ok(iF117 >= 0, 'no se encontró la llamada anexada de F-117');
  assert.ok(iF112 > iBlob, 'F-112 debe seguir anexándose después del blob');
  assert.ok(
    iF117 > iF112,
    'F-117 debe ANEXARSE DESPUÉS de F-112, no anteponerse'
  );
  assert.ok(iIfPersona < iF117, 'la llamada debe ir dentro del `if (persona)`');

  const iNeedsPersona = ROUTE.search(/if\s*\(\s*needsPersona\s*\)\s*\{/);
  const iNeedsOffer = ROUTE.search(/if\s*\(\s*needsOffer\s*\)\s*\{/);
  assert.ok(iNeedsPersona >= 0 && iNeedsOffer > iNeedsPersona);
  assert.ok(iF117 > iNeedsPersona && iF117 < iNeedsOffer);
});

test('T-09 R-19 el blob `## BUYER PERSONA (APROBADO)` sigue INTACTO (F-117 complementa, no reemplaza)', () => {
  assert.match(
    ROUTE,
    /contextChain\s*\+=\s*['"]\\n\\n## BUYER PERSONA \(APROBADO\)\\n['"]\s*\+\s*\(\s*persona\.raw_text\s*\|\|\s*JSON\.stringify\(\s*persona\.content\s*\)\s*\)/
  );
});

test('T-09 R-19 la llamada usa el seam puro con el `step` y la fila `persona`', () => {
  assert.match(
    ROUTE,
    /buildPersonaDownstreamBlock\s*\(\s*\{[\s\S]*?step[\s\S]*?persona:\s*persona\s+as\s+RawPersonaRow[\s\S]*?\}\s*\)/
  );
  assert.match(
    ROUTE,
    /import\s*\{[\s\S]*?buildPersonaDownstreamBlock[\s\S]*?\}\s*from\s*['"]@\/lib\/personas\/method-context['"]/
  );
});

/* ================================================================== */
/*  R-01/R-19 — `needsBrief` y `needsOffer` intactos                   */
/* ================================================================== */

test('T-09 R-01 `needsBrief` conserva sus 10 steps (F-117 no lo toca)', () => {
  const brief = listaDeSteps('needsBrief');
  for (const s of [
    'buyer_persona',
    'ofv',
    'gbp_description',
    'gbp_posts',
    'campaign_copy',
    'website_home',
    'website_service',
    'website_location',
    'nurturing',
    'social_content'
  ]) {
    assert.ok(brief.includes(`'${s}'`), `needsBrief perdió ${s}`);
  }
  assert.equal((brief.match(/'/g) ?? []).length / 2, 10);
});

test('T-09 R-01 `needsOffer` conserva sus 8 steps, INCLUIDO `gbp_description` (CL-092 = brief + OFV)', () => {
  const offer = listaDeSteps('needsOffer');
  for (const s of [
    'gbp_description',
    'gbp_posts',
    'campaign_copy',
    'website_home',
    'website_service',
    'website_location',
    'nurturing',
    'social_content'
  ]) {
    assert.ok(offer.includes(`'${s}'`), `needsOffer perdió ${s}`);
  }
  assert.equal((offer.match(/'/g) ?? []).length / 2, 8);
});

/* ================================================================== */
/*  R-26 — F-110 / F-111 intactos                                      */
/* ================================================================== */

test('T-09 R-26 el bloque OFV de F-110/F-111 sigue intacto en la route', () => {
  assert.match(ROUTE, /contextChain\s*\+=\s*'\\nEntregables:/); // F-110
  assert.match(ROUTE, /contextChain\s*\+=\s*'\\nPrueba social:/); // F-110
  assert.match(ROUTE, /contextChain\s*\+=\s*buildOfvMethodLines/); // F-111
  assert.match(ROUTE, /pickCanonicalOffer\s*\(/); // F-109
  assert.match(ROUTE, /pickCanonicalContentRow\s*\(/); // F-113
});

test('T-09 ⭐ R-26 `OFV_METHOD_FIELDS_BY_STEP` sin altas ni bajas (F-111 no se toca)', () => {
  const i = OFFERS_METHOD_CONTEXT.indexOf('OFV_METHOD_FIELDS_BY_STEP');
  const bloque = OFFERS_METHOD_CONTEXT.slice(
    i,
    OFFERS_METHOD_CONTEXT.indexOf('} as const satisfies', i)
  );
  for (const s of [
    'website_home',
    'website_service',
    'website_location',
    'gbp_posts',
    'campaign_copy'
  ]) {
    assert.match(bloque, new RegExp(`${s}\\s*:\\s*\\[`), `F-111 perdió ${s}`);
  }
  assert.equal((bloque.match(/^\s*\w+\s*:\s*\[/gm) ?? []).length, 5);
});

/* ================================================================== */
/*  R-08 — CL-092 del lado ya conforme: `generate-gbp` sigue en 0      */
/* ================================================================== */

test('T-09 ⭐ R-08 `generate-gbp` y `src/lib/gbp-slice/*` siguen con 0 referencias a `buyer_personas`', () => {
  assert.equal(
    (GBP_ROUTE.match(/buyer_personas/g) ?? []).length,
    0,
    'CL-092: el otro camino al GBP nunca consumió la persona y no puede empezar ahora'
  );
  const dir = resolve(REPO, 'src/lib/gbp-slice');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(resolve(dir, f), 'utf8');
    assert.equal(
      (src.match(/buyer_personas/g) ?? []).length,
      0,
      `gbp-slice/${f} referencia buyer_personas`
    );
  }
});

/* ================================================================== */
/*  R-20 / R-23 — El NÚCLEO sin campos nuevos (CL-105)                 */
/* ================================================================== */

test('T-09 ⭐ R-20 el prompt `buyer_persona` es BYTE-IDÉNTICO a `HEAD` (F-117 no reintroduce campos al núcleo)', () => {
  const rel = 'prompts/buyer_persona/system_prompt.md';
  assert.equal(read(rel), head(rel));
});

/**
 * **⤫ F-120 — GUARD PREEXISTENTE RE-ANCLADO (no debilitado).** *(Mismo patrón e idéntica
 * doctrina que el ⤫ F-119 que este test llevaba, que el ⤫ F-117 R-24 sobre los guards de
 * F-113 y que los ⤫ F-118 de `f116`/`f117` — lección CL-107 / F-118 H-5 / F-119 R-37.
 * Autorización: `CL-103`, spec `specs/F-120/` R-45, previsto por escrito en `design.md`
 * §10.3 fila 2.)*
 *
 * **La primera mitad NO se toca y queda verde POR MÉRITO, no por evasión.** La intención de
 * R-20/R-23 (CL-105) es que **el NÚCLEO no gane campos**: `PersonaFields` y `emptyPersona`
 * byte-idénticos. F-120 añade la UI de `dream_result`, y `dream_result` **ya estaba** en el
 * tipo y en el estado inicial desde antes (§G-5) ⇒ el núcleo **no gana ni un campo** (R-32).
 * Ésa es exactamente la razón por la que este assert sobrevive intacto: (c) es **puro render**.
 *
 * **La segunda mitad se rompía MECÁNICAMENTE** al sacar el Brandboard de `page.tsx` (R-23):
 * el `assert.deepEqual` enumeraba las líneas eliminadas por F-119, y F-120 elimina otras. Se
 * re-ancla en dos sentidos:
 *
 *   1. el ancla deja de ser `2c072b6` y pasa a ser el **commit FIJO `76e7637`** (`main` antes
 *      de F-120) ⇒ verde en el working tree **SIN commit** y sensible a cualquier edición
 *      posterior. **Nunca `HEAD`**: contra `HEAD` volvería a verde por movimiento del ancla al
 *      commitear, afirmando algo ya falso (CL-107).
 *   2. el conjunto autorizado de eliminaciones pasa a ser **exactamente el bloque Brandboard**
 *      — import, `TabsTrigger` con su gate, `TabsContent`, `BrandboardTab` con sus 3 props —
 *      y nada más. El binding `ofvApproved` **NO** se elimina: sigue en uso en el tab de OFV
 *      (F-108 R-07), así que sale de la lista por mérito.
 *
 * **La intención se preserva íntegra (CL-105): el núcleo no gana campos, y sólo se elimina lo
 * autorizado.** Muerde: cualquier otra línea eliminada de la UI del núcleo deja esto rojo —
 * incluida cualquier consulta, cualquier `INSERT`, el aviso `GenerationSourceNotice` o un
 * eslabón de la cadena `briefApproved → personaApproved` (R-41).
 */
test('T-09 ⭐ R-20 (⤫ F-120) el NÚCLEO no gana campos: `PersonaFields`/`emptyPersona` BYTE-IDÉNTICOS a `76e7637`, y lo ÚNICO eliminado es el bloque Brandboard', () => {
  const BASE = '76e7637';
  const base = execFileSync('git', ['show', `${BASE}:${CORE_PAGE_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  const actual = read(CORE_PAGE_REL);
  /** Bloque `<decl> … {` … `}` balanceado por llaves. */
  const bloque = (src: string, marcador: string): string => {
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
  };
  // (1) La intención literal de R-20/R-23: el núcleo NO gana campos de persona.
  assert.equal(
    bloque(actual, 'interface PersonaFields'),
    bloque(base, 'interface PersonaFields'),
    'CL-105: el núcleo no puede ganar campos de persona'
  );
  assert.equal(
    bloque(actual, 'const emptyPersona'),
    bloque(base, 'const emptyPersona')
  );
  // (2) Alcance autorizado: el delta de F-120 no ELIMINA nada fuera del bloque Brandboard
  // (R-23). Todo lo demás de la feature es adición (la `<Field>` de `dream_result`).
  const diff = execFileSync('git', ['diff', BASE, '--', CORE_PAGE_REL], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  const eliminadas = diff
    .split('\n')
    .filter((l) => l.startsWith('-') && !l.startsWith('---'))
    .map((l) => l.slice(1).trim());
  assert.deepEqual(
    eliminadas.sort(),
    [
      '', // la línea en blanco que separaba el `TabsContent` del anterior
      '/>',
      '</TabsContent>',
      '</TabsTrigger>',
      "<TabsContent value='brandboard' className='mt-4'>",
      "<TabsTrigger value='brandboard' disabled={!ofvApproved}>",
      '<BrandboardTab',
      'clientId={clientId!}',
      "import { BrandboardTab } from './brandboard-tab';",
      'tenantId={tenantId!}',
      'userId={user!.id}',
      "{!ofvApproved && '🔒 '}Brandboard"
    ].sort(),
    'F-120 sólo puede ELIMINAR el bloque Brandboard de la pantalla del núcleo (R-23); ' +
      'cualquier otra línea eliminada de la UI del núcleo está fuera del alcance ' +
      'autorizado — incluidas las 3 consultas de carga, las 3 de señal `approved`, los 6 ' +
      '`INSERT`, el `GenerationSourceNotice` de F-119 y la cadena `briefApproved` → ' +
      '`personaApproved` (R-41)'
  );
  // Y el gate no se perdió: viajó con el tab. La contraparte (el `TabsTrigger` gateado
  // presente EN EL DESTINO) la exige `tests/onboarding/f117-declarations.test.ts` T-12 R-29.
  assert.ok(
    eliminadas.includes(
      "<TabsTrigger value='brandboard' disabled={!ofvApproved}>"
    ),
    'si el gate no aparece entre las líneas eliminadas del origen, el tab no se movió'
  );
});

test('T-09 ⭐ R-23 el contrato de F-112 sobrevive el refactor: exports, 10 etiquetas y `["ofv"]`', () => {
  for (const sym of [
    'PersonaMethodField',
    'PERSONA_METHOD_LABELS',
    'PERSONA_METHOD_HEADING',
    'NormalizedPersonaFields',
    'normalizePersonaMethodFields',
    'buildPersonaMethodBlock'
  ]) {
    assert.match(
      PERSONAS_METHOD_CONTEXT,
      new RegExp(`export\\s+(?:const|type|interface|function)\\s+${sym}\\b`),
      `F-112 perdió el export ${sym}`
    );
  }
  assert.match(
    PERSONAS_METHOD_CONTEXT,
    /export\s+const\s+PERSONA_METHOD_STEPS\s*=\s*\[\s*'ofv'\s*\]\s*as\s+const/,
    'PERSONA_METHOD_STEPS debe seguir siendo exactamente `["ofv"]` (DT-1)'
  );
  const i = PERSONAS_METHOD_CONTEXT.indexOf('PERSONA_METHOD_LABELS = [');
  const bloque = PERSONAS_METHOD_CONTEXT.slice(
    i,
    PERSONAS_METHOD_CONTEXT.indexOf('] as const satisfies', i)
  );
  assert.equal(
    (bloque.match(/\[\s*'[a-z][a-z0-9_]*'\s*,/g) ?? []).length,
    10,
    'el mapeo canónico persona→OFV tiene 10 campos, ni uno más'
  );
});

test('T-09 ⭐ R-10 el reparto de F-117 es DATO, con default-deny y sin `ofv` ni `gbp_description`', () => {
  const i = PERSONAS_METHOD_CONTEXT.indexOf(
    'PERSONA_DOWNSTREAM_FIELDS_BY_STEP = {'
  );
  assert.ok(
    i >= 0,
    'el reparto debe existir como DATO, no como condicionales inline'
  );
  const bloque = PERSONAS_METHOD_CONTEXT.slice(
    i,
    PERSONAS_METHOD_CONTEXT.indexOf('} as const satisfies', i)
  );
  for (const s of [
    'nurturing',
    'social_content',
    'website_home',
    'website_service',
    'website_location'
  ]) {
    assert.match(
      bloque,
      new RegExp(`^\\s*${s}\\s*:\\s*\\[`, 'm'),
      `falta ${s}`
    );
  }
  assert.equal((bloque.match(/^\s*\w+\s*:\s*\[/gm) ?? []).length, 5);
  // Los ausentes van declarados en el propio dato ("AUSENTES A PROPÓSITO"), no como
  // claves: si alguien los agregara como clave, el conteo de arriba se rompe.
  assert.match(bloque, /AUSENTES A PROPÓSITO/);
  assert.match(bloque, /CL-092/);
  // Y el reparto reutiliza la fuente única del filtro `[PENDIENTE]` (R-15).
  assert.match(
    PERSONAS_METHOD_CONTEXT,
    /import\s*\{[\s\S]*?cleanScalar[\s\S]*?\}\s*from\s*['"]\.\.\/method-context\/pending\.ts['"]/
  );
  assert.ok(
    !/function\s+cleanScalar/.test(PERSONAS_METHOD_CONTEXT),
    'R-15: el filtro `[PENDIENTE]` no se re-implementa, se importa'
  );
});

test('T-09 R-12 el canon de `social_content` (ARC7, no ARC5) queda CITADO en el dato', () => {
  const i = PERSONAS_METHOD_CONTEXT.indexOf(
    'PERSONA_DOWNSTREAM_FIELDS_BY_STEP = {'
  );
  const bloque = PERSONAS_METHOD_CONTEXT.slice(
    i,
    PERSONAS_METHOD_CONTEXT.indexOf('} as const satisfies', i)
  );
  assert.match(bloque, /ARC5/);
  assert.match(bloque, /ARC7/);
  assert.match(bloque, /nurturing\.md|social-content\.md|landing-structure/);
});

/* ================================================================== */
/*  R-27 — Sin DDL, sin `delete`, sin migraciones                      */
/* ================================================================== */

test('T-09 ⭐ R-27 los archivos que F-117 toca no introducen DDL ni `.delete(`', () => {
  for (const [rel, src] of [
    [ROUTE_REL, ROUTE],
    [EDGE_REL, EDGE],
    ['src/lib/personas/method-context.ts', PERSONAS_METHOD_CONTEXT]
  ] as const) {
    assert.ok(!/\.delete\(/.test(src), `${rel} introdujo un delete`);
    assert.ok(
      !/\b(DROP|ALTER)\s+TABLE\b|\bCREATE\s+TABLE\b/i.test(src),
      `${rel} introdujo DDL`
    );
  }
});

test('T-09 R-27 F-117 no introduce ninguna migración nueva', () => {
  const dir = resolve(REPO, 'supabase/migrations');
  const ahora = readdirSync(dir).sort();
  const enHead = execFileSync(
    'git',
    ['ls-tree', '--name-only', 'HEAD', 'supabase/migrations/'],
    { cwd: REPO, encoding: 'utf8' }
  )
    .split('\n')
    .filter(Boolean)
    .map((p) => p.split('/').pop() as string)
    .sort();
  assert.deepEqual(ahora, enHead);
});
