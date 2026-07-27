/**
 * F-118 T-05 — Core PURO del guard de fabricación en copy publicable
 * (`src/lib/content/non-fabrication.ts` + `detectMissingMarkers` de
 * `src/lib/method-context/pending.ts`). Runner: node:test + node:assert/strict.
 *
 * Cubre R-01..R-13, R-18, R-38 y el ⭐ CRITERIO ANTI-NO-OP de R-40 con los outputs REALES
 * documentados en el ledger.
 *
 * Dos reglas de construcción de este archivo, que son parte de lo que prueba:
 *   1. **El grounding NO se hardcodea.** Cada test que necesita grounding lo construye con
 *      `resolveContentGrounding()` sobre un `contextChain` SINTÉTICO escrito con las líneas
 *      literales que emite `buildOfvMethodLines` (`\nUrgencia: ` / `\nDecision Frame: `).
 *      Si esos prefijos cambian, el grounding se vacía y estos tests lo notan.
 *   2. **El veredicto no se hardcodea como constante**: siempre sale de
 *      `checkContentNonFabrication`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveContentGrounding,
  collectContentText,
  detectContentFabrication,
  checkContentNonFabrication,
  improvesStrictly,
  buildContentFabricationRetryDirective,
  formatContentFabricationWarning,
  type ContentFabricationKind,
  type ContentNonFabricationResult
} from '../../src/lib/content/non-fabrication.ts';
import { detectMissingMarkers } from '../../src/lib/method-context/pending.ts';

/* ================================================================================ */
/*  Contextos sintéticos — con las líneas LITERALES que emite `buildOfvMethodLines`  */
/* ================================================================================ */

/** El bloque OFV tal como lo arma `route.ts` para JD Valley (urgencia REAL, CL-101). */
const CTX_JD_VALLEY =
  '## DATOS DEL CLIENTE\nNegocio: JD Valley Painting\nTelefono: 555-15-1500\n' +
  '\n\n## OFERTA DE VALOR (APROBADA)\nBig Promise: Tu casa pintada en 5 dias' +
  '\nVehiculo: Painting Sprint — 15 anios de experiencia' +
  '\nPrueba social: over 50 satisfied clients | 150% increase in visibility' +
  '\nDecision Frame: A (entrada): consulta | B (recomendado): full interior | C (status quo): esperar' +
  '\nUrgencia: Solo 5 espacios disponibles este mes';

/** Cliente SIN OFV aprobada (control negativo, CL-101 b): no hay rebanada promocional. */
const CTX_SIN_OFV =
  '## DATOS DEL CLIENTE\nNegocio: Customize It\nTelefono: 305-555-1500\n' +
  '\n\n## INPUT ADICIONAL DEL OPERADOR\nSin datos adicionales.';

const G_JD = resolveContentGrounding(CTX_JD_VALLEY);
const G_NONE = resolveContentGrounding(CTX_SIN_OFV);

const kinds = (r: ContentNonFabricationResult): ContentFabricationKind[] =>
  r.signals.map((s) => s.kind);

/* ================================================================================ */
/*  R-04/R-05/R-06 — grounding present-only ESTRECHO (la inversión frente a F-105)   */
/* ================================================================================ */

test('T-05 R-05 el grounding sale SÓLO de `Urgencia:` / `Decision Frame:`, no del contextChain', () => {
  // Lo que SÍ entra: el texto de las dos líneas del reparto de F-111.
  assert.match(G_JD.promotional, /Solo 5 espacios disponibles este mes/);
  assert.match(G_JD.promotional, /full interior/);
  // Lo que NO entra: brief, teléfono, prueba social, big promise, vehículo.
  assert.doesNotMatch(G_JD.promotional, /JD Valley Painting/);
  assert.doesNotMatch(G_JD.promotional, /Prueba social/);
  assert.doesNotMatch(G_JD.promotional, /Big Promise/);
  // ⭐ El digit-set es ESTRECHO: '5' (de la urgencia) sí; '15' (del teléfono y de
  // "15 anios de experiencia") NO. Ése es exactamente el agujero de falso-negativo que
  // el digit-set GLOBAL de F-105 dejaría abierto para un `15% discount`.
  assert.equal(G_JD.digits.has('5'), true);
  assert.equal(G_JD.digits.has('15'), false);
  assert.equal(G_JD.digits.has('555'), false);
  assert.equal(G_JD.digits.has('50'), false);
});

