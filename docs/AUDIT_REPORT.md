# C3 Studio — Auditoría de código (diagnóstico)

**Fecha:** 2026-03-27  
**Alcance:** Código en `src/` + middleware raíz.  
**Suposición de esquema:** Se utiliza el esquema indicado en el brief de auditoría (tablas con/sin `tenant_id`). Si la base real en Supabase difiere, algunos ítems deben revalidarse contra migraciones reales.

**Nota:** Este documento solo diagnostica; no incluye correcciones aplicadas.

---

## 1. Autenticación y contexto

### BUG 1: Fallback de `tenant_id` al “primer tenant” de la BD
- **Archivo:** `src/contexts/UserContext.tsx` (aprox. L52–L68)
- **Severidad:** CRÍTICO
- **Descripción:** Si no existe fila en `users` para el usuario autenticado, el contexto asigna `tenant_id` del **primer** registro en `tenants` (`limit(1)`), sin vínculo con el usuario real.
- **Impacto:** Usuario puede operar “como” otro tenant; datos y RLS pueden comportarse de forma impredecible o mezclar contexto multi-tenant.
- **Fix sugerido:** No inventar perfil; exigir fila en `users` (o flujo de onboarding) y mostrar bloqueo hasta tener `tenant_id` válido.

### BUG 2: `profileMissing` no expone estado en la UI del proveedor
- **Archivo:** `src/contexts/UserContext.tsx`
- **Severidad:** MEDIO
- **Descripción:** `profileMissing` se expone en el contexto pero muchas páginas solo miran `tenantId`; si falla el fallback de BUG 1, `tenantId` queda `null` sin guiar al usuario.
- **Impacto:** Pantallas colgadas o listas sin filtro coherente (p. ej. onboarding brief).
- **Fix sugerido:** Página global o banner cuando `profileMissing` y redirección a completar perfil.

### BUG 3: Posible condición de carrera entre `getUser` y `onAuthStateChange`
- **Archivo:** `src/contexts/UserContext.tsx` (aprox. L77–L96)
- **Severidad:** BAJO
- **Descripción:** Ambos flujos llaman `fetchProfile`/`setLoading` sin serializar; en transiciones de sesión podría aplicarse un perfil obsoleto por un tick.
- **Impacto:** Parpadeo de `tenantId` o datos inconsistentes al login/logout rápido.
- **Fix sugerido:** Cancelación con `AbortController` o flag de versión de sesión al actualizar estado.

### BUG 4: Supabase browser client sin configuración explícita más allá de URL/anon
- **Archivo:** `src/lib/supabase/client.ts`
- **Severidad:** BAJO
- **Descripción:** Uso estándar de `createBrowserClient`; asume que cookies/SSR están alineadas con `middleware`.
- **Impacto:** Normalmente OK; problemas suelen ser de RLS o dominio, no del archivo en sí.
- **Fix sugerido:** N/A salvo incidencias; documentar flujo cookie en un solo sitio.

### BUG 5: Middleware y rutas públicas
- **Archivo:** `src/lib/supabase/middleware.ts` (aprox. L39–L48), `middleware.ts`
- **Severidad:** MEDIO
- **Descripción:** Rutas públicas: `/login`, `/signup`, `/auth/callback`, y prefijo `/preview/`. El login real de la app está en `/login` (`src/app/login/page.tsx`), coherente con el redirect.
- **Impacto:** Cualquier página pública nueva debe añadirse explícitamente; si no, redirect a `/login`.
- **Fix sugerido:** Centralizar lista `publicPaths` y comentar que `/preview/[token]` depende de RLS para lectura anónima.

---

## 2. API routes

### BUG 6: `generate-content` puede responder 200 con `success` aunque el insert falle
- **Archivo:** `src/app/api/generate-content/route.ts` (aprox. L200–L239)
- **Severidad:** ALTO
- **Descripción:** Tras error en `insert`, solo se hace `console.error`; la respuesta sigue con `success: true` y `saved` puede ser `null`.
- **Impacto:** UI y logs muestran éxito aunque no haya fila nueva; el usuario cree que el brief se guardó.
- **Fix sugerido:** Si `save === true` y el insert falla, devolver 4xx/5xx o `success: false` con detalle.

