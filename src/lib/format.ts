export function formatearPrecio(valor: number) {
  const numero = new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor);

  return `$${numero}`;
}
