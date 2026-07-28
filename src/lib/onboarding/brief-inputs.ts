/**
 * F-121 (R-06/R-07/R-10/R-11, rama 1b) — **Declaración de los «insumos reales del
 * Brief»** + señal DERIVADA de ellos.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * EL CONTRATO ROTO QUE ESTE MÓDULO CIERRA
 * ─────────────────────────────────────────────────────────────────────────────────
 * `clients/[id]/page.tsx:315` calculaba `hasDiagnostic: !!diagnosticData` y la ficha
 * lo rotulaba **«Diagnóstico completado ✓»**. Eso es **EXISTENCIA DE FILA**, no
 * disponibilidad de insumos: R & M QTB LLC tiene fila de diagnóstico, la ficha decía
 * ✓, y su Brief salió con **23 de 29 claves en [PENDIENTE]** porque el generador no
 * recibió nada más que el prefill. **El generador se portó bien; mintió la señal.**
 *
 * Y el dato para decir la verdad **ya estaba**: nadie lo derivaba.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * QUÉ RECIBE REALMENTE EL GENERADOR (la declaración, R-07)
 * ─────────────────────────────────────────────────────────────────────────────────
 * `POST /api/generate-content` con `step:'brief'` arma su user message con
 * **exactamente dos fuentes**:
 *
 *   1. el bloque `## DATOS DEL CLIENTE` — los campos de `clients` de
 *      `BRIEF_CLIENT_INPUT_FIELDS`, abajo;
 *   2. el bloque `## INPUT ADICIONAL DEL OPERADOR` — `input_data.structured_fields`.
 *
 * Y **nada más**: `brief` NO pertenece a `needsBrief`/`needsPersona`/`needsOffer`
 * (`route.ts`), así que su `contextChain` es la cadena vacía.
 *
 * ⭐ **La declaración de abajo está ATADA al ensamblado real por un source-guard**
 * (`f121-brief-inputs.test.ts`, R-12): agregar una fuente al `userMessageBase` del
 * step `brief` sin declararla acá deja el test **rojo**, y declarar una que no se
 * inyecta también. Ésa es la diferencia entre arreglar el síntoma de julio y arreglar
 * la clase de fallo: la razón por la que la señal mintió es que **nadie ató la promesa
 * al pipeline**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * ⚠️ NOTA DE FRONTERA (CL-102 / CL-104 §5.2)
 * ─────────────────────────────────────────────────────────────────────────────────
 * `diagnostics` NO es un insumo del Brief. Su único contacto con el generador es el
 * **prefill de UI de 2 campos** (`team_size`, y `google_presence`+`digital_health` →
 * `digital_presence`), que viaja **dentro de `structured_fields`** si el operador no
 * los sobreescribe. Cablearlo de verdad es la **rama (2)**, elevada al operador
 * (**GATE-D1**) y **NO implementada**. Este módulo lo MIDE, no lo conecta.
 *
 * Si mañana se decide cablearlo, `BRIEF_INPUT_SOURCES` es exactamente el punto de
 * extensión (design.md §2.4).
 *
 * Módulo puro: sin I/O, sin red, sin Supabase, sin React (`node --test`-able).
 */

import { toIndustryLabel } from '../clients/industry-label.ts';
import {
  buildDigitalPresenceSentence,
  toTeamSizeLabel
} from './diagnostic-labels.ts';

/**
 * ⭐ Los campos de `clients` que el step `brief` inyecta en `## DATOS DEL CLIENTE`.
 * Atado a `route.ts` por el source-guard de R-12, **en los dos sentidos**.
 */
export const BRIEF_CLIENT_INPUT_FIELDS = [
  'business_name',
  'industry',
  'contact_first_name',
  'contact_last_name',
  'phone',
  'email',
  'tier'
] as const;

