import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { nombreCookieAuth, type AreaSesion } from "./cookies";

async function areaDeRequest(): Promise<AreaSesion> {
  const store = await headers();
  return store.get("x-sazon-area") === "mesero" ? "mesero" : "admin";
}

export async function createClient(area?: AreaSesion) {
  const cookieStore = await cookies();
  const areaFinal = area ?? (await areaDeRequest());

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: nombreCookieAuth(areaFinal) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component. The proxy handles session refresh.
          }
        },
      },
    },
  );
}
