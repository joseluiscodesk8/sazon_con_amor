import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { MesaAbierta, Pedido } from "@/lib/pedidos";
import PedidosCliente from "./PedidosCliente";

export const instant = false;

export default async function PedidosPage() {
  await requireAdmin();

  const supabase = await createClient();
  const [pedidosRes, sesionesRes] = await Promise.all([
    supabase
      .from("pedidos")
      .select(
        "id, numero, tipo, origen, estado, mesa, cliente_nombre, cliente_telefono, direccion, lugar, notas, total, mesero_user_id, mesero_nombre, created_at, updated_at, pedido_items(id, pedido_id, plato_id, nombre, precio, cantidad, opciones, adiciones)",
      )
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("mesas_abiertas")
      .select("id, mesa, mesero_user_id, mesero_nombre, abierta_at")
      .order("mesa", { ascending: true }),
  ]);

  if (pedidosRes.error) {
    console.error("[PedidosPage] pedidos", pedidosRes.error);
  }
  if (sesionesRes.error) {
    console.error("[PedidosPage] sesiones", sesionesRes.error);
  }

  return (
    <PedidosCliente
      pedidos={(pedidosRes.data ?? []) as Pedido[]}
      mesasAbiertas={(sesionesRes.data ?? []) as MesaAbierta[]}
    />
  );
}