test('T-05 R-06 sin rebanada promocional ⇒ grounding vacío ⇒ toda señal `commitment` se marca', () => {
  assert.equal(G_NONE.promotional, '');
  assert.equal(G_NONE.digits.size, 0);
  const r = checkContentNonFabrication(
    { post: 'Only 3 spots left! Special offer for new clients.' },
    G_NONE,
    'nurturing'
  );
  assert.equal(r.ok, false);
  assert.equal(r.tier, 'commitment');
  // la numérica NO groundea (digit-set vacío) y el genérico tampoco (rebanada vacía).
  assert.ok(r.signals.length >= 2, JSON.stringify(r.signals));
});

test('T-05 R-04 present-only: entrada no-string o vacía ⇒ grounding vacío, nunca inventado', () => {
  for (const bad of [undefined, null, 42, {}, []]) {
    const g = resolveContentGrounding(bad);
    assert.equal(g.promotional, '');
    assert.equal(g.digits.size, 0);
  }
});

test('T-05 R-05 el `## INPUT ADICIONAL DEL OPERADOR` NO es fuente de grounding (FP-1 declarado)', () => {
  const ctx =
    CTX_SIN_OFV +
    '\n\n## INPUT ADICIONAL DEL OPERADOR\n{ "post_topic": "20% discount this week" }';
  const g = resolveContentGrounding(ctx);
  assert.equal(g.promotional, '');
  const r = checkContentNonFabrication(
    { post: 'Get a 20% discount this week' },
    g,
    'gbp_posts'
  );
  assert.equal(
    r.ok,
    false,
    'la promoción escrita por el operador NO groundea (R-05)'
  );
});

/* ================================================================================ */
/*  R-01 — la puerta rectora INVERTIDA: el empate va al flag                         */
/* ================================================================================ */

test('T-05 ⭐ R-01 empate ⇒ FLAG (inverso exacto de F-105 R-04 "ante la duda, no marcar")', () => {
  // Señal SIN dígitos y que NO es un genérico de la banlist: no hay forma de establecer
  // grounding present-only para ella ⇒ se marca, aunque la rebanada promocional exista.
  const r = checkContentNonFabrication(
    { post: 'Book now — offer expires soon' },
    G_JD,
    'gbp_posts'
  );
  assert.equal(r.ok, false, 'la duda debe ir al flag, no al pase');
  assert.ok(kinds(r).indexOf('deadline') !== -1, JSON.stringify(r.signals));
});

/* ================================================================================ */
/*  R-02 — dos tiers, con tratamiento distinto                                       */
/* ================================================================================ */

test('T-05 R-02 tiering: discount/scarcity/deadline = `commitment`; marker/event = `publication_defect`', () => {
  const commitment = detectContentFabrication(
    '15% off, only 4 spots left, offer expires Friday',
    'gbp_posts'
  );
  for (const s of commitment) {
    if (s.kind !== 'missing_marker' && s.kind !== 'event_datetime') {
      assert.equal(s.tier, 'commitment', s.kind + ' debe ser commitment');
    }
  }
  const defects = detectContentFabrication(
    'Join us [PENDING] at 10:30 am',
    'gbp_posts'
  );
  const byKind: Record<string, string> = {};
  for (const s of defects) byKind[s.kind] = s.tier;
  assert.equal(byKind['missing_marker'], 'publication_defect');
  assert.equal(byKind['event_datetime'], 'publication_defect');
});

test('T-05 R-02 `tier` del resultado = el MÁXIMO presente (commitment > publication_defect)', () => {
  const mixed = checkContentNonFabrication(
    { a: 'Date: [PENDING]', b: 'Get a 15% discount' },
    G_JD,
    'gbp_posts'
  );
  assert.equal(mixed.tier, 'commitment');
  const onlyDefect = checkContentNonFabrication(
    { a: 'Date: [PENDING]' },
    G_JD,
    'gbp_posts'
  );
  assert.equal(onlyDefect.tier, 'publication_defect');
  const clean = checkContentNonFabrication(
    { a: 'Pintamos tu casa' },
    G_JD,
    'gbp_posts'
  );
  assert.equal(clean.ok, true);
  assert.equal(clean.tier, null);
});

