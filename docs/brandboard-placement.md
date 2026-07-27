# Brandboard — emplazamiento declarado (y su traslado, ya EJECUTADO)

**Estado:** declaración vigente (F-117 R-28, Fase C del plan núcleo/downstream).
**Traslado:** **EJECUTADO en la Fase F por F-120** (R-23..R-29) —
_Visibilidad / UX del núcleo_ (`docs/c3-studio-core-downstream-plan.md`). F-117 declaró y
**no** movió nada (R-29); **F-120 es la Fase F** y lo movió.

---

## Declaración

El tab **Brandboard** era un **DOWNSTREAM alojado dentro de la pantalla del núcleo por
conveniencia de gating, no por pertenencia.**

La pantalla `src/app/(app)/onboarding/brief/[clientId]/page.tsx` es la del **núcleo**
`brief → buyer_persona → ofv` (CL-102). El Brandboard no es parte de ese núcleo: no lo
produce, no lo consume campo-a-campo y no participa de la cadena de aprobación
`brief → persona → OFV`. Estaba ahí porque **necesitaba el mismo gate** que la pantalla ya
calculaba (`ofvApproved`) y porque tenía a mano `clientId`, `tenantId` y `userId` del
scope de esa página. Era hospedaje, no pertenencia — y por eso salió.

---

## El gate que el traslado NO podía perder

**Origen (antes de F-120)** — `src/app/(app)/onboarding/brief/[clientId]/page.tsx`:

```
<TabsTrigger value='brandboard' disabled={!ofvApproved}>
<TabsContent value='brandboard' className='mt-4'>
  <BrandboardTab clientId tenantId userId />
```

⚠️ **`disabled={!ofvApproved}` DEBÍA preservarse en el destino.** El Brandboard sólo se
habilita con la OFV **aprobada**. Trasladar el tab exigía **recomputar el gate** en su
nuevo hogar. Éste era el riesgo concreto del traslado y la razón principal por la que se
difirió a una fase propia: hacerlo al final de una feature de cableado es exactamente
cómo se pierde un gate en silencio.

**Se preservó.** El `TabsTrigger value='brandboard' disabled={!ofvApproved}` vive ahora en
la ficha, y hay guards dedicados que lo exigen **en el destino** y exigen **cero
referencias al Brandboard en el origen** (`tests/clients/f120-brandboard-move.test.ts`,
`tests/onboarding/f117-declarations.test.ts` T-12 R-29 re-anclado ⤫ F-120).

## Lo que el destino tenía que proveer — y de dónde sale hoy

| Prop       | Antes salía de                        | En el destino (F-120)                   |
| ---------- | ------------------------------------- | --------------------------------------- |
| `clientId` | param de ruta de `page.tsx`           | `client.id` de la ficha                 |
| `tenantId` | scope de `page.tsx`                   | `useUser().tenantId` de la ficha        |
| `userId`   | `user.id` del scope de `page.tsx`     | `useUser().user.id` de la ficha         |
| **gate**   | `ofvApproved` calculado en `page.tsx` | **recomputado, no asumido** — ver abajo |

**SI `tenantId` o `userId` no se resuelven, el editor NO se monta y se declara** (R-28):
`brandboards` se escribe con `tenant_id`/`user_id`, y montarlo con identidad ausente
produce escrituras rotas o mal atribuidas.

---

## Destino (F-120)

| Qué            | Dónde                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Componente** | `src/components/brandboard/brandboard-tab.tsx` (**movido byte-idéntico**; convención `src/components/<dominio>/`)                                                                                      |
| **Superficie** | tab `brandboard` de la ficha del cliente, `src/app/(app)/clients/[id]/page.tsx`, inmediatamente **después de `gbp`** (preserva el orden `gbp` < `deliverable` < `readiness` de `f092-visibility` T-24) |
| **Origen**     | `src/app/(app)/onboarding/brief/[clientId]/page.tsx` — **cero referencias** a `brandboard` / `BrandboardTab`                                                                                           |

### Cómo se recomputó el gate

`ofvApproved` **se deriva de la lectura canónica de la OFV que F-120 ya trae a la ficha**,
no de una consulta propia:

```
const ofvApproved = ofvSource !== null && ofvSource.state !== 'none-approved';
```

donde `ofvSource` es el resultado de `resolveGenerationSource({ artifact: 'offer', … })`
(F-119), que delega en `pickCanonicalOffer` (F-109). **`pickCanonicalOffer` devuelve `null`
si y sólo si el conjunto de candidatos `status='approved'` está vacío** ⇒
`state !== 'none-approved'` es **exactamente equivalente** al `!!ofvData` que gobernaba el
gate en el origen: **ni relajación ni endurecimiento**. El gate se recomputó, como exigía
esta declaración, pero **desde un dato que la feature ya traía**: menos superficie donde
perderlo.

### Efecto colateral que el traslado cierra

`src/app/(app)/clients/[id]/client-asset-hub.tsx` ya le pedía al operador _"Aprueba el
Brandboard del cliente para desbloquear los assets de presencia digital"_ **sin darle
dónde** (ningún deep-link a `brandboard` existía en `src/`). Con el tab en la ficha, ese
bucle queda cerrado dentro de la misma pantalla. El traslado **no rompió ningún
deep-link** porque no había ninguno.

---

## Por qué se difirió (F-117 DT-6) — registro histórico

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

Lo que F-117 pagó fue **esta declaración**: convirtió un "pendiente recordado" en un
contrato escrito, para que la Fase F ejecutara **sin re-descubrir el gate**. Funcionó: la
Fase F no re-descubrió nada — leyó este documento y derivó el gate en vez de
re-implementarlo.
