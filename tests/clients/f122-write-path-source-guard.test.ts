/**
 * F-122 — T-12 — ⭐⭐⭐ **Source-guard de los write-paths a `clients`** (R-34, R-40).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * QUÉ EXIGE, Y POR QUÉ NO PUEDE SER UNA LISTA
 * ─────────────────────────────────────────────────────────────────────────────────
 * Todo write a `clients` que lleve **columnas de captura** debe pasar por
 * `stripPlaceholdersFromCapture`. Un write nuevo que las lleve **sin** el guard deja este
 * test en **rojo**.
 *
 * **R-40 — la lista se DERIVA del repo.** Hoy hay 7 writes a `clients`: 3 llevan columnas
 * de captura (el alta, la ficha y el espejo del Brief) y 4 sólo llevan estado del sistema
 * (`status`, `tier`, `deliverable_token`, `updated_at`). Esa distinción se **calcula**
 * leyendo el payload de cada uno —resolviendo un salto de indirección: un spread de una
 * variable local, o un helper que arma el payload—, **no** se escribe a mano. Un guard
 * que enumerara los sitios se encontraría a sí mismo y pasaría sin medir nada (CL-109).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CAPTURE_COLUMNS } from '../../src/lib/clients/capture-guard.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
/** ⭐ Ancla FIJA de todos los source-guards de F-122 (R-39). Jamás `HEAD`. */
const BASE = '9509f6f';
const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });

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

/* ------------------------------------------------------------------ */
/*  Descubrimiento de los writes y de su payload REAL                  */
/* ------------------------------------------------------------------ */

interface Write {
  archivo: string;
  op: string;
  payload: string;
  /** El payload tras resolver UN salto de indirección (spread o helper). */
  expandido: string;
  conCaptura: boolean;
  guardado: boolean;
}

/** Argumento de una llamada, con paréntesis balanceados desde `desde`. */
function argumento(code: string, desde: number): string {
  let nivel = 0;
  for (let j = desde; j < code.length; j++) {
    if (code[j] === '(') nivel++;
    else if (code[j] === ')') {
      nivel--;
      if (nivel === 0) return code.slice(desde + 1, j);
    }
  }
  return '';
}

/**
 * ⭐ Resuelve UN salto: un spread `...X` se reemplaza por la declaración de `X`, y una
 * llamada `NAME(args)` por el cuerpo de `NAME`. Sin esto, un payload como
 * `{ ...formDataSafe }` parecería no llevar ninguna columna de captura y el guard se
 * declararía verde sobre el write más peligroso del repo.
 */
function expandir(payload: string, code: string): string {
  let out = payload;
  const identificadores = new Set(
    Array.from(payload.matchAll(/\b([A-Za-z_$][\w$]*)\b/g), (m) => m[1])
  );
  for (const id of Array.from(identificadores)) {
    // (a) la DECLARACIÓN del identificador, en sus tres formas reales:
    //     `const X = {…}` · `const [X, setX] = useState({…})` · `const { X } = …`
    const decl = new RegExp(
      `(?:const|let|var)\\s*(?:\\[\\s*${id}\\s*,[^\\]]*\\]|\\{[^}]*\\b${id}\\b[^}]*\\}|${id})\\s*(?::[^=]{0,60})?=[\\s\\S]{0,700}?\\n\\s*(?:\\}\\)?;|const |let |return |if |await )`
    ).exec(code);
    if (decl) out += '\n' + decl[0];
    // (b) las ASIGNACIONES posteriores de propiedades: `patch.city = briefFields.city`.
    //     Sin esto, un payload que es sólo un identificador (`update(patch)`) parecería
    //     no llevar ninguna columna — y es justo el write por el que entró el defecto.
    for (const a of Array.from(
      code.matchAll(new RegExp(`\\b${id}\\.([\\w$]+)\\s*=[^\\n=][^\\n]*`, 'g'))
    )) {
      out += `\n${a[1]}: ${a[0]}`;
    }
  }
  // (c) el CUERPO del helper que arma el payload (`clientInsertPayload(formDataSafe, …)`).
  for (const m of Array.from(payload.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g))) {
    const cuerpo = new RegExp(
      `function\\s+${m[1]}\\s*\\(([\\s\\S]{0,900}?)\\n\\}`
    ).exec(code);
    if (cuerpo) out += '\n' + cuerpo[0];
  }
  return out;
}

/** ¿El valor que llega al write proviene del guard? Se resuelven las 3 formas reales. */
function esGuardado(payload: string, code: string): boolean {
  const nombres = new Set<string>();
  for (const m of Array.from(payload.matchAll(/\.\.\.([A-Za-z_$][\w$]*)/g)))
    nombres.add(m[1]);
  for (const m of Array.from(payload.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)))
    nombres.add(m[1]);
  for (const n of Array.from(nombres)) {
    const formas = [
      // (1) `const { patch: X, blocked } = stripPlaceholdersFromCapture(…)`
      new RegExp(
        `\\{[^}]*patch:\\s*${n}\\b[^}]*\\}\\s*=\\s*[\\s\\S]{0,40}?stripPlaceholdersFromCapture\\(`
      ),
      // (2) `const { patch, blocked } = stripPlaceholdersFromCapture(…)` con X === 'patch'
      new RegExp(
        `\\{[^}]*\\b${n}\\b[^}]*\\}\\s*=\\s*[\\s\\S]{0,40}?stripPlaceholdersFromCapture\\(`
      ),
      // (3) `const g = stripPlaceholdersFromCapture(X); X = g.patch;`
      new RegExp(
        `const\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*stripPlaceholdersFromCapture\\([\\s\\S]{0,200}?${n}\\s*=\\s*\\1\\.patch`
      )
    ];
    if (formas.some((re) => re.test(code))) return true;
  }
  return false;
}