/* ================================================================================ */
/*  R-10/R-11 — las 5 clases, y el límite deliberado de `discount`                    */
/* ================================================================================ */

test('T-05 R-10 las 5 clases se detectan, cada una con su forma', () => {
  const cases: [string, ContentFabricationKind][] = [
    ['Get 15% off today', 'discount'],
    ['descuento del 20% en interiores', 'discount'],
    ['aprovecha el 2x1', 'discount'],
    ['Only 3 spots left', 'scarcity'],
    ['Solo 4 cupos disponibles', 'scarcity'],
    ['Por tiempo limitado', 'scarcity'],
    ['book by the end of this month', 'deadline'],
    ['oferta valida hasta el viernes', 'deadline'],
    ['nos vemos a las 10:30 am', 'event_datetime'],
    ['el evento es el 12/09', 'event_datetime'],
    ['Location: [PENDING]', 'missing_marker']
  ];
  for (const [text, kind] of cases) {
    const found = detectContentFabrication(text, 'gbp_posts').map(
      (s) => s.kind
    );
    assert.ok(
      found.indexOf(kind) !== -1,
      `"${text}" debía dar ${kind}, dio ${found.join(',')}`
    );
  }
});

test('T-05 ⭐ R-11 `discount` exige SEMÁNTICA: un porcentaje desnudo NO es una promoción', () => {
  // El caso real: `150% increase in visibility` es prueba social (R-12.1, fuera de scope),
  // no un descuento. Detectarlo produciría un FP sistemático sobre output ya observado.
  for (const bare of [
    '150% increase in visibility',
    'aumentamos 30% las visitas',
    '100% satisfaccion garantizada'
  ]) {
    const found = detectContentFabrication(bare, 'gbp_posts').map(
      (s) => s.kind
    );
    assert.equal(
      found.indexOf('discount'),
      -1,
      `"${bare}" no debe ser discount`
    );
  }
  // …y la forma CON semántica sí se detecta.
  assert.ok(
    detectContentFabrication('15% discount', 'gbp_posts').some(
      (s) => s.kind === 'discount'
    )
  );
});

test('T-05 R-10 `event_datetime` está gateada por step: sólo `gbp_posts` (design DT-2)', () => {
  const text = 'Te esperamos el 12/09 a las 10:30 am';
  const inPosts = detectContentFabrication(text, 'gbp_posts').map(
    (s) => s.kind
  );
  assert.ok(inPosts.indexOf('event_datetime') !== -1);
  for (const step of [
    'nurturing',
    'website_home',
    'social_content',
    'campaign_copy'
  ]) {
    const out = detectContentFabrication(text, step).map((s) => s.kind);
    assert.equal(out.indexOf('event_datetime'), -1, step);
  }
});

/* ================================================================================ */
/*  R-07/R-08 — cómo pasa una señal legítima                                          */
/* ================================================================================ */

test('T-05 R-07 señal numérica con su run de dígitos en la rebanada ⇒ NO se marca', () => {
  const r = checkContentNonFabrication(
    { post: 'Only 5 spots available this month' },
    G_JD,
    'gbp_posts'
  );
  assert.equal(r.ok, true, JSON.stringify(r.signals));
});

test('T-05 R-08 genérico de la banlist F-114: pasa con rebanada NO vacía, se marca con rebanada vacía', () => {
  const withOfv = checkContentNonFabrication(
    { post: 'Oferta especial para vecinos del barrio' },
    G_JD,
    'gbp_posts'
  );
  assert.equal(
    withOfv.ok,
    true,
    'con fuente promocional real, el genérico pasa (R-08)'
  );
  const withoutOfv = checkContentNonFabrication(
    { post: 'Oferta especial para vecinos del barrio' },
    G_NONE,
    'gbp_posts'
  );
  assert.equal(
    withoutOfv.ok,
    false,
    'sin fuente promocional, el genérico se marca (R-08)'
  );
});

test('T-05 R-09 el core NO audita la veracidad de la OFV: una promoción presente en la rebanada PASA', () => {
  // Límite de claim declarado: el contenido queda FIEL, no VERDADERO (CL-101 d).
  const g = resolveContentGrounding(
    '## OFERTA DE VALOR (APROBADA)\nUrgencia: 40% de descuento hasta agotar cupos'
  );
  const r = checkContentNonFabrication(
    { post: 'Get 40% off now' },
    g,
    'gbp_posts'
  );
  assert.equal(
    r.ok,
    true,
    'la OFV es la fuente; su veracidad es trabajo de otro guard'
  );
});

