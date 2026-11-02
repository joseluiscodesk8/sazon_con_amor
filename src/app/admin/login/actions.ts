"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizarUsuario, usuarioToEmail } from "@/lib/supabase/usuario";

export type LoginState = { error?: string };

export async function signIn(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const usuario = normalizarUsuario(String(formData.get("usuario") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!usuario || !password) {
    return { error: "Ingresa tu usuario y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: usuarioToEmail(usuario),
    password,
  });

  if (error) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  redirect("/admin");
}
