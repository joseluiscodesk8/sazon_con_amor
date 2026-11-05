"use server";

import { createHash, randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EstadoPedido } from "@/lib/pedidos";

export type CrearPedidoInput = {
  modo: "domicilio" | "restaurante";
  nombre: string;
  telefono?: string;
  direccion?: string;
  lugar?: string;
  mesa?: number | null;
  notas?: string;
  idempotencia?: string;
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClientePedidos = ReturnType<typeof createAdminClient>;

async function hashIp() {
  const encabezados = await headers();
  const ip =
    encabezados.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    encabezados.get("x-real-ip") ||
    "local";

  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function hashTelefono(telefono: string) {
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length < 7) return null;

  return createHash("sha256").update(digitos).digest("hex").slice(0, 32);
}

async function consumirLimite(
  supabase: ClientePedidos,
  clave: string,
  limite: number,
  ventanaSegundos: number,
) {
  const { data, error } = await supabase.rpc("consumir_limite", {
    p_clave: clave,
    p_limite: limite,
    p_ventana_segundos: ventanaSegundos,
  });

  if (error) {
    console.error("[consumirLimite]", error);
    return false;
  }

  return data === true;
}

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

  if (items.length > 50) {
    return { ok: false, error: "El pedido tiene demasiados ítems." };
  }

  const idempotencia = input.idempotencia?.trim() || randomUUID();
  if (!UUID_RE.test(idempotencia)) {
    return { ok: false, error: "No pudimos registrar tu pedido." };
  }

  const supabase = createAdminClient();
  const ip = await hashIp();

  if (!(await consumirLimite(supabase, `crear:ip:${ip}`, 10, 600))) {
    return {
      ok: false,
      error: "Has hecho demasiados intentos. Espera unos minutos.",
    };
  }

  const telefono = input.telefono?.trim();
  const telefonoHash = telefono ? hashTelefono(telefono) : null;

  if (
    telefonoHash &&
    !(await consumirLimite(supabase, `crear:tel:${telefonoHash}`, 3, 3600))
  ) {
    return {
      ok: false,
      error: "Has hecho demasiados pedidos. Espera un momento.",
    };
  }

  const { data, error } = await supabase.rpc("crear_pedido", {
    p_tipo: input.modo,
    p_mesa: input.modo === "restaurante" ? (input.mesa ?? null) : null,
    p_cliente_nombre: nombre,
    p_cliente_telefono: telefono || null,
    p_direccion: input.modo === "domicilio" ? input.direccion!.trim() : null,
    p_lugar: input.lugar?.trim() || null,
    p_notas: input.notas?.trim() || null,
    p_items: items.map((i) => ({
      plato_id: i.plato_id,
      cantidad: i.cantidad,
      opciones: i.opciones ?? [],
      adiciones: i.adiciones ?? [],
    })),
    p_idempotencia: idempotencia,
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

  if (!input.token || !UUID_RE.test(input.token)) {
    return { ok: false, error: "No encontramos tu pedido." };
  }
  if (!nombre) return { ok: false, error: "Escribe tu nombre." };
  if (items.length === 0) return { ok: false, error: "Tu carrito está vacío." };
  if (items.length > 50) {
    return { ok: false, error: "El pedido tiene demasiados ítems." };
  }
  if (!input.direccion?.trim()) {
    return { ok: false, error: "Escribe la dirección de entrega." };
  }

  const supabase = createAdminClient();
  const ip = await hashIp();

  if (!(await consumirLimite(supabase, `editar:ip:${ip}`, 10, 600))) {
    return {
      ok: false,
      error: "Has hecho demasiados intentos. Espera unos minutos.",
    };
  }

  if (
    !(await consumirLimite(supabase, `editar:token:${input.token}`, 10, 600))
  ) {
    return {
      ok: false,
      error: "Has hecho demasiados intentos. Espera unos minutos.",
    };
  }

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
  if (!token || !UUID_RE.test(token)) {
    return { ok: false, error: "No encontramos tu pedido." };
  }

  const supabase = createAdminClient();
  const ip = await hashIp();

  if (!(await consumirLimite(supabase, `estado:ip:${ip}`, 120, 60))) {
    return {
      ok: false,
      error: "Demasiadas consultas. Espera un momento.",
    };
  }

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
