-- =============================================================================
-- C3 Studio — Vincular operadores a public.users + tenant C3
-- Supabase → SQL Editor. Revisa ① y ② antes de ejecutar ④.
-- =============================================================================

-- ① Comprobar que los UUID existen en Auth y los emails coinciden
select id, email, created_at
from auth.users
where id in (
  'd2867987-ba12-43a4-aba0-785aa2d7304f', -- carlos@c3marketinghub.com (operador)
  'a8be9384-b7dd-44fc-9290-9f0c4ad3d183'  -- info@c3marketinghub.com
);

-- ② Debe existir el tenant (slug c3 según WEBAPP_SPEC)
select id, slug, name from public.tenants where slug = 'c3';

-- ③ Valores del enum de rol (si falla el cast en ④, usa uno de esta lista)
-- select enum_range(null::user_role);

-- ④ Insertar / actualizar filas en public.users enlazadas a tenant c3
--    Si falla por el rol, cambia 'admin'::user_role por otro valor válido (p. ej. 'operator').
insert into public.users (id, email, full_name, role, tenant_id, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', initcap(split_part(u.email, '@', 1))),
  'admin'::user_role,
  t.id,
  null
from auth.users u
inner join public.tenants t on t.slug = 'c3'
where u.id in (
  'd2867987-ba12-43a4-aba0-785aa2d7304f',
  'a8be9384-b7dd-44fc-9290-9f0c4ad3d183'
)
on conflict (id) do update set
  email = excluded.email,
  tenant_id = excluded.tenant_id,
  role = excluded.role,
  full_name = coalesce(excluded.full_name, public.users.full_name);

-- ⑤ Verificar
select u.id, u.email, u.role, u.tenant_id, t.slug
from public.users u
left join public.tenants t on t.id = u.tenant_id
where u.id in (
  'd2867987-ba12-43a4-aba0-785aa2d7304f',
  'a8be9384-b7dd-44fc-9290-9f0c4ad3d183'
);
