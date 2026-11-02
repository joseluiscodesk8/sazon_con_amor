-- Sazón con Amor — lugares frecuentes de entrega
-- Ejecutar después de 0003_fix_crear_pedido.sql.
--
-- El admin administra una lista de lugares frecuentes. En el checkout de
-- domicilio el cliente los ve como botones y al elegir uno se llena la
-- dirección. También puede elegir "Otro" y escribir una dirección distinta.

create table if not exists public.lugares (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  direccion  text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.lugares enable row level security;

drop policy if exists lugares_lectura_publica on public.lugares;
create policy lugares_lectura_publica on public.lugares
  for select using (true);

drop policy if exists lugares_admin_todo on public.lugares;
create policy lugares_admin_todo on public.lugares
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