### BUG 7: Inserción en `activity_log` sin campos esperados para modelo multi-tenant
- **Archivo:** `src/app/api/generate-content/route.ts` (aprox. L222–L229)
- **Severidad:** ALTO (si la tabla exige `tenant_id` / `user_id`)
- **Descripción:** El insert solo incluye `client_id`, `action`, `entity_type`, `entity_id`, `metadata`. No incluye `tenant_id` ni `user_id` (a diferencia de `src/lib/activity.ts`).
- **Impacto:** Fallo silencioso o filas incompletas; actividad no asociada al tenant.
- **Fix sugerido:** Alinear con `logActivity` o esquema real (mismos columnas obligatorias).

### BUG 8: Mismo problema de `activity_log` en `generate-alt-text`
- **Archivo:** `src/app/api/generate-alt-text/route.ts` (aprox. L72)
- **Severidad:** ALTO (mismas condiciones que BUG 7)
- **Descripción:** Insert mínimo sin `tenant_id`/`user_id`.
- **Impacto:** Igual que BUG 7.
- **Fix sugerido:** Reutilizar helper compartido o extender el payload.

### BUG 9: Acceso a `claudeResponse.content[0]` sin comprobar longitud
- **Archivo:** `src/app/api/generate-alt-text/route.ts` (aprox. L69)
- **Severidad:** MEDIO
- **Descripción:** Si la respuesta no tiene bloque de texto, `content[0]` puede ser `undefined`.
- **Impacto:** 500 poco controlado en edge cases de API Anthropic.
- **Fix sugerido:** Comprobar `content.length` y tipos igual que en `generate-content`.

### BUG 10: Modelo Anthropic `claude-sonnet-4-6`
- **Archivo:** `src/app/api/generate-content/route.ts` L130; `src/app/api/generate-alt-text/route.ts` L52
- **Severidad:** MEDIO
- **Descripción:** Identificador de modelo puede no coincidir con el nombre oficial en la API en el momento del despliegue.
- **Impacto:** Errores 400 de Anthropic en producción.
- **Fix sugerido:** Validar contra documentación actual y variables de entorno para el id del modelo.

### BUG 11: `prompt_versions` sin filtro por tenant (si los prompts son multi-tenant)
- **Archivo:** `src/app/api/generate-content/route.ts` (aprox. L38–L46)
- **Severidad:** MEDIO
- **Descripción:** Se selecciona prompt activo solo por `step` y `active`, sin `tenant_id` ni org.
- **Impacto:** Si la tabla mezcla prompts por tenant, se podría usar el prompt incorrecto.
- **Fix sugerido:** Si el diseño es global, documentarlo; si no, filtrar por tenant.

### BUG 12: No hay uso de `SUPABASE_SERVICE_ROLE_KEY` en el repo
- **Archivo:** (búsqueda global en `src`)
- **Severidad:** INFORMATIVO / MEDIO
- **Descripción:** Ninguna API route usa service role; todo va con anon + cookies.
- **Impacto:** Depende totalmente de RLS. Políticas mal configuradas → fallos o fugas; no hay bypass servidor explícito.
- **Fix sugerido:** Revisar políticas RLS en Supabase; usar service role solo en rutas server acotadas si hace falta leer prompts sin usuario.

### BUG 13: Verificación débil de pertenencia cliente–usuario
- **Archivo:** `src/app/api/generate-content/route.ts` (aprox. L56–L64)
- **Descripción:** Se carga el cliente por `id` solamente; la contención por tenant depende de RLS.
- **Impacto:** Correcto si RLS es estricta; si no, riesgo de IDOR.
- **Fix sugerido:** Añadir comprobación explícita `client.tenant_id === profile.tenant` o política equivalente.

---

## 3. Helpers y tipos

### BUG 14: `generateContent` / `generateAltText` — coherencia con API
- **Archivo:** `src/lib/edge-functions.ts`
- **Severidad:** BAJO
- **Descripción:** Apunta a `/api/generate-content` y `/api/generate-alt-text` con `credentials: 'include'` (correcto para cookies).
- **Impacto:** Ninguno conocido en este archivo.
- **Fix sugerido:** Definir tipo `GenerateContentResponse` compartido para evitar casts en páginas.