/* ================================================================================ */
/*  R-13 — recorrido de leaves robusto, URLs y metadata fuera                         */
/* ================================================================================ */

test('T-05 R-13 `collectContentText` tolera cualquier shape y NUNCA lanza', () => {
  assert.deepEqual(collectContentText(null), []);
  assert.deepEqual(collectContentText(undefined), []);
  assert.deepEqual(collectContentText('hola'), ['hola']);
  assert.deepEqual(collectContentText(7), ['7']);
  assert.deepEqual(collectContentText(true), ['true']);
  assert.deepEqual(collectContentText([{ a: 'x' }, ['y'], null]), ['x', 'y']);
  const cyclic: Record<string, unknown> = { a: 'z' };
  cyclic.self = cyclic;
  assert.doesNotThrow(() => collectContentText(cyclic));
  assert.ok(collectContentText(cyclic).indexOf('z') !== -1);
});

test('T-05 R-13 se excluyen leaves-URL y las claves `_validation`/`_method_grounding`/`_fabrication_guard`', () => {
  const leaves = collectContentText({
    cta_url_suggestion: 'https://jdvalley.com/offers/15-percent-discount',
    otra: 'www.ejemplo.com/only-5-spots',
    copy: 'texto real',
    _validation: { note: 'Only 3 spots left' },
    _method_grounding: { note: '15% discount' },
    _fabrication_guard: { note: '20% off' }
  });
  assert.deepEqual(leaves, ['texto real']);
  // …y por lo tanto no producen señales.
  const r = checkContentNonFabrication(
    {
      cta_url_suggestion: 'https://jdvalley.com/offers/15-percent-discount',
      _validation: { note: 'Only 3 spots left' }
    },
    G_NONE,
    'gbp_posts'
  );
  assert.equal(r.ok, true);
});

/* ================================================================================ */
/*  R-14..R-18 — el marcador de faltante, por PATRÓN e independiente del idioma       */
/* ================================================================================ */

test('T-05 R-14 el detector es por PATRÓN: captura el marcador en 4 idiomas y en formas no vistas', () => {
  for (const t of [
    'Fecha: [PENDIENTE]',
    'Date: [PENDING]',
    'Date : [À DÉFINIR]',
    'Data: [DA DEFINIRE]',
    'Ort: [NOCH OFFEN]',
    'Horario: [POR DEFINIR]',
    'Location: TBD',
    'Time: TBA',
    'Direccion: ______'
  ]) {
    assert.ok(
      detectMissingMarkers(t).length > 0,
      `no detectó el marcador en: ${t}`
    );
  }
});

test('T-05 R-17 carve-out: un enlace markdown NO es un marcador de faltante', () => {
  assert.deepEqual(
    detectMissingMarkers('[Reservá ahora](https://jdvalley.com)'),
    []
  );
  assert.deepEqual(
    detectMissingMarkers('Mirá [nuestras reseñas](https://g.page/x) hoy'),
    []
  );
  // …pero el corchete SIN paréntesis siguiente sí lo es.
  assert.deepEqual(detectMissingMarkers('Fecha: [PENDING] hoy'), ['[PENDING]']);
});

test('T-05 R-14 no lanza ante entradas raras y no marca copy limpio', () => {
  for (const bad of [undefined, null, 42, {}, []]) {
    assert.deepEqual(detectMissingMarkers(bad), []);
  }
  assert.deepEqual(
    detectMissingMarkers('Pintamos tu casa en 5 dias, sin sorpresas.'),
    []
  );
});

test('T-05 ⭐ R-18 el marcador NUNCA está grounded — inversión explícita de F-105 R-01', () => {
  // En F-105 el marcador es la puerta rectora HONESTA que siempre pasa. Acá es un defecto
  // que nunca pasa, porque el artefacto es copy publicable ("channel-ready" por canon).
  const conMarcadorEnLaOfv = resolveContentGrounding(
    '## OFERTA DE VALOR (APROBADA)\nUrgencia: [PENDIENTE]\nDecision Frame: [PENDIENTE]'
  );
  const r = checkContentNonFabrication(
    { post: 'Event date: [PENDIENTE]' },
    conMarcadorEnLaOfv,
    'gbp_posts'
  );
  assert.equal(
    r.ok,
    false,
    'ni con el mismo marcador en el contexto puede quedar grounded'
  );
  assert.ok(kinds(r).indexOf('missing_marker') !== -1);
});

