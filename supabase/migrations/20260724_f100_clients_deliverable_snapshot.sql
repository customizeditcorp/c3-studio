-- F-100 — Snapshot inmutable del entregable: columna `deliverable_snapshot` en `clients`
-- (R-01, R-13). Repo: c3-studio · Supabase: uxczbwtfcsjsrmrikwoh
--
-- FRONTERA (F-074/CL-023): este archivo lo ESCRIBE el implementer; la APLICACIÓN
-- (MCP apply_migration) la corre el operador/Leader SÓLO tras APROBADO. NO aplicada aún
-- (tarea LIVE T-13 gateada). El apply del DDL PRECEDE al deploy: el read de
-- `/deliverable/[token]` añade `deliverable_snapshot` a un `select` EXPLÍCITO (no `select('*')`)
-- → sólo seguro con la columna ya aplicada; el código deployado corre siempre contra el
-- schema ya aplicado.
--
-- Aditiva: 1 columna `jsonb` que almacena el ENVELOPE del snapshot inmutable del entregable
-- ({ version, captured_at, view }, DT-01). Se escribe SET-ONCE en la 1ª transición a
-- `delivered` (misma guarda `delivered_at NULL→now` de F-092); un cliente no entregado / legacy
-- tiene el snapshot en NULL → el read cae a live (R-09).
--
-- NULLABLE, SIN DEFAULT, SIN BACKFILL (precedente F-091 CRÍTICO / CL-071): una columna
-- `NOT NULL` sin default rompe los writers existentes de `clients` (ClientForm inserta filas
-- nuevas sin snapshot). `deliverable_snapshot IS NULL` = aún no entregado / legacy → read live
-- (R-09). NO GENERATED (no aplica el trap F-080/CL-061). NO altera columnas existentes ni RLS
-- (clients aísla por `tenant_id`).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS deliverable_snapshot jsonb; -- snapshot inmutable set-once (R-01)
