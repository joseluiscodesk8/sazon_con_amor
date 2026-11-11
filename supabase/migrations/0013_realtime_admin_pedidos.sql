-- Sazón con Amor — Realtime de pedidos para el admin
-- Ejecutar después de 0012_mesas_historial.sql.
--
-- Supabase Realtime solo entrega INSERT/UPDATE si el usuario suscrito puede
-- hacer SELECT sobre la fila. La política existente pedidos_admin_todo es
-- "for all"; esta política SELECT explícita permite que el panel del admin
-- reciba los pedidos nuevos sin recargar la página.

begin;

drop policy if exists pedidos_admin_lectura on public.pedidos;
create policy pedidos_admin_lectura on public.pedidos
  for select to authenticated
  using ((select public.es_admin()));

-- Asegura que pedidos siga en la publicación de Realtime (idempotente).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
