import { createClient } from "@supabase/supabase-js";

// Cliente anónimo sin cookies: seguro para usar dentro de "use cache".
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
