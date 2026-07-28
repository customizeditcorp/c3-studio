/**
 * F-121 (R-20/R-23/R-27) — **Guards deterministas del ENSAMBLADO del Brief.**
 *
 * Tres detectores puros, uno por defecto observado en producción el 2026-07-27. Ninguno
 * bloquea, ninguno muta, ninguno persiste: alimentan un reintento-una-vez dirigido y un
 * warning **transitorio** (patrón literal de F-105 `route.ts`, DT-07), o un aviso
 * advisory en la UI (DT-04).
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⚠️ RESTRICCIÓN H-3 — EL LITERAL DEL MARCADOR NO SE ESCRIBE ACÁ
 * ─────────────────────────────────────────────────────────────────────────────────
 * `f112-no-regression` T-10 R-07 y `f113-source-guards` T-11 R-08 exigen que el literal
 * entrecomillado del marcador aparezca **una sola vez en todo `src/lib`**
 * (`method-context/pending.ts`). Este módulo lo detecta **POR PATRÓN**, con el mismo
 * criterio de tolerancia que `PLACEHOLDER_TOKEN` de `approval-guard.ts` — que **no se
 * toca ni se importa desde acá**, porque R-02 lo declara intocable y exportarle algo
 * nuevo sería tocarlo.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⚠️ EL MECANISMO DEL RESIDUO DE PRUEBA (R-26) — VERIFICADO, NO SUPUESTO
 * ─────────────────────────────────────────────────────────────────────────────────
 * `differentiators = "TEST T-04"` sobrevivió hasta la generación de R & M (`b56d1fa3`).
 * **No hay bug: hay ausencia de señal.** La cadena, verificada en
 * `src/app/(app)/onboarding/brief/[clientId]/page.tsx`:
 *
 *   1. `loadData` carga la fila de `briefs` más reciente por `created_at desc`
 *      **de CUALQUIER status** (sin `.eq('status', …)`) — intencional desde F-113 R-35:
 *      filtrar por status le borraría al operador su borrador vivo de la pantalla;
 *   2. el valor puebla `briefFields` vía `parseContentToFields`;
 *   3. `handleGenerateBrief` lo envía **tal cual** como
 *      `inputData: { structured_fields: briefFields }` ⇒ el modelo lo lee como un hecho
 *      afirmado por el operador;
 *   4. y el **bucle de re-inyección post-generación** (`for (const k of
 *      Object.keys(briefFields))` … `if (!parsed[k] && briefFields[k]) parsed[k] =
 *      briefFields[k]`) lo **vuelve a poner** si el modelo lo omitió.
 *
 * Los 4 eslabones son legítimos por separado; nadie le dice al operador que ese valor va
 * a viajar. Por eso el arreglo es **VISIBILIDAD** (advisory), no un bloqueo (DT-04): un
 * gate colisionaría con R-02 y frenaría a un operador que hoy no está frenado.
 * `f121-test-residue.test.ts` asserta que las referencias a estos 3 puntos siguen
 * existiendo en el archivo ⇒ si el mecanismo cambia, el comentario queda **rojo**, no
 * stale (R-26).
 *
 * Módulo puro: sin I/O, sin red, sin Supabase, sin React (`node --test`-able).
 */

import { INDUSTRIES } from '../clients/industry-label.ts';

/* ═══════════════════════════════════════════════════════════════════ */
/*  (1/3) R-20 — TOKEN-CÓDIGOS usados como lenguaje                    */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * Los vocabularios cerrados de la app, **fuera de industria** (que se toma de
 * `INDUSTRIES`, la declaración única de R-14 — no se la copia).
 *
 * Fuente: los `RadioGroup` de `src/app/(app)/diagnostic/page.tsx` y `calculateTier`.
 */
