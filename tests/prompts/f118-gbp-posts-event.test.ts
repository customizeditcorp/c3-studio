/**
 * F-118 T-12 — Cierre PROMPT-SIDE de los dos hallazgos de CL-101:
 *   (1) `gbp_posts`: el tipo `EVENT` queda CONDICIONADO a hechos reales, de forma ADITIVA
 *       (la línea `3. EVENT — Eventos con fecha y hora` queda BYTE-IDÉNTICA — H-2), y la
 *       línea 24 (`Variedad de tipos de posts…`) queda NEUTRALIZADA. R-29..R-32.
 *   (2) los 8 prompts de contenido generalizan la prohibición del marcador de faltante a
 *       CUALQUIER idioma y CUALQUIER forma, preservando verbatim la sub-frase que fija
 *       `f114-content-honesty` T-11(f). R-19/R-20.
 *
 * Asserts whitespace-tolerantes (el hook husky/prettier reformatea al commit).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

const CONTENT_STEPS = [
  'gbp_description',
  'gbp_posts',
  'campaign_copy',
  'website_home',
  'website_service',
  'website_location',
  'nurturing',
  'social_content'
];

const P: Record<string, string> = {};
for (const step of CONTENT_STEPS) {
  P[step] = readFileSync(
    resolve(REPO, `prompts/${step}/system_prompt.md`),
    'utf8'
  );
}

/* ================================================================================ */
/*  R-29 / H-2 — EVENT condicionado ADITIVAMENTE                                     */
/* ================================================================================ */

test('T-12 ⭐ R-29 (H-2) la línea `3. EVENT — Eventos con fecha y hora` sigue BYTE-IDÉNTICA', () => {
  // `f114-content-honesty.test.ts:278` la fija byte-exacta ("debe quedar intacto como tipo
  // válido del canal"). F-118 condiciona el tipo SIN reescribir esa línea: el precedente es
  // el mismo que F-116 aplicó a la línea `OUTPUT:` de los 3 prompts del núcleo.
  assert.match(
    P['gbp_posts'],
    /^3\. EVENT — Eventos con fecha y hora$/m,
    'se reescribió la línea del tipo EVENT (pondría rojo un test preexistente)'
  );
});

test('T-12 ⭐ R-29 la condición de EVENT existe, es ADYACENTE y exige fecha, hora y lugar REALES', () => {
  const lines = P['gbp_posts'].split('\n');
  const idx = lines.findIndex((l) =>
    /^3\. EVENT — Eventos con fecha y hora$/.test(l)
  );
  assert.ok(idx > -1, 'no se encontró la línea del tipo EVENT');
  const next = lines[idx + 1] ?? '';
  assert.match(
    next,
    /Condición\s+de\s+EVENT/,
    'la condición de EVENT no está en la línea inmediatamente adyacente'
  );
  // Exige los TRES hechos duros que ningún input entrega hoy.
  assert.match(next, /fecha/i);
  assert.match(next, /hora/i);
  assert.match(next, /lugar/i);
  assert.match(next, /REALES/);
  // …e instruye SUSTITUIR, conservando los 4 posts (no amputa el tipo, DT-3 de F-114).
  assert.match(next, /UPDATE\s*o\s*WHAT_IS_NEW/);
  assert.match(next, /conservando\s+los\s+4\s+posts/);
  // …y cierra las dos salidas fabricadoras: inventar, o poner un marcador.
  assert.match(next, /NUNCA\s+inventes/i);
  assert.match(next, /marcador\s+de\s+faltante/i);
});

/* ================================================================================ */
/*  R-30 — la enmienda T-13b de F-114 NO se revierte                                 */
/* ================================================================================ */

test('T-12 ⭐ R-30 la línea `2. OFFER —` sigue SIN `EVENT` y con sustitutos exactos', () => {
  const offer = /^2\. OFFER —.*$/m.exec(P['gbp_posts']);
  assert.ok(offer, 'desapareció la línea del tipo OFFER');
  assert.ok(
    !/EVENT/.test(offer[0]),
    'EVENT volvió a la lista de sustitutos de OFFER: F-118 REFUERZA la enmienda T-13b, no la revierte'
  );
  assert.match(offer[0], /UPDATE\s*o\s*WHAT_IS_NEW/);
});

/* ================================================================================ */
/*  R-31 — la línea 24 neutralizada (la contradicción interna se elimina)             */
/* ================================================================================ */

test('T-12 ⭐ R-31 `Variedad de tipos de posts` deja de ser un tirón incondicional', () => {
  const text = P['gbp_posts'];
  // La forma INCONDICIONAL preexistente ya no existe…
  assert.ok(
    !/^- Variedad de tipos de posts \(no solo ofertas\)$/m.test(text),
    'la línea 24 sigue empujando hacia otros tipos sin condición (el residuo estocástico que CL-101 confirmó)'
  );
  // …y la variedad queda subordinada al material real disponible.
  const linea = /^- Variedad de tipos de posts.*$/m.exec(text);
  assert.ok(
    linea,
    'desapareció la línea de variedad (se amputó en vez de subordinarse)'
  );
  assert.match(
    linea[0],
    /subordinada\s+al\s+material\s+real\s+disponible/,
    'la variedad no quedó subordinada al material real'
  );
  assert.match(
    linea[0],
    /hechos\s+duros/,
    'la línea no nombra el criterio (los hechos duros que el contexto debe proveer)'
  );
  // Sigue viva la sección que la contiene (no se degradó el prompt).
  assert.match(text, /^REGLAS SEO LOCAL:$/m);
});

