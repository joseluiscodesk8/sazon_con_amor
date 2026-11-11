export type TipoPedido = "domicilio" | "restaurante";

export type OrigenPedido = "cliente" | "mesero";

export type EstadoPedido =
  | "nuevo"
  | "en_preparacion"
  | "listo"
  | "en_camino"
  | "entregado"
  | "cancelado";

export type OpcionSeleccionada = {
  subcategoria: string;
  opcion: string;
};

export type AdicionSeleccionada = {
  nombre: string;
  precio: number;
};

export type PedidoItem = {
  id: string;
  pedido_id: string;
  plato_id: string | null;
  nombre: string;
  precio: number;
  cantidad: number;
  opciones: OpcionSeleccionada[] | null;
  adiciones: AdicionSeleccionada[] | null;
};

export type EstadoMesa = "abierta" | "cerrada";

export type MesaAbierta = {
  id: string;
  mesa: number;
  mesero_user_id: string;
  mesero_nombre: string;
  abierta_at: string;
  estado: EstadoMesa;
  cerrada_at: string | null;
};

export type Pedido = {
  id: string;
  numero: number;
  tipo: TipoPedido;
  origen: OrigenPedido;
  estado: EstadoPedido;
  mesa: number | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  direccion: string | null;
  lugar: string | null;
  notas: string | null;
  total: number;
  mesero_user_id: string | null;
  mesero_nombre: string | null;
  created_at: string;
  updated_at: string;
  pedido_items: PedidoItem[];
};

export type MesaCerrada = MesaAbierta & {
  pedidos: Pedido[];
};

export const ESTADO_LABEL: Record<EstadoPedido, string> = {
  nuevo: "Nuevo",
  en_preparacion: "En preparación",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function formatearHora(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}