const DIAGNOSTIC_CODE_TOKENS: readonly string[] = [
  // google_presence
  'no_gbp',
  'has_gbp_not_ranking',
  'ranking_no_calls',
  'generating_leads',
  // digital_health
  'nothing',
  'have_access',
  'lost_access',
  'inconsistent',
  // team_size
  'solo',
  '2_5',
  '6_plus',
  // revenue_range
  'less_10k',
  '10k_25k',
  '25k_60k',
  'more_60k',
  // license_status
  'new_license',
  'established',
  'recent_change',
  // expectation
  'urgent',
  'process',
  'long_term',
  'unsure',
  // client_management
  'paper',
  'apps',
  'crm',
  // tier
  'presencia_digital',
  'cimientos',
  'expansion',
  'dominio'
];

/**
 * ⭐ **Exclusión DECLARADA — postura conservadora.** Tokens del vocabulario cerrado que
 * son además **palabras corrientes del español**: marcarlos convertiría al guard en una
 * fuente de falsos positivos sobre prosa perfectamente sana (*"trabaja **solo**"*,
 * *"es un **proceso** de 90 días"*, *"la **expansión** del negocio"*, *"puso los
 * **cimientos**"*, *"es **urgente**"*, *"un negocio **establecido**"*).
 *
 * El costo de excluirlos está medido: **ninguno de los 4 defectos reales observados los
 * usa**. Los defectos reales son `other`, `cleaning`, `no_gbp` y `nothing`.
 */
const NATURAL_LANGUAGE_COLLISIONS = new Set([
  'solo',
  'process',
  'expansion',
  'cimientos',
  'dominio',
  'urgent',
  'established',
  'apps',
  'paper'
]);

/**
 * El vocabulario efectivo del detector: los códigos de industria + los del diagnóstico,
 * menos las colisiones declaradas. Se construye a partir de `INDUSTRIES` para que
 * **agregar una industria nueva a la tabla la incorpore automáticamente** — una lista
 * propia acá sería la cuarta copia, que es la causa raíz que F-121 vino a eliminar.
 */
const CODE_TOKENS: readonly string[] = INDUSTRIES.map((i) => i.value)
  .concat(DIAGNOSTIC_CODE_TOKENS as string[])
  .filter((t) => !NATURAL_LANGUAGE_COLLISIONS.has(t))
  .filter((t, i, a) => a.indexOf(t) === i);

/** Escapa un token para uso literal dentro de un `RegExp`. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ⭐ R-20 — ¿Este valor emitido contiene **token-códigos** usados como lenguaje?
 * Devuelve los tokens LITERALES hallados, sin repetir (vacío = valor limpio).
 *
 * Criterio: coincidencia de **palabra completa** y **case-SENSITIVE en minúsculas**.
 * Las dos decisiones son deliberadas:
 *   · *palabra completa* — `otherwise` no contiene el token `other`, y `2_5` no debe
 *     dispararse dentro de `12_54`;
 *   · *case-sensitive* — la ETIQUETA legítima suele diferir sólo en el caso
 *     (`HVAC` la etiqueta vs `hvac` el código; `Landscaping` vs `landscaping`), así que
 *     distinguirlas por caso separa exactamente el defecto de su arreglo.
 *
 * **Residual declarado, no silenciado:** en un brief redactado en INGLÉS
 * (`client.content_language`), palabras como `cleaning` o `other` son lenguaje legítimo
 * y este detector las marcaría. El costo de ese falso positivo está acotado por diseño:
 * la acción es **un** reintento y un warning transitorio — nunca un bloqueo, nunca una
 * mutación (DT-07/R-20). Se prefiere ese costo a dejar pasar *"Top 3 en Google Maps
 * para other"* (Clara V, `e1ad789c`) y *"para cleaning en la zona"* (SCS, `be43470f`).
 *
 * Puro y `es5`-safe. No lanza ante entradas no-string.
 */