function writes(rel: string, fuente?: string): Write[] {
  const code = stripComments(fuente ?? read(rel));
  const out: Write[] = [];
  const re =
    /from\(\s*['"`]clients['"`]\s*\)\s*(?:\.\w+\([^)]*\)\s*)*?\.(insert|update|upsert)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const desde = m.index + m[0].length - 1;
    const payload = argumento(code, desde);
    const expandido = expandir(payload, code);
    const conCaptura = CAPTURE_COLUMNS.some((c) =>
      new RegExp(`\\b${c}\\s*:`).test(expandido)
    );
    out.push({
      archivo: rel,
      op: m[1],
      payload: payload.replace(/\s+/g, ' ').slice(0, 90),
      expandido,
      conCaptura,
      guardado: esGuardado(payload, code)
    });
  }
  return out;
}

const TODOS = fuentes().flatMap((rel) => writes(rel));

/* ================================================================== */
/*  ⭐ Anti-no-op del descubrimiento                                    */
/* ================================================================== */

test('T-12 ⭐ R-40 el barrido descubre los writes a `clients` del repo', () => {
  assert.ok(
    TODOS.length >= 6,
    `sólo ${TODOS.length} writes a \`clients\` descubiertos: el barrido está roto ` +
      '(en `9509f6f` había 7)'
  );
  // Y el clasificador distingue de verdad: hay writes de los dos tipos.
  assert.ok(
    TODOS.some((w) => w.conCaptura),
    'ningún write clasificado con columnas de captura: el clasificador quedó ciego ' +
      '(y con él, el guard entero pasaría sin medir nada)'
  );
  assert.ok(
    TODOS.some((w) => !w.conCaptura),
    'todos los writes clasificados con columnas de captura: el clasificador quedó romo ' +
      '⇒ exigiría el guard a `update({ status })`, y la próxima feature lo apagaría'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-34 — todo write con columnas de captura pasa por el guard   */
/* ================================================================== */

test('T-12 ⭐⭐⭐ R-34 todo write a `clients` con columnas de CAPTURA pasa por el guard', () => {
  const sinGuard = TODOS.filter((w) => w.conCaptura && !w.guardado);
  assert.deepEqual(
    sinGuard.map((w) => `${w.archivo} .${w.op}(${w.payload})`),
    [],
    'R-34: estos writes llevan columnas de captura y NO pasan por ' +
      '`stripPlaceholdersFromCapture`. Por uno de ellos (el espejo del Brief) entró el ' +
      'marcador a `clients.city` en SCS `e24ddff3` y Clara V `122f3593`, +274 ms y ' +
      '+337 ms después de guardar el brief. La lista de arriba se DERIVÓ del repo: un ' +
      'write nuevo con columnas de captura y sin guard pone este test en rojo solo.'
  );
  assert.ok(
    TODOS.filter((w) => w.conCaptura).length >= 3,
    'se esperaban al menos los 3 write-paths de captura de E-6'
  );
});

test('T-12 ⭐⭐ los writes que sólo llevan ESTADO del sistema quedan fuera del guard', () => {
  const soloEstado = TODOS.filter((w) => !w.conCaptura);
  assert.ok(
    soloEstado.length >= 3,
    'E-6: `deliverable_token`, `status`/`tier` y el seam de estado no llevan captura'
  );
  for (const w of soloEstado) {
    assert.ok(
      !w.guardado,
      `${w.archivo}: aplicar el guard a un payload de estado (\`${w.payload}\`) sería ` +
        'ruido — y el ruido es lo que hace que una feature futura apague el guard'
    );
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ ANTI-NO-OP REAL: rojo contra el ancla `9509f6f`               */
/* ================================================================== */

test('T-12 ⭐⭐⭐ R-38 el mismo guard, corrido contra `9509f6f`, encuentra los writes sin guard', () => {
  const archivos = git('grep', '-l', '-F', "from('clients')", BASE, '--', 'src')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(l.indexOf(':') + 1))
    .filter((p) => /\.tsx?$/.test(p));
  assert.ok(
    archivos.length >= 4,
    `en \`${BASE}\` sólo ${archivos.length} archivos escriben a \`clients\``
  );
  const enBase = archivos
    .flatMap((rel) => writes(rel, git('show', `${BASE}:${rel}`)))
    .filter((w) => w.conCaptura && !w.guardado);
  assert.ok(
    enBase.length >= 3,
    `contra \`${BASE}\` el guard encontró sólo ${enBase.length} writes de captura sin ` +
      'guard; E-6 documenta 3. Si no los encuentra, su verde de hoy no significa nada.'
  );
  // Y el sitio por el que entró el defecto está entre ellos.
  assert.ok(
    enBase.some((w) => w.archivo.includes('onboarding/brief/[clientId]')),
    'el detector NO ve el espejo del Brief en el ancla ⇒ está midiendo mal justo el ' +
      'write por el que entró el defecto verificado'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-05 — F-122 no agrega writes nuevos a `clients`                */
/* ================================================================== */

test('T-12 ⭐⭐ R-05 F-122 no añade ningún write NUEVO a `clients`', () => {
  const archivos = git('grep', '-l', '-F', "from('clients')", BASE, '--', 'src')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(l.indexOf(':') + 1))
    .filter((p) => /\.tsx?$/.test(p));
  const antes = archivos.flatMap((rel) =>
    writes(rel, git('show', `${BASE}:${rel}`))
  ).length;
  assert.ok(
    TODOS.length <= antes,
    `F-122 pasó de ${antes} a ${TODOS.length} writes a \`clients\`: el frente cierra ` +
      'puertas, no abre ninguna'
  );
});
