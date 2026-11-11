-- Sazón con Amor — historial de mesas cerradas
-- Ejecutar después de 0011_mesas_abiertas.sql.
--
-- 1) Cerrar una mesa conserva su sesión y sus tickets como historial.
-- 2) Solo puede haber una sesión abierta por mesa.
-- 3) El admin puede borrar todo el historial de mesas cerradas.

begin;

-- ---------------------------------------------------------------------------
-- 1) Estado de las sesiones
-- ---------------------------------------------------------------------------

alter table public.mesas_abiertas
  add column if not exists estado text not null default 'abierta';

alter table public.mesas_abiertas
  add column if not exists cerrada_at timestamptz;

alter table public.mesas_abiertas
  drop constraint if exists mesas_abiertas_estado_check;

alter table public.mesas_abiertas
  add constraint mesas_abiertas_estado_check
  check (estado in ('abierta', 'cerrada'));

-- ---------------------------------------------------------------------------
-- 2) Una sola sesión abierta por mesa, pero muchas cerradas
-- ---------------------------------------------------------------------------

alter table public.mesas_abiertas
  drop constraint if exists mesas_abiertas_mesa_key;

do $$
declare
  v_conname text;
begin
  for v_conname in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.mesas_abiertas'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (
          select a.attnum
          from pg_attribute a
          where a.attrelid = 'public.mesas_abiertas'::regclass
            and a.attname = 'mesa'
            and not a.attisdropped
        )
      ]::smallint[]
  loop
    execute format(
      'alter table public.mesas_abiertas drop constraint %I',
      v_conname
    );
  end loop;
end;
$$;

drop index if exists public.mesas_abiertas_mesa_key;

create unique index if not exists mesas_abiertas_mesa_abierta_uidx
  on public.mesas_abiertas (mesa)
  where estado = 'abierta';

create index if not exists mesas_abiertas_historial_idx
  on public.mesas_abiertas (cerrada_at desc)
  where estado = 'cerrada';

-- ---------------------------------------------------------------------------
-- 3) Abrir mesa (solo sesiones abiertas)
-- ---------------------------------------------------------------------------

create or replace function public.abrir_mesa(
  p_mesa           int,
  p_mesero_user_id uuid,
  p_mesero_nombre  text
)
returns table (
  id             uuid,
  mesa           int,
  mesero_user_id uuid,
  mesero_nombre  text,
  abierta_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sesion public.mesas_abiertas%rowtype;
  v_nombre text;
begin
  if p_mesa is null or p_mesa < 1 or p_mesa > 60 then
    raise exception 'La mesa es inválida';
  end if;

  if p_mesero_user_id is null or not exists (
    select 1
    from public.admins a
    where a.user_id = p_mesero_user_id
      and a.rol in ('admin', 'mesero')
  ) then
    raise exception 'Mesero inválido';
  end if;

  v_nombre := nullif(trim(p_mesero_nombre), '');
  if v_nombre is null or char_length(v_nombre) > 80 then
    raise exception 'El nombre del mesero es inválido';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('mesa:' || p_mesa::text, 0)
  );

  select *
    into v_sesion
  from public.mesas_abiertas m
  where m.mesa = p_mesa
    and m.estado = 'abierta'
  for update;

  if found then
    if v_sesion.mesero_user_id = p_mesero_user_id then
      return query
        select v_sesion.id, v_sesion.mesa, v_sesion.mesero_user_id,
               v_sesion.mesero_nombre, v_sesion.abierta_at;
      return;
    end if;

    raise exception 'La mesa % ya está abierta por %',
      p_mesa, v_sesion.mesero_nombre;
  end if;

  insert into public.mesas_abiertas (mesa, mesero_user_id, mesero_nombre)
  values (p_mesa, p_mesero_user_id, v_nombre)
  returning * into v_sesion;

  return query
    select v_sesion.id, v_sesion.mesa, v_sesion.mesero_user_id,
           v_sesion.mesero_nombre, v_sesion.abierta_at;
end;
$$;

revoke all on function public.abrir_mesa(integer, uuid, text)
  from public, anon, authenticated;
