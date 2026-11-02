// Comprime/redimensiona una imagen en el navegador antes de subirla.
// Motivos: mantener el peso bajo (storage/egress de Supabase) y no chocar
// con el límite de 4.5 MB por request de Vercel. Si algo falla, devuelve el
// archivo original para no bloquear al usuario.

const ANCHO_MAX = 1600;
const CALIDAD = 0.8;
const PESO_SIN_TOCAR = 1.5 * 1024 * 1024;

export async function comprimirImagen(archivo: File): Promise<File> {
  if (!archivo.type.startsWith("image/")) return archivo;

  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, ANCHO_MAX / bitmap.width);

    if (escala === 1 && archivo.size <= PESO_SIN_TOCAR) {
      bitmap.close();
      return archivo;
    }

    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return archivo;
    }

    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CALIDAD),
    );

    if (!blob) return archivo;

    const nombre = `${archivo.name.replace(/\.[^.]+$/, "")}.jpg`;
    return new File([blob], nombre, { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}
