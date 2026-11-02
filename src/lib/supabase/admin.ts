import { createClient } from "@supabase/supabase-js";

// Cliente con Service Role: omite RLS. Solo debe usarse en el servidor
// (Server Actions / Route Handlers). NUNCA importar desde un componente cliente.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error("Falta la variable de entorno SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