### BUG 15: No existe tipo compartido para respuesta de generación
- **Archivo:** `src/types/index.ts` (solo navegación/footer)
- **Severidad:** BAJO
- **Descripción:** No hay `GenerateContentResponse` u homólogo; las páginas castean `as unknown as { ... }`.
- **Impacto:** Desalineación UI/API y errores en tiempo de ejecución difíciles de detectar.
- **Fix sugerido:** Añadir interfaces en `src/types/` y usarlas en `edge-functions` y consumidores.

### BUG 16: Aserciones `as unknown as { ... }` en generación de contenido
- **Archivo:** `src/app/(app)/onboarding/brief/[clientId]/page.tsx` (aprox. L167, L262, L355); `src/app/(app)/gbp/[clientId]/page.tsx` (aprox. L261, L286)
- **Severidad:** MEDIO
- **Descripción:** La API devuelve `content` como `Record<string, unknown>`, no como `string`; la UI asume forma distinta (p. ej. `result.content` string).
- **Impacto:** Brief/Persona/OFV pueden mostrar `[object Object]` o fallar en ramas “fallback” si no hay refetch correcto.
- **Fix sugerido:** Tipar respuesta real y mapear `raw_text` / `content` de forma explícita.

### BUG 17: Aserciones en tier del diagnóstico / preview
- **Archivo:** `src/app/(app)/diagnostic/page.tsx` (aprox. L398–L399)
- **Severidad:** BAJO
- **Descripción:** `tierResult as { priceInstallment?: number }` compensa que el tipo de retorno de `calculateTier` no incluye `priceInstallment` / `priceDiscount` en todas las ramas (aunque `PRESENCIA_DIGITAL` sí los tiene).
- **Impacto:** Preview puede guardar `undefined` para cuotas/descuento en tiers mensuales (comportamiento quizá intencional).
- **Fix sugerido:** Unificar tipo de retorno de `calculateTier` con campos opcionales.

---

## 4. Inconsistencia `tenant_id` en consultas (según esquema declarado)

**Regla del brief:** Si la tabla **no** tiene `tenant_id` y el código hace `.eq('tenant_id', tenantId)`, PostgREST/Supabase puede devolver error o vacío según versión; en la práctica suele ser **error o cero filas** → comportamiento roto o silencioso.

### BUG 18: Detalle de cliente — checklist con `tenant_id` en tablas hijas
- **Archivo:** `src/app/(app)/clients/[id]/page.tsx` (aprox. L112–L120)
- **Severidad:** CRÍTICO (bajo esquema dado)
- **Descripción:** `diagnostics`, `credentials`, `nap_checks`, `briefs`, `buyer_personas`, `offers`, `gbp_profiles`, `client_photos`, `previews` se filtran con `.eq('tenant_id', tenantId)`.
- **Impacto:** Progreso de onboarding siempre en falso o queries erróneas; UX “nunca completado”.
- **Fix sugerido:** Filtrar solo por `client_id` (y/o join vía `clients.tenant_id`); alinear con columnas reales.

### BUG 19: Dashboard — conteo de diagnósticos del mes
- **Archivo:** `src/app/dashboard/overview/c3-dashboard.tsx` (aprox. L105–L109)
- **Severidad:** CRÍTICO (bajo esquema dado)
- **Descripción:** `diagnostics` filtrado por `tenant_id` que, según el brief, no existe en esa tabla.
- **Impacto:** Métrica incorrecta o siempre 0.
- **Fix sugerido:** Agregar por `client_id` in (clientes del tenant) o denormalizar `tenant_id` en `diagnostics` en BD.

### BUG 20: Dashboard — previews aprobados sin filtro por tenant
- **Archivo:** `src/app/dashboard/overview/c3-dashboard.tsx` (aprox. L130–L136)
- **Severidad:** ALTO
- **Descripción:** Query a `previews` por `approved` y fecha, **sin** `tenant_id`.
- **Impacto:** Posible fuga de información entre tenants si RLS no restringe por rol/tenant.
- **Fix sugerido:** Restringir via RLS o join con `clients.tenant_id`.

