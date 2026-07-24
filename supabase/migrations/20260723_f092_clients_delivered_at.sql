-- F-092 — Entregable del cliente: columna `delivered_at` en `clients` (R-06, R-16).
-- Repo: c3-studio · Supabase: uxczbwtfcsjsrmrikwoh
--
-- FRONTERA (F-074/CL-023): este archivo lo ESCRIBE el implementer; la APLICACIÓN
-- (MCP apply_migration) la corre el operador/Leader SÓLO tras APROBADO. NO aplicada aún
-- (tarea LIVE T-27 gateada). El apply del DDL PRECEDE al deploy: las lecturas de la ficha
-- usan `select('*')` (seguras si la columna falta), pero la ESCRITURA de `delivered_at`
-- requiere la columna y está scopeada exclusivamente a la transición a `delivered`.
--
-- Aditiva: 1 columna `timestamptz` que registra CUÁNDO se entregó el cliente por primera
-- vez (semántica set-once, DT-02; ver `client-status.ts:persistClientStatus`).
--
-- NULLABLE, SIN DEFAULT, SIN BACKFILL (precedente F-091 CRÍTICO / CL-071): una columna
-- `NOT NULL` sin default rompe los writers existentes de `clients` (ClientForm inserta filas
-- nuevas sin delivered_at). `delivered_at` DEBE ser nullable — un cliente aún no entregado
-- tiene `delivered_at IS NULL` (la superficie degrada honestamente a "aún no entregado", R-09).
-- NO GENERATED (no aplica el trap F-080/CL-061). NO altera columnas existentes ni RLS
-- (clients aísla por `tenant_id`).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz; -- cuándo se entregó (set-once, R-06)
