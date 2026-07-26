/**
 * F-114 — T-12 — No-regresión y SOURCE-GUARD del acoplamiento prompt↔código.
 *
 * F-114 es un cambio de CONTENIDO de prompt: **sin código de app, sin DDL, sin
 * delete, sin bump de `meta.json`**. Este test fija esa frontera y, sobre todo, el
 * **acoplamiento deseado pero silencioso** que introduce el anclaje (R-30):
 *
 *   los 7 prompts CITAN los literales `## OFERTA DE VALOR (APROBADA)`, `Urgencia:` y
 *   `Decision Frame:` que emiten `generate-content/route.ts` y
 *   `src/lib/offers/method-context.ts`.
 *
 * SI alguien renombra una de esas etiquetas en el código, o AMPLÍA el reparto de
 * CL-094, el anclaje del prompt queda apuntando a la nada **sin ninguna señal**. Este
 * test convierte ese silencio en rojo.
 *
 * Test puro: `fs`-read de prompts y código fuente + import del reparto. Sin LLM, sin
 * red, sin DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// El reparto se IMPORTA (no se re-escribe como literal): ampliarlo o recortarlo pone
// este test rojo, que es exactamente el freno que R-30 pide.
import { OFV_METHOD_FIELDS_BY_STEP } from '../../src/lib/offers/method-context.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

const ROUTE = readFileSync(
  resolve(ROOT, 'src/app/api/generate-content/route.ts'),
  'utf8'
);
const METHOD_CONTEXT = readFileSync(
  resolve(ROOT, 'src/lib/offers/method-context.ts'),
  'utf8'
);

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

function prompt(step: string): string {
  return readFileSync(
    resolve(ROOT, 'prompts', step, 'system_prompt.md'),
    'utf8'
  );
}

/* ---- (a) las Fases 2-3 (F-104 / F-106 / F-112) quedan intactas (R-26) ---------- */

test('T-12(a) R-26 `prompts/ofv/system_prompt.md` conserva sus anclas de F-104 y F-112', () => {
  const OFV = prompt('ofv');
  assert.match(
    OFV,
    /PRINCIPIO DE HONESTIDAD \(transversal a las 8 secciones\)/,
    'F-114 alteró el PRINCIPIO DE HONESTIDAD de la OFV (F-104)'
  );
  assert.match(
    OFV,
    /^8\. SOCIAL PROOF$/m,
    'F-114 alteró la Sección 8 de la OFV (F-104)'
  );
  assert.match(
    OFV,
    /PROHIBIDO fabricar testimonios/,
    'F-114 alteró la prohibición de la Sección 8 de la OFV (F-104)'
  );
  assert.match(
    OFV,
    /MAPEO CAMPO-A-CAMPO PERSONA→OFV/,
    'F-114 alteró el mapeo campo-a-campo de la OFV (F-112)'
  );
  assert.match(
    OFV,
    /NO fabricar escasez falsa/,
    'F-114 alteró la Sección 7 URGENCIA / ESCASEZ de la OFV (doctrina)'
  );
  assert.match(
    OFV,
    /OUTPUT: JSON con 8 secciones \+ raw_text markdown\./,
    'F-114 alteró el contrato de output de la OFV'
  );
});

test('T-12(a) R-26 `buyer_persona` y `brief` conservan sus anclas (F-106 / F-101)', () => {
  const PERSONA = prompt('buyer_persona');
  assert.match(
    PERSONA,
    /PRINCIPIO \(transversal a los 12 bloques\)/,
    'F-114 alteró el principio de la buyer persona (F-106)'
  );
  assert.match(
    PERSONA,
    /JAMÁS fabricar hechos duros del negocio/,
    'F-114 alteró la regla de no-fabricación de la buyer persona (F-106)'
  );
  assert.match(
    PERSONA,
    /OUTPUT: JSON con 12 bloques \+ raw_text markdown\./,
    'F-114 alteró el contrato de output de la buyer persona'
  );

  const BRIEF = prompt('brief');
  assert.match(
    BRIEF,
    /NO inventes datos\. Si falta información, marca como \[PENDIENTE\]/,
    'F-114 alteró la regla de no-invención del brief'
  );
  assert.match(
    BRIEF,
    /OUTPUT: JSON con los 5 bloques \+ raw_text en markdown\./,
    'F-114 alteró el contrato de output del brief'
  );
});

/* ---- (b) SOURCE-GUARDS del acoplamiento prompt↔código (R-27, R-28, R-30) ------- */

test('T-12(b) ⭐ R-30 `route.ts` sigue emitiendo el literal `## OFERTA DE VALOR (APROBADA)` que los 7 prompts citan', () => {
  assert.ok(
    ROUTE.includes('## OFERTA DE VALOR (APROBADA)'),
    'el heading del bloque OFV cambió en `route.ts`: el anclaje de los 7 prompts de F-114 quedó apuntando a la nada'
  );
  // …y los 7 prompts lo citan de verdad (los dos lados del acoplamiento, en un test).
  for (const step of CONTENT_STEPS.filter((s) => s !== 'gbp_description')) {
    assert.ok(
      prompt(step).includes('## OFERTA DE VALOR (APROBADA)'),
      `${step}: dejó de citar el heading literal del bloque OFV`
    );
  }
});

