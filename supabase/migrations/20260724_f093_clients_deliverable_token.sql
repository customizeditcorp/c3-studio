-- F-093 — Página client-facing del entregable: columna `deliverable_token` en `clients`
-- (R-01, R-18, R-19). Repo: c3-studio · Supabase: uxczbwtfcsjsrmrikwoh
--
-- FRONTERA (F-074/CL-023): este archivo lo ESCRIBE el implementer; la APLICACIÓN
-- (MCP apply_migration) la corre el operador/Leader SÓLO tras APROBADO. NO aplicada aún
-- (tarea LIVE T-11 gateada). El apply del DDL PRECEDE al deploy: las lecturas del cliente
-- usan `select('*')` (seguras si la columna falta), pero la GENERACIÓN/COPIA del link
-- requiere la columna presente (control de la pestaña Entregable).
--
-- Aditiva: 1 columna `text` que almacena un identificador INADIVINABLE (uuid) para la URL
-- pública del entregable `${origin}/deliverable/${token}`. Se genera LAZY al primer click
-- del operador (no auto al `delivered`, DT-01); un cliente sin link tiene el token en NULL.
--
-- NULLABLE, SIN DEFAULT, SIN BACKFILL (precedente F-091 CRÍTICO / CL-071): una columna
-- `NOT NULL` sin default rompe los writers existentes de `clients` (ClientForm inserta filas
-- nuevas sin el token). Un default `gen_random_uuid()` BACKFILLEARÍA un token vivo a TODOS
-- los clientes (incluidos los NO entregados) → links vivos sin entrega. `deliverable_token`
-- DEBE ser nullable, sin default, sin backfill (R-01). NO GENERATED (no aplica el trap
-- F-080/CL-061). NO altera columnas existentes ni RLS (clients aísla por `tenant_id`).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS deliverable_token text; -- uuid del link público (lazy, R-01)