/**
 * ⭐ Las fuentes del contexto del step `brief`, declaradas. `contextChain` NO figura:
 * `brief` no está en `needsBrief`/`needsPersona`/`needsOffer` ⇒ no recibe brief,
 * persona ni OFV. `diagnostics` NO figura: no es una fuente (ver nota de frontera).
 */
export const BRIEF_INPUT_SOURCES = [
  'clients',
  'input_data.structured_fields'
] as const;

/** Identificador de un insumo, tal como aparece en `present` / `missing`. */
export type BriefInputId =
  | (typeof BRIEF_CLIENT_INPUT_FIELDS)[number]
  | 'structured_fields';

/** Una fila de `diagnostics`, en lo que a este seam le concierne. */
export interface DiagnosticRowLike {
  id?: string | null;
  created_at?: string | null;
  team_size?: string | null;
  google_presence?: string | null;
  digital_health?: string | null;
}

/** La fila de `clients`, laxa: se lee lo declarado y se ignora el resto. */
export type ClientRowLike = Record<string, unknown> | null | undefined;

export interface BriefInputAssessment {
  /** Insumos que el generador VA A RECIBIR con contenido real. */
  present: BriefInputId[];
  /** Insumos declarados que llegarían vacíos (o no llegarían). */
  missing: BriefInputId[];
  /**
   * ⭐ El veredicto que consume la señal de progreso (R-06/R-08): **todos** los insumos
   * declarados llegan con contenido real.
   *
   * **Postura declarada: CONSERVADORA.** Cuando el llamador no puede observar un insumo
   * —la ficha del cliente no lee los campos manuales— ese insumo cuenta como
   * **ausente**, nunca como presente. Toda la feature existe porque la señal
   * SOBRE-prometía; equivocarse hacia "todavía no" no puede reproducir ese defecto, y
   * `present.length` / `missing.length` quedan disponibles para que la superficie diga
   * el número exacto en vez de un booleano suelto.
   */
  allInputsPresent: boolean;
  /**
   * ¿La fila de diagnóstico elegida aporta al menos UN valor de prefill utilizable?
   * `false` con fila presente = el caso R-11: existe el registro y **no aporta nada**.
   */
  hasUsableDiagnosticInput: boolean;
  /** `id` de la fila de diagnóstico elegida por `selectDiagnosticRow`, o `null`. */
  diagnosticRowUsed: string | null;
}

/** Normaliza a string no-vacío o `null`. */
function nonEmpty(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * ⭐ R-10 — **Selección DETERMINISTA y DECLARADA** de la fila de diagnóstico cuando
 * hay más de una.
 *
 * Criterio, en orden: **`created_at` descendente**, y a igualdad (o ante fechas
 * ausentes/no parseables) **`id` ascendente** como desempate total.
 *
 * · `created_at desc` es el criterio que la pantalla de onboarding YA usaba de hecho
 *   (`.order('created_at', { ascending: false }).limit(1)`) — pero sin declararlo y
 *   sin compartirlo con la ficha, así que las dos superficies podían discrepar.
 * · El desempate por `id` existe porque `created_at desc` **no es un orden total**:
 *   sin él, dos filas del mismo instante quedan a merced del orden de llegada.
 *
 * Caso real que lo obliga: **R & M QTB LLC tiene DOS filas mutuamente
 * contradictorias** — `bc0a1027` (tier `presencia_digital`, $3300, `expectation:
 * process`, `new_license`) vs `33872f29` (tier `cimientos`, $399, `urgent`,
 * `established`). El seam elige **una sola, siempre la misma**, y la ficha y el
 * prefill usan **esa misma** (R-10).
 *
 * No muta el array recibido.
 */
export function selectDiagnosticRow<T extends DiagnosticRowLike>(
  rows: readonly T[] | null | undefined
): T | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const candidatos = rows.slice();
  candidatos.sort((a, b) => {
    const ta = Date.parse(nonEmpty(a?.created_at) ?? '');
    const tb = Date.parse(nonEmpty(b?.created_at) ?? '');
    const va = Number.isNaN(ta) ? -Infinity : ta;
    const vb = Number.isNaN(tb) ? -Infinity : tb;
    if (va !== vb) return vb - va; // created_at DESC
    const ia = nonEmpty(a?.id) ?? '';
    const ib = nonEmpty(b?.id) ?? '';
    return ia < ib ? -1 : ia > ib ? 1 : 0; // id ASC (orden total)
  });
  return candidatos[0] ?? null;
}

