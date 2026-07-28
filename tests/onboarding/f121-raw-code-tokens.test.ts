/**
 * F-121 — T-06 — `assembly-guard.ts` (1/3): `detectRawCodeTokens` (R-20).
 *
 * **Fixtures REALES** (R-30), copiados verbatim de las filas de producción y citados con
 * su `id`. La constante `VALORES_REALES` es la única fuente de los fixtures.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  detectRawCodeTokens,
  detectRawCodeTokensInContent
} from '../../src/lib/onboarding/assembly-guard.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ================================================================== */
/*  ⭐ FIXTURES REALES — valores observados, no paráfrasis (R-30)      */
/* ================================================================== */

const VALORES_REALES = {
  /** Clara V Decor, brief `e1ad789c`, clave `goal_12m`. */
  clara_goal_12m:
    'Top 3 en Google Maps para other en [PENDIENTE] + 15-20 leads/mes',
  /** Clara V Decor, brief `e1ad789c`, clave `search_behavior`. */
  clara_search_behavior:
    'Busca en Google: other near me, other rental [PENDIENTE]',
  /** SCS Cleaning Service, brief `be43470f`, clave `digital_presence`. */
  scs_digital_presence: 'GBP: no_gbp, Salud digital: nothing',
  /** SCS Cleaning Service, brief `be43470f`, clave `main_problem`. */
  scs_main_problem:
    'No pueden encontrar SCS en Google para cleaning en la zona',
  /** R & M QTB LLC, cliente `4a59cbff`, `clients.industry`. */
  rym_industry: 'portable_toilet_rental_service'
} as const;

/* ================================================================== */
/*  ⭐⭐ R-20 — los 4 defectos reales, uno por uno                      */
/* ================================================================== */

test('T-06 ⭐⭐ R-20 Clara V `goal_12m`: marca `other` dentro de la frase', () => {
  const t = detectRawCodeTokens(VALORES_REALES.clara_goal_12m);
  assert.deepEqual(t, ['other']);
});

test('T-06 ⭐⭐ R-20 Clara V `search_behavior`: marca `other` (dos ocurrencias, un token)', () => {
  const t = detectRawCodeTokens(VALORES_REALES.clara_search_behavior);
  assert.deepEqual(t, ['other'], 'sin repetir: el token se reporta una vez');
});

test('T-06 ⭐⭐ R-20 SCS `digital_presence`: marca `no_gbp` Y `nothing`', () => {
  const t = detectRawCodeTokens(VALORES_REALES.scs_digital_presence).sort();
  assert.deepEqual(t, ['no_gbp', 'nothing']);
});

test('T-06 ⭐⭐ R-20 SCS `main_problem`: marca `cleaning` — el MISMO defecto con un token que se lee como palabra', () => {
  const t = detectRawCodeTokens(VALORES_REALES.scs_main_problem);
  assert.deepEqual(
    t,
    ['cleaning'],
    'DT-02: el defecto no es que `other` sea feo, es que un valor de vocabulario ' +
      'cerrado se usa como sustantivo. Ignorar `cleaning` dejaría el defecto vivo en ' +
      '9 de 10 industrias'
  );
});

test('T-06 ⭐ R-20 R & M `industry`: marca `portable_toilet_rental_service`', () => {
  // Fuera de la tabla de industrias, pero inequívocamente un token: `snake_case`.
  assert.deepEqual(detectRawCodeTokens(VALORES_REALES.rym_industry), [
    'portable_toilet_rental_service'
  ]);
});

/* ================================================================== */
/*  ⭐ ANTI-FALSO-POSITIVO — prosa normal NO se marca                  */
/* ================================================================== */

test('T-06 ⭐⭐ R-20 prosa de negocio SANA no se marca — ni una', () => {
  const sanas = [
    'Servicio de limpieza residencial y comercial en el condado de Los Angeles',
    'Renta de baños portátiles para eventos y obras en construcción',
    'Trabajamos solo con materiales certificados y garantía escrita',
    'Es un proceso de 90 días con reportes mensuales',
    'La expansión del negocio requiere cimientos digitales sólidos',
    'Contratista general establecido desde 2014, con licencia CSLB',
    'Necesita clientes con urgencia antes de la temporada alta',
    'Instalación de HVAC residencial',
    'Landscaping y mantenimiento de jardines',
    '[PENDIENTE]',
    'Licencias: [PENDIENTE]',
    ''
  ];
  for (const s of sanas) {
    assert.deepEqual(
      detectRawCodeTokens(s),
      [],
      `falso positivo sobre prosa sana: «${s}»`
    );
  }
});

