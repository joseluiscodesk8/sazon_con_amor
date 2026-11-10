"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireMesero } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type PedidoItemInput = {
  plato_id: string;
  cantidad: number;
  opciones?: { subcategoria_id: string; opcion_id: string }[];
  adiciones?: { adicion_id: string }[];
};

export type AbrirMesaInput = {
  mesa: number;
};

export type AbrirMesaResult =
  | { ok: true; mesa: number }
  | { ok: false; error: string };

export type GuardarPedidoMesaInput = {
  mesa: number;
  notas?: string;
  items: PedidoItemInput[];
  idempotencia?: string;
};

export type PedidoMesaResult =
  | { ok: true; numero: number; total: number; creado: boolean }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nombreMesero(perfil: {
  nombre: string | null;
  usuario: string | null;
}) {
  return (perfil.nombre?.trim() || perfil.usuario?.trim() || "Mesero").slice(
    0,
    80,
  );
}

export async function abrirMesa(
  input: AbrirMesaInput,
): Promise<AbrirMesaResult> {
  const { perfil } = await requireMesero();

  const mesa = Number(input.mesa);
  if (!Number.isInteger(mesa) || mesa < 1 || mesa > 60) {
    return { ok: false, error: "Selecciona una mesa válida." };
  }

  const supabase = createAdminClient();

  const { data: permitido, error: errorLimite } = await supabase.rpc(
    "consumir_limite",
    {
      p_clave: `mesero:abrir:${perfil.user_id}`,
      p_limite: 120,
      p_ventana_segundos: 600,
    },
  );

  if (errorLimite || permitido !== true) {
    if (errorLimite) console.error("[abrirMesa] limite", errorLimite);
    return {
      ok: false,
      error: "Demasiadas solicitudes seguidas. Espera unos minutos.",
    };
  }

  const { error } = await supabase.rpc("abrir_mesa", {
    p_mesa: mesa,
    p_mesero_user_id: perfil.user_id,
    p_mesero_nombre: nombreMesero(perfil),
  });

  if (error) {
    console.error("[abrirMesa]", error);
    const mensaje = error.message ?? "";
    if (mensaje.includes("ya está abierta por")) {
      return { ok: false, error: mensaje };
    }
    return { ok: false, error: "No se pudo abrir la mesa. Intenta de nuevo." };
  }

  revalidatePath("/admin");
  revalidatePath("/mesero");

  return { ok: true, mesa };
}

export async function guardarPedidoMesa(
  input: GuardarPedidoMesaInput,
): Promise<PedidoMesaResult> {
  const { perfil } = await requireMesero();

  const mesa = Number(input.mesa);
  if (!Number.isInteger(mesa) || mesa < 1 || mesa > 60) {
    return { ok: false, error: "Selecciona una mesa válida." };
  }

  const items = (input.items ?? []).filter(
    (item) =>
      item &&
      typeof item.plato_id === "string" &&
      Number.isInteger(item.cantidad) &&
      item.cantidad > 0,
  );

  if (items.length === 0) {
    return { ok: false, error: "Agrega al menos un plato." };
  }
  if (items.length > 50) {
    return { ok: false, error: "El pedido tiene demasiados ítems." };
  }
  if (items.some((item) => item.cantidad > 20)) {
    return { ok: false, error: "La cantidad máxima por plato es 20." };
  }

  const notas = input.notas?.trim() ?? "";
  if (notas.length > 500) {
    return { ok: false, error: "Las notas son demasiado largas." };
  }

  const idempotencia = input.idempotencia?.trim() || randomUUID();
  if (!UUID_RE.test(idempotencia)) {
    return { ok: false, error: "No pudimos registrar el pedido." };
  }

  const supabase = createAdminClient();

  const { data: permitido, error: errorLimite } = await supabase.rpc(
    "consumir_limite",
    {
      p_clave: `mesero:guardar:${perfil.user_id}`,
      p_limite: 60,
      p_ventana_segundos: 600,
    },
  );

  if (errorLimite || permitido !== true) {
    if (errorLimite) console.error("[guardarPedidoMesa] limite", errorLimite);
    return {
      ok: false,
      error: "Demasiados pedidos seguidos. Espera unos minutos.",
    };
  }

  const { data, error } = await supabase.rpc("guardar_pedido_mesa", {
    p_mesa: mesa,
    p_mesero_user_id: perfil.user_id,
    p_mesero_nombre: nombreMesero(perfil),
    p_notas: notas || null,
    p_items: items.map((item) => ({
      plato_id: item.plato_id,
      cantidad: item.cantidad,
      opciones: item.opciones ?? [],
      adiciones: item.adiciones ?? [],
    })),
    p_idempotencia: idempotencia,
  });

  if (error) {
    console.error("[guardarPedidoMesa]", error);
    const mensaje = error.message ?? "";
    if (
      mensaje.includes("La mesa no está abierta") ||
      mensaje.includes("La mesa está abierta por otro mesero")
    ) {
      return { ok: false, error: "La mesa ya no está disponible. Vuelve a elegirla." };
    }
    if (mensaje.includes("Agrega al menos un plato")) {
      return { ok: false, error: "Agrega al menos un plato." };
    }
    return { ok: false, error: "No pudimos registrar el pedido. Intenta de nuevo." };
  }

  const fila = Array.isArray(data) ? data[0] : null;
  if (!fila) {
    return { ok: false, error: "No pudimos registrar el pedido." };
  }

  revalidatePath("/admin");
  revalidatePath("/mesero");

  return {
    ok: true,
    numero: Number(fila.numero),
    total: Number(fila.total),
    creado: Boolean(fila.creado),
  };
}
