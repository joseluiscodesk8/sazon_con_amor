"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  normalizarUsuario,
  usuarioEsValido,
  usuarioToEmail,
} from "@/lib/supabase/usuario";

export type RegistroState = { error?: string };

export async function registrarAdmin(
  _prevState: RegistroState,
  formData: FormData,
): Promise<RegistroState> {
  const codigo = String(formData.get("codigo") ?? "").trim();
  const usuario = normalizarUsuario(String(formData.get("usuario") ?? ""));
  const password = String(formData.get("password") ?? "");

  const codigoEsperado = process.env.ADMIN_SETUP_CODE;
  if (!codigoEsperado) {
    return { error: "El registro está deshabilitado (falta ADMIN_SETUP_CODE)." };
  }
  if (codigo !== codigoEsperado) {
    return { error: "Código de instalación incorrecto." };
  }
  if (!usuario) {
    return { error: "Escribe un usuario." };
  }
  if (!usuarioEsValido(usuario)) {
    return {
      error:
        "Usuario inválido: 3 a 30 caracteres, solo letras, números, punto, guion o guion bajo.",
    };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const admin = createAdminClient();
  const email = usuarioToEmail(usuario);

  const { data: creado, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !creado?.user) {
    const mensaje = (error?.message ?? "").toLowerCase();
    if (mensaje.includes("already") || mensaje.includes("registered")) {
      return { error: "Ese usuario ya existe." };
    }
    console.error("[registrarAdmin] createUser", error);
    return { error: "No se pudo crear el usuario." };
  }

  const { error: errorAdmin } = await admin
    .from("admins")
    .upsert(
      { user_id: creado.user.id, usuario, email, rol: "admin" },
      { onConflict: "user_id" },
    );

  if (errorAdmin) {
    console.error("[registrarAdmin] admins", errorAdmin);
    await admin.auth.admin.deleteUser(creado.user.id);
    return { error: "No se pudo asignar como administrador." };
  }

  const supabase = await createClient();
  const { error: errorLogin } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (errorLogin) {
    return { error: "Cuenta creada. Inicia sesión en /admin/login." };
  }

  redirect("/admin");
}
