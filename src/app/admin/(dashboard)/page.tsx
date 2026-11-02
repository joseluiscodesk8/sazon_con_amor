import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { Pedido } from "@/lib/pedidos";
import PedidosCliente from "./PedidosCliente";

export const instant = false;

export default async function PedidosPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .select(
      "id, numero, tipo, estado, mesa, cliente_nombre, cliente_telefono, direccion, lugar, notas, total, created_at, updated_at, pedido_items(id, pedido_id, plato_id, nombre, precio, cantidad, opciones, adiciones)",
    )
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    console.error("[PedidosPage]", error);
  }

  return <PedidosCliente pedidos={(data ?? []) as Pedido[]} />;
}