/* ================================================================================ */
/*  R-23 — adopción sólo-si-mejora (núcleo puro de la decisión del retry)             */
/* ================================================================================ */

test('T-05 R-23 `improvesStrictly`: limpio ⇒ sí; bajar de tier ⇒ sí; igual o peor ⇒ no', () => {
  const commitment = checkContentNonFabrication(
    { a: 'Get 15% off' },
    G_NONE,
    'gbp_posts'
  );
  const defect = checkContentNonFabrication(
    { a: 'Date: [PENDING]' },
    G_NONE,
    'gbp_posts'
  );
  const clean = checkContentNonFabrication(
    { a: 'Pintamos tu casa' },
    G_NONE,
    'gbp_posts'
  );
  assert.equal(commitment.tier, 'commitment');
  assert.equal(defect.tier, 'publication_defect');
  assert.equal(clean.ok, true);

  assert.equal(
    improvesStrictly(commitment, clean),
    true,
    'retry limpio se adopta'
  );
  assert.equal(
    improvesStrictly(commitment, defect),
    true,
    'cambiar un descuento fabricado por un marcador residual ES una mejora material (R-23)'
  );
  assert.equal(
    improvesStrictly(defect, commitment),
    false,
    'subir de tier nunca se adopta'
  );
  assert.equal(
    improvesStrictly(commitment, commitment),
    false,
    'igual nunca se adopta'
  );
  assert.equal(improvesStrictly(defect, defect), false);
});

/* ================================================================================ */
/*  R-22/R-25 — directiva y warning                                                  */
/* ================================================================================ */

test('T-05 R-22 la directiva enumera los TOKENS LITERALES detectados y ordena omitirlos', () => {
  const r = checkContentNonFabrication(
    { post: 'For a limited time: 15% discount, book by the end of this month' },
    G_JD,
    'gbp_posts'
  );
  const directive = buildContentFabricationRetryDirective(r.signals);
  assert.match(directive, /CORRECCIÓN OBLIGATORIA/);
  for (const s of r.signals) {
    assert.ok(
      directive.indexOf(s.value) !== -1,
      `la directiva no enumera "${s.value}"`
    );
  }
  assert.match(directive, /omitiendo exactamente esos elementos/);
  assert.match(directive, /marcador de faltante/);
  assert.equal(buildContentFabricationRetryDirective([]), '');
});

test('T-05 R-25 el warning es ES legible y distingue el tier; vacío ⇒ ""', () => {
  const commitment = checkContentNonFabrication(
    { a: 'Get 15% off' },
    G_NONE,
    'gbp_posts'
  );
  const msg = formatContentFabricationWarning(commitment.signals);
  assert.match(msg, /OFV aprobada/);
  assert.match(msg, /COMPROMETE al negocio/);
  const defect = checkContentNonFabrication(
    { a: 'Date: [PENDING]' },
    G_NONE,
    'gbp_posts'
  );
  assert.doesNotMatch(
    formatContentFabricationWarning(defect.signals),
    /COMPROMETE al negocio/
  );
  assert.equal(formatContentFabricationWarning([]), '');
});

/* ================================================================================ */
/*  ⭐⭐ R-40 — CRITERIO ANTI-NO-OP: los 4 outputs REALES del ledger                  */
/* ================================================================================ */

test('T-05 ⭐ R-40 (a) CL-101 (c) — el post EVENT de JD Valley con `[PENDING]` ×3 MUERDE', () => {
  // Origen literal: docs/continuity-ledger.md CL-101 hallazgo (c). El modelo NO fabricó la
  // fecha (el PRINCIPIO DE HONESTIDAD aguantó) pero escribió la degradación correcta en la
  // forma PROHIBIDA, en copy publicable. Es el defecto que esta feature existe para atrapar.
  const post = {
    content:
      'Join us for our Spring Painting Workshop!\nDate: [PENDING]\nTime: [PENDING]\nLocation: [PENDING]',
    post_type: 'EVENT'
  };
  const r = checkContentNonFabrication(post, G_JD, 'gbp_posts');
  assert.equal(
    r.ok,
    false,
    'el guard NO muerde sobre el caso documentado ⇒ es un no-op'
  );
  const markers = r.signals.filter((s) => s.kind === 'missing_marker');
  assert.equal(markers.length, 3, 'los 3 marcadores del post real');
  assert.equal(r.tier, 'publication_defect');
  // …y con la postura de F-105 este output PASARÍA: el marcador es allí la puerta honesta.
});

