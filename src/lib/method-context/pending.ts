/**
 * F-112 (R-07 / DT-3 opción c) — **Fuente única** del criterio `[PENDIENTE]` para
 * los extractores de contexto del método.
 *
 * `[PENDIENTE]` es un marcador de gestión LEGÍTIMO en el artefacto (F-104/F-106 lo
 * instituyeron; F-109 lo tolera en la aprobación). Lo que NO debe ocurrir es
 * inyectarlo en el prompt de un generador de copy: el riesgo concreto es que el
 * modelo escriba literalmente "[PENDIENTE]" en el output, o peor, lo interprete como
 * una instrucción. Este módulo no altera ninguna fila, no bloquea aprobaciones y no
 * oculta el marcador al operador — solo lo filtra en el borde de lectura.
 *
 * Nacido de la copia privada que F-111 tenía en `src/lib/offers/method-context.ts`:
 * la extracción es **preservadora de comportamiento** (los 40 tests de F-111 son su
 * red de regresión) y evita que dos definiciones de una regla doctrinal deriven en
 * silencio cuando `src/lib/personas/method-context.ts` (F-112) aplica el mismo filtro.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * F-118 (R-14/R-15) — DOS CRITERIOS SOBRE UN MISMO MARCADOR, EN DOS BORDES OPUESTOS
 * ─────────────────────────────────────────────────────────────────────────────────
 * El módulo pasa a alojar dos predicados que NO son el mismo y no deben unificarse:
 *
 *   | criterio                       | predicado                        | borde | consumidores |
 *   |--------------------------------|----------------------------------|-------|--------------|
 *   | ¿este CAMPO es el marcador?    | `isPendingMarker` / `cleanScalar` | ENTRADA al prompt: filtrarlo para que no se inyecte | F-111, F-112, F-113, F-116 |
 *   | ¿este COPY contiene un marcador? | `detectMissingMarkers`          | SALIDA en copy publicable: detectarlo antes de que se publique | F-118 |
 *
 * La extensión es **por ADICIÓN de una función nueva, nunca por ensanchamiento** del
 * predicado existente (R-15): `isPendingMarker`/`cleanScalar` deciden qué contexto
 * reciben tres features ya cerradas; ensancharlos cambiaría ese contexto en silencio.
 * Un marcador, dos bordes, dos predicados.
 *
 * Módulo puro: sin I/O, sin red, sin Supabase, framework-free (`node --test`-able).
 */

/** El marcador, en su forma canónica de comparación (minúsculas). Única definición
 * del literal en la familia `method-context` (R-07). */
export const PENDING_MARKER = '[pendiente]';

/**
 * ¿El valor es EXACTAMENTE el marcador `[PENDIENTE]`? Comparación tras `trim()` y
 * case-insensitive.
 *
 * **Residual declarado:** un `[PENDIENTE]` *embebido* en una frase más larga
 * (p. ej. "Objeciones principales: [PENDIENTE] y falta de tiempo") NO se detecta —
 * filtrarlo exigiría reescribir contenido aprobado, fuera de scope. Límite conocido,
 * no silenciado.
 */
export function isPendingMarker(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.trim().toLowerCase() === PENDING_MARKER;
}

/**
 * Escalar → texto útil, o `null`. Comportamiento EXACTO de la copia privada de
 * F-111 (contrato preservado):
 *
 *   - número finito           → `String(v)`
 *   - string                  → `trim()`; vacío ⇒ `null`; `[PENDIENTE]` ⇒ `null`
 *   - cualquier otro tipo     → `null` (objeto, booleano, array, `null`, `undefined`,
 *                               número no finito)
 */
export function cleanScalar(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (t.length === 0) return null;
  if (isPendingMarker(t)) return null;
  return t;
}

/**
 * F-118 (R-14/R-17/R-18) — ¿este COPY contiene un marcador de faltante, **en cualquier
 * idioma**? Devuelve los tokens LITERALES hallados (vacío = copy limpio).
 *
 * **Por PATRÓN, no por lista cerrada de variantes** — y la razón no es de estilo: la regla
 * de los prompts nombraba únicamente el marcador canónico (ver `PENDING_MARKER`) y el
 * modelo emitió su traducción al inglés en copy publicable (CL-101 hallazgo 1). Una lista
 * sólo cubre lo ya visto y obligaría a adivinar el próximo idioma; el patrón generaliza.
 * (Además, enumerar variantes exigiría escribir otra vez el literal del marcador en
 * `src/lib`, cosa que dos tests preexistentes prohíben: la fuente única es la constante de
 * arriba.)
 *
 * Criterio:
 *   `/\[[^\]\n]{1,40}\]/`  que NO esté seguido de `(`   ∪  `\bTBD\b` ∪ `\bTBA\b` ∪ `_{3,}`
 *
 *   · **Carve-out de enlace markdown** (R-17): `[Reservá ahora](https://…)` es el único uso
 *     legítimo y frecuente de corchetes en copy publicable (emails de nurturing, CTAs de
 *     landing). Sin él, el falso positivo sería ESTRUCTURAL, no residual.
 *   · La lista corta no-corchetada (`TBD`/`TBA`/`___`) es inequívoca y no tiene uso legítimo
 *     en copy comercial. Deliberadamente NO incluye `N/A` (uso legítimo: una tabla de
 *     servicios).
 *
 * Puro y `es5`-safe (`exec`-loop). No lanza ante entradas no-string.
 */
export function detectMissingMarkers(text: unknown): string[] {
  const t = typeof text === 'string' ? text : '';
  const found: string[] = [];
  if (t.length === 0) return found;
  const bracketed = /\[[^\]\n]{1,40}\]/g;
  let m: RegExpExecArray | null;
  while ((m = bracketed.exec(t)) !== null) {
    // Carve-out markdown link: `[texto](url)` no es un marcador de faltante (R-17).
    if (t.charAt(m.index + m[0].length) !== '(') found.push(m[0]);
    if (m.index === bracketed.lastIndex) bracketed.lastIndex++;
  }
  const bare = [/\bTBD\b/gi, /\bTBA\b/gi, /_{3,}/g];
  for (let i = 0; i < bare.length; i++) {
    const re = new RegExp(bare[i].source, bare[i].flags);
    let b: RegExpExecArray | null;
    while ((b = re.exec(t)) !== null) {
      found.push(b[0]);
      if (b.index === re.lastIndex) re.lastIndex++;
    }
  }
  return found;
}
