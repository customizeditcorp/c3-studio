/**
 * F-122 — **BLOQUE G · T-33** — ⭐⭐⭐ **El ROUND-TRIP del rubro libre: la cobertura que
 * faltaba** (R-56, R-57, R-58).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO, VERIFICADO EN PRODUCCIÓN Y NO SUPUESTO
 * ─────────────────────────────────────────────────────────────────────────────────
 * La §6.1 en vivo sobre la app desplegada (`bd78f35`) destapó que **F-122 introdujo la
 * forma ESPEJO del defecto que vino a cerrar**: con `clients.industry = 'Sign Shop'` —un
 * rubro libre **guardado correctamente** por el Slice A— el `<select>` de Industria del
 * diálogo «Editar Cliente» **no tiene ninguna `<option>` que matchee** ⇒ **renderiza
 * VACÍO**: el operador **no puede ver ni editar el rubro que el cliente tiene guardado**, y
 * si toca el control lo pierde de vista.
 *
 * ⚠️ **PREMISA CORREGIDA POR LA SEGUNDA §6.1 EN VIVO (2026-07-28).** El diagnóstico
 * original agregaba *«…⇒ el submit se bloquea ⇒ NINGÚN cambio del cliente se puede
 * guardar»*. **Eso es falso.** En vivo, guardar sin tocar el desplegable **funciona**
 * («Cliente actualizado»): el `<select>` no muestra nada, pero `formData.industry` **sigue
 * teniendo `'Sign Shop'`** —el estado de React no se vacía porque falte una `<option>`— así
 * que al submit llega el valor, no `''`. **El defecto es de REPRESENTACIÓN, no de
 * persistencia**, y este archivo lo mide como tal (ver la corrección de premisa, asentada
 * y ejercida en el anti-no-op de abajo).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⭐⭐⭐ POR QUÉ NINGÚN TEST LO ATRAPÓ — Y QUÉ CLASE DE COBERTURA ES ÉSTA
 * ─────────────────────────────────────────────────────────────────────────────────
 * Los guards de F-122 midieron el **write-path** (R-28/R-34) y la **derivación de
 * consumidores** (R-18). **Nadie midió la VUELTA.** Medir la ida sin medir la vuelta dejó
 * pasar a producción un defecto que deja clientes enteros no editables: es la **cuarta**
 * variante de `feedback_guards_measure_index_not_world` — el guard verde mientras el mundo
 * está mal, esta vez porque el recorrido medido **terminaba en la tabla** y el usuario
 * **vuelve del otro lado**.
 *
 * Este test cierra el circuito completo: **guardar** un rubro fuera de tabla → **reabrir**
 * el formulario → el valor **sigue presente y legible** → se puede **guardar de nuevo sin
 * re-elegir** y **sin mutarlo**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⚠️ ANTI-NO-OP, CON SU ANCLA Y SU ROL (R-55/R-57)
 * ─────────────────────────────────────────────────────────────────────────────────
 * Este test **debe estar ROJO contra `5db980a`** — el commit donde el defecto existe. Si
 * diera verde ahí, no estaría midiendo el defecto sino la existencia del arreglo. Además
 * de correrlo contra el ancla (ejercicio reportado en `impl_F-122.md`), el defecto se
 * **EJECUTA acá dentro**: los módulos del ancla se materializan y se reproduce el bloqueo
 * del submit, para que el verde de hoy no valga por ausencia de sujeto.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { resolveIndustryForPersist } from '../../src/lib/clients/industry-input.ts';
import { INDUSTRIES } from '../../src/lib/clients/industry-label.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');
const git = (...args: string[]): string =>
  execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  });
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * ⭐ **La TERCERA ancla declarada de F-122 (R-55/R-57). No es `HEAD`.**
 *
 * · `9509f6f` — previo a la feature; · `86fae28` — post tramo offline (ancla de la
 * regresión de idioma); · **`5db980a` — el commit donde ESTE defecto existe.** Anclar el
 * round-trip a cualquiera de las otras dos lo dejaría verde **por ausencia de sujeto**:
 * antes de `5db980a` el vocabulario todavía era cerrado y no había rubro libre que releer.
 */
const DEFECTO = '5db980a';

const SEAM_REL = 'src/lib/clients/industry-input.ts';
const LABEL_REL = 'src/lib/clients/industry-label.ts';
const FORM_REL = 'src/components/clients/ClientForm.tsx';