/**
 * ⭐ R-11 — ¿La fila de diagnóstico aporta algún **insumo utilizable**?
 *
 * "Utilizable" = alguno de los **2 campos de prefill de siempre** resuelve a lenguaje:
 * `team_size`, o la frase de presencia digital (`google_presence`+`digital_health`).
 * Un código fuera del vocabulario cerrado **no** cuenta: si no se lo puede expresar,
 * no llega nada al Brief (degradación honesta, F-104/F-106).
 *
 * No se cuenta ningún otro campo de la fila **a propósito**: los demás (`revenue_range`,
 * `license_status`, `expectation`, `client_management`, `recommended_*`) **no llegan al
 * generador**. Contarlos volvería a prometer lo que el pipeline no entrega — el defecto
 * exacto que F-121 cierra.
 */
export function hasUsableDiagnosticInput(
  row: DiagnosticRowLike | null | undefined
): boolean {
  if (!row) return false;
  if (toTeamSizeLabel(row.team_size ?? null) !== null) return true;
  return (
    buildDigitalPresenceSentence(
      row.google_presence ?? null,
      row.digital_health ?? null
    ).length > 0
  );
}

export interface AssessBriefInputsArgs {
  /** La fila de `clients` (o `null`). */
  client: ClientRowLike;
  /** Todas las filas de `diagnostics` del cliente (0, 1 o N). */
  diagnostics?: readonly DiagnosticRowLike[] | null;
  /**
   * Los campos manuales que viajarían como `input_data.structured_fields`.
   * **Opcional**: la ficha del cliente no los tiene a mano y no los inventa — su
   * ausencia se reporta como insumo `missing`, que es la verdad para esa superficie.
   */
  manualFields?: Record<string, unknown> | null;
}

/**
 * ⭐ R-06/R-07 — Dado el cliente, sus filas de diagnóstico y (opcionalmente) los campos
 * manuales, devuelve **qué insumos del Brief están presentes y cuáles ausentes**.
 *
 * Puro, determinista, sin I/O. Es la única fuente de la señal de progreso relativa al
 * Brief: la ficha ya no puede afirmar disponibilidad por su cuenta.
 */
export function assessBriefInputs(
  args: AssessBriefInputsArgs
): BriefInputAssessment {
  const client = (args.client ?? {}) as Record<string, unknown>;
  const present: BriefInputId[] = [];
  const missing: BriefInputId[] = [];

  for (let i = 0; i < BRIEF_CLIENT_INPUT_FIELDS.length; i++) {
    const field = BRIEF_CLIENT_INPUT_FIELDS[i];
    const raw = nonEmpty(client[field]);
    // `industry` se mide por su ETIQUETA, no por el token: un `other` no aporta rubro
    // al generador, aporta un token que el modelo leería como sustantivo (R-15).
    const aporta =
      field === 'industry' ? toIndustryLabel(raw) !== null : raw !== null;
    (aporta ? present : missing).push(field);
  }

  const manual = args.manualFields ?? null;
  const manualAporta =
    manual !== null &&
    Object.keys(manual).some((k) => nonEmpty(manual[k]) !== null);
  (manualAporta ? present : missing).push('structured_fields');

  const row = selectDiagnosticRow(args.diagnostics ?? null);
  return {
    present,
    missing,
    allInputsPresent: missing.length === 0,
    hasUsableDiagnosticInput: hasUsableDiagnosticInput(row),
    diagnosticRowUsed: row ? (nonEmpty(row.id) ?? null) : null
  };
}
