import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  experimental: {
    agentFeedback: true,
    serverActions: {
      // Vercel limita el body de una función a 4.5 MB; 4 MB deja margen
      // para el multipart. Las fotos se comprimen en el cliente antes de subir.
      bodySizeLimit: "4mb",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
