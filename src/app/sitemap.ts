import type { MetadataRoute } from "next";
import { URL_SITIO } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: URL_SITIO,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${URL_SITIO}/menu/domicilio`,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${URL_SITIO}/menu/restaurante`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