### BUG 21: GBP — lectura y escritura con `tenant_id`
- **Archivo:** `src/app/(app)/gbp/[clientId]/page.tsx` (aprox. L119–L147, L158–L182)
- **Severidad:** CRÍTICO (bajo esquema dado)
- **Descripción:** `gbp_profiles` y `gbp_posts` usan `tenant_id` en select/insert/update.
- **Impacto:** Formulario GBP vacío o no guarda.
- **Fix sugerido:** Eliminar columna inexistente o añadirla en migración.

### BUG 22: Fotos — `client_photos` con `tenant_id`
- **Archivo:** `src/app/(app)/photos/[clientId]/page.tsx` (múltiples líneas, p. ej. L79–L84, L120–L133, L194–L284)
- **Severidad:** CRÍTICO (bajo esquema dado)
- **Descripción:** Igual que arriba para `client_photos` y fila de insert.
- **Impacto:** Lista vacía, uploads que fallan o updates que no aplican.
- **Fix sugerido:** Alinear esquema y queries.

### BUG 23: Credenciales — `credentials` con `tenant_id`
- **Archivo:** `src/app/(app)/onboarding/credentials/[clientId]/page.tsx` (aprox. L112–L117)
- **Severidad:** CRÍTICO (bajo esquema dado)
- **Impacto:** Datos de credenciales nunca cargan.
- **Fix sugerido:** Filtrar por `client_id` únicamente o migración de esquema.

### BUG 24: NAP — `nap_checks` con `tenant_id`
- **Archivo:** `src/app/(app)/onboarding/nap/[clientId]/page.tsx` (aprox. L104–L109)
- **Severidad:** CRÍTICO (bajo esquema dado)
- **Impacto:** Igual.
- **Fix sugerido:** Igual.

### BUG 25: Brief/Persona/OFV — refetch con `tenant_id` en tablas sin columna
- **Archivo:** `src/app/(app)/onboarding/brief/[clientId]/page.tsx` (múltiples `.from('briefs')`, `buyer_personas`, `offers`)
- **Severidad:** CRÍTICO (bajo esquema dado)
- **Impacto:** Tras generar contenido, la UI no muestra el registro recién creado.
- **Fix sugerido:** Quitar filtro `tenant_id` de esas tablas o añadir columna en BD.

### BUG 26: Preview generator — `previews` con `tenant_id`
- **Archivo:** `src/app/(app)/preview/generator/page.tsx` (aprox. L64–L68, L87–L97)
- **Severidad:** CRÍTICO (bajo esquema dado) + **inconsistencia**
- **Descripción:** Usa `tenant_id` en select/insert. El flujo de **diagnóstico** inserta en `previews` **sin** `tenant_id` (`src/app/(app)/diagnostic/page.tsx` ~L408–L417).
- **Impacto:** Dos formas de fila preview; listados incompletos o inserts fallidos.
- **Fix sugerido:** Un solo contrato de fila (`tenant_id` opcional vs obligatorio) y migración.

---

## 5. Módulos y páginas

### BUG 27: Navegación a rutas que no tienen `page.tsx`
- **Archivo:** `src/config/nav-config.ts` (aprox. L40–L47, L58–L70)
- **Severidad:** CRÍTICO (UX)
- **Descripción:** URLs: `/onboarding/credentials`, `/onboarding/nap`, `/photos`, `/gbp` — en el árbol actual solo existen rutas con **`[clientId]`** (`credentials/[clientId]`, `nap/[clientId]`, `photos/[clientId]`, `gbp/[clientId]`). No hay índice en esas rutas “cortas”.
- **Impacto:** **404** desde el sidebar para flujos principales.
- **Fix sugerido:** Páginas índice que listen clientes o redirijan; o cambiar URLs del nav a una ruta válida.

### BUG 28: Lista onboarding brief sin `PageContainer` coherente y sin esperar carga de usuario
- **Archivo:** `src/app/(app)/onboarding/brief/page.tsx`
- **Severidad:** MEDIO
- **Descripción:** Si `tenantId` es `null` (p. ej. perfil no listo), la query **no** aplica `.eq('tenant_id', tenantId)` y devuelve todos los clientes permitidos por RLS.
- **Impacto:** Lista incorrecta o demasiado amplia momentáneamente.
- **Fix sugerido:** No ejecutar fetch hasta `tenantId` o `!userLoading`; mostrar skeleton.

