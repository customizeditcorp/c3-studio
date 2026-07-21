-- F-081 — Idioma por-cliente en la generación de contenido (R-01/R-02).
-- Repo: c3-studio · Supabase: uxczbwtfcsjsrmrikwoh
--
-- FRONTERA (F-074/CL-023): este archivo lo ESCRIBE el implementer; la APLICACIÓN
-- (MCP apply_migration) la corre el operador/Leader tras APROBADO. NO aplicada aún.
--
-- Aditiva, con default → todas las filas existentes quedan 'es' (comportamiento
-- actual preservado, R-03). CHECK acotado y reversible (DT-04; no crea un type nuevo).

-- R-01/R-02: columna nueva, default 'es', restringida a {es,en}.
ALTER TABLE public.clients
  ADD COLUMN content_language text NOT NULL DEFAULT 'es'
  CHECK (content_language IN ('es', 'en'));

-- R-08 — Seed JD Valley Painting a 'en' (T-12): lo aplica el operador/Leader.
-- Se deja documentado aquí (comentado) para que el seed sea un paso explícito y
-- gateado, no un efecto colateral del ALTER (DT-02). Descomentar al sembrar:
--
-- UPDATE public.clients SET content_language = 'en'
-- WHERE id = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c';