test('T-12 ⭐ R-29/R-31 las DOS ediciones coexisten: no queda contradicción dentro del archivo', () => {
  // Con sólo una de las dos, el archivo diría "varía los tipos" y "pero este tipo casi
  // nunca" — la contradicción de instrucciones que es la causa raíz de toda la cadena
  // (F-104 §1, F-114 hallazgo 3). Este test exige AMBAS.
  const text = P['gbp_posts'];
  assert.match(text, /Condición\s+de\s+EVENT/);
  assert.match(text, /Variedad de tipos de posts[^\n]*subordinada/);
});

/* ================================================================================ */
/*  R-32 — el contrato de output de `gbp_posts` intacto                              */
/* ================================================================================ */

test('T-12 ⭐ R-32 el contrato de output sigue siendo 4 posts, y `EVENT` sigue en el enum de tipos', () => {
  const text = P['gbp_posts'];
  assert.match(
    text,
    /^OUTPUT: JSON array con 4 posts \(1 semana de contenido\) cada uno con: content, cta_type, cta_url_suggestion, photo_suggestion, post_type\.$/m,
    'cambió el contrato de output (F-114 R-07/R-25 lo congela)'
  );
  // Los 4 tipos siguen declarados: se condiciona, no se amputa.
  for (const t of [
    /^1\. UPDATE —/m,
    /^2\. OFFER —/m,
    /^3\. EVENT —/m,
    /^4\. WHAT_IS_NEW —/m
  ]) {
    assert.match(text, t, `desapareció un tipo de post: ${t}`);
  }
});

/* ================================================================================ */
/*  R-19 / R-20 — el marcador generalizado en los 8 prompts                           */
/* ================================================================================ */

test('T-12 ⭐ R-19 los 8 prompts PRESERVAN VERBATIM la sub-frase que fija `f114` T-11(f)', () => {
  for (const step of CONTENT_STEPS) {
    assert.match(
      P[step],
      /NO\s+escribas\s+marcadores\s+de\s+faltante\s+como\s+\[PENDIENTE\]/,
      `${step}: se reescribió la sub-frase de F-114 (pondría rojo T-11(f))`
    );
  }
});

test('T-12 ⭐ R-19 los 8 prompts EXTIENDEN la prohibición a cualquier idioma y cualquier forma', () => {
  for (const step of CONTENT_STEPS) {
    const text = P[step];
    assert.match(
      text,
      /EN\s+NING[UÚ]N\s+IDIOMA/i,
      `${step}: la prohibición no se generalizó a cualquier idioma (hallazgo 1 de CL-101)`
    );
    assert.match(
      text,
      /est[eé]\s+entre\s+corchetes\s+o\s+no/i,
      `${step}: la prohibición sigue atada a la forma con corchetes`
    );
    // Con ejemplos concretos, incluida la variante EXACTA que el modelo emitió en vivo.
    assert.match(
      text,
      /\[PENDING\]/,
      `${step}: falta el ejemplo observado en CL-101`
    );
    assert.match(
      text,
      /\bTBD\b/,
      `${step}: falta el ejemplo no-corchetado TBD`
    );
    // Y la degradación correcta sigue siendo OMITIR (no marcar) — no se invirtió F-114.
    assert.match(
      text,
      /OM[IÍ]TELO|Omitir\s+lo\s+genuinamente\s+ausente/,
      `${step}: se perdió la instrucción de degradación por omisión`
    );
  }
});

test('T-12 ⭐ R-20 toda ocurrencia de `[PENDIENTE` queda bajo una negación `NO` (contrato de T-11(f))', () => {
  // Réplica EXACTA del assert negativo preexistente: si la generalización hubiera
  // introducido una ocurrencia sin negación cercana, este test lo dice con el mensaje
  // correcto en vez de descubrirlo en rojo ajeno.
  for (const step of CONTENT_STEPS) {
    const text = P[step];
    let idx = text.indexOf('[PENDIENTE');
    let n = 0;
    while (idx !== -1) {
      n++;
      const before = text.slice(Math.max(0, idx - 80), idx);
      assert.ok(
        /\bNO\b/.test(before),
        `${step}: [PENDIENTE] sin negación en los 80 chars previos`
      );
      idx = text.indexOf('[PENDIENTE', idx + 1);
    }
    assert.equal(
      n,
      1,
      `${step}: la generalización no debía multiplicar el literal [PENDIENTE`
    );
  }
});

test('T-12 R-19 la generalización es de UNA línea por archivo (edición aditiva sobre la misma frase)', () => {
  for (const step of CONTENT_STEPS) {
    const lines = P[step].split('\n');
    const hits = lines.filter((l) =>
      /NO\s+escribas\s+marcadores\s+de\s+faltante/.test(l)
    );
    assert.equal(
      hits.length,
      1,
      `${step}: la regla del marcador aparece en más de una línea`
    );
    assert.match(
      hits[0],
      /EN\s+NING[UÚ]N\s+IDIOMA/i,
      `${step}: la extensión no vive en la MISMA línea que la sub-frase preservada`
    );
  }
});

/* ================================================================================ */
/*  R-36 — sin bump de versión                                                       */
/* ================================================================================ */

test('T-12 R-36 los 8 `meta.json` de contenido siguen en `version: 1` (sin bump)', () => {
  for (const step of CONTENT_STEPS) {
    const meta = JSON.parse(
      readFileSync(resolve(REPO, `prompts/${step}/meta.json`), 'utf8')
    );
    assert.equal(meta.version, 1, `${step}: se bumpeó meta.json.version`);
  }
});