grant execute on function public.abrir_mesa(integer, uuid, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4) Guardar/agregar platos al ticket único de la mesa
-- ---------------------------------------------------------------------------

create or replace function public.guardar_pedido_mesa(
  p_mesa           int,
  p_mesero_user_id uuid,
  p_mesero_nombre  text,
  p_notas          text,
  p_items          jsonb,
  p_idempotencia   uuid
)
returns table (
  id     uuid,
  numero int,
  total  numeric,
  creado boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sesion          public.mesas_abiertas%rowtype;
  v_pedido_id       uuid;
  v_pedido_numero   int;
  v_temp_id         uuid;
  v_temp_numero     int;
  v_temp_total      numeric(10, 2);
  v_id              uuid;
  v_numero          int;
  v_total           numeric(10, 2);
  v_creado          boolean := false;
  v_nombre          text;
  v_envio_pedido_id uuid;
  v_envio_mesa      int;
  v_envio_creado    boolean;
begin
  if p_mesa is null or p_mesa < 1 or p_mesa > 60 then
    raise exception 'La mesa es inválida';
  end if;

  if p_mesero_user_id is null then
    raise exception 'El mesero es obligatorio';
  end if;

  if p_idempotencia is null then
    raise exception 'La idempotencia es obligatoria';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un plato';
  end if;

  if p_notas is not null and char_length(p_notas) > 500 then
    raise exception 'Las notas son demasiado largas';
  end if;

  v_nombre := nullif(trim(p_mesero_nombre), '');
  if v_nombre is null or char_length(v_nombre) > 80 then
    raise exception 'El nombre del mesero es inválido';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_idempotencia::text, 0)
  );

  select e.pedido_id, e.creado, p.mesa
    into v_envio_pedido_id, v_envio_creado, v_envio_mesa
  from public.pedido_envios e
  join public.pedidos p on p.id = e.pedido_id
  where e.idempotencia = p_idempotencia;

  if found then
    if v_envio_mesa is distinct from p_mesa then
      raise exception 'No pudimos registrar el pedido';
    end if;

    return query
      select p.id, p.numero, p.total, v_envio_creado
      from public.pedidos p
      where p.id = v_envio_pedido_id;
    return;
  end if;

  select *
    into v_sesion
  from public.mesas_abiertas m
  where m.mesa = p_mesa
    and m.estado = 'abierta'
  for update;

  if not found then
    raise exception 'La mesa no está abierta';
  end if;

  if v_sesion.mesero_user_id <> p_mesero_user_id then
    raise exception 'La mesa está abierta por otro mesero';
  end if;

  select p.id, p.numero
    into v_pedido_id, v_pedido_numero
  from public.pedidos p
  where p.sesion_id = v_sesion.id
    and p.tipo = 'restaurante'
    and p.origen = 'mesero'
    and p.estado in ('nuevo', 'en_preparacion', 'listo')
  order by p.created_at desc
  limit 1
  for update;

  if not found then
    -- Compatibilidad: adopta el ticket activo más reciente de la mesa si
    -- venía de antes de existir mesas_abiertas.
    select p.id, p.numero
      into v_pedido_id, v_pedido_numero
    from public.pedidos p
    where p.tipo = 'restaurante'
      and p.origen = 'mesero'
      and p.mesa = p_mesa
      and p.sesion_id is null
      and p.estado in ('nuevo', 'en_preparacion', 'listo')
    order by p.created_at desc
    limit 1
    for update;

    if found then
      update public.pedidos p
      set sesion_id = v_sesion.id
      where p.id = v_pedido_id;
    end if;
  end if;

  if v_pedido_id is null then
    select t.id, t.numero, t.total
      into v_id, v_numero, v_total
    from public.crear_pedido(
      p_tipo             => 'restaurante',
      p_mesa             => p_mesa,
      p_cliente_nombre   => 'Mesa ' || p_mesa::text,
      p_cliente_telefono => null,
      p_direccion        => null,
      p_lugar            => null,
      p_notas            => nullif(trim(p_notas), ''),
      p_items            => p_items,
      p_idempotencia     => null,
      p_origen           => 'mesero',
      p_mesero_user_id   => p_mesero_user_id,
      p_mesero_nombre    => v_nombre
    ) t;

    update public.pedidos p
    set sesion_id = v_sesion.id
    where p.id = v_id;

    v_creado := true;
  else
    select t.id, t.numero, t.total
      into v_temp_id, v_temp_numero, v_temp_total
    from public.crear_pedido(
      p_tipo             => 'restaurante',
      p_mesa             => p_mesa,
      p_cliente_nombre   => 'Mesa ' || p_mesa::text,
      p_cliente_telefono => null,
      p_direccion        => null,
      p_lugar            => null,
      p_notas            => null,
      p_items            => p_items,
      p_idempotencia     => null,
      p_origen           => 'mesero',
      p_mesero_user_id   => p_mesero_user_id,
      p_mesero_nombre    => v_nombre
    ) t;

    update public.pedido_items
    set pedido_id = v_pedido_id
    where pedido_id = v_temp_id;

    select coalesce(sum(pi.precio * pi.cantidad), 0)
      into v_total
    from public.pedido_items pi
    where pi.pedido_id = v_pedido_id;

    update public.pedidos p
    set total = v_total,
        notas = nullif(trim(p_notas), '')
    where p.id = v_pedido_id;

    delete from public.pedidos p where p.id = v_temp_id;

    v_id := v_pedido_id;
    v_numero := v_pedido_numero;
  end if;

  insert into public.pedido_envios (idempotencia, pedido_id, creado)
  values (p_idempotencia, v_id, v_creado);

  return query
    select p.id, p.numero, p.total, v_creado
    from public.pedidos p
    where p.id = v_id;
