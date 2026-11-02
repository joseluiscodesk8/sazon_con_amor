"use server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { ESTADOS, type EstadoPedido } from "@/lib/pedidos";

export type EstadoResult = { ok: true } | { ok: false; error: string };

export async function cambiarEstado(
  pedidoId: string,
  estado: EstadoPedido,
): Promise<EstadoResult> {
  await requireAdmin();

  if (!ESTADOS.includes(estado)) {
    return { ok: false, error: "Estado inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pedidos")
    .update({ estado })
    .eq("id", pedidoId);

  if (error) {
    console.error("[cambiarEstado]", error);
    return { ok: false, error: "No se pudo actualizar el pedido." };
  }

  return { ok: true };
}

export async function cerrarMesa(mesa: number): Promise<EstadoResult> {
  await requireAdmin();

  if (!Number.isInteger(mesa) || mesa <= 0) {
    return { ok: false, error: "Mesa inválida." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("pedidos")
    .update({ estado: "entregado" })
    .eq("tipo", "restaurante")
    .eq("mesa", mesa)
    .in("estado", ["nuevo", "en_preparacion", "listo"]);

  if (error) {
    console.error("[cerrarMesa]", error);
    return { ok: false, error: "No se pudo cerrar la mesa." };
  }

  return { ok: true };
}
