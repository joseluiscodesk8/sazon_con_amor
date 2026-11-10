import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { AreaSesion } from "@/lib/supabase/cookies";

export type Rol = "admin" | "mesero";

export type Perfil = {
  user_id: string;
  usuario: string | null;
  nombre: string | null;
  rol: Rol;
};

async function getSesionYPerfil(area: AreaSesion) {
  const supabase = await createClient(area);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, perfil: null };
  }

  const { data } = await supabase
    .from("admins")
    .select("user_id, usuario, nombre, rol")
    .eq("user_id", user.id)
    .maybeSingle();

  return { supabase, user, perfil: (data as Perfil | null) ?? null };
}

export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function requireAdmin() {
  // Fuerza render en tiempo de petición: el cliente de Supabase usa Date.now()
  // internamente y no debe ejecutarse durante el prerender.
  await connection();

  const { supabase, user, perfil } = await getSesionYPerfil("admin");

  if (!user) {
    redirect("/admin/login");
  }

  if (!perfil) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=sin-acceso");
  }

  if (perfil.rol !== "admin") {
    redirect("/admin/login?error=rol-mesero");
  }

  return user;
}

export async function requireMesero() {
  await connection();

  const { supabase, user, perfil } = await getSesionYPerfil("mesero");

  if (!user) {
    redirect("/mesero/login");
  }

  if (!perfil) {
    await supabase.auth.signOut();
    redirect("/mesero/login?error=sin-acceso");
  }

  // El panel de meseros es solo para cuentas creadas como mesero. Un
  // administrador trabaja desde /admin y usa su propia sesión.
  if (perfil.rol !== "mesero") {
    redirect("/mesero/login?error=rol-admin");
  }

  return { user, perfil };
}
