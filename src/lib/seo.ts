import type { Metadata } from "next";
import type { Menu } from "@/app/menu/data";

const urlProduccion = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const urlDespliegue = process.env.VERCEL_URL;
const urlEntorno =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (urlProduccion
    ? `https://${urlProduccion}`
    : urlDespliegue
      ? `https://${urlDespliegue}`
      : "http://localhost:3000");

export const URL_SITIO = urlEntorno.replace(/\/+$/, "");
export const NOMBRE_SITIO = "Sazón con Amor";
export const DESCRIPCION_SITIO =
  "Comida casera hecha con amor. Pide a domicilio o come en el restaurante.";
export const TITULO_INICIO =
  "Comida casera a domicilio y en restaurante";
export const IMAGEN_OG = "/opengraph-image";
export const ALT_IMAGEN_OG = `${NOMBRE_SITIO} — ${TITULO_INICIO}`;

type MetadataPagina = {
  titulo: string;
  descripcion: string;
  ruta: `/${string}` | "/";
};

export function crearMetadata({
  titulo,
  descripcion,
  ruta,
}: MetadataPagina): Metadata {
  return {
    title: titulo,
    description: descripcion,
    alternates: { canonical: ruta },
    openGraph: {
      type: "website",
      locale: "es_CO",
      url: ruta,
      siteName: NOMBRE_SITIO,
      title: titulo,
      description: descripcion,
      images: [
        {
          url: IMAGEN_OG,
          width: 1200,
          height: 630,
          alt: ALT_IMAGEN_OG,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descripcion,
      images: [IMAGEN_OG],
    },
  };
}

export function esquemaRestaurante() {
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: NOMBRE_SITIO,
    description: DESCRIPCION_SITIO,
    url: URL_SITIO,
    servesCuisine: "Comida casera",
    priceRange: "$",
    acceptsReservations: false,
    paymentAccepted: "Efectivo, Tarjeta",
    currenciesAccepted: "COP",
    hasMenu: `${URL_SITIO}/menu/restaurante`,
  };
}

export function esquemaMenu(menu: Menu, ruta: `/${string}`, nombre: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: nombre,
    url: `${URL_SITIO}${ruta}`,
    inLanguage: "es-CO",
    hasMenuSection: menu
      .filter((categoria) => categoria.platos.length > 0)
      .map((categoria) => ({
        "@type": "MenuSection",
        name: categoria.nombre,
        hasMenuItem: categoria.platos.map((plato) => ({
          "@type": "MenuItem",
          name: plato.nombre,
          ...(plato.descripcion ? { description: plato.descripcion } : {}),
          ...(plato.imagen_url ? { image: plato.imagen_url } : {}),
          offers: {
            "@type": "Offer",
            price: String(plato.precio),
            priceCurrency: "COP",
            availability: plato.disponible
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          },
        })),
      })),
  };
}
