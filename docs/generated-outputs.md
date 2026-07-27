# `generated_outputs` — qué es, y qué NO es

**Estado:** declaración vigente (F-117 R-30, Fase C del plan núcleo/downstream).
**Feature que lo declara:** F-117 · **Decisión de arquitectura de referencia:** CL-102.

---

## Declaración

`generated_outputs` es un **registro de auditoría/histórico de generación**: el
write-path deja constancia de qué se generó, para qué cliente y con qué OFV asociada.
**No tiene consumidor de lectura en el producto y no se planea uno.**

Los artefactos con superficie viva tienen su propio home canónico —`briefs`,
`buyer_personas`, `offers`, `gbp_profiles`— y `gbp_description` está **excluido** de
este registro desde F-089, porque su home es `gbp_profiles`.

**Esto no es una omisión pendiente de corregir: es la naturaleza de la tabla.** Quien
venga a "arreglar que nadie la lea" está por construir algo que nadie pidió.

---

## El hecho verificado que sostiene la declaración

`SELECT` read-only, agrupado por `output_type` (2026-07-26):

| `output_type`     | filas | última         |
| ----------------- | ----- | -------------- |
| `gbp_description` | **3** | **2026-07-21** |

Una sola fila de resultado. Es decir:

1. **De los 8 steps que escriben ahí, 7 nunca escribieron.** La tabla está
   esencialmente vacía.
2. **El único tipo con filas es justo el que el write-path EXCLUYE.**
   `shouldPersistGeneratedOutput` (`src/lib/gbp-slice/content-status.ts:61-64`) deja
   fuera `gbp_description` desde **F-089** ⇒ las 3 filas son **anteriores** a ese
   cambio. Ninguna se escribió después.
3. **Ninguna superficie las lee.** El único read que existía fue **eliminado en F-089
   R-07** (`src/app/preview/[token]/page.tsx:53`). Hoy no hay endpoint, ni UI, ni
   consulta que las consuma.

---

## Qué NO hace esta declaración (F-117 R-32)

- **No construye un lector**, ni endpoint, ni UI, ni consulta nueva sobre la tabla.
- **No borra filas ni hace DDL.** Las 3 filas históricas se quedan donde están: son
  precisamente el histórico que la tabla existe para conservar.
- **No revierte la exclusión de F-089.** `gbp_description` sigue fuera del registro.

## Dónde vive la contraparte de esta declaración

En el **write-path**, para que un cambio de código no derive de este documento en
silencio: comentario en el bloque `.from('generated_outputs').insert(...)` de
`src/app/api/generate-content/route.ts`.

Un test (`tests/onboarding/f117-declarations.test.ts`, F-117 R-30/R-31) cruza **los dos
archivos de disco** y exige que ambos declaren lo mismo —registro de auditoría/histórico
**sin consumidor de lectura**— y que **ninguno** afirme que existe un lector. Si la
declaración quedara en uno solo de los dos lugares, o si alguno empezara a hablar de un
lector, la suite se pone roja.
