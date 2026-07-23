-- F-084 — Cleanup del derrame del draft de JD Valley (Bloque E · R-11..R-14).
-- Repo: c3-studio · Supabase: uxczbwtfcsjsrmrikwoh
--
-- FRONTERA (F-074/CL-023): este archivo lo ESCRIBE el implementer; la APLICACIÓN
-- (MCP apply_migration / execute_sql) la corre el operador/Leader tras APROBADO.
-- NO aplicado aún. Cierre autoritativo = LIVE (T-18, §6.1): tras aplicar, el
-- operador/Leader consulta la fila y confirma los 4 campos limpios.
--
-- Fila objetivo:
--   gbp_profiles.id = 14edf66f-f9c4-4178-99b6-03d79c540dcf
--   client_id       = 1d3b28b1-dce2-4e48-b8ac-a5561b202a6c  (JD Valley Painting)
--
-- Bugs de dato (recon §2.3/§2.4, confirmados por SELECT read-only 2026-07-22):
--   • description       = blob ```json crudo — Y ADEMÁS TRUNCADO a mitad del JSON
--                         (corta dentro de suggested_services). El campo .description
--                         del blob está ÍNTEGRO; el truncado ocurre después.
--   • short_description = español stale (pre-F-081), aunque el blob contiene un
--                         short_description en INGLÉS íntegro.
--   • address           = '380 DANIA AVE BUELLTON, CA 9342' (zip truncado, typo).
--   • clients.city/state = NULL.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- (1) R-11 — description: recuperación DETERMINISTA del blob, SIN LLM.
-- ─────────────────────────────────────────────────────────────────────────────
-- Un JSON.parse completo del blob FALLARÍA (JSON truncado). Por eso NO se usa una
-- expresión de parse in-DB: se fija inline el valor EXACTO del campo .description
-- leído del blob por SELECT read-only (2026-07-22). Es determinista (copia literal
-- del propio dato guardado, aplicando "strip fences + tomar .description"). El WHERE
-- `description LIKE '```%'` lo hace idempotente: solo reescribe si sigue siendo blob.

UPDATE public.gbp_profiles
SET description = 'JD Valley Painting offers expert painting services in CA, prioritizing quality craftsmanship and customer satisfaction. Our main services include interior painting, exterior painting, commercial painting, residential painting, and color consulting. Choose us for our attention to detail, reliability, and professional service. Contact us today to refresh your space with vibrant colors.',
    updated_at = now()
WHERE client_id = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c'
  AND id = '14edf66f-f9c4-4178-99b6-03d79c540dcf'
  AND description LIKE '```%';

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) R-12/R-13 — short_description (inglés) + address (zip corregido).
-- ─────────────────────────────────────────────────────────────────────────────
-- GATEADO: el operador CONFIRMA los valores y DESCOMENTA este UPDATE antes de
-- aplicarlo (los placeholders <<...>> NO son valores válidos: nunca aplicar tal cual).
--
--   • short_description — candidato DETERMINISTA (extraído del MISMO blob, inglés,
--     íntegro; coherente con clients.content_language='en', R-12):
--         'JD Valley Painting provides expert interior and exterior painting services across CA, ensuring top-quality results every time.'
--     El operador confirma/ajusta el wording en inglés.
--   • address/zip — actual '380 DANIA AVE BUELLTON, CA 9342' (zip truncado). Buellton,
--     CA ⇒ ZIP candidato 93427. El operador confirma el ZIP US de 5 dígitos correcto.
--
-- UPDATE public.gbp_profiles
-- SET short_description = '<<SHORT_DESCRIPTION_EN — operador confirma; candidato arriba>>',
--     address           = '380 DANIA AVE, BUELLTON, CA <<ZIP_CORRECTO — ej. 93427>>',
--     updated_at        = now()
-- WHERE client_id = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c'
--   AND id = '14edf66f-f9c4-4178-99b6-03d79c540dcf';

-- ─────────────────────────────────────────────────────────────────────────────
-- (3) R-14 — clients.city/state: NULL → valores confirmados (derivados del address).
-- ─────────────────────────────────────────────────────────────────────────────
-- GATEADO: candidatos deterministas del address 'BUELLTON, CA' ⇒ city='Buellton',
-- state='CA'. El operador confirma y DESCOMENTA antes de aplicar.
--
-- UPDATE public.clients
-- SET city  = '<<CITY — ej. Buellton>>',
--     state = '<<STATE — ej. CA>>'
-- WHERE id = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c';

-- ─────────────────────────────────────────────────────────────────────────────
-- (4) T-18 — Verificación LIVE post-apply (la corre el operador/Leader):
-- ─────────────────────────────────────────────────────────────────────────────
--   SELECT description, short_description, address
--     FROM public.gbp_profiles WHERE client_id = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c';
--   SELECT city, state, content_language
--     FROM public.clients WHERE id = '1d3b28b1-dce2-4e48-b8ac-a5561b202a6c';
-- Esperado: description = texto (NO empieza con '```'); short_description = inglés
-- coherente con content_language='en'; address con zip US de 5 dígitos; city/state NOT NULL.
