-- Datos de ejemplo (OPCIONAL). Ejecutar en el SQL Editor de Supabase
-- solo si quieres ver el menú con platos de prueba. Puedes borrarlos
-- luego desde /admin/menu.

insert into public.categorias (nombre, orden, activa) values
  ('Desayunos', 1, true),
  ('Almuerzos', 2, true),
  ('Bebidas', 3, true);

insert into public.platos (categoria_id, nombre, descripcion, precio, disponible, orden)
select id, 'Calentado con huevo', 'Frijoles, arroz, arepa y huevo al gusto', 12000, true, 1
from public.categorias where nombre = 'Desayunos';

insert into public.platos (categoria_id, nombre, descripcion, precio, disponible, orden)
select id, 'Arepa con queso', 'Arepa asada con queso campesino', 8000, true, 2
from public.categorias where nombre = 'Desayunos';

insert into public.platos (categoria_id, nombre, descripcion, precio, disponible, orden)
select id, 'Bandeja paisa', 'Frijoles, chicharrón, carne, chorizo, huevo, arroz y aguacate', 28000, true, 1
from public.categorias where nombre = 'Almuerzos';

insert into public.platos (categoria_id, nombre, descripcion, precio, disponible, orden)
select id, 'Pollo asado', 'Pollo a la brasa con papas y ensalada', 22000, true, 2
from public.categorias where nombre = 'Almuerzos';

insert into public.platos (categoria_id, nombre, descripcion, precio, disponible, orden)
select id, 'Limonada natural', 'Limonada con panela o azúcar', 6000, true, 1
from public.categorias where nombre = 'Bebidas';