test('T-12(b) ⭐ R-30 `method-context.ts` sigue emitiendo las etiquetas `Urgencia: ` y `Decision Frame: `', () => {
  assert.match(
    METHOD_CONTEXT,
    /'\\nUrgencia: '/,
    'la etiqueta `Urgencia: ` cambió en `method-context.ts`: el anclaje de F-114 se rompe en silencio'
  );
  assert.match(
    METHOD_CONTEXT,
    /'\\nDecision Frame: '/,
    'la etiqueta `Decision Frame: ` cambió en `method-context.ts`: el anclaje de F-114 se rompe en silencio'
  );
});

test('T-12(b) R-28 el reparto de CL-094 sigue siendo EXACTAMENTE los 5 steps (F-114 no lo toca)', () => {
  assert.deepStrictEqual(
    Object.keys(OFV_METHOD_FIELDS_BY_STEP).sort(),
    [
      'campaign_copy',
      'gbp_posts',
      'website_home',
      'website_location',
      'website_service'
    ],
    'cambió el reparto de `OFV_METHOD_FIELDS_BY_STEP`: revisar los `INPUTS:` de F-114, que declaran Decision Frame/Urgencia SOLO a los 5 del reparto'
  );
  for (const excluido of ['nurturing', 'social_content', 'gbp_description']) {
    assert.ok(
      !(excluido in OFV_METHOD_FIELDS_BY_STEP),
      `\`${excluido}\` entró al reparto: su prompt NO declara Decision Frame/Urgencia (CL-094 lo retiene a propósito)`
    );
  }
  for (const fields of Object.values(OFV_METHOD_FIELDS_BY_STEP)) {
    assert.deepStrictEqual(
      [...fields].sort(),
      ['decision_frame', 'urgency'],
      'cambiaron los campos repartidos por step'
    );
  }
});

test('T-12(b) R-27 F-114 no toca el read-path de `generate-content` (sigue resolviendo por step + active)', () => {
  assert.match(
    ROUTE,
    /\.from\('prompt_versions'\)/,
    'ya no consulta prompt_versions'
  );
  assert.match(
    ROUTE,
    /\.eq\('step', step\)/,
    'ya no filtra la resolución por step'
  );
  assert.match(
    ROUTE,
    /\.eq\('active', true\)/,
    'ya no filtra la resolución por active=true'
  );
  assert.match(ROUTE, /buildOfvMethodLines\(/, 'ya no invoca el seam de F-111');
});

/* ---- (c) los 8 `meta.json` sin cambios: `version` sigue en 1 (R-29 / DT-5) ----- */

test('T-12(c) R-29 los 8 `meta.json` conservan `version: 1` y sus campos', () => {
  const METHODOLOGY: Record<string, string> = {
    gbp_posts: 'c3_sales_framework',
    campaign_copy: 'c3_sales_framework',
    website_home: 'c3_seo_method',
    website_service: 'c3_seo_method',
    website_location: 'c3_seo_method',
    nurturing: 'c3_sales_framework',
    social_content: 'c3_sales_framework',
    gbp_description: 'c3_value_method'
  };
  for (const step of CONTENT_STEPS) {
    const meta = JSON.parse(
      readFileSync(resolve(ROOT, 'prompts', step, 'meta.json'), 'utf8')
    );
    // Bumpear alteraría el dato de desempate de `order('version' desc).limit(1)`,
    // un mecanismo cerrado en F-112 (DT-9). F-114 tocaría 8 filas a la vez.
    assert.equal(
      meta.version,
      1,
      `${step}: se bumpeó meta.json.version (prohibido, R-29)`
    );
    assert.equal(meta.step, step, `${step}: cambió el campo step`);
    assert.equal(
      meta.methodology,
      METHODOLOGY[step],
      `${step}: cambió la methodology`
    );
    assert.equal(meta.vertical, null, `${step}: cambió vertical`);
    assert.equal(
      meta.validation_rules,
      null,
      `${step}: cambió validation_rules`
    );
    assert.equal(meta.tenant, '__primary__', `${step}: cambió el tenant`);
  }
});

/* ---- (d) sin migraciones / DDL (R-28) ----------------------------------------- */

test('T-12(d) R-28 F-114 no introduce migración ni DDL nueva', () => {
  const migDir = resolve(ROOT, 'supabase/migrations');
  if (existsSync(migDir)) {
    const f114 = readdirSync(migDir).filter((f) => /f[-_]?114/i.test(f));
    assert.deepStrictEqual(
      f114,
      [],
      `F-114 no debe añadir migraciones; encontradas: ${f114.join(', ')}`
    );
  }
});
