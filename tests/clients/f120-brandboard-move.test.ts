/**
 * F-120 — T-11 — **El traslado del Brandboard, con el gate como invariante**
 * (R-23, R-24, R-25, R-26, R-27, R-28, R-29, R-37, R-46).
 *
 * ## El riesgo #1 de la fase, nombrado por escrito antes de ejecutarlo
 *
 * `docs/brandboard-placement.md` (producido por F-117 R-28 precisamente para que esta fase
 * no re-descubriera nada) dice literal: *"`disabled={!ofvApproved}` **DEBE preservarse en el
 * destino** […] Trasladar el tab exige **recomputar el gate** en su nuevo hogar. Éste es el
 * riesgo concreto del traslado y la razón principal por la que se difiere a una fase propia:
 * hacerlo al final de una feature de cableado es exactamente cómo se pierde un gate en
 * silencio."*
 *
 * Este archivo es la red de esa afirmación, en tres capas:
 *   1. el **componente** cruza el movimiento **byte-idéntico** (ancla FIJA `76e7637`);
 *   2. el **gate** existe **en el destino** y se **DERIVA** de la lectura canónica — no de
 *      una consulta propia (R-25) — que es lo que reduce el riesgo en vez de trasladarlo;
 *   3. el **origen** queda con **cero** referencias: es un traslado, no una duplicación.
 *
 * **Nota de modalidad (`docs/verification.md` §6):** que el tab esté BLOQUEADO en Customize It
 * y HABILITADO en SCS, y que el editor cargue y guarde desde su nuevo hogar, es conductual y
 * vive en T-22 `[LIVE §6.1]`, gateado y NO ejecutado en este tramo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');

/** Ancla FIJA, nunca `HEAD` (CL-107 / F-118 H-5 / F-119 R-37). */
const BASE = '76e7637';
const desde = (rel: string): string =>
  execFileSync('git', ['show', `${BASE}:${rel}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });

const FICHA_REL = 'src/app/(app)/clients/[id]/page.tsx';
const CORE_PAGE_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const TAB_DESTINO_REL = 'src/components/brandboard/brandboard-tab.tsx';
const TAB_ORIGEN_REL =
  'src/app/(app)/onboarding/brief/[clientId]/brandboard-tab.tsx';
const DOC_REL = 'docs/brandboard-placement.md';

const FICHA = read(FICHA_REL);
const CORE_PAGE = read(CORE_PAGE_REL);
const DOC = read(DOC_REL);

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const FICHA_CODE = stripComments(FICHA);

/* ================================================================== */
/*  ⭐ R-26 — byte-identidad A TRAVÉS del movimiento                    */
/* ================================================================== */

test('T-11 ⭐ R-26 `brandboard-tab.tsx` es BYTE-IDÉNTICO a `76e7637` en su ruta nueva', () => {
  assert.equal(
    read(TAB_DESTINO_REL),
    desde(TAB_ORIGEN_REL),
    'R-26: el traslado es de UBICACIÓN y de quién lo importa — **ni una línea** del ' +
      'editor puede cambiar. Todos sus imports usan el alias `@/`, así que el movimiento ' +
      'no requería tocar nada. Cualquier cambio de comportamiento está fuera de scope.'
  );
});

test('T-11 R-26 es un MOVIMIENTO, no una copia: el archivo ya no existe en la ruta vieja', () => {
  assert.ok(
    !existsSync(resolve(REPO, TAB_ORIGEN_REL)),
    'dejar el componente en la carpeta de ruta del núcleo mientras se lo importa desde la ' +
      'ficha conservaría la MISMA coacoplación que la fase viene a cerrar, sólo que invisible'
  );
  assert.ok(existsSync(resolve(REPO, TAB_DESTINO_REL)));
  // Convención del repo: `src/components/<dominio>/`.
  assert.match(
    TAB_DESTINO_REL,
    /^src\/components\/[a-z-]+\/brandboard-tab\.tsx$/
  );
});

/* ================================================================== */
/*  ⭐ R-24 / R-25 — EL GATE NO SE PIERDE, y se DERIVA                  */
/* ================================================================== */

test('T-11 ⭐ R-24 el `TabsTrigger` gateado y su `TabsContent` viven EN EL DESTINO', () => {
  assert.match(
    FICHA,
    /<TabsTrigger\s+value='brandboard'\s+disabled=\{\s*!ofvApproved\s*\}/,
    'R-24: el Brandboard debe permanecer inaccesible mientras el cliente no tenga una OFV ' +
      'APROBADA — es el gate que el contrato escrito del traslado prohíbe perder'
  );
  assert.match(FICHA, /<TabsContent\s+value='brandboard'/);
  assert.match(FICHA, /<BrandboardTab/);
  assert.match(
    FICHA,
    /import\s*\{[\s\S]*?BrandboardTab[\s\S]*?\}\s*from\s*'@\/components\/brandboard\/brandboard-tab'/
  );
  // El candado visual acompaña al gate, igual que en el origen.
  assert.match(FICHA, /!ofvApproved\s*&&\s*'🔒\s*'/);
});

test('T-11 ⭐ R-25 `ofvApproved` se DERIVA del resultado del seam, NO de una consulta propia', () => {
  assert.match(
    FICHA_CODE,
    /const\s+ofvApproved\s*=\s*ofvSource\s*!==\s*null\s*&&\s*ofvSource\.state\s*!==\s*'none-approved'/,
    'R-25: `pickCanonicalOffer` devuelve `null` **si y sólo si** el conjunto de candidatos ' +
      '`approved` está vacío ⇒ `state !== "none-approved"` es EXACTAMENTE equivalente al ' +
      '`!!ofvData` que gobernaba el gate en el origen: ni relajación ni endurecimiento'
  );
  // Y NO hay una consulta propia del gate: la ficha consulta `offers` DOS veces (candidatos
  // + editable) y ambas alimentan el mismo seam. Una tercera sería la re-implementación
  // que `docs/brandboard-placement.md` señala como el modo de fallo del traslado.
  assert.equal(
    (FICHA_CODE.match(/\.from\('offers'\)/g) ?? []).length,
    2,
    'una consulta extra de `offers` para el gate sería re-implementarlo a ciegas'
  );
  assert.equal(
    (FICHA_CODE.match(/const\s+ofvApproved\s*=/g) ?? []).length,
    1,
    'una sola definición del gate: dos podrían discrepar'
  );
});

/* ================================================================== */
/*  ⭐ R-23 — CERO rastros en el ORIGEN                                 */
/* ================================================================== */

test('T-11 ⭐ R-23 la pantalla del núcleo tiene CERO referencias al Brandboard', () => {
  assert.equal(
    (CORE_PAGE.match(/brandboard/gi) ?? []).length,
    0,
    'Mandato 1 de CL-102: la pantalla del núcleo contiene el núcleo y nada adicional. El ' +
      'Brandboard es guía de ejecución de canal y precondición del GBP, no parte de la ' +
      'cadena `brief → persona → OFV`'
  );
  assert.equal((CORE_PAGE.match(/BrandboardTab/g) ?? []).length, 0);
  // En `76e7637` SÍ estaba: si esto no fuera cierto, el test no probaría el traslado.
  assert.ok(
    (desde(CORE_PAGE_REL).match(/brandboard/gi) ?? []).length > 0,
    'ancla de sentido: en la baseline el Brandboard vivía en la pantalla del núcleo'
  );
});

test('T-11 R-41 la cadena de gates del NÚCLEO sobrevive intacta al traslado', () => {
  // El tab que sale es el 4.º; los 3 del núcleo y su cadena siguen exactamente igual.
  for (const t of ['brief', 'persona', 'ofv']) {
    assert.match(CORE_PAGE, new RegExp(`<TabsTrigger\\s+value='${t}'`));
  }
  assert.match(
    CORE_PAGE,
    /<TabsTrigger\s+value='persona'\s+disabled=\{\s*!briefApproved\s*\}/
  );
  assert.match(
    CORE_PAGE,
    /<TabsTrigger\s+value='ofv'\s+disabled=\{\s*!personaApproved\s*\}/
  );
  // Y `ofvApproved` sigue vivo en el núcleo: se usa para el botón "Guardar borrador" de la
  // OFV (F-108 R-07) ⇒ NO quedó sin uso y por eso NO se elimina.
  assert.match(
    CORE_PAGE,
    /const\s+ofvApproved\s*=\s*ofvRecord\?\.status\s*===\s*'approved'/
  );
  assert.match(CORE_PAGE, /\{\s*!ofvApproved\s*&&\s*\(/);
});

/* ================================================================== */
/*  R-27 / R-28 — las 3 props, y NUNCA montar con identidad ausente     */
/* ================================================================== */

test('T-11 ⭐ R-27 el destino le provee `clientId`, `tenantId` y `userId`', () => {
  const i = FICHA_CODE.indexOf('<BrandboardTab');
  assert.ok(i > 0);
  const montaje = FICHA_CODE.slice(i, FICHA_CODE.indexOf('/>', i) + 2);
  assert.match(montaje, /clientId=\{\s*client\.id\s*\}/);
  assert.match(montaje, /tenantId=\{\s*tenantId\s*\}/);
  assert.match(montaje, /userId=\{\s*user\.id\s*\}/);
  // `user` viene de `useUser()` — ya expuesto por `UserContextValue`, sólo faltaba
  // desestructurarlo en la ficha.
  assert.match(
    FICHA_CODE,
    /const\s*\{[^}]*\buser\b[^}]*\}\s*=\s*useUser\(\)/,
    'el `user` del contexto debe estar en scope de la ficha'
  );
});

test('T-11 ⭐ R-28 SI falta `tenantId` o `user` ENTONCES el editor NO se monta y se declara', () => {
  const i = FICHA_CODE.indexOf("<TabsContent value='brandboard'");
  assert.ok(i > 0);
  const bloque = FICHA_CODE.slice(i, FICHA_CODE.indexOf('</TabsContent>', i));
  assert.match(
    bloque,
    /tenantId\s*&&\s*user\??\.id\s*\?/,
    'R-28: el editor escribe `brandboards` con `tenant_id`/`user_id`; montarlo con ' +
      'identidad ausente produce escrituras rotas o mal atribuidas'
  );
  // Y la rama negativa DECLARA por qué no se monta (no falla en silencio).
  const iElse = bloque.indexOf(') : (');
  assert.ok(
    iElse > 0,
    'debe existir una rama declarada para la identidad ausente'
  );
  assert.match(bloque.slice(iElse), /identidad|tenant|usuario/i);
  // Los `!` de aserción no-nula del origen NO viajaron: eso sería "montar y esperar".
  assert.ok(
    !/tenantId=\{\s*tenantId!\s*\}|userId=\{\s*user!\.id\s*\}/.test(bloque),
    'R-28: el destino comprueba la identidad, no la asume con `!`'
  );
});

/* ================================================================== */
/*  H-5 — el orden relativo de los tabs de la ficha se preserva         */
/* ================================================================== */

test('T-11 H-5 el orden `gbp` < `brandboard` < `deliverable` < `readiness` se cumple', () => {
  const idx = (v: string): number => {
    const i = FICHA.indexOf(`<TabsTrigger value='${v}'`);
    assert.ok(i > 0, `no se encontró el TabsTrigger \`${v}\``);
    return i;
  };
  const gbp = idx('gbp');
  const brandboard = idx('brandboard');
  const deliverable = idx('deliverable');
  const readiness = idx('readiness');
  assert.ok(
    gbp < brandboard,
    'el Brandboard va inmediatamente DESPUÉS de `gbp`'
  );
  assert.ok(
    brandboard < deliverable && deliverable < readiness,
    'el orden relativo `gbp` < `deliverable` < `readiness` que fija `f092-visibility` T-24 ' +
      'NO puede alterarse'
  );
});