/**
 * ⭐ **R-36 — fixture REAL, citado con su fila.** El rubro libre que el operador guardó y
 * que dejó al cliente no editable. Valor observado en vivo por el Leader sobre la app
 * desplegada (§6.1, `bd78f35`), no una paráfrasis.
 *
 * (En `f122-anti-noop.test.ts` esta misma fila figura con `industry: ''`: ése era su valor
 * **antes** de que el Slice A capturara el rubro. El fixture de acá es el estado posterior
 * — y es exactamente el que rompió.)
 */
const RUBRO_LIBRE = {
  id: 'b016f86b (Customize It)',
  value: 'Sign Shop'
} as const;

/** Un rubro libre fuera de tabla ya observado antes, con otra forma (R & M, `4a59cbff`). */
const RUBRO_LIBRE_SNAKE = 'portable_toilet_rental_service';

/* ================================================================== */
/*  El seam del Bloque G, resuelto de forma que el ROJO sea LEGIBLE    */
/* ================================================================== */

type OpcionFueraDeCatalogo = { value: string; label: string } | null;
interface SeamBloqueG {
  outOfCatalogIndustryOption?: (
    raw: string | null | undefined
  ) => OpcionFueraDeCatalogo;
  isIndustryInCatalog?: (raw: string | null | undefined) => boolean;
  OUT_OF_CATALOG_SUFFIX?: string;
}

/**
 * Se importa **dinámicamente** a propósito: contra `5db980a` estas exportaciones no
 * existen, y un `import` estático haría estallar el archivo entero con un `SyntaxError` de
 * módulo. Resolviéndolo así, el rojo del ancla dice **qué falta y por qué importa**.
 */
async function seam(): Promise<SeamBloqueG> {
  return (await import(
    '../../src/lib/clients/industry-input.ts'
  )) as SeamBloqueG;
}

async function opcionFueraDeCatalogo(
  raw: string | null | undefined
): Promise<OpcionFueraDeCatalogo> {
  const fn = (await seam()).outOfCatalogIndustryOption;
  assert.equal(
    typeof fn,
    'function',
    `R-56: no existe ningún seam que represente un valor de \`clients.industry\` FUERA ` +
      `de \`INDUSTRIES\`. Sin él, el \`<select>\` no tiene ninguna \`<option>\` que ` +
      `matchee «${RUBRO_LIBRE.value}» (${RUBRO_LIBRE.id}) ⇒ renderiza VACÍO: el operador ` +
      'no puede VER ni EDITAR el rubro que el cliente ya tiene guardado. Es el defecto ' +
      'de `5db980a`, y es de REPRESENTACIÓN (la persistencia nunca estuvo rota).'
  );
  return (fn as (r: string | null | undefined) => OpcionFueraDeCatalogo)(raw);
}

/* ================================================================== */
/*  ⭐⭐⭐ T-33 / R-57 — EL ROUND-TRIP COMPLETO                          */
/* ================================================================== */

