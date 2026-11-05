type ImagenDetectada = {
  mime: string;
  extension: string;
};

function empiezaCon(bytes: Uint8Array, firma: number[]) {
  return firma.every((valor, indice) => bytes[indice] === valor);
}

export async function detectarImagen(
  archivo: File,
): Promise<ImagenDetectada | null> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const ascii = new TextDecoder().decode(bytes.slice(0, 12));

  if (empiezaCon(bytes, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", extension: "jpg" };
  }

  if (empiezaCon(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", extension: "png" };
  }

  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }

  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) {
    return { mime: "image/gif", extension: "gif" };
  }

  return null;
}
