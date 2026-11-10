-- Sazón con Amor — mesas abiertas y un solo ticket por mesa
-- Ejecutar después de 0010_meseros.sql.
--
-- 1) Una mesa abierta pertenece a un mesero hasta que el admin la cierra.
-- 2) Todas las adiciones del mesero se guardan en el mismo ticket de la mesa.
-- 3) pedido_envios evita duplicar platos si se reintenta un envío.

begin;

-- Limpieza del enfoque anterior (por si llegó a aplicarse).
drop function if exists public.crear_pedidos_mesa(
  integer, jsonb, uuid, uuid, text
);

-- ---------------------------------------------------------------------------
-- 1) Sesiones de mesa
-- ---------------------------------------------------------------------------

create table if not exists public.mesas_abiertas (
  id               uuid primary key default gen_random_uuid(),
  mesa             int not null unique check (mesa between 1 and 60),
  mesero_user_id   uuid not null references public.admins(user_id) on delete cascade,
  mesero_nombre    text not null
                     check (char_length(trim(mesero_nombre)) between 1 and 80),
  abierta_at       timestamptz not null default now()
);

alter table public.mesas_abiertas enable row level security;

drop policy if exists mesas_abiertas_lectura on public.mesas_abiertas;
create policy mesas_abiertas_lectura on public.mesas_abiertas
  for select to authenticated
  using ((select public.es_admin()) or (select public.es_mesero()));

-- ---------------------------------------------------------------------------
-- 2) Vínculo pedido -> sesión de mesa
-- ---------------------------------------------------------------------------

alter table public.pedidos
  add column if not exists sesion_id uuid
    references public.mesas_abiertas(id) on delete set null;

create index if not exists pedidos_sesion_id_idx
  on public.pedidos (sesion_id);

create unique index if not exists pedidos_sesion_activa_idx
  on public.pedidos (sesion_id)
  where sesion_id is not null
    and estado in ('nuevo', 'en_preparacion', 'listo');

-- ---------------------------------------------------------------------------
-- 3) Idempotencia de envíos y adiciones
-- ---------------------------------------------------------------------------

create table if not exists public.pedido_envios (
  idempotencia uuid primary key,
  pedido_id    uuid not null references public.pedidos(id) on delete cascade,
  creado       boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists pedido_envios_pedido_id_idx
  on public.pedido_envios (pedido_id);

alter table public.pedido_envios enable row level security;
-- Sin políticas: solo se usa con service_role desde las Server Actions.

-- ---------------------------------------------------------------------------
-- 4) Backfill: pedidos de mesero activos que ya existan
-- ---------------------------------------------------------------------------

insert into public.mesas_abiertas (mesa, mesero_user_id, mesero_nombre, abierta_at)
select distinct on (p.mesa)
  p.mesa,
  p.mesero_user_id,
  p.mesero_nombre,
  p.created_at
from public.pedidos p
where p.tipo = 'restaurante'
  and p.origen = 'mesero'
  and p.estado in ('nuevo', 'en_preparacion', 'listo')
  and p.mesa between 1 and 60
  and p.mesero_user_id is not null
  and coalesce(trim(p.mesero_nombre), '') <> ''
order by p.mesa, p.created_at desc
on conflict (mesa) do nothing;

update public.pedidos p
set sesion_id = s.id
from public.mesas_abiertas s
where p.id = (
  select p2.id
  from public.pedidos p2
  where p2.mesa = s.mesa
    and p2.tipo = 'restaurante'
    and p2.origen = 'mesero'
    and p2.estado in ('nuevo', 'en_preparacion', 'listo')
    and p2.sesion_id is null
  order by p2.created_at desc
  limit 1
)
and p.sesion_id is null
and not exists (
  select 1
  from public.pedidos px
  where px.sesion_id = s.id
    and px.estado in ('nuevo', 'en_preparacion', 'listo')
);

-- ---------------------------------------------------------------------------
-- 5) Abrir mesa
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
-- 6) Guardar/agregar platos al ticket único de la mesa
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
-- 7) Cerrar mesa (solo admin, vía Server Action con service_role)
-- ---------------------------------------------------------------------------

create or replace function public.cerrar_mesa(p_mesa int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mesa is null or p_mesa < 1 or p_mesa > 60 then
    raise exception 'La mesa es inválida';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('mesa:' || p_mesa::text, 0)
  );

  perform 1
  from public.mesas_abiertas m
  where m.mesa = p_mesa
  for update;

  update public.pedidos
  set estado = 'entregado'
  where tipo = 'restaurante'
    and mesa = p_mesa
    and estado in ('nuevo', 'en_preparacion', 'listo');

  delete from public.mesas_abiertas where mesa = p_mesa;

  return true;
end;
$$;

revoke all on function public.cerrar_mesa(integer)
  from public, anon, authenticated;
grant execute on function public.cerrar_mesa(integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 8) Realtime para el estado de las mesas
-- ---------------------------------------------------------------------------

do $$
begin
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