end;
$$;

revoke all on function public.guardar_pedido_mesa(
  integer, uuid, text, text, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.guardar_pedido_mesa(
  integer, uuid, text, text, jsonb, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Cerrar mesa: la sesión pasa al historial, no se borra
-- ---------------------------------------------------------------------------

create or replace function public.cerrar_mesa(p_mesa int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sesion public.mesas_abiertas%rowtype;
begin
  if p_mesa is null or p_mesa < 1 or p_mesa > 60 then
    raise exception 'La mesa es inválida';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('mesa:' || p_mesa::text, 0)
  );

  select *
    into v_sesion
  from public.mesas_abiertas m
  where m.mesa = p_mesa
    and m.estado = 'abierta'
  for update;

  if not found then
    return false;
  end if;

  update public.pedidos p
  set estado = 'entregado'
  where p.tipo = 'restaurante'
    and p.mesa = p_mesa
    and p.estado in ('nuevo', 'en_preparacion', 'listo');

  update public.mesas_abiertas m
  set estado = 'cerrada',
      cerrada_at = now()
  where m.id = v_sesion.id;

  return true;
end;
$$;

revoke all on function public.cerrar_mesa(integer)
  from public, anon, authenticated;
grant execute on function public.cerrar_mesa(integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6) Borrar todo el historial de mesas cerradas
-- ---------------------------------------------------------------------------

create or replace function public.limpiar_historial_mesas()
returns table (
  mesas_borradas   bigint,
  pedidos_borrados bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids     uuid[];
  v_mesas   bigint := 0;
  v_pedidos bigint := 0;
begin
  select coalesce(array_agg(m.id), array[]::uuid[])
    into v_ids
  from public.mesas_abiertas m
  where m.estado = 'cerrada';

  if cardinality(v_ids) = 0 then
    return query select 0::bigint, 0::bigint;
    return;
  end if;

  delete from public.pedidos p
  where p.sesion_id = any(v_ids);
  get diagnostics v_pedidos = row_count;

  delete from public.mesas_abiertas m
  where m.id = any(v_ids);
  get diagnostics v_mesas = row_count;

  return query select v_mesas, v_pedidos;
end;
$$;

revoke all on function public.limpiar_historial_mesas()
  from public, anon, authenticated;
grant execute on function public.limpiar_historial_mesas()
  to service_role;

-- ---------------------------------------------------------------------------
-- 7) Realtime para mesas y pedidos
-- ---------------------------------------------------------------------------

alter table public.mesas_abiertas replica identity full;

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

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mesas_abiertas'
  ) then
    alter publication supabase_realtime add table public.mesas_abiertas;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
