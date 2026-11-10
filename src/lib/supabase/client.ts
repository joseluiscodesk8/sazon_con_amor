import { createBrowserClient } from "@supabase/ssr";
import { nombreCookieAuth, type AreaSesion } from "./cookies";

type ClienteNavegador = ReturnType<typeof createBrowserClient>;

const clientes: Partial<Record<AreaSesion, ClienteNavegador>> = {};

export function createClient(area: AreaSesion) {
  const existente = clientes[area];
  if (existente) return existente;

  const cliente = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: nombreCookieAuth(area) },
      isSingleton: false,
    },
  );

  clientes[area] = cliente;
  return cliente;
}