test('T-05 ⭐ R-40 (b) CL-097 — el `15% discount` + `by the end of this month` MUERDE', () => {
  // Origen literal: docs/continuity-ledger.md CL-097 (el output que originó toda la cadena).
  const post = {
    content:
      'For a limited time, JD Valley Painting is offering a 15% discount on all interior painting projects booked by the end of this month'
  };
  const r = checkContentNonFabrication(post, G_JD, 'gbp_posts');
  assert.equal(r.ok, false);
  assert.ok(
    kinds(r).indexOf('discount') !== -1,
    'no marcó el descuento sin origen'
  );
  assert.ok(
    kinds(r).indexOf('deadline') !== -1,
    'no marcó el plazo sin origen'
  );
  assert.equal(r.tier, 'commitment');
  // ⭐ La razón por la que muerde es la INVERSIÓN del grounding: el `15` existe en el
  // contextChain (teléfono, "15 anios de experiencia"), pero NO en la rebanada promocional.
  assert.ok(
    CTX_JD_VALLEY.indexOf('15') !== -1,
    'el 15 SÍ está en el contextChain'
  );
  assert.equal(
    G_JD.digits.has('15'),
    false,
    'pero NO en la rebanada promocional'
  );
});

test('T-05 ⭐ R-40 (c) CL-101 (a) — el `Only 5 spots available this month` NO se marca', () => {
  // Origen literal: docs/continuity-ledger.md CL-101 hallazgo (a) — el post OFFER post-F-114
  // que usó la urgencia REAL de la OFV. Marcarlo sería el falso positivo que REFUTA la
  // feature: F-118 no puede romper el logro de F-114 (R-33).
  const post = {
    content:
      'Only 5 spots available this month to ensure personalized service!',
    post_type: 'OFFER'
  };
  const r = checkContentNonFabrication(post, G_JD, 'gbp_posts');
  assert.equal(
    r.ok,
    true,
    'FALSO POSITIVO sobre el output correcto de F-114: ' +
      JSON.stringify(r.signals)
  );
});

test('T-05 ⭐ R-40 (d) CL-101 (d) — la prueba social propagada NO se marca (fuera de scope R-12.1)', () => {
  // Origen literal: docs/continuity-ledger.md CL-101 hallazgo (d) — la OFV vieja (a6c66d5c,
  // pre-F-104) propagó prueba social a content. Es DEUDA DE DATOS del operador y su
  // tratamiento está normado aguas arriba (F-105 + F-114), no acá (R-12.1).
  const post = {
    content:
      'With over 50 satisfied clients and a 150% increase in visibility, we know local painting.'
  };
  const r = checkContentNonFabrication(post, G_JD, 'gbp_posts');
  assert.equal(
    r.ok,
    true,
    'la prueba social no es clase de F-118: ' + JSON.stringify(r.signals)
  );
});

/* ================================================================================ */
/*  R-38 — pureza                                                                    */
/* ================================================================================ */

test('T-05 R-38 el core es PURO: sin I/O y sin `matchAll` (compatible con target es5)', async () => {
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const HERE = dirname(fileURLToPath(import.meta.url));
  const SRC = readFileSync(
    resolve(HERE, '../..', 'src/lib/content/non-fabrication.ts'),
    'utf8'
  );
  assert.doesNotMatch(SRC, /\.matchAll\(/, 'matchAll no es es5-safe');
  assert.doesNotMatch(
    SRC,
    /from\s+'(next|@supabase|openai)/,
    'el core no depende del framework'
  );
  assert.doesNotMatch(
    SRC,
    /fetch\(|readFileSync|process\.env/,
    'el core no hace I/O'
  );
  // la única dependencia es la fuente única del marcador.
  assert.match(SRC, /from '\.\.\/method-context\/pending\.ts'/);
});
