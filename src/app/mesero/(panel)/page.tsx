import { requireMesero } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getMenu } from "@/app/menu/data";
import type { MesaAbierta, Pedido } from "@/lib/pedidos";
import MeseroCliente from "./MeseroCliente";

export const instant = false;

const ESTADOS_ACTIVOS = ["nuevo", "en_preparacion", "listo"];

export default async function MeseroPage() {
  const { perfil } = await requireMesero();
  const menu = await getMenu();
  const supabase = await createClient("mesero");

  const [pedidosRes, sesionesRes] = await Promise.all([
    supabase
      .from("pedidos")
      .select(
        "id, numero, tipo, origen, estado, mesa, cliente_nombre, cliente_telefono, direccion, lugar, notas, total, mesero_user_id, mesero_nombre, created_at, updated_at, pedido_items(id, pedido_id, plato_id, nombre, precio, cantidad, opciones, adiciones)",
      )
      .eq("tipo", "restaurante")
      .eq("origen", "mesero")
      .in("estado", ESTADOS_ACTIVOS)
      .order("created_at", { ascending: true })
      .limit(150),
    supabase
      .from("mesas_abiertas")
      .select("id, mesa, mesero_user_id, mesero_nombre, abierta_at")
      .order("mesa", { ascending: true }),
  ]);

  if (pedidosRes.error) {
    console.error("[MeseroPage] pedidos", pedidosRes.error);
  }
  if (sesionesRes.error) {
    console.error("[MeseroPage] sesiones", sesionesRes.error);
  }

  return (
    <MeseroCliente
      menu={menu}
      pedidos={(pedidosRes.data ?? []) as Pedido[]}
      mesasAbiertas={(sesionesRes.data ?? []) as MesaAbierta[]}
      meseroId={perfil.user_id}
      mesero={perfil.nombre?.trim() || perfil.usuario?.trim() || "Mesero"}
    />
  );
}
