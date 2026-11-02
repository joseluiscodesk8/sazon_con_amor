-- Sazón con Amor — subcategorías (acompañantes / opciones)
-- Ejecutar en el SQL Editor de Supabase después de 0001_init.sql.
--
-- Idea: algunas categorías son "subcategorías" (jugos, sopas, frijoles...).
-- Sus platos son solo nombres SIN foto ni precio, y se ofrecen como opciones
-- al pedir un plato principal (que se enlaza a una o varias subcategorías).
-- El cliente elige una opción por subcategoría (la primera por orden es la
-- que viene por defecto, y se puede cambiar).

-- ---------------------------------------------------------------------------
-- 1) Marcar categorías como subcategoría (detección por nombre + bandera)
-- ---------------------------------------------------------------------------

alter table public.categorias
  add column if not exists es_subcategoria boolean not null default false;

-- Backfill: categorías cuyo nombre (normalizado) coincide con un acompañante.
update public.categorias
set es_subcategoria = true
where lower(btrim(nombre)) in (
  'jugo', 'jugos', 'jugos naturales',
  'sopa', 'sopas',
  'frijol', 'frijoles',
  'acompañamiento', 'acompañamientos',
  'acompanamiento', 'acompanamientos'
);

-- ---------------------------------------------------------------------------
-- 2) Enlace plato principal -> subcategorías que ofrece
-- ---------------------------------------------------------------------------

create table if not exists public.platos_subcategorias (
  plato_id       uuid not null references public.platos(id) on delete cascade,
  subcategoria_id uuid not null references public.categorias(id) on delete cascade,
  orden          int not null default 0,
  primary key (plato_id, subcategoria_id)
);
create index if not exists platos_subcategorias_sub_idx
  on public.platos_subcategorias (subcategoria_id);

alter table public.platos_subcategorias enable row level security;

drop policy if exists platos_subcategorias_lectura on public.platos_subcategorias;
create policy platos_subcategorias_lectura on public.platos_subcategorias
  for select using (true);

drop policy if exists platos_subcategorias_admin on public.platos_subcategorias;
create policy platos_subcategorias_admin on public.platos_subcategorias
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- 3) Snapshot de opciones elegidas por línea de pedido
-- ---------------------------------------------------------------------------

alter table public.pedido_items
  add column if not exists opciones jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 4) crear_pedido(): ahora acepta opciones por ítem.
-- p_items = [ { plato_id, cantidad, opciones: [ { subcategoria_id, opcion_id } ] } ]
-- Se valida que cada opción sea un plato disponible de una subcategoría
-- enlazada al plato principal. Los acompañantes NO suman al total.
-- ---------------------------------------------------------------------------

create or replace function public.crear_pedido(
  p_tipo             text,
  p_mesa             int,
  p_cliente_nombre   text,
  p_cliente_telefono text,
  p_direccion        text,
  p_notas            text,
  p_items            jsonb
)
returns table (id uuid, numero int, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        uuid;
  v_total     numeric(10, 2);
  v_item      jsonb;
  v_plato_id  uuid;
  v_cantidad  int;
  v_precio    numeric(10, 2);
  v_nombre    text;
  v_disponible boolean;
  v_item_id   uuid;
  v_opciones  jsonb;
  v_op        jsonb;
  v_opcion_id uuid;
  v_op_nombre text;
  v_sub_nombre text;
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

  insert into pedidos (tipo, mesa, cliente_nombre, cliente_telefono, direccion, notas, total)
  values (p_tipo, p_mesa, p_cliente_nombre, p_cliente_telefono, p_direccion, p_notas, 0)
  returning pedidos.id into v_id;

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

    insert into pedido_items (pedido_id, plato_id, nombre, precio, cantidad, opciones)
    values (v_id, v_plato_id, v_nombre, v_precio, v_cantidad, '[]'::jsonb)
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
      join platos_subcategorias ps
        on ps.subcategoria_id = cat.id
       and ps.plato_id = v_plato_id
      where op.id = v_opcion_id
        and op.disponible = true;

      if found then
        v_opciones := v_opciones || jsonb_build_object(
          'subcategoria', v_sub_nombre,
          'opcion', v_op_nombre
        );
      end if;
    end loop;

    update pedido_items set opciones = v_opciones where pedido_items.id = v_item_id;
  end loop;

  select coalesce(sum(precio * cantidad), 0) into v_total
  from pedido_items where pedido_id = v_id;

  if v_total = 0 then
    delete from pedidos where pedidos.id = v_id;
    raise exception 'Los platos seleccionados ya no están disponibles';
  end if;

  update pedidos set total = v_total where pedidos.id = v_id;

  return query
    select ped.id, ped.numero, ped.total from pedidos ped where ped.id = v_id;
end;
$$;

revoke all on function public.crear_pedido(text, int, text, text, text, text, jsonb) from public;
grant execute on function public.crear_pedido(text, int, text, text, text, text, jsonb)
  to anon, authenticated;
