-- F-089 — Aprobación de contenido GBP: columna `content_status` en `gbp_profiles` (R-02, R-10).
-- Repo: c3-studio · Supabase: uxczbwtfcsjsrmrikwoh
--
-- FRONTERA (F-074/CL-023): este archivo lo ESCRIBE el implementer; la APLICACIÓN
-- (MCP apply_migration) y el backfill los corre el operador/Leader SÓLO tras APROBADO.
-- NO aplicada aún (tarea LIVE T-26 gateada).
--
-- Aditiva: 1 columna que co-localiza la APROBACIÓN de contenido con el contenido mismo
-- (`gbp_profiles.description`, home canónico de F-084/F-087). Reutiliza el vocabulario del
-- enum de aplicación `RecordStatus` (draft|in_review|approved|rejected|published,
-- src/types/c3-domain.ts:17-22); se mantiene TEXT (no enum Postgres) por paridad con el
-- resto del esquema (briefs/personas/offers usan `status` text) y para no crear un tipo
-- Postgres nuevo. NO es GENERATED (no aplica el trap F-080/CL-061). NO altera columnas
-- existentes ni RLS (gbp_profiles aísla por `client_id`).
--
-- ORTOGONALIDAD (R-02): `content_status` es INDEPENDIENTE de `verification_status` (F-087).
-- Un GBP puede tener contenido aprobado sin estar verificado en Google, y viceversa.

ALTER TABLE public.gbp_profiles
  ADD COLUMN content_status text NOT NULL DEFAULT 'draft'; -- aprobación de contenido (R-02)

-- Backfill (R-10): las filas VIVAS (con descripción no-vacía) ya fueron mostradas en
-- previews aceptados (p.ej. JD Valley — F-084). Se marcan `approved` para que el nuevo
-- gating del preview (content_status='approved') NO las oculte (no-regresión de previews
-- ya aceptados). Las filas sin descripción quedan en el default 'draft'.
UPDATE public.gbp_profiles
  SET content_status = 'approved'
  WHERE description IS NOT NULL
    AND btrim(description) <> '';
