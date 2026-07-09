# F-066 — Slice vertical OFV→GBP→preview (product-side)

Primer downstream del spine c3-studio: lleva un cliente con **OFV aprobada** + **brandboard aprobado** hasta un **asset GBP** con **preview de aprobación**. Especificado en aeos-factory (`specs/F-066/`), ejecutado acá.

## Qué entrega

- `src/lib/gbp-slice/` — building blocks puros (testeables sin DB/OpenAI):
  - `precondition.ts` — guard R-01/R-02/R-11 (OFV approved **no vacía** + brandboard approved).
  - `context.ts` — lector OFV+brandboard+media con degradación (logo R-05, media R-06).
  - `operational-state.ts` — modelo mínimo read-only de estado operativo GBP (R-07/R-08/R-09).
  - `prompt.ts` — ensamblado de prompt anclado en OFV + tono de brandboard (R-03/R-04/R-10).
  - `profile.ts` — parseo, mapeo a `gbp_profiles` con fallo explícito antes de escribir (R-10/R-11), snapshot de preview (R-12), transición por decisión (R-13), guardrail de scope (R-14).
- `src/app/api/generate-gbp/route.ts` — orquesta la cadena (auth+tenant, guard, contexto, grounding F-065, OpenAI, insert `gbp_profiles`, preview `type='gbp'`, `client_assets(gbp)` → `review`).
- `src/app/api/preview-approve/route.ts` — R-13: al aprobar GBP, `client_assets(gbp)` → `approved`.
- `src/app/api/preview-feedback/route.ts` — R-13: al pedir cambios, `client_assets(gbp)` → `review`.
- `src/app/preview/[token]/preview-public-view.tsx` — fix de drift (`preview_type` → `type`).
- `tests/gbp-slice/*.test.ts` — 33 tests (`node --test`), fixtures del piloto real JD Valley.

## Deuda técnica declarada (design.md §9)

- **DT-F066-01:** capa 4 sin tabla física; `operational-state.ts` lee un modelo lógico y degrada a `pendiente`. Normalizar `credentials`/booleans operativos de `client_plans` a una capa `operational_state` por sistema es rework futuro.
- **DT-F066-02:** drift de tipos `src/types/c3-domain.ts` ↔ schema vivo. El slice se apoya solo en columnas verificadas del schema vivo (ver `docs/references/supabase-schema-c3-studio.md` en aeos-factory), no en los tipos drifteados.
- **DT-F066-03:** `previews` no tiene FK a `gbp_profiles`; el vínculo preview↔asset se resuelve por `client_id` + `type='gbp'` + snapshot en `data`.

## Hallazgos de drift encontrados durante F-066 (fuera de scope estricto; corregidos los que bloqueaban el slice)

- **`previews.type` vs `preview_type`:** la columna viva es `type` (enum `preview_type`). `preview-public-view.tsx` leía `preview.preview_type` (undefined) y ocultaba el mockup GBP → **corregido** (parte de la superficie R-12).
- **`previews.feedback_at` inexistente:** `preview-feedback` escribía `feedback_at`, columna que no existe → el update fallaba (422) y rompía el path de rechazo de R-13 → **corregido** (persiste solo `feedback`).
- **`preview/generator/page.tsx` (operator tool, fuera del path del slice):** inserta `preview_type` (columna inexistente) y omite `data` (NOT NULL) → **NO corregido** (fuera de alcance; el slice crea previews server-side vía `generate-gbp`). Documentado para feature futura.

## Estado de ejecución

Rama local `feat/f066-gbp-slice`, commits locales. **Sin push/merge/deploy/publish** (límites CL-023). El end-to-end se ejerció contra el piloto JD Valley (`1d3b28b1-…`) escribiendo filas reales (`gbp_profiles`/`previews`/`client_assets`) en el Supabase de c3-studio; **no** se publicó nada a sistemas externos (R-14).
