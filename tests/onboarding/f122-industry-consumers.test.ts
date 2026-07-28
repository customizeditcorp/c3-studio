/**
 * F-122 — T-03 / T-05 — **Los 5 consumidores de industria que quedaron fuera de la
 * declaración única** (R-03, R-14, R-15, R-16, R-17, R-19, R-20).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * QUÉ SE MIDE, Y POR QUÉ NO ALCANZA CON MIRAR LA FUENTE
 * ─────────────────────────────────────────────────────────────────────────────────
 * Dos de los 5 sitios son módulos puros ⇒ se **ejercen** con los 4 valores reales de
 * producción. Los otros 3 son plantillas de `SuggestButton` dentro de la página: se
 * **extraen del código fuente y se EVALÚAN**, para que la degradación honesta de R-15
 * sea una propiedad **observada** y no un `assert.match` sobre un ternario. Sin eso, un
 * ternario presente pero mal escrito (que emitiera `undefined` o un hueco) pasaría.
 *
 * ⭐ **CL-113 — de estas plantillas salieron los defectos que se atribuían al modelo.**
 * Los 7 `SuggestButton` del Brief no llaman a ninguna API (cero `fetch`): son plantillas
 * hardcodeadas. `goal_12m` de Clara V —*"Top 3 en Google Maps para **other** en
 * **[PENDIENTE]**"*— es la salida literal de una de ellas.
 *
 * Fixtures = valores reales (R-36): `other` (Clara V `122f3593`), `''` (Customize It
 * `b016f86b`), `portable_toilet_rental_service` (R & M `4a59cbff`), `cleaning`
 * (SCS `e24ddff3`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { toIndustryLabel } from '../../src/lib/clients/industry-label.ts';
import { buildSalesPanelData } from '../../src/lib/gbp-slice/knowledge-panel.ts';
import { buildGbpUserMessage } from '../../src/lib/gbp-slice/prompt.ts';
import { readGbpContext } from '../../src/lib/gbp-slice/context.ts';
import {
  CLIENT,
  REAL_OFFER,
  APPROVED_BRANDBOARD
} from '../gbp-slice/fixtures.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const BRIEF_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const BRIEF = read(BRIEF_REL);
const BRIEF_CODE = stripComments(BRIEF);

/** Los 4 valores REALES de `clients.industry` observados en producción (R-36). */
const REALES = ['other', '', 'portable_toilet_rental_service', 'cleaning'];

/* ================================================================== */
/*  ⭐⭐ R-03 — el contrato de F-121 sigue valiendo (no se toca)        */
/* ================================================================== */

test('T-03 ⭐⭐ R-03 el contrato de `toIndustryLabel` no se movió', () => {
  assert.equal(toIndustryLabel('cleaning'), 'Limpieza');
  assert.equal(toIndustryLabel('other'), null);
  assert.equal(toIndustryLabel(''), null);
  assert.equal(
    toIndustryLabel('portable_toilet_rental_service'),
    'portable toilet rental service'
  );
});

/* ================================================================== */
/*  ⭐⭐ (a)/(b) — `ind` y `pageDescription` de la pantalla del Brief    */
/* ================================================================== */

