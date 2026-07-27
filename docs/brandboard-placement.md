# Brandboard — emplazamiento declarado (y su traslado diferido)

**Estado:** declaración vigente (F-117 R-28, Fase C del plan núcleo/downstream).
**Traslado:** **DIFERIDO a la Fase F** — _Visibilidad / UX del núcleo_
(`docs/c3-studio-core-downstream-plan.md`). F-117 **no** mueve nada (R-29).

---

## Declaración

El tab **Brandboard** es un **DOWNSTREAM alojado dentro de la pantalla del núcleo por
conveniencia de gating, no por pertenencia.**

La pantalla `src/app/(app)/onboarding/brief/[clientId]/page.tsx` es la del **núcleo**
`brief → buyer_persona → ofv` (CL-102). El Brandboard no es parte de ese núcleo: no lo
produce, no lo consume campo-a-campo y no participa de la cadena de aprobación
`brief → persona → OFV`. Está ahí porque **necesita el mismo gate** que la pantalla ya
calculaba (`ofvApproved`) y porque tenía a mano `clientId`, `tenantId` y `userId` del
scope de esa página. Es hospedaje, no pertenencia.

---

## El gate que el traslado NO puede perder

```
page.tsx:1037   <TabsTrigger value='brandboard' disabled={!ofvApproved}>
page.tsx:2132   <TabsContent value='brandboard' className='mt-4'>
                  <BrandboardTab clientId tenantId userId />
```

⚠️ **`disabled={!ofvApproved}` DEBE preservarse en el destino.** El Brandboard sólo se
habilita con la OFV **aprobada**; hoy ese booleano se calcula en el scope de `page.tsx`.
Trasladar el tab exige **recomputar el gate** en su nuevo hogar. Éste es el riesgo
concreto del traslado y la razón principal por la que se difiere a una fase propia:
hacerlo al final de una feature de cableado es exactamente cómo se pierde un gate en
silencio.

## Lo que el destino tendrá que proveer

| Prop       | Hoy sale de                           | Nota                      |
| ---------- | ------------------------------------- | ------------------------- |
| `clientId` | param de ruta de `page.tsx`           | trivial de reponer        |
| `tenantId` | scope de `page.tsx`                   | resolver en el destino    |
| `userId`   | `user.id` del scope de `page.tsx`     | resolver en el destino    |
| **gate**   | `ofvApproved` calculado en `page.tsx` | **recomputar, no asumir** |

Archivos involucrados: `src/app/(app)/onboarding/brief/[clientId]/page.tsx` (`:1037`,
`:2132`) y `src/app/(app)/onboarding/brief/[clientId]/brandboard-tab.tsx`.

---

## Por qué se difiere (F-117 DT-6)

1. **Naturaleza.** La Fase A reencuadró la Fase C como trabajo de **contrato y
   cableado, no de producto** (CL-104). Mover un tab es puro producto/UX.
2. **Modalidad de verificación** (`docs/verification.md` §6). Los demás ítems de F-117
   se verifican con claims de **contexto de prompt** (API, `save:false`); mover el tab
   es una claim de **rendering/interacción** ⇒ exige browser/end-to-end. Mezclar las dos
   modalidades bajo un mismo gate deja que un fallo de UI contamine la lectura de una
   §6.1 de contrato, y viceversa.
3. **Visibilidad.** Es el único ítem que cambia lo que el operador ve todos los días.
   Un cambio visible merece su propio gate y su propio anuncio.
4. **Hay un hogar exacto:** la **Fase F**, que depende de la Fase B (ya cerrada).

Lo que F-117 sí paga es **esta declaración**: convierte un "pendiente recordado" en un
contrato escrito, para que la Fase F ejecute sin re-descubrir el gate.
