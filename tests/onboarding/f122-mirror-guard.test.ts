/**
 * F-122 — T-10 — ⭐⭐⭐ **El espejo del Brief pasa por el guard** (R-04, R-31, R-32).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ÉSTE ES EL SITIO POR EL QUE ENTRÓ EL DEFECTO
 * ─────────────────────────────────────────────────────────────────────────────────
 * El encargo suponía que el marcador se había tecleado en el `<input>` libre del alta.
 * **La evidencia dice otra cosa:** lo escribió el propio sistema. Cadena verificada por
 * `SELECT` el 2026-07-28:
 *
 *   | fila | `content->>'city'` | Δ `clients.updated_at` − `briefs.updated_at` |
 *   |------|--------------------|-----------------------------------------------|
 *   | SCS `be43470f`     | `[PENDIENTE]` | **+274 ms** |
 *   | Clara V `e1ad789c` | `[PENDIENTE]` | **+337 ms** |
 *
 * ⇒ un `<select>` en el alta **no habría impedido ninguna de las dos**. El guard tiene
 * que vivir en el WRITE-PATH.
 *
 * ⭐ **H-4 — y DENTRO de la función, no en sus dos call-sites** (`handleApproveBrief` y
 * `handleSaveDraft`): así los dos quedan cubiertos por construcción y queda **un solo
 * punto** que el source-guard de R-34 puede exigir.
 *
 * **Método:** la función se **extrae del código fuente y se EJECUTA** con dobles. No es
 * un `assert.match` sobre una llamada: es la conducta real de la función que corre en
 * producción, con los valores reales de las 2 filas defectuosas.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stripPlaceholdersFromCapture } from '../../src/lib/clients/capture-guard.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string) => readFileSync(resolve(REPO, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const BRIEF_REL = 'src/app/(app)/onboarding/brief/[clientId]/page.tsx';
const BRIEF = read(BRIEF_REL);
const BRIEF_CODE = stripComments(BRIEF);

const MARCADOR = '[' + 'PENDIENTE' + ']';

/** Extrae `mirrorCityStateToClient` del código fuente, con llaves balanceadas. */
function fuenteDelEspejo(): string {
  const marca = 'const mirrorCityStateToClient = ';
  const i = BRIEF_CODE.indexOf(marca);
  assert.ok(i > 0, 'la pantalla ya no declara `mirrorCityStateToClient`');
  const abre = BRIEF_CODE.indexOf('{', BRIEF_CODE.indexOf('=>', i));
  let nivel = 0;
  for (let j = abre; j < BRIEF_CODE.length; j++) {
    if (BRIEF_CODE[j] === '{') nivel++;
    else if (BRIEF_CODE[j] === '}') {
      nivel--;
      if (nivel === 0) {
        // Se le quitan las anotaciones de tipo (`: Record<…>`, `as Record<…>`) para poder
        // EJECUTAR la función: son borradas en compilación y no cambian su conducta.
        return BRIEF_CODE.slice(i + marca.length, j + 1)
          .replace(/\s+as\s+Record<[^>]*>/g, '')
          .replace(/:\s*Record<[^>]*>\s*=/g, ' =');
      }
    }
  }
  throw new Error('la función no cierra');
}

interface Corrida {
  writes: { tabla: string; patch: Record<string, string>; id: string }[];
  otras: string[];
  avisos: string[];
  lanzo: unknown;
}

/** Ejecuta el espejo REAL con dobles y devuelve todo lo que hizo. */
async function correrEspejo(
  briefFields: Record<string, string>
): Promise<Corrida> {
  const c: Corrida = { writes: [], otras: [], avisos: [], lanzo: null };
  const supabase = {
    from(tabla: string) {
      return {
        update(patch: Record<string, string>) {
          return {
            eq(_col: string, id: string) {
              c.writes.push({ tabla, patch, id });
              return Promise.resolve({ error: null });
            }
          };
        },
        delete() {
          c.otras.push(`delete:${tabla}`);
          return { eq: () => Promise.resolve({ error: null }) };
        },
        insert() {
          c.otras.push(`insert:${tabla}`);
          return { eq: () => Promise.resolve({ error: null }) };
        }
      };
    }
  };
  const toast = {
    warning: (m: string) => c.avisos.push(m),
    error: (m: string) => c.avisos.push(m),
    success: (m: string) => c.avisos.push(m)
  };
  const espejo = new Function(
    'briefFields',
    'supabase',
    'clientId',
    'toast',
    'stripPlaceholdersFromCapture',
    `return (${fuenteDelEspejo()});`
  )(briefFields, supabase, 'e24ddff3', toast, stripPlaceholdersFromCapture);
  try {
    await espejo();
  } catch (e) {
    c.lanzo = e;
  }
  return c;
}

/* ================================================================== */
/*  ⭐⭐⭐ R-28/R-32 — el marcador NO cruza a `clients`                  */
/* ================================================================== */

test('T-10 ⭐⭐⭐ R-32 con `briefFields.city = [PENDIENTE]`, el `.update()` NO lleva `city`', async () => {
  const c = await correrEspejo({ city: MARCADOR, state: 'CA' });
  assert.equal(
    c.writes.length,
    1,
    'la acción del operador debe seguir escribiendo `state`'
  );
  assert.deepEqual(
    c.writes[0].patch,
    { state: 'CA' },
    'R-28: el marcador cruzaba de espacio-generación a espacio-captura y se volvía un ' +
      'HECHO del home canónico. `briefs.content.city = "[PENDIENTE]"` sigue siendo ' +
      'legítimo (F-104/F-106); lo prohibido es el CRUCE.'
  );
  assert.equal(c.writes[0].tabla, 'clients');
});

