/**
 * F-122 — **T-28 / T-29 / T-30** — ⭐⭐⭐ **La declaración única habla DOS idiomas**
 * (R-50, R-51, R-52, R-53, R-54, R-55).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO, VERIFICADO Y NO SUPUESTO
 * ─────────────────────────────────────────────────────────────────────────────────
 * `api/generate-alt-text/route.ts` compone `'Industry: ' + toIndustryLabel(...)` dentro
 * de un prompt que dice **`English only`**, y `toIndustryLabel` devuelve la etiqueta
 * **española** (`Plomería`, `Limpieza`, `Cercas`). En `9509f6f` esa línea llevaba el
 * **código crudo** (`plumbing`), que al menos se lee como inglés ⇒ **para esa superficie
 * F-122 fue una REGRESIÓN**.
 *
 * ⭐⭐ **La lección de método, que vale más que el fix.** R-14/R-18 medían *"¿la industria
 * pasa por la declaración única?"*. La respuesta era **sí**. **El guard estaba VERDE y el
 * artefacto estaba MAL**, porque **el guard medía la RUTA del dato, no el IDIOMA del
 * artefacto**. Tercera aparición de `feedback_guards_measure_index_not_world` — y esta
 * vez **la produjo la propia feature que instaló el guard**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⭐ LA REGLA (R-52) Y POR QUÉ ES VERIFICABLE
 * ─────────────────────────────────────────────────────────────────────────────────
 * **El rendering acompaña al idioma del TEXTO QUE LO RODEA en el artefacto producido.**
 * No al idioma del código, ni al del repo, ni al de la UI que lo dispara. El criterio es
 * **observable en el propio literal** que se está componiendo — y por eso puede exigirlo
 * un guard en vez de quedar como convención. **La convención es precisamente lo que falló
 * acá:** F-122 tenía la declaración única, tenía el guard, y aun así escribió `Plomería`
 * dentro de un prompt inglés.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⚠️ ANTI-NO-OP, CON SU FORMA ESPECÍFICA Y NO NEGOCIABLE (R-53/R-55)
 * ─────────────────────────────────────────────────────────────────────────────────
 * El guard de idioma **debe encontrarse ROJO contra `86fae28`** —el tramo offline
 * aprobado, **el único commit donde la regresión existe**—.
 * ⛔ **Anclarlo a `9509f6f` no probaría nada:** ahí la línea llevaba el código crudo y el
 * defecto de idioma **todavía no había nacido** ⇒ **verde por ausencia de sujeto**, el
 * fallo exacto que CL-109 documentó cuatro veces. Los dos casos se ejercen abajo, cada
 * uno con su rol declarado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  INDUSTRIES,
  toIndustryLabel,
  toIndustryLabelEn
} from '../../src/lib/clients/industry-label.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * ⭐ **Anclas declaradas, cada una con su ROL (R-55). Ninguna es `HEAD`.**
 * · `9509f6f` — estado **previo a F-122**: ahí la industria viajaba CRUDA y el defecto de
 *   idioma **no existía**. Sirve para probar que el guard **no** puede anclarse ahí.
 * · `86fae28` — estado **posterior al tramo offline aprobado**: el **único** commit donde
 *   la regresión vive. Es el ancla del anti-no-op.
 */
const BASE = '9509f6f';
const POST_OFFLINE = '86fae28';
const LABEL_REL = 'src/lib/clients/industry-label.ts';
const ALT_REL = 'src/app/api/generate-alt-text/route.ts';

const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
const desde = (commit: string, rel: string): string =>
  git('show', `${commit}:${rel}`);

/* ================================================================== */
/*  Derivadores del guard de IDIOMA (R-53) — nada enumerado (R-40)      */
/* ================================================================== */

/** Todo literal de string/template de un tramo de código. */
const LITERALES = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/**
 * ⭐ ¿El artefacto que rodea a esta llamada **declara salida en inglés**?
 *
 * Se deriva **del propio texto** que se está componiendo: se leen los literales vecinos
 * y se busca la marca de idioma que el artefacto lleva escrita (`English only`,
 * `in English`, `respond in English` y cualquier equivalente que nombre el idioma). **No
 * hay una lista de sitios ni de frases exactas** (R-40): la marca es el nombre del idioma
 * dentro del literal, que es lo que un autor humano escribe cuando fija la salida.
 */
