import type { Metadata } from "next";
import { requireAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import MeserosAdmin from "./MeserosAdmin";
import type { AdminMesero } from "./types";

export const metadata: Metadata = {
  title: "Meseros",
};

export const instant = false;

export default async function MeserosPage() {
  await requireAdmin();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admins")
    .select("user_id, usuario, nombre, email, created_at")
    .eq("rol", "mesero")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[MeserosPage]", error);
  }

  return <MeserosAdmin meseros={(data ?? []) as AdminMesero[]} />;
}
