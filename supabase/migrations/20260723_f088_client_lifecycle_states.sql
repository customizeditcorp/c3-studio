-- F-088 — Estados del cliente + post-venta (Frente 2, Slice A) — R-02, R-04, R-17.
-- Repo: c3-studio · Supabase: uxczbwtfcsjsrmrikwoh
--
-- FRONTERA (F-074/CL-023): este archivo lo ESCRIBE el implementer; la APLICACIÓN
-- (MCP apply_migration) la corre el operador/Leader SÓLO tras APROBADO. NO aplicada aún.
--
-- Aditiva (R-02): agrega 2 valores al enum `client_status`. NO remueve ni renombra
-- ningún valor existente (R-04: la remoción de un enum value en Postgres es destructiva
-- y queda fuera del alcance de Slice A). NO toca filas: todo cliente preexistente
-- (lead/diagnosed/negotiating/onboarding/active/paused/churned) conserva su estado.
--
-- Nota Postgres: `ALTER TYPE ... ADD VALUE` no puede ejecutarse dentro de un bloque de
-- transacción junto al uso inmediato del valor; se aplican como statements sueltos.
-- `IF NOT EXISTS` hace el apply idempotente (safe re-run). Pre/post-check §6.1 los corre
-- el operador/Leader (T-25): pre = los valores no existen; post = existen, sin alterar
-- los previos ni filas.

ALTER TYPE client_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE client_status ADD VALUE IF NOT EXISTS 'maintenance';
