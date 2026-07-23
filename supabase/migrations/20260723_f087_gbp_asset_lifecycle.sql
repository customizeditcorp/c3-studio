-- F-087 — Activo GBP creado a mano + lifecycle de verificación (R-01, R-02, R-05, R-12).
-- Repo: c3-studio · Supabase: uxczbwtfcsjsrmrikwoh
--
-- FRONTERA (F-074/CL-023): este archivo lo ESCRIBE el implementer; la APLICACIÓN
-- (MCP apply_migration) la corre el operador/Leader SÓLO tras APROBADO. NO aplicada aún.
--
-- Aditiva: 3 columnas de identidad (metadata, NO secretos) + 1 fecha de verificación.
-- NO altera columnas existentes ni RLS (gbp_profiles aísla por `client_id`, sin
-- `tenant_id` propio). Ninguna columna nueva es GENERATED (no aplica el trap F-080/CL-061).
--
-- R-02 (dura): NINGUNA columna captura passwords/recovery/secretos. `operational_email`
-- es el Gmail operativo de REFERENCIA (metadata), no una credencial; los secretos viven
-- en Drive, fuera del producto.
--
-- Lifecycle (R-04): `verification_status` se mantiene TEXT (no se migra a enum) para no
-- tocar la columna ya poblada, preservar el contrato string de `mapVerificationStatus`
-- (readiness-repo.ts) y conservar la atestación de F-083 (escribe el string 'verified').
-- Los estados válidos (pending/created/verified/not_found) se controlan en la capa app
-- (constante VERIFICATION_STATUS_OPTIONS + <Select>), no por un tipo Postgres.

ALTER TABLE public.gbp_profiles
  ADD COLUMN operational_email text,   -- Gmail operativo de referencia (metadata, NO secreto)
  ADD COLUMN gbp_url           text,   -- enlace al listing Maps/g.co (distinto de website_url)
  ADD COLUMN place_id          text,   -- Google Place ID (opcional)
  ADD COLUMN verified_at       timestamptz; -- fecha de la transición created/verified (R-05)
