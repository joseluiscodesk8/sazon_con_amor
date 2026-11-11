"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoResult = { ok: true } | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ESTADOS_ACTIVOS = ["nuevo", "en_preparacion", "listo", "en_camino"];

export async function cancelarPedido(
  pedidoId: string,
): Promise<EstadoResult> {
  await requireAdmin();

  if (!UUID_RE.test(pedidoId)) {
    return { ok: false, error: "Pedido inválido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .update({ estado: "cancelado" })
    .eq("id", pedidoId)
    .in("estado", ESTADOS_ACTIVOS)
    .select("id");

  if (error) {
    console.error("[cancelarPedido]", error);
    return { ok: false, error: "No se pudo cancelar el pedido." };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "El pedido ya no está activo." };
  }

  return { ok: true };
}

export async function eliminarPedido(
  pedidoId: string,
): Promise<EstadoResult> {
  await requireAdmin();

  if (!UUID_RE.test(pedidoId)) {
    return { ok: false, error: "Pedido inválido." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pedidos")
    .delete()
    .eq("id", pedidoId)
    .select("id");

  if (error) {
    console.error("[eliminarPedido]", error);
    return { ok: false, error: "No se pudo eliminar el pedido." };
  }

  if (!data || data.length === 0) {
    return { ok: false, error: "El pedido no existe." };
  }

  return { ok: true };
}

export async function cerrarMesa(mesa: number): Promise<EstadoResult> {
  await requireAdmin();

  if (!Number.isInteger(mesa) || mesa < 1 || mesa > 60) {
    return { ok: false, error: "Mesa inválida." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("cerrar_mesa", { p_mesa: mesa });

  if (error) {
    console.error("[cerrarMesa]", error);
    return { ok: false, error: "No se pudo cerrar la mesa." };
  }

  if (data !== true) {
    return { ok: false, error: "La mesa ya no está abierta." };
  }

  revalidatePath("/admin");
  revalidatePath("/mesero");

  return { ok: true };
}

export async function limpiarHistorialMesas(): Promise<EstadoResult> {
  await requireAdmin();

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("limpiar_historial_mesas");

  if (error) {
    console.error("[limpiarHistorialMesas]", error);
    return { ok: false, error: "No se pudo borrar el historial." };
  }

  revalidatePath("/admin");

  return { ok: true };
}
