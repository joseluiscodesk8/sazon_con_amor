"use server";

import { createPublicClient } from "@/lib/supabase/public";
import type { EstadoPedido } from "@/lib/pedidos";

export type CrearPedidoInput = {
  modo: "domicilio" | "restaurante";
  nombre: string;
  telefono?: string;
  direccion?: string;
  lugar?: string;
  mesa?: number | null;
  notas?: string;
  items: {
    plato_id: string;
    cantidad: number;
    opciones?: { subcategoria_id: string; opcion_id: string }[];
    adiciones?: { adicion_id: string }[];
  }[];
};

export type CrearPedidoResult =
  | { ok: true; total: number; token: string }
  | { ok: false; error: string };

export type ActualizarPedidoInput = {
  token: string;
  nombre: string;
  telefono?: string;
  direccion?: string;
  lugar?: string;
  notas?: string;
  items: {
    plato_id: string;
    cantidad: number;
    opciones?: { subcategoria_id: string; opcion_id: string }[];
    adiciones?: { adicion_id: string }[];
  }[];
};

export type ActualizarPedidoResult =
  | { ok: true; total: number }
  | { ok: false; error: string };

export type EstadoPedidoResult =
  | {
      ok: true;
      estado: EstadoPedido;
      segundosRestantes: number;
      total: number;
      creadoEn: string;
    }
  | { ok: false; error: string };

export async function crearPedido(
  input: CrearPedidoInput,
): Promise<CrearPedidoResult> {
  const nombre = input.nombre?.trim();
  const items = (input.items ?? []).filter((i) => i.cantidad > 0);

  if (!nombre) return { ok: false, error: "Escribe tu nombre." };
  if (items.length === 0) return { ok: false, error: "Tu carrito está vacío." };

  if (input.modo === "domicilio" && !input.direccion?.trim()) {
    return { ok: false, error: "Escribe la dirección de entrega." };
  }

  if (input.modo === "restaurante" && !input.mesa) {
    return { ok: false, error: "Selecciona el número de mesa." };
  }

  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc("crear_pedido", {
    p_tipo: input.modo,
    p_mesa: input.modo === "restaurante" ? (input.mesa ?? null) : null,
    p_cliente_nombre: nombre,
    p_cliente_telefono: input.telefono?.trim() || null,
    p_direccion: input.modo === "domicilio" ? input.direccion!.trim() : null,
    p_lugar: input.lugar?.trim() || null,
    p_notas: input.notas?.trim() || null,
    p_items: items.map((i) => ({
      plato_id: i.plato_id,
      cantidad: i.cantidad,
      opciones: i.opciones ?? [],
      adiciones: i.adiciones ?? [],
    })),
  });

  if (error) {
    console.error("[crearPedido]", error);
    return {
      ok: false,
      error: "No pudimos registrar tu pedido. Intenta de nuevo.",
    };
  }

  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila) {
    return { ok: false, error: "No pudimos registrar tu pedido." };
  }

  return {
    ok: true,
    total: Number(fila.total),
    token: String(fila.token),
  };
}

export async function actualizarPedido(
  input: ActualizarPedidoInput,
): Promise<ActualizarPedidoResult> {
  const nombre = input.nombre?.trim();
  const items = (input.items ?? []).filter((i) => i.cantidad > 0);

  if (!input.token) {
    return { ok: false, error: "No encontramos tu pedido." };
  }
  if (!nombre) return { ok: false, error: "Escribe tu nombre." };
  if (items.length === 0) return { ok: false, error: "Tu carrito está vacío." };
  if (!input.direccion?.trim()) {
    return { ok: false, error: "Escribe la dirección de entrega." };
  }

  const supabase = createPublicClient();

  const { data, error } = await supabase.rpc("actualizar_pedido", {
    p_token: input.token,
    p_cliente_nombre: nombre,
    p_cliente_telefono: input.telefono?.trim() || null,
    p_direccion: input.direccion.trim(),
    p_lugar: input.lugar?.trim() || null,
    p_notas: input.notas?.trim() || null,
    p_items: items.map((i) => ({
      plato_id: i.plato_id,
      cantidad: i.cantidad,
      opciones: i.opciones ?? [],
      adiciones: i.adiciones ?? [],
    })),
  });

  if (error) {
    console.error("[actualizarPedido]", error);
    const mensaje = error.message ?? "";
    if (mensaje.includes("tiempo para modificar")) {
      return {
        ok: false,
        error: "El tiempo para modificar tu pedido terminó.",
      };
    }
    if (mensaje.includes("no se puede editar")) {
      return {
        ok: false,
        error:
          "Tu pedido ya está en preparación y no se puede editar. Llámanos si necesitas un cambio.",
      };
    }
    if (mensaje.includes("no encontrado")) {
      return {
        ok: false,
        error: "No encontramos tu pedido. Puede que ya no esté disponible.",
      };
    }
    return {
      ok: false,
      error: "No pudimos actualizar tu pedido. Intenta de nuevo.",
    };
  }

  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila) {
    return { ok: false, error: "No pudimos actualizar tu pedido." };
  }

  return {
    ok: true,
    total: Number(fila.total),
  };
}

export async function estadoPedido(token: string): Promise<EstadoPedidoResult> {
  if (!token) {
    return { ok: false, error: "No encontramos tu pedido." };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("estado_pedido", {
    p_token: token,
  });

  if (error) {
    console.error("[estadoPedido]", error);
    return { ok: false, error: "No pudimos consultar tu pedido." };
  }

  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila) {
    return { ok: false, error: "No encontramos tu pedido." };
  }

  return {
    ok: true,
    estado: fila.estado as EstadoPedido,
    segundosRestantes: Number(fila.segundos_restantes),
    total: Number(fila.total),
    creadoEn: String(fila.creado),
  };
}
