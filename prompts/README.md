# `prompts/` — Fuente versionada de los prompts del método (F-101, Fase 0)

Esta carpeta es la **fuente autoritativa en git** de los prompts del método C3 que viven
en la tabla `prompt_versions` de Supabase. Antes de F-101 los prompts vivían **solo en la
DB** → no eran auditables ni versionables (causa raíz #1 del recon, `docs/c3-studio-buyer-ofv-flow-recon.md` §C2).

> **Scope A (F-101):** git = fuente + un script seed/sync idempotente. **El runtime NO
> cambia:** `generate-content` y `generate-gbp` SIGUEN leyendo `prompt_versions` desde la
> DB. Esta fase **no cambia el comportamiento de generación**, solo recupera la fuente.
> La prueba de fidelidad es que el **primer `apply` sea un no-op** (byte-a-byte).

## Formato (DT-01)

Una carpeta por step: `prompts/<step>/` con **dos** archivos:

| Archivo | Contenido |
|---|---|
| `system_prompt.md` | El `system_prompt` **VERBATIM** (texto tal cual, sin escapar, sin trailing-newline añadido). Es el ancla de la fidelidad byte-a-byte y del diff legible. |
| `meta.json` | `{ step, methodology, vertical, validation_rules, version, tenant }` — JSON con indent de 2 espacios y un único `\n` final. `validation_rules` es el jsonb exacto. |

**Campos versionados (DT-04):** `step`, `system_prompt`, `methodology`, `vertical`,
`validation_rules`, `version`. Los artefactos de fila `id` y `created_at` **NO** se
versionan (los preserva el sync). `active` es implícito `true` (git = el conjunto activo).

Los **11 steps**: `brief`, `buyer_persona`, `ofv`, `gbp_description`, `gbp_posts`,
`campaign_copy`, `nurturing`, `social_content`, `website_home`, `website_service`,
`website_location`.

## Tenant (DT-02) — nunca una UUID en git

`meta.json` guarda una **referencia** de tenant (p.ej. `"tenant": "__primary__"`), **no**
la UUID literal (principio whitelabel #4). La UUID concreta se resuelve por la variable de
entorno **`PROMPT_SYNC_TENANT_ID`** al sincronizar. El sync **preserva el tenant**: nunca
escribe filas globales (`tenant_id=null`), porque eso alteraría la resolución del runtime
(el prompt tenant-scoped gana sobre el global).

## Cómo correr el sync

```sh
# Variables requeridas (se leen, no se suponen — R-08):
#   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PROMPT_SYNC_TENANT_ID
# (típicamente en .env.local; el service-role key es un SECRETO y NO va a git)

# export — lee las 11 filas activas del tenant → escribe prompts/<step>/*  (READ-ONLY sobre la DB)
node --env-file=.env.local scripts/sync-prompts.mjs export

# check  — parsea git + lee la DB → reporta diffs por step; exit≠0 si hay diffs (NO escribe)
node --env-file=.env.local scripts/sync-prompts.mjs check

# apply  — upsert git→DB (idempotente, update-in-place por (step,tenant_id))
node --env-file=.env.local scripts/sync-prompts.mjs apply
```

O vía npm: `npm run prompts:export` · `npm run prompts:check` · `npm run prompts:apply`.

### `apply` es una acción de FRONTERA (F-074 / CL-023)

`apply` **escribe `prompt_versions` en prod**. Es un **tramo LIVE gateado**: lo corre el
operador/Leader tras `APROBADO`, **no** el implementer. El flujo seguro es:

1. `export` (puebla los archivos leyendo prod — read-only sobre la DB).
2. `check` **antes** de cualquier write → debe reportar **0 diffs** (prueba de fidelidad/no-op).
3. `apply` (1er run = **no-op** si el export fue fiel). Post-check: siguen 11 filas, todas
   `active=true`, `version` sin bump, mismo `tenant_id`, sin filas nuevas/duplicadas.

Si `check` reporta diffs **antes** del primer `apply`, el export no fue fiel → **re-exportar**
(NO "arreglar" el prompt aquí; corregir el contenido de un prompt es F2/F3, no Fase 0).

## Garantías (núcleo puro `scripts/lib/prompt-sync-core.mjs`)

- **Fidelidad byte-a-byte (R-02):** `parsePromptFile(serializePrompt(row))` deep-equals `row`
  y `serializePrompt(parsePromptFile(files))` reproduce los archivos byte a byte.
- **Idempotencia (R-05/R-06):** el upsert es read-modify-write por `(step, tenant_id)`,
  **update-in-place** por `id`, **sin version-bump** (el historial de versiones vive en git),
  **sin desactivar** filas. Fila idéntica ⇒ 0 cambios.
- **No-secretos (R-03):** el `export` escanea el contenido y aborta si detecta un secreto.
- **Sin DDL (R-12):** F-101 no altera el schema de `prompt_versions`.
