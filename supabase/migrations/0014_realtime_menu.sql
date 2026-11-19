-- Sazón con Amor — Realtime del menú
-- Ejecutar después de 0013_realtime_admin_pedidos.sql.
--
-- El mesero necesita ver al instante cuándo un plato o una adición se agota.
-- Las lecturas públicas ya están permitidas, así que solo hace falta publicar
-- las tablas y enviar el row completo en los UPDATE.

begin;

alter table public.platos replica identity full;
alter table public.adiciones replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'platos'
  ) then
    alter publication supabase_realtime add table public.platos;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'adiciones'
  ) then
    alter publication supabase_realtime add table public.adiciones;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
