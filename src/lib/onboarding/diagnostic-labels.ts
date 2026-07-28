/**
 * F-121 (R-13/R-17/R-18) — Códigos del diagnóstico → **lenguaje**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⚠️ NOTA DE FRONTERA — ESTE MÓDULO **NO** AMPLÍA LO QUE EL DIAGNÓSTICO APORTA
 * ─────────────────────────────────────────────────────────────────────────────────
 * `docs/c3-studio-core-downstream-boundary.md` §5.2 clasifica `diagnostics` como
 * **FRONTERA**, con dos lecturas SIN resolver (CL-104). La decisión de si el
 * diagnóstico debe **alimentar** al generador del Brief está **elevada al operador
 * (GATE-D1)** y **NO se implementa en F-121**.
 *
 * Lo único que existía hasta hoy es un **prefill de UI** de DOS campos:
 *   · `team_size`        → `briefFields.team_size`
 *   · `google_presence` + `digital_health` → `briefFields.digital_presence`
 *
 * Este módulo cambia **la FORMA en que esos mismos 2 campos se expresan**, y nada más.
 * No agrega campos, no agrega lecturas, no toca `route.ts`. Es CL-102-safe por
 * construcción, y `f121-brief-inputs.test.ts` lo asserta contra la proyección real de
 * la consulta a `diagnostics` de la pantalla de onboarding.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * POR QUÉ
 * ─────────────────────────────────────────────────────────────────────────────────
 * `page.tsx:563-566` ensamblaba una FRASE con CÓDIGOS:
 *
 *     `GBP: ${google_presence}, Salud digital: ${digital_health}`
 *
 * …y ese string se persistió VERBATIM en producción:
 *   · SCS Cleaning Service (`be43470f`) → "GBP: no_gbp, Salud digital: nothing"
 *   · Clara V Decor        (`e1ad789c`) → "GBP: ranking_no_calls, Salud: nothing"
 *
 * ⇒ **el único punto donde el diagnóstico hoy toca al Brief lo hacía inyectando
 * códigos dentro de una oración.** El modelo, correctamente, los reprodujo. Un prompt
 * no puede des-fabricar un string que la app le entrega ya hecho (design.md §5).
 *
 * Las etiquetas salen de las MISMAS opciones que el formulario de diagnóstico
 * presenta al operador (`app/(app)/diagnostic/page.tsx`), en su forma afirmativa.
 *
 * Módulo puro: sin I/O, sin red, sin Supabase, sin React (`node --test`-able).
 */

/** `google_presence` → frase afirmativa. Vocabulario cerrado del paso 2. */
const GOOGLE_PRESENCE_LABELS: Record<string, string> = {
  no_gbp: 'No tiene Google Business Profile',
  has_gbp_not_ranking:
    'Tiene Google Business Profile pero no aparece en búsquedas',
  ranking_no_calls: 'Aparece en Google pero el perfil no genera llamadas',
  generating_leads: 'El perfil de Google ya genera leads'
};

/** `digital_health` → frase afirmativa. Vocabulario cerrado del paso 2. */
const DIGITAL_HEALTH_LABELS: Record<string, string> = {
  nothing: 'no tiene nada digital',
  have_access: 'tiene sus activos digitales y conserva el acceso',
  lost_access: 'perdió el acceso a sus cuentas',
  inconsistent: 'su información aparece distinta en varios sitios'
};

/** `team_size` → frase legible. Vocabulario cerrado del paso 3. */
const TEAM_SIZE_LABELS: Record<string, string> = {
  solo: 'Solo el dueño (solopreneur)',
  '2_5': '2-5 personas',
  '6_plus': '6 o más personas'
};

/** Normaliza a string no-vacío o `null`. */
function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Código de vocabulario cerrado → etiqueta, o `null` si el valor está ausente o no
 * pertenece al vocabulario. **Nunca devuelve el código crudo**: si no se lo reconoce,
 * la degradación honesta es la ausencia, no el token (misma doctrina que
 * `toIndustryLabel`, R-15/R-16).
 */
function fromTable(
  table: Record<string, string>,
  raw: string | null | undefined
): string | null {
  const v = nonEmpty(raw);
  if (v === null) return null;
  return Object.prototype.hasOwnProperty.call(table, v) ? table[v] : null;
}

/** `google_presence` en lenguaje, o `null` si ausente/desconocido. */
export function toGooglePresenceLabel(
  raw: string | null | undefined
): string | null {
  return fromTable(GOOGLE_PRESENCE_LABELS, raw);
}

/** `digital_health` en lenguaje, o `null` si ausente/desconocido. */
export function toDigitalHealthLabel(
  raw: string | null | undefined
): string | null {
  return fromTable(DIGITAL_HEALTH_LABELS, raw);
}

/** `team_size` en lenguaje, o `null` si ausente/desconocido. */
export function toTeamSizeLabel(raw: string | null | undefined): string | null {
  return fromTable(TEAM_SIZE_LABELS, raw);
}

/**
 * ⭐ Los **mismos 2 campos de siempre** (`google_presence` + `digital_health`)
 * expresados como UNA frase en lenguaje, o `''` si ninguno de los dos aporta.
 *
 * Degradación honesta (F-104/F-106): si sólo uno de los dos códigos es reconocible se
 * emite sólo ése; si ninguno lo es se emite **cadena vacía** — nunca `N/A`, nunca el
 * código, nunca una frase con un hueco. El llamador trata `''` como "no prefillar".
 */
export function buildDigitalPresenceSentence(
  googlePresence: string | null | undefined,
  digitalHealth: string | null | undefined
): string {
  const gp = toGooglePresenceLabel(googlePresence);
  const dh = toDigitalHealthLabel(digitalHealth);
  if (gp !== null && dh !== null) return `${gp}; ${dh}.`;
  if (gp !== null) return `${gp}.`;
  if (dh !== null) {
    // La cláusula de salud digital es subordinada: se la promueve a oración propia
    // capitalizando su primera letra, en vez de dejar una frase colgando.
    return dh.charAt(0).toUpperCase() + dh.slice(1) + '.';
  }
  return '';
}
