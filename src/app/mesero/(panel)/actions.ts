"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOutMesero() {
  const supabase = await createClient("mesero");
  await supabase.auth.signOut();
  redirect("/mesero/login");
}