test('T-33 ⭐⭐⭐ R-57 ROUND-TRIP: guardar un rubro fuera de tabla → reabrir → guardar de nuevo SIN re-elegir', async () => {
  // ── 1. IDA: el operador eligió «Otro» y escribió el rubro. Esto es lo que se guardó.
  const guardado = resolveIndustryForPersist('other', RUBRO_LIBRE.value);
  assert.equal(
    guardado,
    RUBRO_LIBRE.value,
    'la ida ya estaba cubierta: el rubro se persiste verbatim (R-11)'
  );

  // ── 2. VUELTA: se reabre el formulario con lo que hay en la fila. El control se enlaza
  //    a `formData.industry`, así que TIENE que existir una opción con ESE value exacto.
  const opcion = await opcionFueraDeCatalogo(guardado);
  assert.notEqual(
    opcion,
    null,
    `R-56: al reabrir el formulario, «${guardado}» no tiene ninguna opción que lo ` +
      'represente ⇒ el desplegable queda VACÍO y el operador no puede saber qué rubro ' +
      'tiene guardado el cliente'
  );
  assert.equal(
    opcion?.value,
    guardado,
    'el `value` de la opción debe ser EXACTAMENTE el valor guardado: es contra eso que ' +
      'el control matchea. Una opción con el valor recortado o normalizado no matchea, ' +
      'y el `<select>` vuelve a renderizar vacío.'
  );

  // ── 3. …y se muestra LEGIBLE y SEÑALADO como fuera de catálogo (patrón de `CitySelect`).
  assert.ok(
    (opcion as { label: string }).label.includes(RUBRO_LIBRE.value),
    `la etiqueta no muestra el rubro: el operador tiene que poder LEER qué tiene guardado`
  );
  assert.match(
    (opcion as { label: string }).label,
    /fuera de catálogo/,
    'R-56: el valor se muestra pero no se SEÑALA. La señal no es un reproche: nombra que ' +
      'el rubro está fuera del vocabulario cerrado, igual que `CitySelect` hace con la ' +
      'ciudad escrita a mano (R-23).'
  );

  // ── 4. VUELTA DE LA VUELTA: con el formulario reabierto, el operador cambia OTRO campo
  //    y guarda. NO vuelve a tocar la industria ⇒ el submit debe resolver, y el valor
  //    debe salir INTACTO.
  const reguardado = resolveIndustryForPersist(guardado, '');
  assert.notEqual(
    reguardado,
    null,
    'R-57: reabrir un cliente con rubro libre y guardar sin tocar la industria tiene que ' +
      'resolver. (En el ancla esto YA funcionaba: la persistencia nunca estuvo rota — lo ' +
      'que faltaba era poder VER el valor. Se mide igual, para que un cambio futuro en el ' +
      'seam no rompa la vuelta en silencio.)'
  );
  assert.equal(
    reguardado,
    RUBRO_LIBRE.value,
    'R-57: el rubro se MUTÓ en la vuelta. Guardar sin tocar la industria no puede ' +
      'cambiar la industria (F-121 R-04: el sistema no sobrescribe lo que puso el humano).'
  );

  // ── 5. Y el circuito es estable: reabrir y guardar N veces no deriva el valor.
  let v: string | null = RUBRO_LIBRE.value;
  for (let i = 0; i < 5; i++) {
    const o = await opcionFueraDeCatalogo(v);
    assert.equal(
      o?.value,
      v,
      `ciclo ${i}: la opción dejó de representar el valor`
    );
    v = resolveIndustryForPersist(v, '');
  }
  assert.equal(
    v,
    RUBRO_LIBRE.value,
    'el round-trip deriva el valor tras varias vueltas'
  );
});