test('T-06 ⭐ R-20 las colisiones con el español están EXCLUIDAS y declaradas', () => {
  // `solo`, `process`, `expansion`, `cimientos`, `dominio`, `urgent`, `established`,
  // `apps`, `paper` son a la vez códigos y palabras corrientes: marcarlos daría falsos
  // positivos sobre prosa sana. Ninguno de los 4 defectos reales los usa.
  for (const palabra of [
    'solo',
    'proceso',
    'expansion',
    'cimientos',
    'dominio'
  ]) {
    assert.deepEqual(
      detectRawCodeTokens(`El negocio ${palabra} en la zona`),
      []
    );
  }
  const GUARD = stripComments(
    readFileSync(resolve(REPO, 'src/lib/onboarding/assembly-guard.ts'), 'utf8')
  );
  assert.match(
    GUARD,
    /NATURAL_LANGUAGE_COLLISIONS\s*=\s*new Set\(\[/,
    'la exclusión debe estar DECLARADA en el módulo, no dispersa en condiciones sueltas'
  );
});

test('T-06 R-20 palabra COMPLETA y case-SENSITIVE: la etiqueta legítima no se marca', () => {
  // Sub-cadena: `otherwise` NO contiene el token `other`.
  assert.deepEqual(detectRawCodeTokens('otherwise the job is done'), []);
  assert.deepEqual(detectRawCodeTokens('brothers and mothers'), []);
  // La ETIQUETA suele diferir sólo en el caso ⇒ distinguirlas por caso separa el
  // defecto de su arreglo.
  assert.deepEqual(detectRawCodeTokens('Instalación de HVAC'), []);
  assert.deepEqual(detectRawCodeTokens('Servicios de Landscaping'), []);
  assert.deepEqual(detectRawCodeTokens('landscaping'), ['landscaping']);
  // Y los códigos numéricos no se disparan dentro de números más largos.
  assert.deepEqual(detectRawCodeTokens('el proyecto 12_54 quedó cerrado'), []);
  assert.deepEqual(detectRawCodeTokens('equipo: 2_5'), ['2_5']);
});

test('T-06 R-20 no lanza ante entradas no-string', () => {
  for (const v of [null, undefined, 42, true, {}, []]) {
    assert.deepEqual(detectRawCodeTokens(v), []);
  }
});

/* ================================================================== */
/*  ⭐ El vocabulario NO es una cuarta copia de la tabla               */
/* ================================================================== */

test('T-06 ⭐ R-14 el vocabulario de industrias se DERIVA de `INDUSTRIES`, no se copia', () => {
  const GUARD = stripComments(
    readFileSync(resolve(REPO, 'src/lib/onboarding/assembly-guard.ts'), 'utf8')
  );
  assert.match(
    GUARD,
    /import\s*\{\s*INDUSTRIES\s*\}\s*from\s*'\.\.\/clients\/industry-label\.ts'/
  );
  assert.match(GUARD, /INDUSTRIES\.map\(\s*\(i\)\s*=>\s*i\.value\s*\)/);
  // Y no reintroduce la tabla: cero pares `{ value, label }` en este archivo.
  assert.doesNotMatch(
    GUARD,
    /\{\s*value:\s*'[a-z_]+',\s*label:/,
    'reapareció una copia de la tabla de industrias en `assembly-guard.ts`'
  );
});

/* ================================================================== */
/*  ⭐ H-3 — el literal del marcador sigue definido UNA sola vez       */
/* ================================================================== */

test('T-06 ⭐⭐ H-3 los archivos nuevos de F-121 NO escriben el literal del marcador en `src/lib`', () => {
  // Criterio EXACTO de `f113-source-guards` T-11 R-08 (el más estricto de los dos que
  // fijan la restricción): se mira el CÓDIGO sin comentarios —una mención en prosa no es
  // una definición— y la comparación es case-insensitive. Re-ejercido acá para que la
  // restricción viaje CON la feature en vez de depender de un guard ajeno.
  const hits: string[] = [];
  const walk = (dir: string, rel = ''): void => {
    for (const e of readdirSync(resolve(REPO, dir), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(`${dir}/${e.name}`, r);
      else if (/\.tsx?$/.test(e.name)) {
        const code = stripComments(
          readFileSync(resolve(REPO, `${dir}/${e.name}`), 'utf8')
        );
        const n = (code.match(/'\[pendiente\]'/gi) ?? []).length;
        for (let k = 0; k < n; k++) hits.push(r);
      }
    }
  };
  walk('src/lib');
  assert.deepEqual(
    hits,
    ['method-context/pending.ts'],
    'apareció una SEGUNDA definición del marcador en `src/lib` (H-3): ' +
      hits.join(', ')
  );
});

/* ================================================================== */
/*  Barrido sobre un `content` completo                                */
/* ================================================================== */

test('T-06 R-20 el barrido por claves reporta clave + tokens, y `raw_text` no queda exento', () => {
  const content = {
    business_name: 'Clara V Decor',
    goal_12m: VALORES_REALES.clara_goal_12m,
    search_behavior: VALORES_REALES.clara_search_behavior,
    digital_presence: VALORES_REALES.scs_digital_presence,
    guarantees: 'Garantía escrita de mano de obra',
    raw_text: '# BRIEF\n\nIndustria: other'
  };
  const found = detectRawCodeTokensInContent(content);
  const claves = found.map((f) => f.key).sort();
  assert.deepEqual(claves, [
    'digital_presence',
    'goal_12m',
    'raw_text',
    'search_behavior'
  ]);
  assert.ok(!claves.includes('business_name'));
  assert.ok(!claves.includes('guarantees'));
  assert.deepEqual(detectRawCodeTokensInContent(null), []);
  assert.deepEqual(detectRawCodeTokensInContent('no soy un objeto'), []);
});
