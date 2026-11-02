-- Sazón con Amor — subcategorías y adiciones globales
-- Ejecutar después de 0007_adiciones_seguimiento.sql.
--
-- Las subcategorías (grupos de opciones incluidas) y las adiciones se ofrecen
-- automáticamente en todos los platos del menú. No se asignan por plato ni por
-- categoría: se crean una vez y aplican a todo el menú, incluidos los platos
-- que se creen después.

-- ---------------------------------------------------------------------------
-- 1) Retirar las tablas de asignaciones (ya no hay dos fuentes de verdad).
-- ---------------------------------------------------------------------------

drop table if exists public.categorias_adiciones;
drop table if exists public.platos_adiciones;
drop table if exists public.platos_subcategorias;

-- ---------------------------------------------------------------------------
-- 2) Recrear las funciones de pedido con validación global de opciones y
--    adiciones (sin enlaces por plato ni por categoría).
-- ---------------------------------------------------------------------------

create or replace function public.crear_pedido(
  p_tipo             text,
  p_mesa             int,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_direccion        text,
  p_lugar            text,
  p_notas            text,
  p_items            jsonb
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
  if p_tipo not in ('domicilio', 'restaurante') then
    raise exception 'Tipo de pedido inválido';
  end if;

  if coalesce(trim(p_cliente_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if p_tipo = 'restaurante' and p_mesa is null then
    raise exception 'La mesa es obligatoria';
  end if;

  if p_tipo = 'domicilio' and coalesce(trim(p_direccion), '') = '' then
    raise exception 'La dirección es obligatoria';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  insert into pedidos (
    tipo, mesa, cliente_nombre, cliente_telefono, direccion, lugar, notas, total
  )
  values (
    p_tipo, p_mesa, p_cliente_nombre, p_cliente_telefono, p_direccion,
    nullif(trim(p_lugar), ''), p_notas, 0
  )
  returning pedidos.id, pedidos.token into v_id, v_token;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::int, 0);
    if v_cantidad <= 0 then
      continue;
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

revoke all on function public.crear_pedido(text, int, text, text, text, text, text, jsonb) from public;
grant execute on function public.crear_pedido(text, int, text, text, text, text, text, jsonb)
  to anon, authenticated;

create or replace function public.actualizar_pedido(
  p_token            uuid,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_direccion        text,
  p_lugar            text,
  p_notas            text,
  p_items            jsonb
)
returns table (numero int, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid;
  v_estado    text;
  v_creado    timestamptz;
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
  select p.id, p.estado, p.created_at into v_id, v_estado, v_creado
  from pedidos p
  where p.token = p_token;

  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  if v_estado <> 'nuevo' then
    raise exception 'El pedido ya está en preparación y no se puede editar';
  end if;

  if v_creado <= now() - interval '5 minutes' then
    raise exception 'El tiempo para modificar el pedido terminó';
  end if;

  if coalesce(trim(p_cliente_nombre), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;

  if coalesce(trim(p_direccion), '') = '' then
    raise exception 'La dirección es obligatoria';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;

  update pedidos
    set cliente_nombre = p_cliente_nombre,
        cliente_telefono = p_cliente_telefono,
        direccion = p_direccion,
        lugar = nullif(trim(p_lugar), ''),
        notas = p_notas
  where pedidos.id = v_id;

  delete from pedido_items where pedido_items.pedido_id = v_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_cantidad := coalesce((v_item ->> 'cantidad')::int, 0);
    if v_cantidad <= 0 then
      continue;
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
    raise exception 'Los platos seleccionados ya no están disponibles';
  end if;

  update pedidos set total = v_total where pedidos.id = v_id;

  return query
    select ped.numero, ped.total
    from pedidos ped where ped.id = v_id;
end;
$$;

revoke all on function public.actualizar_pedido(uuid, text, text, text, text, text, jsonb) from public;
grant execute on function public.actualizar_pedido(uuid, text, text, text, text, text, jsonb)
  to anon, authenticated;

notify pgrst, 'reload schema';
