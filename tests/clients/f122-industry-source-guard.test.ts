/**
 * F-122 — T-04 — ⭐⭐⭐ **El source-guard EXHAUSTIVO de la declaración única**
 * (R-08, R-14, R-18, R-40).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ESTE ES EL TEST QUE HACE VERDADERA LA PALABRA «ÚNICA»
 * ─────────────────────────────────────────────────────────────────────────────────
 * F-121 **declaró** la fuente única (DT-05) y corrigió los 3 productores que veía. En el
 * MISMO arco reaparecieron 4 consumidores del código crudo —uno de ellos
 * (`gbp-slice/prompt.ts`) sin registrar en ninguna parte— porque **nada los vigilaba**.
 * Una declaración sin enforcement no es una fuente única: es una convención.
 *
 * ⭐ **Hallazgo de la ejecución de F-122, dejado asentado acá:** cuando este guard se
 * corrió por primera vez encontró **NUEVE sitios más** de los 5 que el spec enumeró
 * (`requirements.md` E-8 + DT-02) — la lista de clientes, dos de la ficha, dos
 * selectores de onboarding, el prompt de alt-text y **tres de la vista pública del
 * preview**. Ninguno estaba en ningún documento. Es exactamente la evidencia empírica
 * que DT-02 anticipó ("y ya sabemos que el sitio nº 5 aparece"), sólo que a mayor escala.
 * Todos quedaron enrutados por la declaración única; **el que los encontró fue el guard,
 * no la lectura.**
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * R-40 — LA LISTA SE DESCUBRE, NO SE ENUMERA
 * ─────────────────────────────────────────────────────────────────────────────────
 * Los sitios se derivan recorriendo `src/`. Lo único enumerado son las **excepciones**,
 * cada una con su razón escrita acá (T-04 lo autoriza explícitamente), y el test
 * verifica además que ninguna excepción esté **obsoleta**: una excepción que ya no
 * corresponde a un sitio real es una puerta abierta sin dueño.
 *
 * ⚠️ **Criterio, y por qué es éste:** R-14 dice *"ningún consumidor deberá leer
 * `clients.industry` y componerlo dentro de un string"*. Lo prohibido es el uso
 * **PRESENTACIONAL** del valor crudo. Leerlo para enlazar un `<select>`, para compararlo
 * con `'other'` o para pasárselo al seam que lo persiste **no** es presentación y no
 * puede exigirse que pase por `toIndustryLabel` — exigirlo volvería el guard un ruido
 * que la próxima feature apagaría. El criterio distingue por el **rol sintáctico** del
 * uso, que se deriva del código; no por el nombre del archivo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
/** ⭐ Ancla FIJA de todos los source-guards de F-122 (R-39). Jamás `HEAD`. */
const BASE = '9509f6f';
const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Todos los `.ts`/`.tsx` de `src/`, descubiertos de disco (nunca hardcodeados). */
function fuentes(): string[] {
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

/** La declaración única: es la fuente, no un consumidor. */
const DECLARACION = 'src/lib/clients/industry-label.ts';

/**
 * ⭐ Las ÚNICAS excepciones, cada una con su razón. Son **roles**, no archivos: un sitio
 * nuevo con el mismo rol cae acá; un sitio nuevo PRESENTACIONAL no.
 */
const EXCEPCIONES: { rol: string; razon: string }[] = [
  {
    rol: 'write-path / seam de persistencia',
    razon:
      'El valor que se PERSISTE es el código del vocabulario cerrado (o el rubro libre ' +
      'verbatim). Pasarlo por `toIndustryLabel` antes de guardarlo escribiría la ETIQUETA ' +
      'en la columna y rompería R-11 y el contrato de F-121.'
  },
  {
    rol: 'binding de un control de formulario (`value={…}`)',
    razon:
      'El `<select>` se enlaza al CÓDIGO, que es lo que sus `<option>` declaran. ' +
      'Enlazarlo a la etiqueta dejaría el control sin opción coincidente.'
  },
  {
    rol: 'comparación / predicado (`=== "other"`, `!!x.industry`)',
    razon: 'No hay presentación: no se compone ningún string con el valor.'
  }
];

/* ------------------------------------------------------------------ */
/*  El detector: usos PRESENTACIONALES de `.industry` sin resolver     */
/* ------------------------------------------------------------------ */

interface Uso {
  archivo: string;
  fragmento: string;
  presentacional: boolean;
  resuelto: boolean;
}

const LECTURA = /[A-Za-z_$][\w$]*(?:\??\.[\w$]+)*\??\.industry\b/g;

function usos(rel: string, fuente?: string): Uso[] {
  const code = stripComments(fuente ?? read(rel));
  const out: Uso[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(LECTURA.source, 'g');
  while ((m = re.exec(code)) !== null) {
    const pre = code.slice(Math.max(0, m.index - 80), m.index);
    const post = code.slice(m.index + m[0].length, m.index + m[0].length + 60);

    // Resuelto = el valor es argumento directo de la declaración única, o del seam que
    // la consume para persistir.
    const resuelto =
      /toIndustryLabel\(\s*\(?[^)]*$/.test(pre) ||
      /resolveIndustryForPersist\([^)]*$/.test(pre) ||
      /validateFreeIndustry\([^)]*$/.test(pre);

    // Presentacional = el valor se COMPONE dentro de un string (R-14):
    //   · `…?.replace(` / `.toUpperCase()` — des-tokenización artesanal;
    //   · hijo de JSX `{x.industry}` (llaves NO precedidas de `=`, que serían un prop);
    //   · interpolación de template `${x.industry}`;
    //   · concatenación `+ (x.industry …)`.
    const presentacional =
      /^\s*\??\.(replace|toUpperCase|toLowerCase)\s*\(/.test(post) ||
      (/[^=]\{\s*$/.test(pre) && /^\s*\}/.test(post)) ||
      /\$\{\s*$/.test(pre) ||
      /\+\s*\(?\s*$/.test(pre) ||
      /^\s*\+/.test(post);

    out.push({
      archivo: rel,
      fragmento: (pre.slice(-40) + m[0] + post.slice(0, 40))
        .replace(/\s+/g, ' ')
        .trim(),
      presentacional,
      resuelto
    });
  }

  // ⭐ **Un salto de alias.** El defecto E-8(a) de F-121 no era un uso directo: era
  // `const ind = (client?.industry as string) || ''` y DESPUÉS `ind.replace(/_/g,' ')`
  // interpolado en cuatro frases. Sin seguir ese salto, el guard vería una asignación
  // inocente y se declararía verde mientras la pantalla escribía «para other».
  const alias = /const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*\.industry[^;\n]*)/g;
  let a: RegExpExecArray | null;
  while ((a = alias.exec(code)) !== null) {
    const [, nombre, rhs] = a;
    if (/toIndustryLabel\(|resolveIndustryForPersist\(/.test(rhs)) continue;
    const usoPresentacional = new RegExp(
      `\\$\\{\\s*${nombre}\\b|\\b${nombre}\\s*\\.(replace|toUpperCase|toLowerCase)\\s*\\(|[^=]\\{\\s*${nombre}\\s*\\}`
    );
    if (usoPresentacional.test(code)) {
      out.push({
        archivo: rel,
        fragmento: `alias crudo \`${nombre}\` ← ${rhs.trim()}`,
        presentacional: true,
        resuelto: false
      });
    }
  }

  // ⭐ **Un salto de función local.** La otra forma de la misma indirección: la industria
  // no se compone en el sitio, se le pasa a un helper del archivo que hace la
  // des-tokenización artesanal por su cuenta. Ésta era exactamente la deuda #2 de CL-112
  // (`formatIndustry(c?.industry)` en `knowledge-panel.ts`): un criterio propio a un
  // salto de distancia. El conjunto de helpers se DERIVA del archivo (R-40).
  const helper = /function\s+([A-Za-z_$][\w$]*)\s*\(([\s\S]{0,500}?)\n\}/g;
  let h: RegExpExecArray | null;
  while ((h = helper.exec(code)) !== null) {
    const [, nombre, cuerpo] = h;
    if (!/\.replace\(\/_\/g/.test(cuerpo)) continue;
    if (/toIndustryLabel\(/.test(cuerpo)) continue; // delega en la declaración única
    const llamada = new RegExp(`\\b${nombre}\\(\\s*[^)]*\\.industry`);
    if (llamada.test(code)) {
      out.push({
        archivo: rel,
        fragmento: `criterio propio \`${nombre}()\` aplicado a \`.industry\``,
        presentacional: true,
        resuelto: false
      });
    }
  }
  return out;
}

const TODOS = fuentes()
  .filter((rel) => rel !== `/${DECLARACION}` && !rel.endsWith(DECLARACION))
  .flatMap((rel) => usos(rel));

/* ================================================================== */
/*  ⭐ Anti-no-op: el barrido tiene que ENCONTRAR algo                  */
/* ================================================================== */

test('T-04 ⭐ R-40 el barrido descubre los sitios del repo (si sale vacío, el guard es un no-op)', () => {
  assert.ok(
    fuentes().length > 100,
    `sólo ${fuentes().length} archivos en \`src/\`: el recorrido está roto`
  );
  assert.ok(
    TODOS.length >= 20,
    `sólo ${TODOS.length} lecturas de \`.industry\` descubiertas: el detector dejó de ` +
      'medir el repo (R-40: el conjunto se DERIVA, no se enumera)'
  );
  assert.ok(
    TODOS.some((u) => !u.presentacional),
    'todos los usos clasificados como presentacionales: el clasificador quedó romo'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ ANTI-NO-OP REAL: el guard está ROJO contra el ancla `9509f6f` */
/* ================================================================== */

test('T-04 ⭐⭐⭐ R-38 el mismo guard, corrido contra `9509f6f`, encuentra los sitios crudos', () => {
  // Un detector que sólo se corre contra el estado ARREGLADO no prueba nada: verde por
  // ausencia de sujeto. Se lo corre contra el ancla —donde el defecto SÍ estaba— y tiene
  // que encontrarlo. Es la forma exigible de «un guard que nunca dispara ⇒ rojo» (R-38).
  // Los archivos del ancla que mencionan `.industry`, DERIVADOS con `git grep` (no
  // enumerados) y acotados a `src/` para no barrer el árbol entero.
  const candidatos = git('grep', '-l', '-F', '.industry', BASE, '--', 'src')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(l.indexOf(':') + 1))
    .filter((p) => /\.tsx?$/.test(p));
  assert.ok(
    candidatos.length >= 10,
    `en \`${BASE}\` sólo ${candidatos.length} archivos mencionan \`.industry\`: el ` +
      'descubrimiento contra el ancla está roto'
  );
  const enBase: string[] = [];
  for (const rel of candidatos) {
    const antes = git('show', `${BASE}:${rel}`);
    for (const u of usos(rel, antes)) {
      if (u.presentacional && !u.resuelto)
        enBase.push(`${rel} → ${u.fragmento}`);
    }
  }
  assert.ok(
    enBase.length >= 10,
    `contra \`${BASE}\` el guard encontró sólo ${enBase.length} sitios crudos. En el ` +
      'ancla había al menos 14 (los 5 que el spec enumeró + los 9 que este guard ' +
      'descubrió): si no los encuentra, el detector está ciego y su verde de hoy no ' +
      'significa nada.'
  );
  // Y los sitios que el SPEC enumeró están entre ellos: el detector ve lo que se sabía.
  for (const conocido of [
    'src/app/(app)/onboarding/brief/[clientId]/page.tsx',
    'src/lib/gbp-slice/knowledge-panel.ts',
    'src/lib/gbp-slice/prompt.ts'
  ]) {
    assert.ok(
      enBase.some((s) => s.startsWith(conocido)),
      `el detector NO ve el sitio conocido \`${conocido}\` en el ancla ⇒ está midiendo mal`
    );
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ R-14 / R-18 — CERO usos presentacionales sin resolver         */
/* ================================================================== */

test('T-04 ⭐⭐⭐ R-18 ningún sitio de `src/` compone la industria CRUDA dentro de un string', () => {
  const crudos = TODOS.filter((u) => u.presentacional && !u.resuelto);
  assert.deepEqual(
    crudos.map((u) => `${u.archivo} → ${u.fragmento}`),
    [],
    'R-14/R-18: estos sitios leen `clients.industry` y lo componen en un string sin ' +
      'pasar por la declaración única. Con `other` publican el TOKEN («para other», ' +
      'categoría "other"); con un valor fuera de tabla publican el `snake_case`. La ' +
      'lista de arriba se DERIVÓ del repo: si aparece un sitio nuevo, este test se pone ' +
      'rojo solo — que es exactamente lo que F-121 no tenía.'
  );
});

test('T-04 ⭐⭐ R-14 nadie reimplementa la des-tokenización artesanal `_`→espacio sobre industria', () => {
  const infractores: string[] = [];
  for (const rel of fuentes()) {
    if (rel.endsWith(DECLARACION)) continue; // es la implementación legítima
    const code = stripComments(read(rel));
    const re = /industry[^\n]{0,60}?replace\(\/_\/g/g;
    if (re.test(code)) infractores.push(rel);
  }
  assert.deepEqual(
    infractores,
    [],
    'R-14: `x.industry.replace(/_/g, " ")` es un criterio propio sobre el mismo dato — ' +
      'la clase de fallo que DT-05 de F-121 vino a eliminar'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-08 — la TABLA se declara una sola vez                        */
/* ================================================================== */

test('T-04 ⭐⭐ R-08 `INDUSTRIES` se DECLARA una sola vez en todo `src/`', () => {
  const declaran = fuentes().filter((rel) =>
    /export const INDUSTRIES/.test(read(rel))
  );
  assert.deepEqual(
    declaran,
    [DECLARACION],
    'reapareció una COPIA de la tabla de industrias (F-121 DT-05: eran 2 copias + 2 ' +
      'criterios propios, y el defecto salía del que se olvidaban de actualizar)'
  );
  // Y los consumidores la IMPORTAN.
  const importan = fuentes().filter((rel) =>
    /import[^\n]*INDUSTRIES[^\n]*industry-label/.test(read(rel))
  );
  assert.ok(
    importan.length >= 2,
    `sólo ${importan.length} superficies importan la tabla: se esperaban al menos las 2 ` +
      'que renderizan el desplegable'
  );
});

test('T-04 ⭐⭐ R-08 `toIndustryLabel` se DEFINE una sola vez y lo consumen varios', () => {
  const definen = fuentes().filter((rel) =>
    /export function toIndustryLabel/.test(read(rel))
  );
  assert.deepEqual(definen, [DECLARACION]);
  const consumen = fuentes().filter(
    (rel) =>
      !rel.endsWith(DECLARACION) && /\btoIndustryLabel\s*\(/.test(read(rel))
  );
  assert.ok(
    consumen.length >= 8,
    `sólo ${consumen.length} archivos consumen la declaración única: tras F-122 deben ` +
      'ser todos los que presentan la industria (los 5 del spec + los 9 que este guard ' +
      'encontró)'
  );
});

/* ================================================================== */
/*  ⭐ Las excepciones están DECLARADAS y no están obsoletas            */
/* ================================================================== */

test('T-04 ⭐ R-40 cada excepción tiene su razón escrita, y ninguna quedó sin sitio real', () => {
  for (const e of EXCEPCIONES) {
    assert.ok(
      e.razon.length > 60,
      `la excepción «${e.rol}» no declara una razón: una excepción sin razón es un ` +
        'agujero con nombre'
    );
  }
  // Anti-obsolescencia: los tres roles exceptuados existen HOY en el repo. Si un rol
  // desaparece, la excepción debe irse con él.
  const noPresentacionales = TODOS.filter((u) => !u.presentacional);
  assert.ok(
    noPresentacionales.some((u) => /value=\{/.test(u.fragmento)),
    'el rol «binding de formulario» ya no existe: la excepción quedó obsoleta'
  );
  assert.ok(
    noPresentacionales.some((u) => /===\s*'other'|!!/.test(u.fragmento)),
    'el rol «comparación / predicado» ya no existe: la excepción quedó obsoleta'
  );
  assert.ok(
    TODOS.some((u) => /resolveIndustryForPersist|industry:/.test(u.fragmento)),
    'el rol «write-path» ya no existe: la excepción quedó obsoleta'
  );
});