test('T-33 ⭐⭐ R-57 el round-trip vale para la OTRA forma de rubro fuera de tabla (`snake_case`)', async () => {
  // R & M (`4a59cbff`) tiene `portable_toilet_rental_service`: fuera de tabla desde antes
  // de F-122. La vuelta tiene que servirle igual, o la ficha de ese cliente también se
  // bloquea.
  const opcion = await opcionFueraDeCatalogo(RUBRO_LIBRE_SNAKE);
  assert.equal(opcion?.value, RUBRO_LIBRE_SNAKE);
  assert.equal(
    resolveIndustryForPersist(RUBRO_LIBRE_SNAKE, ''),
    RUBRO_LIBRE_SNAKE,
    'el valor se muta al volver a guardar'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ R-56 — SIN mutar el vocabulario y SIN degradar a `other`      */
/* ================================================================== */

test('T-32 ⭐⭐⭐ R-56 el arreglo NO agrega el rubro a `INDUSTRIES` ni lo degrada a `other`', async () => {
  // (a) La tabla sigue siendo la declaración cerrada: 10 filas, sin el rubro libre.
  assert.equal(
    INDUSTRIES.some((i) => i.value === RUBRO_LIBRE.value),
    false,
    'R-56: el rubro libre entró a `INDUSTRIES`. La tabla es una DECLARACIÓN (F-121 ' +
      'DT-05), no un acumulador de lo que alguien tipeó: mutarla rompe la declaración única.'
  );
  assert.equal(
    INDUSTRIES.length,
    10,
    'el vocabulario cerrado cambió de tamaño'
  );

  // (b) Y no se resuelve degradando a `other` — que es AUSENCIA de industria declarada
  //     (F-121 R-15), no un rubro.
  const opcion = await opcionFueraDeCatalogo(RUBRO_LIBRE.value);
  assert.notEqual(
    opcion?.value,
    'other',
    'R-56/F-121 R-15: degradar el rubro a `other` perdería el dato que el operador ' +
      'declaró y reintroduciría «para other» aguas abajo'
  );
  assert.equal(
    resolveIndustryForPersist(RUBRO_LIBRE.value, ''),
    RUBRO_LIBRE.value,
    'la vuelta persiste algo distinto del valor guardado'
  );
});

test('T-32 ⭐⭐⭐ R-38 el criterio DISCRIMINA dentro/fuera (si señalara todo, o nada, sería un no-op)', async () => {
  const dentro = (await seam()).isIndustryInCatalog;
  assert.equal(
    typeof dentro,
    'function',
    'R-56: falta el predicado que decide si un valor pertenece al vocabulario cerrado'
  );
  const esta = dentro as (r: string | null | undefined) => boolean;

  // Dentro del catálogo ⇒ ninguna opción extra (si la agregara, habría DUPLICADOS).
  for (const i of INDUSTRIES) {
    assert.equal(esta(i.value), true, `${i.value} es del vocabulario cerrado`);
    assert.equal(
      await opcionFueraDeCatalogo(i.value),
      null,
      `${i.value} generó una opción «fuera de catálogo» duplicando la que ya existe`
    );
  }
  // Ausencia ⇒ tampoco. "Sin industria" NO es "fuera de catálogo": señalarla inventaría
  // un defecto (mismo criterio que `isCityInCatalog`, R-23).
  for (const vacio of ['', '   ', null, undefined]) {
    assert.equal(esta(vacio), true, `«${vacio}» es AUSENCIA, no un valor raro`);
    assert.equal(await opcionFueraDeCatalogo(vacio), null);
  }
  // Fuera ⇒ sí, y con la señal.
  for (const fuera of [
    RUBRO_LIBRE.value,
    RUBRO_LIBRE_SNAKE,
    'Decoración de interiores'
  ]) {
    assert.equal(
      esta(fuera),
      false,
      `«${fuera}» no es del vocabulario cerrado`
    );
    assert.notEqual(await opcionFueraDeCatalogo(fuera), null);
  }
});

/* ================================================================== */
/*  ⭐⭐⭐ R-58 — el contrato de PERSISTENCIA no se tocó                 */
/* ================================================================== */

/** Materializa e IMPORTA los módulos del seam **tal como estaban en un commit**. */
async function seamDelAncla(commit: string): Promise<{
  resolveIndustryForPersist: (
    s: string | null | undefined,
    f: string | null | undefined
  ) => string | null;
  outOfCatalogIndustryOption?: unknown;
}> {
  const dir = mkdtempSync(join(tmpdir(), 'f122-bloque-g-'));
  writeFileSync(
    join(dir, 'industry-label.ts'),
    git('show', `${commit}:${LABEL_REL}`),
    'utf8'
  );
  const archivo = join(dir, 'industry-input.ts');
  writeFileSync(archivo, git('show', `${commit}:${SEAM_REL}`), 'utf8');
  return (await import(pathToFileURL(archivo).href)) as never;
}

/** El par (código elegido, rubro libre) en todas sus formas vivas. */
const PARES: [string, string][] = [
  ['cleaning', ''],
  ['other', ''],
  ['other', '   '],
  ['other', RUBRO_LIBRE.value],
  ['other', 'otro'],
  ['other', 'cleaning'],
  ['other', 'Decoración de interiores'],
  ['', ''],
  ['', RUBRO_LIBRE.value],
  [RUBRO_LIBRE.value, ''],
  [RUBRO_LIBRE_SNAKE, '']
];

test('T-32 ⭐⭐⭐ R-58 `resolveIndustryForPersist` devuelve EXACTAMENTE lo mismo que en `5db980a`', async () => {
  const antes = await seamDelAncla(DEFECTO);
  for (const [sel, libre] of PARES) {
    assert.equal(
      resolveIndustryForPersist(sel, libre),
      antes.resolveIndustryForPersist(sel, libre),
      `R-58: el contrato de PERSISTENCIA cambió para (${JSON.stringify(sel)}, ` +
        `${JSON.stringify(libre)}). Lo que el Bloque G corrige es la LECTURA de un valor ` +
        'ya guardado, no la validación de uno nuevo.'
    );
  }
  // Y los invariantes, nombrados uno por uno para que no dependan del ancla.
  assert.equal(
    resolveIndustryForPersist('other', ''),
    null,
    'R-58/R-10: con «Otro» EXPLÍCITO el rubro libre sigue siendo obligatorio'
  );
  assert.equal(
    resolveIndustryForPersist('other', '   '),
    null,
    'R-10: «Otro» no puede volver a ser un sumidero'
  );
  assert.equal(
    resolveIndustryForPersist('other', 'cleaning'),
    null,
    'R-12: la colisión con el vocabulario cerrado sigue rechazada'
  );
  assert.equal(
    resolveIndustryForPersist('other', 'otro'),
    null,
    'R-13: el token de ausencia sigue rechazado'
  );
  const salidas = PARES.map(([s, f]) => resolveIndustryForPersist(s, f));
  assert.equal(
    salidas.includes('other'),
    false,
    'R-07/R-15: `other` NUNCA se persiste como valor de `clients.industry`'
  );
});

/* ================================================================== */
/*  ⭐⭐⭐ ANTI-NO-OP EJECUTADO: el defecto REPRODUCIDO contra `5db980a` */
/* ================================================================== */

test('T-33 ⭐⭐⭐ R-57 contra `5db980a` el defecto se REPRODUCE: el desplegable no tiene con qué representar el rubro', async () => {
  // (a) En el ancla no existe ningún seam de lectura: no había con qué representarlo.
  const antes = await seamDelAncla(DEFECTO);
  assert.equal(
    typeof antes.outOfCatalogIndustryOption,
    'undefined',
    'si el ancla YA tuviera el seam, `5db980a` no sería el commit donde el defecto vive ' +
      'y este anti-no-op estaría midiendo otra cosa'
  );

  // (b) El componente del ancla renderiza **exactamente** `INDUSTRIES` y nada más ⇒ el
  //     conjunto de opciones no contiene el rubro libre ⇒ el `<select>` queda VACÍO.
  const formEnAncla = stripComments(git('show', `${DEFECTO}:${FORM_REL}`));
  assert.match(
    formEnAncla,
    /<SelectContent>\s*\{INDUSTRIES\.map\(/,
    'en el ancla el desplegable debía alimentarse SÓLO de `INDUSTRIES`'
  );
  assert.equal(
    /outOfCatalogIndustryOption/.test(formEnAncla),
    false,
    'el ancla ya tenía el arreglo: el anti-no-op no mide nada'
  );
  const opcionesEnAncla = INDUSTRIES.map((i) => i.value);
  assert.equal(
    opcionesEnAncla.includes(RUBRO_LIBRE.value),
    false,
    `ninguna \`<option>\` matchea «${RUBRO_LIBRE.value}» (${RUBRO_LIBRE.id})`
  );

  // ─────────────────────────────────────────────────────────────────────────────────
  // (c) ⚠️ **CORRECCIÓN DE PREMISA — la §6.1 en vivo (2026-07-28) refutó una parte del
  //     diagnóstico, y se asienta acá en vez de taparse.**
  //
  //     El diagnóstico decía: *«el control renderiza vacío ⇒ lo que llega al submit es
  //     `''` ⇒ `resolveIndustryForPersist('','')` es falsy ⇒ el submit se BLOQUEA ⇒ el
  //     cliente entero queda NO EDITABLE»*. **Es falso, y el mundo lo dijo:** en vivo, con
  //     `industry = 'Sign Shop'`, guardar sin tocar el desplegable **funciona** («Cliente
  //     actualizado», sin bloqueo).
  //
  //     La razón está en el código y se ejerce abajo: el `<select>` no encuentra opción que
  //     matchear y **no muestra nada**, pero `formData.industry` **sigue teniendo el valor**
  //     —el estado de React no se vacía porque falte una `<option>`—, así que lo que llega
  //     al submit es `'Sign Shop'`, no `''`.
  //
  //     ⇒ **El defecto NUNCA fue de persistencia: es de REPRESENTACIÓN.** El operador no
  //     puede ver ni editar el rubro que tiene guardado, y si toca el control lo pierde de
  //     vista. Medir el bloqueo habría sido medir algo que no ocurre —la misma trampa de
  //     [[feedback_guards_measure_index_not_world]], esta vez del lado del diagnóstico.
  // ─────────────────────────────────────────────────────────────────────────────────
  assert.equal(
    antes.resolveIndustryForPersist(RUBRO_LIBRE.value, ''),
    RUBRO_LIBRE.value,
    'CORRECCIÓN DE PREMISA: contra el ancla la PERSISTENCIA ya resolvía bien. Si acá se ' +
      'afirmara que el submit se bloqueaba, el test estaría midiendo un mundo que la ' +
      'verificación en vivo mostró que no existe.'
  );
  // Lo que SÍ estaba roto en el ancla, y es lo único que este bloque arregla: no había
  // NINGUNA opción que representara el valor ⇒ el control se mostraba vacío. Hoy sí la hay.
  assert.equal(
    typeof antes.outOfCatalogIndustryOption,
    'undefined',
    'el ancla no tenía con qué representar el valor: ése es el defecto, y es de la UI'
  );
  assert.equal(
    (await opcionFueraDeCatalogo(RUBRO_LIBRE.value))?.value,
    RUBRO_LIBRE.value,
    'hoy el desplegable tiene una opción que matchea el valor guardado'
  );
});

/* ================================================================== */
/*  ⭐⭐ R-56 / R-40 — el guard se DERIVA del repo, no se enumera        */
/* ================================================================== */

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

/** El bloque `<SelectContent>` que contiene el desplegable de industria. */
function bloqueDelDesplegable(code: string): string {
  const i = code.indexOf('INDUSTRIES.map(');
  const ini = code.lastIndexOf('<SelectContent>', i);
  const fin = code.indexOf('</SelectContent>', i);
  return ini < 0 || fin < 0 ? '' : code.slice(ini, fin);
}

test('T-32/T-34 ⭐⭐ R-56/R-40 TODA superficie que despliega `INDUSTRIES` representa el valor fuera de tabla', () => {
  const superficies = fuentes().filter((rel) =>
    /<SelectContent>[\s\S]{0,600}?\{INDUSTRIES\.map\(/.test(
      stripComments(read(rel))
    )
  );
  // Anti-no-op: si el descubrimiento saliera vacío, el guard pasaría solo.
  assert.ok(
    superficies.length >= 2,
    `sólo ${superficies.length} superficies despliegan \`INDUSTRIES\`: el barrido está ` +
      'roto (se esperaban al menos el alta y la ficha, H-5)'
  );
  for (const rel of superficies) {
    const code = stripComments(read(rel));
    const m =
      /const\s+([A-Za-z_$][\w$]*)\s*=\s*outOfCatalogIndustryOption\(/.exec(
        code
      );
    assert.ok(
      m,
      `${rel}: despliega \`INDUSTRIES\` sin derivar del seam la opción del valor fuera ` +
        'de tabla ⇒ un cliente con rubro libre abre esta pantalla con el desplegable ' +
        'VACÍO y no se puede guardar (R-56). Una superficie NUEVA que consuma la tabla ' +
        'sin la vuelta pone este test rojo sola.'
    );
    const alias = (m as RegExpExecArray)[1];
    assert.match(
      bloqueDelDesplegable(code),
      new RegExp(`<SelectItem value=\\{${alias}\\.value\\}`),
      `${rel}: la opción se calcula pero no se RENDERIZA dentro del mismo desplegable ⇒ ` +
        'el valor sigue sin tener con qué matchear'
    );
    // Y no se resuelve por la puerta prohibida: mutando el vocabulario cerrado.
    assert.equal(
      /\[\s*\.\.\.INDUSTRIES|INDUSTRIES\s*\.\s*concat\s*\(|INDUSTRIES\s*\.\s*push\s*\(/.test(
        code
      ),
      false,
      `${rel}: R-56 prohíbe agregar el valor libre a \`INDUSTRIES\` — sería mutar el ` +
        'vocabulario cerrado y romper la declaración única (F-121 DT-05)'
    );
  }
});

test('T-32 ⭐⭐ R-08 el criterio de «fuera de catálogo» se DECLARA una sola vez', () => {
  const declaran = fuentes().filter((rel) =>
    /export function outOfCatalogIndustryOption|export function isIndustryInCatalog/.test(
      read(rel)
    )
  );
  assert.deepEqual(
    declaran,
    [SEAM_REL],
    'el criterio vive en el seam, no en las pantallas: dos copias sobre el mismo dato es ' +
      'exactamente la clase de fallo que DT-05 de F-121 cerró'
  );
});