### BUG 29: Clientes — fetch sin `tenantId`
- **Archivo:** `src/app/(app)/clients/page.tsx` (aprox. L87–L90)
- **Severidad:** MEDIO
- **Descripción:** Si `tenantId` falta, se lista sin filtro explícito (comentario asume RLS).
- **Impacto:** Depende de RLS; si es laxa, riesgo de listar demás.
- **Fix sugerido:** Bloquear UI sin tenant o confiar solo en RLS con políticas auditadas.

### BUG 30: Diagnóstico — wizard 4 pasos y `created_by`
- **Archivo:** `src/app/(app)/diagnostic/page.tsx` (aprox. L254–L341)
- **Severidad:** BAJO / OK con matices
- **Descripción:** Insert en `diagnostics` incluye `created_by: authUser.id`. Comentario en código admite tabla sin `tenant_id` (coherente con el brief). Tier usa presencia digital + revenue (lógica documentada en funciones).
- **Impacto:** Functional si RLS e insert permiten; **BUG 18** afecta vistas que sí filtran mal.
- **Fix sugerido:** Ninguno en wizard salvo alineación de métricas y checklist.

### BUG 31: Brief `[clientId]` — POST y estados
- **Archivo:** `src/app/(app)/onboarding/brief/[clientId]/page.tsx`
- **Severidad:** MEDIO (mejoras ya hechas en sesiones previas; validar en deploy)
- **Descripción:** `generateContent` vía `/api/generate-content`; guards con toast si falta sesión/tenant; loading en botones. Persistencia visible depende de que refetch Supabase funcione (véase BUG 25).
- **Impacto:** Si esquema y refetch fallan, usuario ve éxito de toast pero lista vacía.
- **Fix sugerido:** Corregir columnas en queries + manejo de respuesta API (BUG 6, BUG 25).

### BUG 32: `/dashboard/overview` layout paralelo ignorado
- **Archivo:** `src/app/dashboard/overview/layout.tsx`
- **Severidad:** BAJO
- **Descripción:** El layout solo renderiza `<C3Dashboard />` y **no** usa los slots `sales`, `pie_stats`, etc.
- **Impacto:** Rutas paralelas (@*) son código muerto/confuso; posible overhead de compilación.
- **Fix sugerido:** Eliminar slots no usados o integrarlos en C3Dashboard.

### BUG 33: Página pública preview — servidor con cliente anónimo
- **Archivo:** `src/app/preview/[token]/page.tsx`
- **Severidad:** CRÍTICO (si RLS no permite lectura sin auth)
- **Descripción:** `createClient()` usa cookies; visitante sin sesión = JWT anónimo. Todas las lecturas (`previews`, `gbp_profiles`, `client_photos`, `generated_outputs`, `offers`) deben estar permitidas por RLS para ese caso.
- **Impacto:** Preview siempre `notFound()` o datos vacíos para el cliente final.
- **Fix sugerido:** Políticas RLS “read by token” o Edge Function / route dedicada con service role y validación de token.

### BUG 34: `PreviewPublicView` — aprobar desde cliente sin sesión
- **Archivo:** `src/app/preview/[token]/preview-public-view.tsx` (aprox. L93–L99)
- **Severidad:** ALTO
- **Descripción:** `update` en `previews` desde `createBrowserClient()` como visitante anónimo suele **fallar** si RLS restringe updates a staff.
- **Impacto:** Botón “aprobar” no persiste.
- **Fix sugerido:** Route handler con validación de token o política RLS específica para `token` + campos limitados.

### BUG 35: `latestOffer.content` en preview — tipo JSON vs string
- **Archivo:** `src/app/preview/[token]/preview-public-view.tsx` (aprox. L84–L90)
- **Descripción:** `JSON.parse(latestOffer.content)` asume string; si Supabase devuelve objeto, `JSON.parse` falla.
- **Impacto:** OFV no mostrado en preview aunque exista.
- **Fix sugerido:** Normalizar `typeof content === 'string' ? JSON.parse(content) : content`.

---

## 6. Variables de entorno y secretos

