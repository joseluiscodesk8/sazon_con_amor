export type AdminCategoria = {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
  es_subcategoria: boolean;
};

export type AdminPlato = {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagen_url: string | null;
  disponible: boolean;
  orden: number;
};

export type AdminAdicion = {
  id: string;
  nombre: string;
  precio: number;
  disponible: boolean;
};
