-- Sazón con Amor — endurecimiento de pedidos
-- Ejecutar después de 0008_opciones_globales.sql.
--
-- Las funciones de pedido dejan de estar disponibles para anon/authenticated.
-- Solo la Service Role (usada por las Server Actions) puede ejecutarlas.
-- También se añaden límites de entrada, idempotencia y validación de estados.

begin;

-- ---------------------------------------------------------------------------
-- 1) Rate limit persistente (funciona entre instancias serverless).
-- ---------------------------------------------------------------------------

create table if not exists public.limites_intentos (
  clave    text not null,
  ventana  timestamptz not null,
  intentos int not null default 0,
  primary key (clave, ventana)
);

create index if not exists limites_intentos_ventana_idx
  on public.limites_intentos (ventana);

alter table public.limites_intentos enable row level security;
revoke all on table public.limites_intentos from public, anon, authenticated;

create or replace function public.consumir_limite(
  p_clave             text,
  p_limite            int,
  p_ventana_segundos  int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ventana  timestamptz;
  v_intentos int;
begin
  if coalesce(trim(p_clave), '') = '' or p_limite <= 0 or p_ventana_segundos <= 0 then
    return false;
  end if;

  v_ventana := to_timestamp(
    floor(extract(epoch from now()) / p_ventana_segundos) * p_ventana_segundos
  );

  insert into public.limites_intentos as li (clave, ventana, intentos)
  values (left(p_clave, 200), v_ventana, 1)
  on conflict (clave, ventana) do update
    set intentos = li.intentos + 1
  returning li.intentos into v_intentos;

  delete from public.limites_intentos
  where ventana < now() - interval '2 days';

  return v_intentos <= p_limite;
end;
$$;

revoke all on function public.consumir_limite(text, int, int)
  from public, anon, authenticated;
grant execute on function public.consumir_limite(text, int, int)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2) Idempotencia de creación de pedidos.
-- ---------------------------------------------------------------------------

alter table public.pedidos
  add column if not exists idempotencia uuid;

create unique index if not exists pedidos_idempotencia_idx
  on public.pedidos (idempotencia)
  where idempotencia is not null;

-- ---------------------------------------------------------------------------
-- 3) crear_pedido con idempotencia y límites de entrada.
-- ---------------------------------------------------------------------------

drop function if exists public.crear_pedido(
  text, integer, text, text, text, text, text, jsonb
);

create or replace function public.crear_pedido(
  p_tipo             text,
  p_mesa             int,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_direccion        text,
  p_lugar            text,
  p_notas            text,
  p_items            jsonb,
  p_idempotencia     uuid default null
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
    idempotencia
  )
  values (
    p_tipo, p_mesa, trim(p_cliente_nombre), p_cliente_telefono,
    trim(p_direccion), nullif(trim(p_lugar), ''), p_notas, 0, p_idempotencia
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
  text, integer, text, text, text, text, text, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.crear_pedido(
  text, integer, text, text, text, text, text, jsonb, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- 4) actualizar_pedido con bloqueo de fila y límites de entrada.
-- ---------------------------------------------------------------------------

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
  where p.token = p_token
  for update;

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
  if char_length(trim(p_cliente_nombre)) > 80 then
    raise exception 'El nombre es demasiado largo';
  end if;

  if p_cliente_telefono is not null and char_length(p_cliente_telefono) > 30 then
    raise exception 'El teléfono es demasiado largo';
  end if;

  if coalesce(trim(p_direccion), '') = '' then
    raise exception 'La dirección es obligatoria';
  end if;
  if char_length(trim(p_direccion)) > 200 then
    raise exception 'La dirección es demasiado larga';
  end if;

  if p_lugar is not null and char_length(p_lugar) > 80 then
    raise exception 'El lugar es demasiado largo';
  end if;

  if p_notas is not null and char_length(p_notas) > 500 then
    raise exception 'Las notas son demasiado largas';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'El carrito tiene demasiados ítems';
  end if;

  update pedidos
    set cliente_nombre = trim(p_cliente_nombre),
        cliente_telefono = p_cliente_telefono,
        direccion = trim(p_direccion),
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
    raise exception 'Los platos seleccionados ya no están disponibles';
  end if;

  update pedidos set total = v_total where pedidos.id = v_id;

  return query
    select ped.numero, ped.total
    from pedidos ped where ped.id = v_id;
end;
$$;

revoke all on function public.actualizar_pedido(
  uuid, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.actualizar_pedido(
  uuid, text, text, text, text, text, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- 5) estado_pedido permanece público solo a través de la Server Action.
-- ---------------------------------------------------------------------------

revoke all on function public.estado_pedido(uuid)
  from public, anon, authenticated;
grant execute on function public.estado_pedido(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6) Transiciones de estado validadas en la base de datos.
-- ---------------------------------------------------------------------------

create or replace function public.validar_estado_pedido()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_flujo     text[];
  v_anterior  int;
  v_nuevo     int;
begin
  if new.estado = old.estado then
    return new;
  end if;

  if old.estado in ('entregado', 'cancelado') then
    raise exception 'El pedido ya está cerrado';
  end if;

  if new.estado = 'cancelado' then
    return new;
  end if;

  v_flujo := case new.tipo
    when 'domicilio' then array['nuevo', 'en_preparacion', 'listo', 'en_camino', 'entregado']
    else array['nuevo', 'en_preparacion', 'listo', 'entregado']
  end;

  v_anterior := array_position(v_flujo, old.estado);
  v_nuevo := array_position(v_flujo, new.estado);

  if v_anterior is null or v_nuevo is null or v_nuevo <= v_anterior then
    raise exception 'Transición de estado inválida';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_estado_pedido()
  from public, anon;
grant execute on function public.validar_estado_pedido()
  to authenticated, service_role;

drop trigger if exists pedidos_validar_estado on public.pedidos;
create trigger pedidos_validar_estado
  before update of estado on public.pedidos
  for each row execute function public.validar_estado_pedido();

notify pgrst, 'reload schema';

commit;