test('T-10 ⭐⭐⭐ R-32 con una ciudad REAL, el `.update()` sí la lleva (el espejo sigue funcionando)', async () => {
  const c = await correrEspejo({ city: 'Santa Maria', state: 'CA' });
  assert.deepEqual(c.writes[0].patch, { city: 'Santa Maria', state: 'CA' });
  assert.deepEqual(
    c.avisos,
    [],
    'no hay nada que avisar cuando no se bloquea nada'
  );
});

test('T-10 ⭐⭐ si TODO el patch se bloquea, no se emite ningún write', async () => {
  const c = await correrEspejo({ city: MARCADOR, state: MARCADOR });
  assert.deepEqual(
    c.writes,
    [],
    'un `update({})` sería un write vacío contra `clients`'
  );
  assert.equal(c.avisos.length, 1, 'y aun así el operador tiene que enterarse');
});

/* ================================================================== */
/*  ⭐⭐⭐ R-31 — se bloquea el VALOR, no al OPERADOR                    */
/* ================================================================== */

test('T-10 ⭐⭐⭐ R-31 el bloqueo AVISA y NO interrumpe la acción que lo originó', async () => {
  const c = await correrEspejo({ city: MARCADOR, state: 'CA' });
  assert.equal(
    c.lanzo,
    null,
    'la función lanzó: guardar/aprobar quedarían rotos'
  );
  assert.equal(
    c.avisos.length,
    1,
    'R-31: el bloqueo tiene que ser VISIBLE. Un guard silencioso deja al operador ' +
      'creyendo que su ciudad se guardó.'
  );
  assert.match(
    c.avisos[0],
    /city/,
    'el aviso debe decir QUÉ se bloqueó, no sólo que algo pasó'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-04 — nunca se borra ni se vacía nada                        */
/* ================================================================== */

test('T-10 ⭐⭐⭐ R-04 el espejo no emite `delete` ni vacía columnas de `clients`', async () => {
  for (const campos of [
    { city: MARCADOR, state: 'CA' },
    { city: '', state: '' },
    { city: 'Santa Maria', state: 'CA' }
  ]) {
    const c = await correrEspejo(campos);
    assert.deepEqual(
      c.otras,
      [],
      'el espejo emitió una operación que no es `update`'
    );
    for (const w of c.writes) {
      for (const [k, v] of Object.entries(w.patch)) {
        assert.notEqual(v, '', `\`${k}\` se escribió VACÍA: R-04 lo prohíbe`);
        assert.notEqual(v, null);
      }
    }
  }
  // Y con el brief sin ciudad ni estado, no se escribe nada (comportamiento previo).
  const vacio = await correrEspejo({ city: '', state: '' });
  assert.deepEqual(vacio.writes, []);
});

/* ================================================================== */
/*  ⭐⭐⭐ H-4 — el guard está DENTRO de la función, no en los call-sites */
/* ================================================================== */

test('T-10 ⭐⭐⭐ H-4 el guard vive DENTRO del espejo ⇒ los DOS call-sites quedan cubiertos', () => {
  const espejo = fuenteDelEspejo();
  assert.match(
    espejo,
    /stripPlaceholdersFromCapture\(/,
    'H-4: poner el guard en los call-sites dejaría DOS puntos que pueden divergir, y un ' +
      'tercer call-site futuro sin cubrir'
  );
  // Los dos call-sites siguen llamando al espejo, y NINGUNO aplica el guard por su cuenta.
  for (const handler of ['handleApproveBrief', 'handleSaveDraft']) {
    const i = BRIEF_CODE.indexOf(`const ${handler}`);
    assert.ok(i > 0, `la pantalla ya no declara \`${handler}\``);
    const cuerpo = BRIEF_CODE.slice(i, i + 2600);
    assert.match(
      cuerpo,
      /await mirrorCityStateToClient\(\)/,
      `${handler} dejó de espejar: F-084 R-07/R-08`
    );
    assert.ok(
      !/stripPlaceholdersFromCapture\(/.test(cuerpo),
      `${handler} aplica el guard por su cuenta ⇒ dos puntos que pueden divergir (H-4)`
    );
  }
  // Un solo punto en toda la pantalla.
  assert.equal(
    (BRIEF_CODE.match(/stripPlaceholdersFromCapture\(/g) ?? []).length,
    1,
    'H-4/R-34: el source-guard exige UN solo punto en esta pantalla'
  );
});

test('T-10 ⭐⭐ el espejo es el ÚNICO write a `clients` de esta pantalla', () => {
  const writes = Array.from(
    BRIEF_CODE.matchAll(
      /from\('clients'\)\s*\.(insert|update|upsert|delete)\(/g
    ),
    (m) => m[1]
  );
  assert.deepEqual(
    writes,
    ['update'],
    'apareció otro write a `clients` en la pantalla del Brief: tiene que pasar por el ' +
      'guard (R-34) o no existir'
  );
});