export function detectRawCodeTokens(value: unknown): string[] {
  const t = typeof value === 'string' ? value : '';
  const found: string[] = [];
  if (t.length === 0) return found;

  // (a) Regla ESTRUCTURAL, independiente de toda lista: un identificador
  // `snake_case` que empieza con letra minúscula **no es lenguaje** en ningún idioma
  // del corpus. Ésta es la que atrapa a `portable_toilet_rental_service` (R & M,
  // `b56d1fa3`), que NO pertenece a la tabla de industrias y aun así viajó literal al
  // prompt y al `raw_text` — una lista cerrada nunca lo habría visto (R-16).
  // Exige al menos un segmento alfabético inicial: `12_54` (un número de proyecto) no
  // es un identificador y no se marca.
  const estructural =
    /(^|[^A-Za-z0-9_])([a-z][a-z0-9]*(?:_[a-z0-9]+)+)($|[^A-Za-z0-9_])/g;
  let m: RegExpExecArray | null;
  while ((m = estructural.exec(t)) !== null) {
    if (found.indexOf(m[2]) < 0) found.push(m[2]);
    if (m.index === estructural.lastIndex) estructural.lastIndex++;
  }

  // (b) Regla por VOCABULARIO: los tokens de una sola palabra, que la forma no delata.
  for (let i = 0; i < CODE_TOKENS.length; i++) {
    const token = CODE_TOKENS[i];
    // Bordes propios en vez de `\b`: `\b` trata `_` como carácter de palabra, así que
    // `\bno_gbp\b` no reconocería el corte correcto en `x_no_gbp`, y `2_5` rompería.
    const re = new RegExp(
      '(^|[^A-Za-z0-9_])' + escapeRe(token) + '($|[^A-Za-z0-9_])'
    );
    if (re.test(t) && found.indexOf(token) < 0) found.push(token);
  }
  return found;
}

