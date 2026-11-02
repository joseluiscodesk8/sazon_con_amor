"use server";

import { updateTag } from "next/cache";
import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

export type LugarInput = {
  id?: string;
  nombre: string;
  direccion: string;
  activo: boolean;
};

export async function guardarLugar(input: LugarInput): Promise<ActionResult> {
  await requireAdmin();

  const nombre = input.nombre.trim();
  const direccion = input.direccion.trim();

  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  if (!direccion) return { ok: false, error: "La dirección es obligatoria." };

  const supabase = await createClient();
  const valores = { nombre, direccion, activo: input.activo };

  const { error } = input.id
    ? await supabase.from("lugares").update(valores).eq("id", input.id)
    : await supabase.from("lugares").insert(valores);

  if (error) {
    console.error("[guardarLugar]", error);
    return { ok: false, error: "No se pudo guardar el lugar." };
  }

  updateTag("lugares");
  return { ok: true };
}

export async function eliminarLugar(id: string): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("lugares").delete().eq("id", id);

  if (error) {
    console.error("[eliminarLugar]", error);
    return { ok: false, error: "No se pudo eliminar el lugar." };
  }

  updateTag("lugares");
  return { ok: true };
}

export async function cambiarActivoLugar(
  id: string,
  activo: boolean,
): Promise<ActionResult> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("lugares")
    .update({ activo })
    .eq("id", id);

  if (error) {
    console.error("[cambiarActivoLugar]", error);
    return { ok: false, error: "No se pudo actualizar el lugar." };
  }

  updateTag("lugares");
  return { ok: true };
}