/* ================================================================== */
/*  R-29 — el doc registra el traslado EJECUTADO                        */
/* ================================================================== */

test('T-11 ⭐ R-29 `docs/brandboard-placement.md` registra el traslado EJECUTADO, con destino y gate', () => {
  assert.match(
    DOC,
    /EJECUTAD[OA]/,
    'el doc debe pasar de "traslado diferido" a "traslado ejecutado"'
  );
  assert.match(DOC, /F-120/);
  assert.match(DOC, /src\/components\/brandboard\/brandboard-tab\.tsx/);
  assert.match(
    DOC,
    /clients\/\[id\]/,
    'debe nombrar el destino: la ficha del cliente'
  );
  assert.match(
    DOC,
    /resolveGenerationSource|none-approved/,
    'debe registrar CÓMO se recomputó el gate (derivado de la lectura canónica)'
  );
  assert.match(
    DOC,
    /equivalente/i,
    'debe registrar la equivalencia con la existencia previa'
  );
});

test('T-11 R-29/H-6 el doc CONSERVA todos los tokens que su guard preexistente exige', () => {
  // Si el implementer se ve obligado a tocar `f117-declarations` T-12 R-28, es señal de
  // que actualizó mal el doc. Este assert lo detecta antes.
  for (const token of [
    '!ofvApproved',
    'ofvApproved',
    'conveniencia de gating',
    'no por pertenencia',
    'clientId',
    'tenantId',
    'userId',
    'brandboard-tab.tsx'
  ]) {
    assert.ok(
      DOC.includes(token),
      `el doc perdió el token exigido por H-6: «${token}»`
    );
  }
  assert.match(DOC, /Fase\s+F/i);
});