/** Los token-códigos hallados en TODOS los valores string de un objeto de contenido. */
export function detectRawCodeTokensInContent(
  content: unknown
): { key: string; tokens: string[] }[] {
  const out: { key: string; tokens: string[] }[] = [];
  if (!content || typeof content !== 'object') return out;
  const obj = content as Record<string, unknown>;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const tokens = detectRawCodeTokens(obj[keys[i]]);
    if (tokens.length > 0) out.push({ key: keys[i], tokens });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  (2/3) R-23 — MARCADOR INCRUSTADO en prosa redactada                */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * El marcador, **por patrón** (H-3: el literal entrecomillado vive una sola vez en
 * `src/lib`, en `method-context/pending.ts`). Mismo criterio de tolerancia que el
 * `PLACEHOLDER_TOKEN` de `approval-guard.ts`: `[PENDIENTE]` / `[PENDING]`, tolerante a
 * whitespace interno y case-insensitive.
 */
const MARKER_RE = /\[\s*(?:PENDIENTE|PENDING)\s*\]/gi;

/**
 * ⭐⭐ R-23/R-24 — ¿El valor tiene el marcador **INCRUSTADO DENTRO de prosa redactada**?
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POSTURA: **CONSERVADORA** (DT-03) — ante la duda, NO marcar
 * ─────────────────────────────────────────────────────────────────────────────────
 * Se aplica el criterio que F-118 formuló, **no su conclusión**: *un guard debe ser
 * conservador donde el humano ya tiene la información y agresivo donde no la tiene*. Un
 * post de GBP se **publica** sin que nadie pueda distinguir un descuento inventado ⇒
 * agresivo. Un **Brief es interno, se lee entero y se aprueba a mano** ⇒ el operador
 * **sí** ve el defecto ⇒ conservador. Y un falso positivo acá ataca directamente el
 * marcador que F-104/F-106 instituyeron.
 *
 * **NO ES, NI PUEDE SER, «contiene algún marcador» (R-01).** Un marcador que ocupa la
 * RANURA COMPLETA de un campo es **degradación honesta legítima**, y el resultado
 * marcado por esta función **sigue siendo aprobable** por `assessApproval` (R-24): este
 * guard opera en tiempo de GENERACIÓN, nunca en tiempo de aprobación.
 *
 * Umbral (DT-03), las tres condiciones a la vez:
 *   1. el valor contiene al menos un marcador; **y**
 *   2. queda **≥ 6 palabras** de prosa alrededor tras removerlos; **y**
 *   3. el marcador **no** está al final tras un separador de etiqueta (`:`, `—`, `-`,
 *      `#`) — la forma legítima *"Licencias: [PENDIENTE]"* / *"CSLB #[PENDIENTE]"*.
 *
 * MARCA (valores reales de Clara V Decor, `e1ad789c`):
 *   · *"Top 3 en Google Maps para other en [PENDIENTE] + 15-20 leads/mes"*
 *   · *"Busca en Google: other near me, other rental [PENDIENTE]…"*
 * NO MARCA: el marcador solo · `"Licencias: [PENDIENTE]"` · `"CSLB #[PENDIENTE]"` ·
 * `"[ PENDIENTE ]"`.
 */
export function detectEmbeddedPlaceholder(value: unknown): boolean {
  const t = typeof value === 'string' ? value.trim() : '';
  if (t.length === 0) return false;

  const marker = new RegExp(MARKER_RE.source, 'gi');
  if (!marker.test(t)) return false;

  // (3) Forma de RANURA ETIQUETADA: `<etiqueta><separador> <marcador>` al cierre del
  // valor. Es la forma canónica de la degradación honesta y no se marca nunca.
  const etiquetado = new RegExp(
    '[:—\\-#]\\s*(?:' + MARKER_RE.source + ')\\s*[.;]?\\s*$',
    'i'
  );
  if (etiquetado.test(t)) return false;

  // (2) Prosa REAL alrededor: ≥ 6 palabras tras remover los marcadores. Debajo de ese
  // umbral el valor es una ranura o un fragmento, no una oración redactada.
  const sinMarcador = t.replace(new RegExp(MARKER_RE.source, 'gi'), ' ');
  const palabras = sinMarcador
    .split(/[^A-Za-z0-9À-ɏ]+/)
    .filter((w) => w.length > 0);
  return palabras.length >= 6;
}

/** Las claves cuyo valor tiene el marcador incrustado en prosa (R-23). */
export function detectEmbeddedPlaceholderInContent(content: unknown): string[] {
  const out: string[] = [];
  if (!content || typeof content !== 'object') return out;
  const obj = content as Record<string, unknown>;
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    // `raw_text` queda FUERA: es el brief entero en markdown, con muchas líneas
    // etiquetadas legítimas. El criterio para el blob es el del prompt (R-22), no éste.
    if (keys[i] === 'raw_text') continue;
    if (detectEmbeddedPlaceholder(obj[keys[i]])) out.push(keys[i]);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  (3/3) R-27 — RESIDUO DE PRUEBA en campos manuales                  */
/* ═══════════════════════════════════════════════════════════════════ */

/**
 * Marcadores de prueba: `TEST`, `PRUEBA`, `DUMMY`, `FOO`, `ASDF`, `XXX`, `LOREM`,
 * seguidos opcionalmente de un identificador corto (`T-04`, `123`, `2`).
 *
 * Case-SENSITIVE en MAYÚSCULAS a propósito: *"Test de agua a presión"* y *"prueba de
 * carga certificada"* son texto de negocio perfectamente válido en estas industrias. Lo
 * que delata al residuo es la forma de marcador — token en mayúsculas, valor corto.
 */
const TEST_RESIDUE_RE =
  /^(?:TEST|PRUEBA|DUMMY|FOO|BAR|ASDF|XXX+|LOREM)(?:\s+[A-Za-z0-9-]{1,8})?$/;

/**
 * ⭐ R-27 — ¿El valor de este campo manual es un **residuo de prueba** y no contenido
 * del negocio?
 *
 * Fixture real: `differentiators = "TEST T-04"` (R & M QTB LLC, brief `b56d1fa3`), que
 * viajó al modelo como un hecho afirmado por el operador y fue re-inyectado por el bucle
 * post-generación.
 *
 * **Conservador por diseño (DT-04):** sólo marca valores que son ÍNTEGRAMENTE un
 * marcador de prueba (tras `trim()`), nunca una frase que contenga la palabra. Y el
 * efecto es **advisory**: la UI avisa, no bloquea ni borra (R-28/R-29).
 */
export function detectTestResidue(value: unknown): boolean {
  const t = typeof value === 'string' ? value.trim() : '';
  if (t.length === 0) return false;
  return TEST_RESIDUE_RE.test(t);
}

/**
 * Las claves de campos manuales cuyo valor es un residuo de prueba (R-27/R-28).
 *
 * Param `object` (no `Record<string, unknown>`) por el **mismo motivo declarado en
 * `assessApproval`**: acepta directamente las interfaces de campos
 * (`BriefFields`/`PersonaFields`/`OFVFields`) SIN cast y SIN introducir errores `tsc`
 * — esas interfaces no tienen index signature. Los valores se leen laxos.
 */
export function detectTestResidueFields(
  fields: object | null | undefined
): string[] {
  const out: string[] = [];
  if (!fields || typeof fields !== 'object') return out;
  const entradas = Object.entries(fields);
  for (let i = 0; i < entradas.length; i++) {
    if (detectTestResidue(entradas[i][1])) out.push(entradas[i][0]);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Resultado agregado, para la orquestación de `route.ts` (R-20/R-23) */
/* ═══════════════════════════════════════════════════════════════════ */

export interface AssemblyDefects {
  /** Claves con token-códigos, y los tokens literales hallados. */
  rawCodes: { key: string; tokens: string[] }[];
  /** Claves con marcador incrustado en prosa redactada. */
  embeddedPlaceholders: string[];
  /** `true` sii no se detectó ningún defecto de ensamblado. */
  ok: boolean;
}

/**
 * Los dos defectos de ensamblado sobre un contenido generado. Acotado al step `brief`
 * por el llamador (DT-08). **No muta la entrada.**
 */
export function checkBriefAssembly(content: unknown): AssemblyDefects {
  const rawCodes = detectRawCodeTokensInContent(content);
  const embeddedPlaceholders = detectEmbeddedPlaceholderInContent(content);
  return {
    rawCodes,
    embeddedPlaceholders,
    ok: rawCodes.length === 0 && embeddedPlaceholders.length === 0
  };
}

/** ¿El segundo resultado es ESTRICTAMENTE mejor que el primero? (adopción, DT-07). */
export function assemblyImprovesStrictly(
  before: AssemblyDefects,
  after: AssemblyDefects
): boolean {
  if (after.ok && !before.ok) return true;
  const antes = before.rawCodes.length + before.embeddedPlaceholders.length;
  const despues = after.rawCodes.length + after.embeddedPlaceholders.length;
  return despues < antes;
}

/**
 * Directiva de reintento que enumera los tokens LITERALES hallados. Cadena vacía si no
 * hay nada que corregir (camino feliz: no se arma directiva y no hay re-call).
 */
export function buildAssemblyRetryDirective(defects: AssemblyDefects): string {
  if (defects.ok) return '';
  const partes: string[] = [];
  if (defects.rawCodes.length > 0) {
    const tokens: string[] = [];
    for (let i = 0; i < defects.rawCodes.length; i++) {
      const t = defects.rawCodes[i].tokens;
      for (let j = 0; j < t.length; j++) {
        if (tokens.indexOf(t[j]) < 0) tokens.push(t[j]);
      }
    }
    partes.push(
      'CORRECCION OBLIGATORIA: los siguientes son IDENTIFICADORES INTERNOS del sistema, ' +
        'no palabras del idioma, y no pueden aparecer dentro de una frase redactada: ' +
        tokens.join(', ') +
        '. Reescribi esos valores nombrando la realidad del negocio; si el dato no se ' +
        'conoce, marca el campo COMPLETO como faltante en vez de usar el identificador.'
    );
  }
  if (defects.embeddedPlaceholders.length > 0) {
    partes.push(
      'CORRECCION OBLIGATORIA: en los campos ' +
        defects.embeddedPlaceholders.join(', ') +
        ' el marcador de dato faltante quedo INCRUSTADO dentro de una oracion ya ' +
        'redactada. El marcador ocupa la RANURA COMPLETA de un campo o no se usa: o el ' +
        'valor entero es el marcador, o la oracion se escribe sin el.'
    );
  }
  return partes.join('\n');
}
