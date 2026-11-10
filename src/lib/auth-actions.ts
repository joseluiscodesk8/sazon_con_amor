"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizarUsuario, usuarioToEmail } from "@/lib/supabase/usuario";
import type { Rol } from "@/lib/supabase/auth";

export type LoginState = { error?: string };

function destinoPermitido(destino: string, rol: Rol) {
  if (!destino.startsWith("/") || destino.startsWith("//")) return null;

  if (rol === "admin") {
    if (destino === "/admin" || destino.startsWith("/admin/")) {
      return destino;
    }
    return null;
  }

  if (destino === "/mesero" || destino.startsWith("/mesero/")) {
    return destino;
  }

  return null;
}

export async function signIn(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const tipo = formData.get("tipo") === "mesero" ? "mesero" : "admin";
  const usuario = normalizarUsuario(String(formData.get("usuario") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!usuario || !password) {
    return { error: "Ingresa tu usuario y contraseña." };
  }

  const supabase = await createClient(tipo);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usuarioToEmail(usuario),
    password,
  });

  if (error) {
    console.error("[signIn]", error);

    if (error.status === 0) {
      return {
        error:
          "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
      };
    }

    return { error: "Usuario o contraseña incorrectos." };
  }

  if (!data.user) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const { data: perfil, error: errorPerfil } = await supabase
    .from("admins")
    .select("rol")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (errorPerfil) {
    console.error("[signIn] perfil", errorPerfil);
    await supabase.auth.signOut();
    return {
      error:
        "No pudimos verificar tu cuenta. Revisa tu conexión e intenta de nuevo.",
    };
  }

  if (!perfil) {
    await supabase.auth.signOut();
    return { error: "Esa cuenta no tiene acceso." };
  }

  const rol = perfil.rol as Rol;
  if (rol !== "admin" && rol !== "mesero") {
    await supabase.auth.signOut();
    return { error: "Esa cuenta no tiene acceso." };
  }

  if (tipo === "admin" && rol !== "admin") {
    await supabase.auth.signOut();
    return {
      error: "Esa cuenta es de mesero. Entra desde /mesero/login.",
    };
  }

  if (tipo === "mesero" && rol !== "mesero") {
    await supabase.auth.signOut();
    return {
      error: "Esa cuenta es de administrador. Entra desde /admin/login.",
    };
  }

  const destino = destinoPermitido(String(formData.get("next") ?? ""), rol);

  redirect(destino ?? (tipo === "mesero" ? "/mesero" : "/admin"));
}
