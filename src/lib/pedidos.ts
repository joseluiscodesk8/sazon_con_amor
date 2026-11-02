export type TipoPedido = "domicilio" | "restaurante";

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

export type Pedido = {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  mesa: number | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  direccion: string | null;
  lugar: string | null;
  notas: string | null;
  total: number;
  created_at: string;
  updated_at: string;
  pedido_items: PedidoItem[];
};

export const ESTADOS: EstadoPedido[] = [
  "nuevo",
  "en_preparacion",
  "listo",
  "en_camino",
  "entregado",
  "cancelado",
];

export const ESTADO_LABEL: Record<EstadoPedido, string> = {
  nuevo: "Nuevo",
  en_preparacion: "En preparación",
  listo: "Listo",
  en_camino: "En camino",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function estadosSiguientes(
  tipo: TipoPedido,
  estado: EstadoPedido,
): EstadoPedido[] {
  if (estado === "entregado" || estado === "cancelado") return [];

  const flujo: EstadoPedido[] =
    tipo === "domicilio"
      ? ["nuevo", "en_preparacion", "listo", "en_camino", "entregado"]
      : ["nuevo", "en_preparacion", "listo", "entregado"];

  const indice = flujo.indexOf(estado);
  if (indice === -1) return [];

  const siguientes = flujo.slice(indice + 1);
  return [...siguientes, "cancelado"];
}

export function formatearHora(iso: string) {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}
