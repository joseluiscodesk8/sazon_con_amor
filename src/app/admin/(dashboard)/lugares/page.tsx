import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import LugaresAdmin from "./LugaresAdmin";
import type { AdminLugar } from "./types";

export const instant = false;

export default async function AdminLugaresPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lugares")
    .select("id, nombre, direccion, activo, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[AdminLugaresPage]", error);
  }

  return <LugaresAdmin lugares={(data ?? []) as AdminLugar[]} />;
}
