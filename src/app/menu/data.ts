import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export type Opcion = {
  id: string;
  nombre: string;
};

export type Subcategoria = {
  id: string;
  nombre: string;
  opciones: Opcion[];
};

export type Adicion = {
  id: string;
  nombre: string;
  precio: number;
};

export type Plato = {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagen_url: string | null;
  disponible: boolean;
  subcategorias: Subcategoria[];
  adiciones: Adicion[];
};

export type Categoria = {
  id: string;
  nombre: string;
  platos: Plato[];
};

export type Menu = Categoria[];

export type Lugar = {
  id: string;
  nombre: string;
  direccion: string;
};

export async function getLugares(): Promise<Lugar[]> {
  "use cache";
  cacheTag("lugares");
  cacheLife("hours");

  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("lugares")
    .select("id, nombre, direccion")
    .eq("activo", true)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[getLugares]", error);
    return [];
  }

  return data ?? [];
}

export async function getMenu(): Promise<Menu> {
  "use cache";
  cacheTag("menu");
  cacheLife("hours");

  const supabase = createPublicClient();

  const [categoriasRes, platosRes, adicionesRes] = await Promise.all([
    supabase
      .from("categorias")
      .select("id, nombre, orden, es_subcategoria")
      .eq("activa", true)
      .order("orden", { ascending: true }),
    supabase
      .from("platos")
      .select(
        "id, categoria_id, nombre, descripcion, precio, imagen_url, disponible, orden",
      )
      .order("orden", { ascending: true }),
    supabase
      .from("adiciones")
      .select("id, nombre, precio, disponible")
      .order("created_at", { ascending: true }),
  ]);

  if (categoriasRes.error || platosRes.error) {
    console.error(
      "[getMenu]",
      categoriasRes.error ?? platosRes.error,
    );
    return [];
  }

  if (adicionesRes.error) {
    console.error("[getMenu] adiciones", adicionesRes.error);
  }

  const categorias = categoriasRes.data ?? [];
  const platos = platosRes.data ?? [];

  const subcategorias = new Map<
    string,
    { id: string; nombre: string; opciones: Opcion[] }
  >();
  for (const categoria of categorias) {
    if (categoria.es_subcategoria) {
      subcategorias.set(categoria.id, {
        id: categoria.id,
        nombre: categoria.nombre,
        opciones: [],
      });
    }
  }

  // Las opciones son los platos (sin foto ni precio) de cada subcategoría.
  // Solo se ofrecen las opciones disponibles.
  for (const fila of platos) {
    const sub = subcategorias.get(fila.categoria_id);
    if (sub && fila.disponible) {
      sub.opciones.push({ id: fila.id, nombre: fila.nombre });
    }
  }

  // Las subcategorías y adiciones son globales: se ofrecen en todos los platos.
  const adicionesPorId = new Map<string, Adicion>();
  for (const fila of adicionesRes.data ?? []) {
    if (fila.disponible) {
      adicionesPorId.set(fila.id, {
        id: fila.id,
        nombre: fila.nombre,
        precio: Number(fila.precio),
      });
    }
  }

  const subcategoriasDisponibles = [...subcategorias.values()].filter(
    (sub) => sub.opciones.length > 0,
  );

  const adicionesDisponibles = [...adicionesPorId.values()];

  const platosPorCategoria = new Map<string, Plato[]>();
  for (const fila of platos) {
    if (subcategorias.has(fila.categoria_id)) continue;

    const plato: Plato = {
      id: fila.id,
      categoria_id: fila.categoria_id,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      precio: Number(fila.precio),
      imagen_url: fila.imagen_url,
      disponible: fila.disponible,
      subcategorias: subcategoriasDisponibles,
      adiciones: adicionesDisponibles,
    };

    const lista = platosPorCategoria.get(plato.categoria_id) ?? [];
    lista.push(plato);
    platosPorCategoria.set(plato.categoria_id, lista);
  }

  return categorias
    .filter((categoria) => !categoria.es_subcategoria)
    .map((categoria) => ({
      id: categoria.id,
      nombre: categoria.nombre,
      platos: platosPorCategoria.get(categoria.id) ?? [],
    }));
}