function declaraSalidaInglesa(codigo: string, indice: number): boolean {
  const a = Math.max(0, indice - 600);
  const b = Math.min(codigo.length, indice + 600);
  const literales = (codigo.slice(a, b).match(LITERALES) ?? []).join(' | ');
  return /\bEnglish\b/i.test(literales);
}

interface SitioDeIndustria {
  rel: string;
  linea: number;
  rendering: 'es' | 'en';
  salidaInglesa: boolean;
}

/** Todos los sitios de `src/` que componen la industria, DERIVADOS del repo (R-40). */
function sitiosDeIndustria(
  leer: (rel: string) => string,
  archivos: string[]
): SitioDeIndustria[] {
  const out: SitioDeIndustria[] = [];
  for (const rel of archivos) {
    if (rel === LABEL_REL) continue; // la declaración no es un consumidor
    let codigo: string;
    try {
      codigo = stripComments(leer(rel));
    } catch {
      continue;
    }
    for (const m of Array.from(codigo.matchAll(/toIndustryLabel(En)?\s*\(/g))) {
      const i = m.index as number;
      out.push({
        rel,
        linea: codigo.slice(0, i).split('\n').length,
        rendering: m[1] ? 'en' : 'es',
        salidaInglesa: declaraSalidaInglesa(codigo, i)
      });
    }
  }
  return out;
}

/** Los sitios que MEZCLAN idioma: el veredicto del guard. */
const mezclanIdioma = (sitios: SitioDeIndustria[]): SitioDeIndustria[] =>
  sitios.filter((s) =>
    s.salidaInglesa ? s.rendering !== 'en' : s.rendering !== 'es'
  );

/** Los `.ts`/`.tsx` de `src/` en disco. */
function archivosDeSrc(): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(resolve(REPO, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(r);
      else if (/\.tsx?$/.test(e.name)) out.push(r);
    }
  };
  walk('src');
  return out.sort();
}

/** Los `.ts`/`.tsx` de `src/` **en un commit** (para correr el guard contra un ancla). */
const archivosDeSrcEn = (commit: string): string[] =>
  git('ls-tree', '-r', '--name-only', commit, 'src/')
    .split('\n')
    .filter((p) => /\.tsx?$/.test(p))
    .sort();

/* ================================================================== */
/*  ⭐⭐ T-28 / R-50 — el rendering inglés, DENTRO de la declaración     */
/* ================================================================== */

test('T-28 ⭐⭐ R-50 los 10 valores tienen su etiqueta inglesa, salida de la MISMA tabla', () => {
  const esperado: [string, string][] = [
    ['landscaping', 'Landscaping'],
    ['roofing', 'Roofing'],
    ['plumbing', 'Plumbing'],
    ['hvac', 'HVAC'],
    ['painting', 'Painting'],
    ['cleaning', 'Cleaning'],
    ['fencing', 'Fencing'],
    ['electrical', 'Electrical'],
    ['general_contractor', 'General Contractor']
  ];
  for (const [value, labelEn] of esperado) {
    assert.equal(toIndustryLabelEn(value), labelEn, `${value} en inglés`);
    // Y la etiqueta sale de la fila, no de un mapa aparte.
    assert.equal(INDUSTRIES.find((i) => i.value === value)?.labelEn, labelEn);
  }
  // Mismo contrato de AUSENCIA que el español (R-15).
  assert.equal(toIndustryLabelEn('other'), null, '`other` = AUSENCIA');
  assert.equal(toIndustryLabelEn(''), null);
  assert.equal(toIndustryLabelEn('   '), null);
  assert.equal(toIndustryLabelEn(null), null);
  assert.equal(toIndustryLabelEn(undefined), null);
  // Fuera de tabla: des-tokenizado tal cual — **el rubro libre NO se traduce**
  // (non-goal 11). `Decoración de interiores` sale como se escribió, también acá.
  assert.equal(
    toIndustryLabelEn('portable_toilet_rental_service'),
    'portable toilet rental service'
  );
  assert.equal(
    toIndustryLabelEn('Decoración de interiores'),
    'Decoración de interiores',
    'non-goal 11: traducir texto libre exigiría un traductor y una decisión de ' +
      'producto que nadie tomó'
  );
});

