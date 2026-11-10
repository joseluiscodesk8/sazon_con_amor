-- Sazón con Amor — meseros
-- Ejecutar después de 0009_endurecer_pedidos.sql.
--
-- 1) Roles en la tabla admins: admin y mesero.
-- 2) Los pedidos de mesero siguen siendo tipo "restaurante", pero se marcan
--    con origen "mesero" y guardan quién los tomó.
-- 3) Los meseros solo pueden leer pedidos de restaurante; crear pedidos sigue
--    pasando por crear_pedido() con Service Role desde una Server Action.

begin;

-- ---------------------------------------------------------------------------
-- 1) Roles de acceso
-- ---------------------------------------------------------------------------

alter table public.admins
  add column if not exists rol text not null default 'admin';

alter table public.admins
  add column if not exists nombre text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admins_rol_check'
  ) then
    alter table public.admins
      add constraint admins_rol_check
      check (rol in ('admin', 'mesero'));
  end if;
end;
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
      and a.rol = 'admin'
  );
$$;

grant execute on function public.es_admin() to anon, authenticated;

create or replace function public.es_mesero()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins a
    where a.user_id = auth.uid()
      and a.rol = 'mesero'
  );
$$;

revoke all on function public.es_mesero() from public, anon;
grant execute on function public.es_mesero() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Origen y autor del pedido
-- ---------------------------------------------------------------------------

alter table public.pedidos
  add column if not exists origen text not null default 'cliente';

alter table public.pedidos
  add column if not exists mesero_user_id uuid
    references public.admins(user_id) on delete set null;

alter table public.pedidos
  add column if not exists mesero_nombre text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_origen_check'
  ) then
    alter table public.pedidos
      add constraint pedidos_origen_check
      check (origen in ('cliente', 'mesero'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_mesero_check'
  ) then
    alter table public.pedidos
      add constraint pedidos_mesero_check
      check (
        origen <> 'mesero'
        or (
          tipo = 'restaurante'
          and mesa is not null
          and mesa between 1 and 60
          and coalesce(trim(mesero_nombre), '') <> ''
          and char_length(trim(mesero_nombre)) <= 80
        )
      );
  end if;
end;
$$;

create index if not exists pedidos_origen_estado_idx
  on public.pedidos (origen, estado, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) Lectura de pedidos de restaurante para meseros
-- ---------------------------------------------------------------------------

create or replace function public.es_pedido_restaurante(p_pedido_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pedidos p
    where p.id = p_pedido_id
      and p.tipo = 'restaurante'
  );
$$;

revoke all on function public.es_pedido_restaurante(uuid)
  from public, anon;
grant execute on function public.es_pedido_restaurante(uuid)
  to authenticated;

drop policy if exists pedidos_mesero_lectura on public.pedidos;
create policy pedidos_mesero_lectura on public.pedidos
  for select to authenticated
  using ((select public.es_mesero()) and tipo = 'restaurante');

drop policy if exists pedido_items_mesero_lectura on public.pedido_items;
create policy pedido_items_mesero_lectura on public.pedido_items
  for select to authenticated
  using (
    (select public.es_mesero())
    and public.es_pedido_restaurante(pedido_id)
  );

-- ---------------------------------------------------------------------------
-- 4) crear_pedido(): admite origen y autor del pedido
-- ---------------------------------------------------------------------------

drop function if exists public.crear_pedido(
  text, integer, text, text, text, text, text, jsonb, uuid
);

