/**
 * F-119 — Seam de procedencia: ¿la fila que estoy editando es la que alimenta la generación?
 * (R-20..R-24, DT-01 opción **B**).
 *
 * Seam framework-free (`node --test`-able, sin I/O, sin red, sin Supabase), hermano de
 * `next-version.ts`, `select-canonical-row.ts` (F-113) y `offers/select-canonical.ts` (F-109).
 *
 * ## El síntoma que vuelve visible
 *
 * La superficie de onboarding carga por `created_at desc` y **sin filtro de `status`**; el
 * generador consume `status='approved'` + el selector canónico. Cuando difieren, la pantalla
 * te muestra una fila mientras el generador consume otra **y nada lo señala** — el síntoma
 * *"lo edité y no cambió nada"* que F-113 R-35 dejó declarado y sin cerrar.
 *
 * ## Lo que este seam NO hace (la constricción central, R-25)
 *
 * **La señal existe para hacer visible una relación, no para forzarla.** Los campos editables
 * se siguen poblando desde la lectura `created_at desc` **sin** filtro de `status`: esa lectura
 * **es intencional** — existe para que el operador siga editando su borrador. Alinearla a
 * ciegas (hacer que la UI lea la fila canónica) **le borraría el borrador vivo de la pantalla**:
 * caso real medido, el draft `9a5357b6` de JD Valley, editado el 2026-07-25, sería reemplazado
 * por `400dbe18` (1 clave). Por eso este módulo **clasifica y no decide**: no promueve, no copia,
 * no aprueba, no reescribe y no bloquea nada (R-29/R-30).
 *
 * ## Por qué reusa los selectores del generador y no un criterio propio (R-24)
 *
 * SI la señal resolviera la canónica con un criterio propio, emitiría una **procedencia falsa**
 * — peor que no señalar nada. Es la misma regla con que F-113 obligó a que el `persona_id` /
 * `brief_id` persistido saliera de la fila que **realmente** alimentó el prompt (R-14/R-15).
 * Acá se delega **literalmente**: `pickCanonicalContentRow` para `brief`/`persona`,
 * `pickCanonicalOffer` para `offer`. Ningún criterio se re-implementa.
 *
 * ## Tres estados, no dos
 *
 * `none-approved` **no** es un sub-caso de `diverged`. Los read-paths de contexto de
 * `generate-content/route.ts` (`:326-341`, `:348-378`, `:383-392`) **no tienen fallback**: sin
 * fila `approved` el bloque **no se emite** y el generador **no recibe ese artefacto en
 * absoluto**. Es la clase más severa y hoy la sufre `offers` de Customize It (4 drafts,
 * 0 approved). Colapsarla en "difieren" perdería exactamente la información que el operador
 * necesita.
 *
 * ## Contrato de entrada
 *
 * `approvedCandidates` son las filas **ya filtradas a `status='approved'` del mismo
 * `client_id`** — los mismos filtros que el generador. El seam no puede re-filtrar por
 * `status` (los `select` del generador no proyectan esa columna: el filtro vive en la query),
 * así que la equivalencia de filtros es responsabilidad del call-site y está fijada por
 * source-guard.
 */
import {
  pickCanonicalContentRow,
  type CanonicalContentRow
} from './select-canonical-row.ts';
import {
  pickCanonicalOffer,
  type CanonicalOfferRow
} from '../offers/select-canonical.ts';

/** Las 3 clases de artefacto del núcleo (el `tableMap` de `generate-content/route.ts`). */
export type GenerationArtifact = 'brief' | 'persona' | 'offer';

/**
 * - `aligned`      — la fila que se edita **es** la que alimenta la generación.
 * - `diverged`     — hay una fila canónica, pero **es otra**.
 * - `none-approved`— **ninguna** fila alimenta la generación: no hay `approved`.
 */
export type GenerationSourceState = 'aligned' | 'diverged' | 'none-approved';

/** Forma mínima de un candidato: el superset de lo que piden ambos selectores. */
export interface GenerationCandidateRow
  extends CanonicalContentRow,
    Partial<Pick<CanonicalOfferRow, 'big_promise'>> {
  /** Sello de aprobación (F-109 R-07). Sólo informativo para el aviso; no interviene. */
  approved_at?: string | null;
}

export interface GenerationSourceResult {
  state: GenerationSourceState;
  /** La fila canónica completa, o `null` si no hay ninguna `approved`. */
  canonical: GenerationCandidateRow | null;
  /** Identidad de la fila canónica (atajo de `canonical?.id`), o `null`. */
  canonicalId: string | null;
  /** Identidad de la fila editable tal como llegó, o `null`. */
  editableId: string | null;
}

/**
 * Clasifica la relación entre la **fila editable** (la que puebla los campos: `created_at desc`,
 * cualquier `status`) y la **fila canónica** (la que el generador consume: `status='approved'`
 * + selector canónico).
 *
 * Reglas exactas:
 *   - `none-approved` **si y sólo si** no hay ningún candidato `approved` (R-21).
 *   - `diverged` si y sólo si hay canónica y su `id` **difiere** del de la editable (R-22).
 *   - `aligned` si y sólo si hay canónica y su `id` **coincide** con el de la editable (R-23).
 *
 * Puro: no muta la entrada (los selectores ordenan sobre una copia), no hace I/O, no lanza.
 */
export function resolveGenerationSource(args: {
  artifact: GenerationArtifact;
  /** La fila que la superficie está editando; `null` si el cliente no tiene ninguna fila. */
  editable: { id: string } | null | undefined;
  /** Candidatos `status='approved'` del mismo `client_id` (mismos filtros que el generador). */
  approvedCandidates: GenerationCandidateRow[] | null | undefined;
}): GenerationSourceResult {
  const { artifact, editable, approvedCandidates } = args;
  const candidates = approvedCandidates ?? [];
  const editableId = editable?.id ?? null;

  // R-24 — se DELEGA en el selector del generador; ningún criterio se re-implementa acá.
  const canonical =
    artifact === 'offer'
      ? (pickCanonicalOffer(
          candidates as (GenerationCandidateRow & CanonicalOfferRow)[]
        ) as GenerationCandidateRow | null)
      : (pickCanonicalContentRow(candidates) as GenerationCandidateRow | null);

  if (!canonical) {
    // R-21 — sin `approved` el generador NO recibe el artefacto (no hay fallback).
    return {
      state: 'none-approved',
      canonical: null,
      canonicalId: null,
      editableId
    };
  }
  return {
    // R-22 / R-23 — la comparación es por `id`, la única identidad estable de la fila.
    state: canonical.id === editableId ? 'aligned' : 'diverged',
    canonical,
    canonicalId: canonical.id,
    editableId
  };
}