### BUG 36: `ANTHROPIC_API_KEY` en rutas API
- **Archivo:** `src/app/api/generate-content/route.ts`, `generate-alt-text/route.ts`
- **Severidad:** INFORMATIVO
- **Descripción:** Uso correcto solo en servidor (`process.env.ANTHROPIC_API_KEY`). Instanciación con `!` ⇒ runtime error si falta.
- **Impacto:** 500 en generación si env no configurada en Vercel.
- **Fix sugerido:** Validación al inicio con mensaje claro.

### BUG 37: `NEXT_PUBLIC_SUPABASE_*` en cliente
- **Archivo:** `src/lib/supabase/client.ts`
- **Severidad:** INFORMATIVO
- **Descripción:** Esperado para Supabase; anon key es pública por diseño.
- **Impacto:** Ninguno si RLS es correcta.
- **Fix sugerido:** Nunca añadir service role en `NEXT_PUBLIC_*`.

### BUG 38: Búsqueda de secretos en `.tsx` cliente
- **Archivo:** (grep `process.env` en `*.tsx` bajo `src`)
- **Severidad:** OK
- **Descripción:** No se encontró `process.env` en archivos `.tsx` (solo uso vía módulo `client.ts` que referencia vars públicas en build).
- **Impacto:** Ninguno detectado.
- **Fix sugerido:** Mantener política.

---

## 7. Navegación y rutas (resumen)

| Ruta nav        | Estado inferido                                      |
|----------------|-------------------------------------------------------|
| `/dashboard/overview` | OK (layout C3)                                 |
| `/clients`     | OK                                                    |
| `/diagnostic`  | OK                                                    |
| `/onboarding/brief` | OK                                              |
| `/onboarding/credentials` | **Probable 404** (falta índice)            |
| `/onboarding/nap` | **Probable 404**                               |
| `/preview/generator` | OK                                               |
| `/photos`      | **Probable 404** (solo `/photos/[clientId]`)          |
| `/gbp`         | **Probable 404** (solo `/gbp/[clientId]`)             |
| `/dashboard/settings` | Existe; placeholder “coming soon”           |

Middleware: sin sesión y ruta no pública → redirect `/login` (coherente con `src/app/login/page.tsx`).

---

## Resumen ejecutivo

### Totales por severidad (aproximado)

| Severidad | Cantidad |
|-----------|----------|
| CRÍTICO   | 12 |
| ALTO      | 6 |
| MEDIO     | 11 |
| BAJO      | 6 |
| INFORMATIVO | 3 |

*Nota:* Varios ítems CRÍTICO dependen de que el esquema real coincida con el “brief” de tablas sin `tenant_id`. Si en producción esas tablas **sí** tienen `tenant_id`, esos bugs se degradan o desaparecen; conviene una verificación única contra `\d+ tabla` en Supabase.

### Top 3 más urgentes

1. **Alinear esquema y queries `tenant_id`** en tablas hijas (`clients/[id]`, onboarding brief, GBP, fotos, credenciales, NAP, dashboard diagnostics, previews) para recuperar datos reales y métricas correctas.
2. **Rutas del sidebar que devuelven 404** (`/photos`, `/gbp`, `/onboarding/credentials`, `/onboarding/nap`) sin `page.tsx` intermedio.
3. **Preview público + aprobación anónima:** RLS y/o API con token; hoy es frágil si las políticas no fueron diseñadas explícitamente para ello.

### Estimación de esfuerzo (equipo 1 developer familiarizado)

| Bloque | Días hábiles (orden de magnitud) |
|--------|-----------------------------------|
| Auditoría Supabase (RLS + columnas reales) + migraciones si hace falta | 1–2 |
| Corregir `tenant_id` y checklist + dashboard + módulos dependientes | 2–3 |
| Nav / páginas índice + UX clientId | 0.5–1 |
| API `generate-content` (errores de guardado, activity_log, tipos respuesta) | 1 |
| Preview público (lectura/escritura segura) | 1–2 |
| UserContext / multi-tenant hardening | 0.5–1 |

**Total orientativo:** **6–10 días hábiles** para cerrar el paquete con pruebas en staging y revision de RLS.

---

*Fin del informe — solo diagnóstico, sin cambios de código en este commit.*
