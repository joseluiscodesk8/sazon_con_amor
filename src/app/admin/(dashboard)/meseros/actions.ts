"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/auth";
import {
  normalizarUsuario,
  usuarioEsValido,
  usuarioToEmail,
} from "@/lib/supabase/usuario";

export type MeseroState = {
  error?: string;
  ok?: boolean;
  mensaje?: string;
};

export type EliminarMeseroResult = { ok: true } | { ok: false; error: string };

export async function crearMesero(
  _prevState: MeseroState,
  formData: FormData,
): Promise<MeseroState> {
  await requireAdmin();

  const usuario = normalizarUsuario(String(formData.get("usuario") ?? ""));
  const password = String(formData.get("password") ?? "");

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
    console.error("[crearMesero] createUser", error);
    return { error: "No se pudo crear el usuario." };
  }

  const { error: errorAdmin } = await admin.from("admins").insert({
    user_id: creado.user.id,
    usuario,
    email,
    nombre: usuario,
    rol: "mesero",
  });

  if (errorAdmin) {
    console.error("[crearMesero] admins", errorAdmin);
    await admin.auth.admin.deleteUser(creado.user.id);
    return { error: "No se pudo asignar el rol de mesero." };
  }

  revalidatePath("/admin/meseros");

  return {
    ok: true,
    mensaje: `Cuenta creada para ${usuario}. Ya puede entrar en /mesero.`,
  };
}

export async function eliminarMesero(
  userId: string,
): Promise<EliminarMeseroResult> {
  await requireAdmin();

  if (!userId) {
    return { ok: false, error: "Mesero inválido." };
  }

  const admin = createAdminClient();
  const { data: perfil, error: errorPerfil } = await admin
    .from("admins")
    .select("rol")
    .eq("user_id", userId)
    .maybeSingle();

  if (errorPerfil) {
    console.error("[eliminarMesero] perfil", errorPerfil);
    return { ok: false, error: "No se pudo consultar el mesero." };
  }

  if (!perfil || perfil.rol !== "mesero") {
    return { ok: false, error: "Solo se pueden eliminar cuentas de mesero." };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    console.error("[eliminarMesero] deleteUser", error);
    return { ok: false, error: "No se pudo eliminar la cuenta." };
  }

  revalidatePath("/admin/meseros");
  return { ok: true };
}