create function public.crear_pedido(
  p_tipo             text,
  p_mesa             int,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_direccion        text,
  p_lugar            text,
  p_notas            text,
  p_items            jsonb,
  p_idempotencia     uuid default null,
  p_origen           text default 'cliente',
  p_mesero_user_id   uuid default null,
  p_mesero_nombre    text default null
)
returns table (id uuid, numero int, total numeric, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid;
  v_token     uuid;
  v_total     numeric(10, 2);
  v_item      jsonb;
  v_plato_id  uuid;
  v_cantidad  int;
  v_precio    numeric(10, 2);
  v_precio_unitario numeric(10, 2);
  v_nombre    text;
  v_disponible boolean;
  v_item_id   uuid;
  v_opciones  jsonb;
  v_op        jsonb;
  v_opcion_id uuid;
  v_op_nombre text;
  v_sub_nombre text;
  v_adiciones jsonb;
  v_ad        jsonb;
  v_ad_id     uuid;
  v_ad_nombre text;
  v_ad_precio numeric(10, 2);
  v_ad_ids    uuid[];
begin
  if p_origen not in ('cliente', 'mesero') then
    raise exception 'Origen de pedido inválido';
  end if;

  if p_tipo not in ('domicilio', 'restaurante') then
    raise exception 'Tipo de pedido inválido';
  end if;

  if coalesce(trim(p_cliente_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if char_length(trim(p_cliente_nombre)) > 80 then
    raise exception 'El nombre es demasiado largo';
  end if;

  if p_cliente_telefono is not null and char_length(p_cliente_telefono) > 30 then
    raise exception 'El teléfono es demasiado largo';
  end if;

  if p_tipo = 'restaurante' then
    if p_mesa is null or p_mesa < 1 or p_mesa > 60 then
      raise exception 'La mesa es inválida';
    end if;
  end if;

  if p_tipo = 'domicilio' then
    if coalesce(trim(p_direccion), '') = '' then
      raise exception 'La dirección es obligatoria';
    end if;
    if char_length(trim(p_direccion)) > 200 then
      raise exception 'La dirección es demasiado larga';
    end if;
  end if;

  if p_lugar is not null and char_length(p_lugar) > 80 then
    raise exception 'El lugar es demasiado largo';
  end if;

  if p_notas is not null and char_length(p_notas) > 500 then
    raise exception 'Las notas son demasiado largas';
  end if;

  if p_origen = 'mesero' then
    if p_tipo <> 'restaurante' then
      raise exception 'Los pedidos de mesero deben ser de restaurante';
    end if;
    if p_mesero_user_id is null then
      raise exception 'El mesero es obligatorio';
    end if;
    if not exists (
      select 1
      from public.admins a
      where a.user_id = p_mesero_user_id
        and a.rol in ('admin', 'mesero')
    ) then
      raise exception 'Mesero inválido';
    end if;
    if coalesce(trim(p_mesero_nombre), '') = '' then
      raise exception 'El nombre del mesero es obligatorio';
    end if;
    if char_length(trim(p_mesero_nombre)) > 80 then
      raise exception 'El nombre del mesero es demasiado largo';
    end if;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'El carrito tiene demasiados ítems';
  end if;

  if p_idempotencia is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_idempotencia::text, 0));

    if exists (
      select 1 from pedidos ped where ped.idempotencia = p_idempotencia
    ) then
      return query
        select ped.id, ped.numero, ped.total, ped.token
        from pedidos ped
        where ped.idempotencia = p_idempotencia;
      return;
    end if;
  end if;

  insert into pedidos (
    tipo, mesa, cliente_nombre, cliente_telefono, direccion, lugar, notas, total,
    idempotencia, origen, mesero_user_id, mesero_nombre
  )
  values (
    p_tipo, p_mesa, trim(p_cliente_nombre), p_cliente_telefono,
    trim(p_direccion), nullif(trim(p_lugar), ''), p_notas, 0, p_idempotencia,
    p_origen,
    case when p_origen = 'mesero' then p_mesero_user_id else null end,
    case when p_origen = 'mesero' then nullif(trim(p_mesero_nombre), '') else null end
  )
  returning pedidos.id, pedidos.token into v_id, v_token;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::int, 0);
    if v_cantidad <= 0 then
      continue;
    end if;
    if v_cantidad > 20 then
      raise exception 'Cantidad inválida';
    end if;

    if jsonb_array_length(coalesce(v_item -> 'opciones', '[]'::jsonb)) > 10 then
      raise exception 'Demasiadas opciones en un ítem';
    end if;
    if jsonb_array_length(coalesce(v_item -> 'adiciones', '[]'::jsonb)) > 20 then
      raise exception 'Demasiadas adiciones en un ítem';
    end if;

    select p.precio, p.nombre, p.disponible
      into v_precio, v_nombre, v_disponible
    from platos p
    where p.id = (v_item ->> 'plato_id')::uuid;

    if not found or not v_disponible then
      continue;
    end if;

    v_plato_id := (v_item ->> 'plato_id')::uuid;

    insert into pedido_items (pedido_id, plato_id, nombre, precio, cantidad, opciones, adiciones)
    values (v_id, v_plato_id, v_nombre, v_precio, v_cantidad, '[]'::jsonb, '[]'::jsonb)
    returning pedido_items.id into v_item_id;

    v_opciones := '[]'::jsonb;

    for v_op in
      select * from jsonb_array_elements(coalesce(v_item -> 'opciones', '[]'::jsonb))
    loop
      v_opcion_id := (v_op ->> 'opcion_id')::uuid;

      select op.nombre, cat.nombre
        into v_op_nombre, v_sub_nombre
      from platos op
      join categorias cat
        on cat.id = op.categoria_id
       and cat.es_subcategoria = true
      where op.id = v_opcion_id
        and op.disponible = true;

      if found then
        v_opciones := v_opciones || jsonb_build_object(
          'subcategoria', v_sub_nombre,
          'opcion', v_op_nombre
        );
      end if;
    end loop;

    v_adiciones := '[]'::jsonb;
    v_precio_unitario := v_precio;
    v_ad_ids := '{}';

    for v_ad in
      select * from jsonb_array_elements(coalesce(v_item -> 'adiciones', '[]'::jsonb))
    loop
      v_ad_id := (v_ad ->> 'adicion_id')::uuid;
      if v_ad_id = any(v_ad_ids) then
        continue;
      end if;

      select a.nombre, a.precio
        into v_ad_nombre, v_ad_precio
      from adiciones a
      where a.id = v_ad_id
        and a.disponible = true;

      if found then
        v_ad_ids := array_append(v_ad_ids, v_ad_id);
        v_precio_unitario := v_precio_unitario + v_ad_precio;
        v_adiciones := v_adiciones || jsonb_build_object(
          'nombre', v_ad_nombre,
          'precio', v_ad_precio
        );
      end if;
    end loop;

    update pedido_items
      set opciones = v_opciones,
          adiciones = v_adiciones,
          precio = v_precio_unitario
    where pedido_items.id = v_item_id;
  end loop;

  select coalesce(sum(precio * cantidad), 0) into v_total
  from pedido_items where pedido_id = v_id;

  if v_total = 0 then
    delete from pedidos where pedidos.id = v_id;
    raise exception 'Los platos seleccionados ya no están disponibles';
  end if;

  update pedidos set total = v_total where pedidos.id = v_id;

  return query
    select ped.id, ped.numero, ped.total, ped.token
    from pedidos ped where ped.id = v_id;
end;
$$;

revoke all on function public.crear_pedido(
  text, integer, text, text, text, text, text, jsonb, uuid, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.crear_pedido(
  text, integer, text, text, text, text, text, jsonb, uuid, text, uuid, text
) to service_role;

notify pgrst, 'reload schema';

commit;
