-- F-083 — Readiness: modo crear-vs-existe (R-01, R-02, R-15, R-17).
-- Repo: c3-studio · Supabase: uxczbwtfcsjsrmrikwoh
--
-- FRONTERA (F-074/CL-023): este archivo lo ESCRIBE el implementer; la APLICACIÓN
-- (MCP apply_migration) la corre el operador/Leader SÓLO tras APROBADO. NO aplicada aún.
--
-- Aditiva: crea un enum nuevo + 2 columnas. NO altera columnas existentes ni RLS
-- (las tablas aíslan por `client_id`, sin `tenant_id` propio). El default 'existing'
-- preserva el comportamiento de todo cliente preexistente (AGS/maintenance) sin
-- migración de datos (R-02). `verification_status` YA existe (columna muerta,
-- recon §2.6) → no requiere DDL aquí; se le da uso en código + captura (atestación).

-- R-01/R-02: eje explícito crear-vs-existe, por-location (home = gbp_profiles).
CREATE TYPE gbp_mode AS ENUM ('create', 'existing');

ALTER TABLE public.gbp_profiles
  ADD COLUMN gbp_mode gbp_mode NOT NULL DEFAULT 'existing';

-- R-15: snapshot auto-descriptivo del modo junto al veredicto histórico.
ALTER TABLE public.readiness_assessments
  ADD COLUMN snap_gbp_mode gbp_mode;

-- T-18 (LIVE, gated) — Fijar JD Valley a modo crear tras aplicar el DDL: lo corre
-- el operador/Leader. Se deja documentado (comentado) como paso explícito y gateado,
-- no como efecto colateral del ALTER. Descomentar al sembrar:
--
-- UPDATE public.gbp_profiles SET gbp_mode = 'create'
-- WHERE client_id = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c';