test('T-03 ⭐⭐ R-14 (a) `ind` sale de la declaración única, no del código crudo', () => {
  assert.match(
    BRIEF_CODE,
    /const ind = toIndustryLabel\(\(client\?\.industry as string\) \|\| ''\)/,
    'E-8(a): `const ind = (client?.industry as string) || ""` era el código CRUDO que ' +
      'alimentaba los otros cuatro sitios de esta pantalla'
  );
  assert.ok(
    !/ind\.replace\(\/_\/g/.test(BRIEF_CODE),
    'E-8(b/c): el criterio propio `_`→espacio sigue vivo en la pantalla (R-14)'
  );
});

test('T-03 ⭐⭐ R-15 (b) el `pageDescription` degrada honesto: ni token, ni hueco, ni `undefined`', () => {
  const m = /pageDescription=\{([\s\S]*?)\}\n/.exec(BRIEF_CODE);
  assert.ok(m, 'la pantalla ya no declara `pageDescription`');
  const expr = m[1];
  const evaluar = (ind: string | null): string =>
    new Function('ind', `return (${expr});`)(ind) as string;

  assert.equal(evaluar('Limpieza'), 'Limpieza · Brief, Persona y OFV');
  const ausente = evaluar(null);
  assert.equal(
    ausente,
    'Brief, Persona y OFV',
    'con `null` el título decía «other · Brief…»; ahora omite la cláusula (R-15)'
  );
  for (const malo of ['other', 'undefined', ' · ']) {
    assert.ok(
      !ausente.includes(malo),
      `el título de la pantalla emite \`${malo}\` cuando no hay industria declarada`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ (c) — las TRES plantillas de `SuggestButton`, EVALUADAS       */
/* ================================================================== */

/**
 * Extrae la expresión que **la plantilla del `SuggestButton`** pasa a
 * `updateBrief('<clave>', …)`. Cada clave tiene además un `onChange` que llama al mismo
 * `updateBrief` con `e.target.value`: ése se descarta, no es una plantilla.
 */
function plantilla(clave: string): string {
  const marca = `updateBrief(`;
  const candidatas: string[] = [];
  for (
    let i = BRIEF_CODE.indexOf(marca);
    i >= 0;
    i = BRIEF_CODE.indexOf(marca, i + 1)
  ) {
    // Escaneo con paréntesis balanceados: el argumento puede contener `)`.
    let nivel = 0;
    let fin = -1;
    for (let j = i + marca.length - 1; j < BRIEF_CODE.length; j++) {
      const ch = BRIEF_CODE[j];
      if (ch === '(') nivel++;
      else if (ch === ')') {
        nivel--;
        if (nivel === 0) {
          fin = j;
          break;
        }
      }
    }
    assert.ok(fin > 0, 'llamada a `updateBrief` sin cerrar');
    const args = BRIEF_CODE.slice(i + marca.length, fin).trim();
    if (!args.startsWith(`'${clave}'`)) continue;
    const expr = args.slice(`'${clave}'`.length).replace(/^\s*,/, '').trim();
    if (/^e\.target\.value$/.test(expr) || expr.length === 0) continue;
    candidatas.push(expr);
  }
  assert.equal(
    candidatas.length,
    1,
    `se esperaba UNA plantilla para \`${clave}\`, se hallaron ${candidatas.length}`
  );
  return candidatas[0];
}

/** La evalúa con un `ind` y unos `briefFields` dados — sin montar React. */
function evaluarPlantilla(
  clave: string,
  ind: string | null,
  briefFields: Record<string, string>
): string {
  return new Function('ind', 'briefFields', `return (${plantilla(clave)});`)(
    ind,
    briefFields
  ) as string;
}

const CLAVES = ['main_problem', 'search_behavior', 'goal_12m'];

test('T-03 ⭐⭐⭐ R-15 con industria declarada, las 3 plantillas emiten la ETIQUETA (no el código)', () => {
  const campos = { business_name: 'SCS Cleaning Service', city: 'Santa Maria' };
  for (const clave of CLAVES) {
    const salida = evaluarPlantilla(clave, toIndustryLabel('cleaning'), campos);
    assert.ok(
      salida.includes('Limpieza'),
      `${clave}: la plantilla no usa la etiqueta declarada`
    );
    assert.ok(
      !salida.includes('cleaning'),
      `${clave}: sigue emitiendo el CÓDIGO crudo — el defecto de SCS ` +
        '("…en Google para cleaning en la zona")'
    );
  }
});

test('T-03 ⭐⭐⭐ R-15 SIN industria declarada, ninguna plantilla emite token, hueco ni `undefined`', () => {
  const campos = { business_name: 'Clara V Decor', city: 'Buellton' };
  for (const codigo of ['other', '']) {
    const ind = toIndustryLabel(codigo);
    assert.equal(
      ind,
      null,
      'fixture inválido: el valor debería expresar ausencia'
    );
    for (const clave of CLAVES) {
      const salida = evaluarPlantilla(clave, ind, campos);
      assert.ok(
        !salida.includes('other'),
        `${clave} con \`${codigo}\`: emite el TOKEN — es el defecto literal de Clara V ` +
          '("Top 3 en Google Maps para other …")'
      );
      assert.ok(
        !salida.includes('undefined') && !salida.includes('null'),
        `${clave} con \`${codigo}\`: emite \`undefined\`/\`null\``
      );
      assert.ok(
        !/\bpara\s+en\b|\bpara\s*$|\s{2,}/.test(salida),
        `${clave} con \`${codigo}\`: dejó un HUECO donde iba la industria ` +
          `(«${salida}»). Cambiar "para other" por "para " es otro defecto, no una ` +
          'corrección (R-15).'
      );
      assert.ok(
        salida.trim().length > 0,
        `${clave} con \`${codigo}\`: la sugerencia quedó vacía`
      );
    }
  }
});

test('T-03 ⭐⭐ R-15 un valor FUERA de tabla llega des-tokenizado a las 3 plantillas', () => {
  const campos = { business_name: 'R & M QTB LLC', city: 'Santa Maria' };
  const ind = toIndustryLabel('portable_toilet_rental_service');
  for (const clave of CLAVES) {
    const salida = evaluarPlantilla(clave, ind, campos);
    assert.ok(
      !salida.includes('portable_toilet_rental_service'),
      `${clave}: el snake_case crudo llega a la prosa (R & M \`4a59cbff\`)`
    );
    if (clave !== 'search_behavior' || ind) {
      assert.ok(
        salida.includes('portable toilet rental service'),
        `${clave}: el valor fuera de tabla no llega des-tokenizado`
      );
    }
  }
});

test('T-03 ⭐ la ranura de CIUDAD de `:1601` recibe el fallback que ya tienen sus hermanas', () => {
  // Alcance acotado y declarado (non-goal 2): se toca la ranura de ciudad de ESA línea
  // porque se está editando esa misma línea. Ni una palabra más de las plantillas.
  const salida = evaluarPlantilla('search_behavior', 'Limpieza', {
    business_name: 'X',
    city: ''
  });
  assert.ok(
    salida.includes('su zona'),
    '`search_behavior` con ciudad vacía dejaba un hueco al final de la frase'
  );
  assert.ok(!/\s{2,}|rental \./.test(salida));
});

test('T-03 ⭐ las 3 plantillas siguen sin llamar a ninguna API (CL-113)', () => {
  for (const clave of CLAVES) {
    assert.ok(
      !/fetch\(|generateContent\(/.test(plantilla(clave)),
      `${clave}: una plantilla hardcodeada no puede convertirse en una llamada`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ (d) — `formatIndustry` deja de ser un criterio propio           */
/* ================================================================== */

test('T-03 ⭐⭐ R-16 (d) el panel resuelve la industria por la declaración única', () => {
  const KP_REL = 'src/lib/gbp-slice/knowledge-panel.ts';
  const kp = stripComments(read(KP_REL));
  assert.ok(
    !/function formatIndustry/.test(kp),
    'R-16 (deuda #2 de CL-112): `formatIndustry` era el TERCER criterio propio sobre ' +
      '`clients.industry` y publicaba la categoría "other" en el entregable'
  );
  assert.match(
    kp,
    /import \{ toIndustryLabel \} from '\.\.\/clients\/industry-label\.ts'/
  );

  // Y la conducta, con los 4 valores reales.
  const panel = (industry: string | null) =>
    buildSalesPanelData({
      gbpProfile: null,
      client: { business_name: 'X', industry },
      photos: []
    });
  assert.equal(panel('cleaning').category, 'Limpieza');
  assert.equal(
    panel('portable_toilet_rental_service').category,
    'portable toilet rental service'
  );
  assert.equal(
    panel('other').category,
    null,
    '`other` NO es una categoría de negocio: es la ausencia (F-121 R-15). Publicarla ' +
      'en el panel del entregable era la deuda #2 de CL-112.'
  );
  assert.equal(panel('').category, null);
  assert.equal(panel(null).category, null);
});

/* ================================================================== */
/*  ⭐⭐ (e) — el QUINTO sitio: el prompt del GBP                       */
/* ================================================================== */

test('T-03 ⭐⭐ R-17 (e) el prompt del GBP emite la industria por la declaración única', () => {
  const mensaje = (industry: string | null): string =>
    buildGbpUserMessage(
      readGbpContext({
        client: { ...CLIENT, industry },
        offer: REAL_OFFER,
        brandboard: APPROVED_BRANDBOARD
      })
    );
  assert.match(mensaje('cleaning'), /Industria: Limpieza/);
  assert.match(
    mensaje('portable_toilet_rental_service'),
    /Industria: portable toilet rental service/
  );
  // ⭐ El quinto sitio, no registrado en CL-112: recibía `Industria: other`.
  for (const ausente of ['other', '', null]) {
    const msg = mensaje(ausente);
    assert.match(
      msg,
      /Industria: Sin industria declarada/,
      'R-17: la ausencia se NOMBRA con la misma expresión que usa `route.ts`, no con un ' +
        '`N/A` mudo que el modelo puede leer como dato'
    );
    assert.ok(
      !/Industria: other/.test(msg),
      'el prompt del GBP sigue recibiendo el token crudo'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐ T-05 — la `Industria` del Brief: `readOnly` + su puntero       */
/* ================================================================== */

test('T-05 ⭐⭐ R-19 el campo `Industria` del Brief SIGUE siendo `readOnly`', () => {
  const campo = BRIEF_CODE.slice(
    BRIEF_CODE.indexOf("<Field label='Industria'"),
    BRIEF_CODE.indexOf("<Field label='Industria'") + 700
  );
  assert.ok(campo.length > 100, 'ya no existe el campo `Industria` del Brief');
  assert.match(
    campo,
    /value=\{briefFields\.industry\}\s*readOnly/,
    'R-19 (anti-deriva): nadie puede volverlo editable "para arreglarlo" — serían DOS ' +
      'fuentes de verdad sobre el mismo dato, que es lo que R-08 prohíbe'
  );
  assert.ok(
    !/onChange=\{\(e\) => updateBrief\('industry'/.test(BRIEF_CODE),
    'R-19: apareció un onChange sobre `industry` en el Brief'
  );
});

test('T-05 ⭐⭐ R-20 con ausencia de industria, la pantalla dice DÓNDE se corrige', () => {
  const campo = BRIEF_CODE.slice(
    BRIEF_CODE.indexOf("<Field label='Industria'"),
    BRIEF_CODE.indexOf("<Field label='Industria'") + 900
  );
  // El puntero está DENTRO del campo, y condicionado a la ausencia (no siempre visible).
  assert.match(
    campo,
    /\{!ind && \(/,
    'R-20: el puntero debe aparecer en el caso de AUSENCIA y no en el caso poblado'
  );
  assert.match(
    campo,
    /<Link\s+href=\{`\/clients\/\$\{clientId\}`\}/,
    'R-20/E-10: el destino es la ficha del cliente, donde ya vive `ClientForm`'
  );
});
