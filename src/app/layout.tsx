import type { Metadata, Viewport } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import {
  ALT_IMAGEN_OG,
  DESCRIPCION_SITIO,
  IMAGEN_OG,
  NOMBRE_SITIO,
  TITULO_INICIO,
  URL_SITIO,
} from "@/lib/seo";
import "./globals.scss";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(URL_SITIO),
  title: {
    default: `${NOMBRE_SITIO} — ${TITULO_INICIO}`,
    template: `%s — ${NOMBRE_SITIO}`,
  },
  description: DESCRIPCION_SITIO,
  applicationName: NOMBRE_SITIO,
  keywords: [
    "comida casera",
    "pedidos a domicilio",
    "restaurante",
    "menú",
    NOMBRE_SITIO,
  ],
  authors: [{ name: NOMBRE_SITIO }],
  creator: NOMBRE_SITIO,
  publisher: NOMBRE_SITIO,
  category: "restaurant",
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: NOMBRE_SITIO,
    title: `${NOMBRE_SITIO} — ${TITULO_INICIO}`,
    description: DESCRIPCION_SITIO,
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
    title: `${NOMBRE_SITIO} — ${TITULO_INICIO}`,
    description: DESCRIPCION_SITIO,
    images: [IMAGEN_OG],
  },
  appleWebApp: {
    capable: true,
    title: NOMBRE_SITIO,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#c0392b",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable}`}
    >
      <body>
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
