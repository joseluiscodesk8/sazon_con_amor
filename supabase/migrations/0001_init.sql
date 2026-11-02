-- Sazón con Amor — esquema inicial
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
--
-- Después de ejecutarlo crea el usuario administrador desde la app:
--   abre /admin/registro, escribe el ADMIN_SETUP_CODE (ver .env), un usuario
--   y una contraseña. El registro lo crea y lo añade a la tabla admins.
--   (No se usa correo real: internamente se genera "usuario@sazon.local".)
--   (Alternativa manual: Authentication -> Users -> Add user, y luego
--    insertar su id en public.admins).
--
-- El acceso público al menú es de solo lectura; la creación de pedidos pasa
-- únicamente por la función crear_pedido() (SECURITY DEFINER), de modo que
-- nadie anónimo puede listar ni leer pedidos.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  orden      int  not null default 0,
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.platos (
  id           uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  nombre       text not null,
  descripcion  text,
  precio       numeric(10, 2) not null check (precio >= 0),
  imagen_url   text,
  disponible   boolean not null default true,
  orden        int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists platos_categoria_id_idx on public.platos (categoria_id);

create table if not exists public.pedidos (
  id               uuid primary key default gen_random_uuid(),
  numero           serial,
  tipo             text not null check (tipo in ('domicilio', 'restaurante')),
  estado           text not null default 'nuevo'
                     check (estado in ('nuevo', 'en_preparacion', 'listo', 'en_camino', 'entregado', 'cancelado')),
  mesa             int,
  cliente_nombre   text not null,
  cliente_telefono text,
  direccion        text,
  notas            text,
  total            numeric(10, 2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists pedidos_created_at_idx on public.pedidos (created_at desc);
create index if not exists pedidos_estado_idx on public.pedidos (estado);

create table if not exists public.pedido_items (
  id        uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  plato_id  uuid references public.platos(id) on delete set null,
  nombre    text not null,
  precio    numeric(10, 2) not null,
  cantidad  int not null check (cantidad > 0)
);
create index if not exists pedido_items_pedido_id_idx on public.pedido_items (pedido_id);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pedidos_touch_updated_at on public.pedidos;
create trigger pedidos_touch_updated_at
  before update on public.pedidos
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Admins (whitelist)
-- Solo los usuarios listados aquí son administradores. Esto es importante
-- porque el proyecto de Supabase puede tener otros usuarios (de otras apps):
-- "estar autenticado" NO basta, hay que estar en esta tabla.
-- ---------------------------------------------------------------------------

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  usuario    text unique,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- Un admin puede leer su propia fila (para que la app verifique el acceso).
-- Nadie puede insertar/editar/borrar desde el cliente: solo la Service Role.
drop policy if exists admins_lectura_propia on public.admins;
create policy admins_lectura_propia on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Devuelve true si el usuario autenticado actual es admin.
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;

grant execute on function public.es_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.categorias    enable row level security;
alter table public.platos        enable row level security;
alter table public.pedidos       enable row level security;
alter table public.pedido_items  enable row level security;

-- Categorías y platos: lectura pública, escritura solo admin.
drop policy if exists categorias_lectura_publica on public.categorias;
create policy categorias_lectura_publica on public.categorias
  for select using (true);

drop policy if exists categorias_admin_todo on public.categorias;
create policy categorias_admin_todo on public.categorias
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists platos_lectura_publica on public.platos;
create policy platos_lectura_publica on public.platos
  for select using (true);

drop policy if exists platos_admin_todo on public.platos;
create policy platos_admin_todo on public.platos
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Pedidos e items: solo admins pueden leer/actualizar.
-- El público NO tiene políticas de select: no puede listar pedidos.
drop policy if exists pedidos_admin_todo on public.pedidos;
create policy pedidos_admin_todo on public.pedidos
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists pedido_items_admin_todo on public.pedido_items;
create policy pedido_items_admin_todo on public.pedido_items
  for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------------------------------------------------------------------------
-- crear_pedido(): única vía pública para crear un pedido.
-- Precios y disponibilidad se leen de la BD (no se confía en el cliente).
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
  v_id    uuid;
  v_total numeric(10, 2);
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

  insert into pedido_items (pedido_id, plato_id, nombre, precio, cantidad)
  select v_id, p.id, p.nombre, p.precio, greatest((it ->> 'cantidad')::int, 0)
  from jsonb_array_elements(p_items) as it
  join platos p on p.id = (it ->> 'plato_id')::uuid
  where p.disponible = true
    and (it ->> 'cantidad')::int > 0;

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

-- ---------------------------------------------------------------------------
-- Storage: bucket público para las fotos de los platos
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('platos', 'platos', true)
on conflict (id) do nothing;

drop policy if exists platos_storage_lectura on storage.objects;
create policy platos_storage_lectura on storage.objects
  for select using (bucket_id = 'platos');

drop policy if exists platos_storage_admin on storage.objects;
create policy platos_storage_admin on storage.objects
  for all to authenticated
  using (bucket_id = 'platos' and public.es_admin())
  with check (bucket_id = 'platos' and public.es_admin());

-- ---------------------------------------------------------------------------
-- Realtime para el dashboard de pedidos
-- ---------------------------------------------------------------------------

alter table public.pedidos replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end;
$$;
