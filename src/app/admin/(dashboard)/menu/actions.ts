"use server";

import { updateTag } from "next/cache";
import { detectarImagen } from "@/lib/imagen-servidor";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { esNombreDeSubcategoria } from "@/lib/subcategorias";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CategoriaInput = {
  id?: string;
  nombre: string;
  orden: number;
  activa: boolean;
  es_subcategoria?: boolean;
};

export type PlatoInput = {
  id?: string;
  categoria_id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  disponible: boolean;
  imagen_url: string | null;
  orden: number;
};

export type AdicionInput = {
  id?: string;
  nombre: string;
  precio: number;
  disponible: boolean;
};

function refrescarMenuPublico() {
  updateTag("menu");
}

export async function guardarCategoria(
  input: CategoriaInput,
): Promise<ActionResult> {
  await requireAdmin();

  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };

  const supabase = await createClient();
  const valores = {
    nombre,
    orden: Number(input.orden) || 0,
    activa: input.activa,
    es_subcategoria:
      input.es_subcategoria ?? esNombreDeSubcategoria(nombre),
  };

  const { error } = input.id
    ? await supabase.from("categorias").update(valores).eq("id", input.id)
    : await supabase.from("categorias").insert(valores);

  if (error) {
    console.error("[guardarCategoria]", error);
    return { ok: false, error: "No se pudo guardar la categoría." };
  }

  refrescarMenuPublico();
  return { ok: true, data: undefined };
}

export async function eliminarCategoria(id: string): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("categorias").delete().eq("id", id);

  if (error) {
    console.error("[eliminarCategoria]", error);
    return { ok: false, error: "No se pudo eliminar la categoría." };
  }

  refrescarMenuPublico();
  return { ok: true, data: undefined };
}

export async function guardarPlato(
  input: PlatoInput,
): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();

  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  if (!input.categoria_id) {
    return { ok: false, error: "Selecciona una categoría." };
  }

  const supabase = await createClient();

  const { data: categoria } = await supabase
    .from("categorias")
    .select("es_subcategoria")
    .eq("id", input.categoria_id)
    .maybeSingle();

  const esSub = categoria?.es_subcategoria ?? false;

  if (!esSub && !(input.precio >= 0)) {
    return { ok: false, error: "El precio no es válido." };
  }

  const valores = {
    categoria_id: input.categoria_id,
    nombre,
    descripcion: esSub ? null : input.descripcion.trim() || null,
    precio: esSub ? 0 : input.precio,
    disponible: input.disponible,
    imagen_url: esSub ? null : input.imagen_url,
    orden: Number(input.orden) || 0,
  };

  const { data, error } = input.id
    ? await supabase
        .from("platos")
        .update(valores)
        .eq("id", input.id)
        .select("id")
        .single()
    : await supabase.from("platos").insert(valores).select("id").single();

  if (error || !data) {
    console.error("[guardarPlato]", error);
    return { ok: false, error: "No se pudo guardar el plato." };
  }

  refrescarMenuPublico();
  return { ok: true, data: { id: data.id } };
}

export async function eliminarPlato(id: string): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("platos").delete().eq("id", id);

  if (error) {
    console.error("[eliminarPlato]", error);
    return { ok: false, error: "No se pudo eliminar el plato." };
  }

  refrescarMenuPublico();
  return { ok: true, data: undefined };
}

export async function cambiarDisponiblePlato(
  id: string,
  disponible: boolean,
): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("platos")
    .update({ disponible })
    .eq("id", id);

  if (error) {
    console.error("[cambiarDisponiblePlato]", error);
    return { ok: false, error: "No se pudo actualizar." };
  }

  refrescarMenuPublico();
  return { ok: true, data: undefined };
}

export async function guardarAdicion(
  input: AdicionInput,
): Promise<ActionResult> {
  await requireAdmin();

  const nombre = input.nombre.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  if (!(input.precio >= 0)) {
    return { ok: false, error: "El precio no es válido." };
  }

  const supabase = await createClient();
  const valores = {
    nombre,
    precio: input.precio,
    disponible: input.disponible,
  };

  const { error } = input.id
    ? await supabase.from("adiciones").update(valores).eq("id", input.id)
    : await supabase.from("adiciones").insert(valores);

  if (error) {
    console.error("[guardarAdicion]", error);
    return { ok: false, error: "No se pudo guardar la adición." };
  }

  refrescarMenuPublico();
  return { ok: true, data: undefined };
}

export async function eliminarAdicion(id: string): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("adiciones").delete().eq("id", id);

  if (error) {
    console.error("[eliminarAdicion]", error);
    return { ok: false, error: "No se pudo eliminar la adición." };
  }

  refrescarMenuPublico();
  return { ok: true, data: undefined };
}

export async function cambiarDisponibleAdicion(
  id: string,
  disponible: boolean,
): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("adiciones")
    .update({ disponible })
    .eq("id", id);

  if (error) {
    console.error("[cambiarDisponibleAdicion]", error);
    return { ok: false, error: "No se pudo actualizar." };
  }

  refrescarMenuPublico();
  return { ok: true, data: undefined };
}

export async function subirImagenPlato(
  formData: FormData,
): Promise<ActionResult<{ url: string }>> {
  await requireAdmin();

  const archivo = formData.get("file");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Selecciona una imagen." };
  }

  if (archivo.size > 4 * 1024 * 1024) {
    return { ok: false, error: "La imagen no puede pesar más de 4 MB." };
  }

  const imagen = await detectarImagen(archivo);
  if (!imagen) {
    return {
      ok: false,
      error: "Formato no permitido. Usa JPG, PNG, WebP o GIF.",
    };
  }

  const ruta = `${crypto.randomUUID()}.${imagen.extension}`;

  const supabase = await createClient();
  const { error } = await supabase.storage
    .from("platos")
    .upload(ruta, archivo, { contentType: imagen.mime, upsert: false });

  if (error) {
    console.error("[subirImagenPlato]", error);
    return { ok: false, error: "No se pudo subir la imagen." };
  }

  const { data } = supabase.storage.from("platos").getPublicUrl(ruta);
  return { ok: true, data: { url: data.publicUrl } };
}