test('T-28 ⭐⭐⭐ R-50 NO existe una segunda tabla ni un mapa `es→en` fuera de la declaración única', () => {
  const declaraciones = archivosDeSrc().filter((rel) =>
    /(?:export\s+)?const\s+INDUSTRIES\s*(?::[^=]*)?=/.test(
      stripComments(read(rel))
    )
  );
  assert.deepEqual(
    declaraciones,
    [LABEL_REL],
    'R-50: el objetivo es que la declaración siga siendo ÚNICA hablando DOS idiomas — ' +
      'no que haya dos declaraciones, una por idioma. Un mapa `es→en` en otro archivo ' +
      'sería la COPIA Nº 3 de la tabla, la clase de fallo que DT-05 de F-121 cerró.'
  );
  // Y ninguna etiqueta inglesa suelta por ahí: las 6 que cambian de idioma sólo pueden
  // aparecer dentro del archivo que las declara.
  const inglesas = [
    'Plumbing',
    'Painting',
    'Cleaning',
    'Fencing',
    'Electrical'
  ];
  for (const rel of archivosDeSrc()) {
    if (rel === LABEL_REL) continue;
    const code = stripComments(read(rel));
    for (const et of inglesas) {
      assert.ok(
        !new RegExp(`['"\`]${et}['"\`]`).test(code),
        `${rel}: declara la etiqueta inglesa \`${et}\` por su cuenta (R-50)`
      );
    }
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ T-28 / R-54 — `toIndustryLabel` NO cambió para NADIE          */
/* ================================================================== */

/** Importa el módulo de la declaración única **tal como estaba en un commit**. */
async function moduloDelAncla(commit: string): Promise<{
  toIndustryLabel: (r: string | null | undefined) => string | null;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'f122-industry-'));
  const archivo = join(dir, 'industry-label.ts');
  writeFileSync(archivo, desde(commit, LABEL_REL), 'utf8');
  return (await import(pathToFileURL(archivo).href)) as never;
}

test('T-28 ⭐⭐⭐ R-54/R-03 `toIndustryLabel` devuelve EXACTAMENTE lo mismo que en `86fae28`', async () => {
  const antes = await moduloDelAncla(POST_OFFLINE);
  const casos = [
    ...INDUSTRIES.map((i) => i.value),
    '',
    '   ',
    'portable_toilet_rental_service',
    'Decoración de interiores'
  ];
  for (const c of casos) {
    assert.equal(
      toIndustryLabel(c),
      antes.toIndustryLabel(c),
      `R-54: \`toIndustryLabel(${JSON.stringify(c)})\` cambió. Tocar su contrato ` +
        'arrastraría los ~14 consumidores que F-122 acaba de enrutar.'
    );
  }
  assert.equal(toIndustryLabel(null), antes.toIndustryLabel(null));
  assert.equal(toIndustryLabel(undefined), antes.toIndustryLabel(undefined));
  // Los invariantes de F-121, nombrados uno por uno (R-03).
  assert.equal(toIndustryLabel('cleaning'), 'Limpieza');
  assert.equal(toIndustryLabel('other'), null);
  assert.equal(
    toIndustryLabel('portable_toilet_rental_service'),
    'portable toilet rental service'
  );
});

test('T-28 ⭐⭐ R-54 el rendering inglés es una función NUEVA: la firma española no cambió', () => {
  const hoy = stripComments(read(LABEL_REL));
  const antes = stripComments(desde(POST_OFFLINE, LABEL_REL));
  const firma = /export function toIndustryLabel\([^)]*\):\s*string \| null/;
  assert.match(hoy, firma);
  assert.match(antes, firma);
  assert.match(
    hoy,
    /export function toIndustryLabelEn\(/,
    'el rendering inglés debe ser una función NUEVA, no un parámetro de la vieja'
  );
  // Y las etiquetas ESPAÑOLAS son las mismas, fila por fila.
  const etiquetasEs = (src: string): [string, string][] =>
    Array.from(
      src.matchAll(/value:\s*'([^']+)',\s*\n?\s*label:\s*'([^']+)'/g),
      (m) => [m[1], m[2]] as [string, string]
    );
  assert.deepEqual(
    etiquetasEs(hoy),
    etiquetasEs(antes),
    'R-54: ninguna superficie española debe cambiar el texto que emite hoy'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ T-29 / R-51/R-52 — la superficie inglesa y su regla declarada  */
/* ================================================================== */

/** Reconstruye el texto del prompt de alt-text con una industria dada. */
function promptDeAltText(industry: string | null): string {
  const code = stripComments(read(ALT_REL));
  const i = code.indexOf("'Generate SEO-optimized alt text");
  assert.ok(i > 0, 'la ruta ya no compone el prompt de alt-text');
  const j = code.indexOf(
    '}\n',
    code.indexOf('Respond with ONLY the alt text', i)
  );
  const expr = code.slice(i, j);
  // Se EJECUTA la concatenación real, con `client` y el rendering inyectados: no es un
  // `assert.match` sobre una llamada, es el string que sale.
  return new Function(
    'client',
    'photo',
    'toIndustryLabelEn',
    `return (${expr.replace(/\(photo as any\)/g, 'photo')});`
  )(
    { business_name: 'SCS CLeaning Service', industry },
    { gbp_category: 'work' },
    toIndustryLabelEn
  ) as string;
}

test('T-29 ⭐⭐⭐ R-51 el prompt INGLÉS de alt-text lleva la etiqueta INGLESA', () => {
  const p = promptDeAltText('plumbing');
  assert.match(p, /Industry: Plumbing/);
  assert.ok(
    !/Plomería/.test(p),
    '⭐ ÉSTE es el defecto: `Plomería` dentro de un prompt que dice `English only`. El ' +
      'guard de R-14/R-18 estaba VERDE porque medía la RUTA del dato, no el IDIOMA del ' +
      'artefacto.'
  );
  // Y el literal sigue declarando su idioma: es lo que hace verificable la regla (R-52).
  assert.match(p, /English only/);
  assert.match(promptDeAltText('cleaning'), /Industry: Cleaning/);
});

test('T-29 ⭐⭐ R-51 la AUSENCIA se expresa en el idioma de la superficie, y el fallback se PRESERVA', () => {
  assert.match(
    promptDeAltText('other'),
    /Industry: home services/,
    'el fallback `home services` ya estaba en inglés y era correcto: la enmienda ' +
      'corrige el rendering del valor PRESENTE, no la expresión de la ausencia'
  );
  assert.match(promptDeAltText(null), /Industry: home services/);
});

test('T-29 ⭐⭐ non-goal 11 el rubro LIBRE no se traduce ni se tokeniza en la superficie inglesa', () => {
  assert.match(
    promptDeAltText('Decoración de interiores'),
    /Industry: Decoración de interiores/,
    'un rubro escrito por el operador se emite TAL COMO SE ESCRIBIÓ, también en inglés'
  );
  assert.match(
    promptDeAltText('portable_toilet_rental_service'),
    /Industry: portable toilet rental service/,
    'fuera de tabla ⇒ des-tokenizado, jamás crudo (volver al código crudo pondría rojo ' +
      'el source-guard de R-18, y con razón)'
  );
});

test('T-29 ⭐⭐ R-54 las superficies ESPAÑOLAS no cambiaron ni un byte de su salida', () => {
  for (const rel of [
    'src/app/api/generate-content/route.ts',
    'src/lib/gbp-slice/prompt.ts',
    'src/lib/gbp-slice/knowledge-panel.ts'
  ]) {
    assert.equal(
      stripComments(read(rel)).replace(/\s+/g, ' ').trim(),
      stripComments(desde(POST_OFFLINE, rel)).replace(/\s+/g, ' ').trim(),
      `${rel}: la enmienda 2 toca UNA superficie —la inglesa—; ninguna española cambia`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ T-30 / R-53 — el SOURCE-GUARD de idioma                       */
/* ================================================================== */

test('T-30 ⭐⭐⭐ R-53 ningún sitio del repo MEZCLA idioma al componer la industria', () => {
  const sitios = sitiosDeIndustria(read, archivosDeSrc());
  // Anti-no-op del derivador: si no encontrara consumidores, todo pasaría solo.
  assert.ok(
    sitios.length >= 10,
    `el derivador sólo encontró ${sitios.length} sitios de industria: el barrido está roto`
  );
  const ingleses = sitios.filter((s) => s.salidaInglesa);
  assert.ok(
    ingleses.length >= 1,
    'no se encontró NINGUNA superficie de salida inglesa: sin sujeto, el guard es un ' +
      'no-op (verde por ausencia — el fallo que CL-109 documentó cuatro veces)'
  );
  assert.deepEqual(
    mezclanIdioma(sitios).map((s) => `${s.rel}:${s.linea} (${s.rendering})`),
    [],
    '⭐ R-52: el rendering acompaña al idioma del TEXTO QUE LO RODEA en el artefacto ' +
      'producido — no al del código, ni al del repo, ni al de la UI que lo dispara. Un ' +
      'consumidor nuevo que mezcle idioma se pone rojo solo, que es lo que convierte ' +
      'R-52 en una regla exigible y no en una convención.'
  );
});

test('T-30 ⭐⭐⭐ ANTI-NO-OP: el guard está ROJO contra `86fae28` — el único commit donde la regresión vive', () => {
  const sitios = sitiosDeIndustria(
    (rel) => desde(POST_OFFLINE, rel),
    archivosDeSrcEn(POST_OFFLINE)
  );
  const mezcla = mezclanIdioma(sitios);
  assert.deepEqual(
    mezcla.map((s) => s.rel),
    [ALT_REL],
    '⛔ Si este guard estuviera VERDE contra `86fae28`, no estaría midiendo nada: ése es ' +
      'el commit del tramo offline APROBADO 9/9, y ahí `toIndustryLabel` (español) se ' +
      'compone dentro de un prompt que dice `English only`.'
  );
  assert.equal(mezcla[0].rendering, 'es');
  assert.match(
    stripComments(desde(POST_OFFLINE, ALT_REL)),
    /toIndustryLabel\(client\?\.industry\)/,
    'el sujeto de la regresión, citado literalmente'
  );
});

test('T-30 ⭐⭐⭐ R-55 contra `9509f6f` el guard estaría VERDE POR AUSENCIA DE SUJETO — por eso NO se ancla ahí', () => {
  const sitios = sitiosDeIndustria(
    (rel) => desde(BASE, rel),
    archivosDeSrcEn(BASE)
  );
  assert.deepEqual(
    mezclanIdioma(sitios),
    [],
    'en el ancla previa a F-122 no hay mezcla de idioma que encontrar'
  );
  // Y la razón, explícita: ahí la superficie inglesa NI SIQUIERA llamaba a la
  // declaración única — inyectaba el código crudo. El defecto no había nacido.
  const alt = stripComments(desde(BASE, ALT_REL));
  assert.ok(
    !/toIndustryLabel/.test(alt),
    'en `9509f6f` la ruta no consumía la declaración única'
  );
  assert.match(
    alt,
    /Industry: ' \+\s*\(client\?\.industry/,
    '⭐ Ahí la línea llevaba el CÓDIGO CRUDO (`plumbing`), que al menos se lee como ' +
      'inglés. Anclar el guard de idioma acá lo dejaría verde por ausencia de sujeto: ' +
      'la forma exacta del no-op que R-53 prohíbe.'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-55 — las DOS anclas existen y son lo que dicen ser            */
/* ================================================================== */

test('T-30 ⭐⭐ R-55 el conjunto de anclas está DECLARADO, cada una con su rol, y ninguna es la punta', () => {
  for (const c of [BASE, POST_OFFLINE]) {
    assert.equal(
      git('cat-file', '-t', c).trim(),
      'commit',
      `${c} no es un commit`
    );
  }
  // `9509f6f` es ANTERIOR a F-122: ninguno de los módulos nuevos existe ahí.
  let existe = true;
  try {
    desde(BASE, 'src/lib/clients/capture-guard.ts');
  } catch {
    existe = false;
  }
  assert.equal(existe, false, '`9509f6f` debe ser anterior a F-122');
  // `86fae28` es POSTERIOR al tramo offline: los módulos nuevos ya están.
  assert.ok(desde(POST_OFFLINE, 'src/lib/clients/capture-guard.ts').length > 0);
  // Y `86fae28` es DESCENDIENTE de `9509f6f`: el orden de los roles no es una opinión.
  // `--is-ancestor` sale con código ≠ 0 si no lo fuera, y `execFileSync` lanzaría.
  git('merge-base', '--is-ancestor', BASE, POST_OFFLINE);
});
