import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import type { MesaAbierta, MesaCerrada, Pedido } from "@/lib/pedidos";
import PedidosCliente from "./PedidosCliente";

export const instant = false;

const PEDIDO_SELECT =
  "id, numero, tipo, origen, estado, mesa, cliente_nombre, cliente_telefono, direccion, lugar, notas, total, mesero_user_id, mesero_nombre, created_at, updated_at, pedido_items(id, pedido_id, plato_id, nombre, precio, cantidad, opciones, adiciones)";

export default async function PedidosPage() {
  await requireAdmin();

  const supabase = await createClient();
  const [pedidosRes, sesionesRes, cerradasRes] = await Promise.all([
    supabase
      .from("pedidos")
      .select(PEDIDO_SELECT)
      .order("created_at", { ascending: false })
      .limit(150),
    supabase
      .from("mesas_abiertas")
      .select(
        "id, mesa, mesero_user_id, mesero_nombre, abierta_at, estado, cerrada_at",
      )
      .eq("estado", "abierta")
      .order("mesa", { ascending: true }),
    supabase
      .from("mesas_abiertas")
      .select(
        `id, mesa, mesero_user_id, mesero_nombre, abierta_at, estado, cerrada_at, pedidos(${PEDIDO_SELECT})`,
      )
      .eq("estado", "cerrada")
      .order("cerrada_at", { ascending: false }),
  ]);

  if (pedidosRes.error) {
    console.error("[PedidosPage] pedidos", pedidosRes.error);
  }
  if (sesionesRes.error) {
    console.error("[PedidosPage] sesiones", sesionesRes.error);
  }
  if (cerradasRes.error) {
    console.error("[PedidosPage] historial", cerradasRes.error);
  }

  const mesasCerradas = ((cerradasRes.data ?? []) as MesaCerrada[]).map(
    (sesion) => ({
      ...sesion,
      pedidos: [...(sesion.pedidos ?? [])].sort((a, b) =>
        a.created_at.localeCompare(b.created_at),
      ),
    }),
  );

  return (
    <PedidosCliente
      pedidos={(pedidosRes.data ?? []) as Pedido[]}
      mesasAbiertas={(sesionesRes.data ?? []) as MesaAbierta[]}
      mesasCerradas={mesasCerradas}
    />
  );
}
