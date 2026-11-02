// Una categoría es "subcategoría" (acompañante: jugos, sopas, frijoles...)
// cuando su nombre coincide con esta lista. El resultado se guarda en la
// columna `categorias.es_subcategoria` al crearla, para que sea estable y
// se pueda corregir a mano si un nombre no coincide.

export const NOMBRES_SUBCATEGORIA = [
  "jugo",
  "jugos",
  "jugos naturales",
  "sopa",
  "sopas",
  "frijol",
  "frijoles",
  "acompañamiento",
  "acompañamientos",
  "acompanamiento",
  "acompanamientos",
];

export function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase();
}

export function esNombreDeSubcategoria(nombre: string): boolean {
  return NOMBRES_SUBCATEGORIA.includes(normalizarNombre(nombre));
}
