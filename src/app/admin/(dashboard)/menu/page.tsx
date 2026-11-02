import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import MenuAdmin from "./MenuAdmin";
import type { AdminAdicion, AdminCategoria, AdminPlato } from "./types";

export const instant = false;

export default async function AdminMenuPage() {
  await requireAdmin();

  const supabase = await createClient();

  const [categoriasRes, platosRes, adicionesRes] = await Promise.all([
    supabase
      .from("categorias")
      .select("id, nombre, orden, activa, es_subcategoria")
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

  if (categoriasRes.error || platosRes.error || adicionesRes.error) {
    console.error(
      "[AdminMenuPage]",
      categoriasRes.error ?? platosRes.error ?? adicionesRes.error,
    );
  }

  const platos: AdminPlato[] = (platosRes.data ?? []).map((plato) => ({
    ...plato,
    precio: Number(plato.precio),
  }));

  const adiciones: AdminAdicion[] = (adicionesRes.data ?? []).map(
    (adicion) => ({
      ...adicion,
      precio: Number(adicion.precio),
    }),
  );

  return (
    <MenuAdmin
      categorias={(categoriasRes.data ?? []) as AdminCategoria[]}
      platos={platos}
      adiciones={adiciones}
    />
  );
}
