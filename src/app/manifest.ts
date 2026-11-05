import type { MetadataRoute } from "next";
import { DESCRIPCION_SITIO, NOMBRE_SITIO } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOMBRE_SITIO,
    short_name: "Sazón",
    description: DESCRIPCION_SITIO,
    start_url: "/",
    display: "standalone",
    background_color: "#fdf6ec",
    theme_color: "#c0392b",
    lang: "es",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
