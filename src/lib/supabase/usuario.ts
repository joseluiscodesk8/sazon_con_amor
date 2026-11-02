// Los administradores entran con un USUARIO (no un correo real).
// Supabase Auth exige un "email", así que se genera uno sintético e interno:
//   "cocina" -> "cocina@sazon.local"
// No se envía ningún correo (la cuenta se crea ya confirmada).

const DOMINIO = "sazon.local";

export function normalizarUsuario(valor: string): string {
  return valor.trim().toLowerCase();
}

export function usuarioEsValido(usuario: string): boolean {
  return /^[a-z0-9._-]{3,30}$/.test(usuario);
}

export function usuarioToEmail(usuario: string): string {
  return `${normalizarUsuario(usuario)}@${DOMINIO}`;
}

export function emailDeUsuarioParaMostrar(email: string): string {
  const sufijo = `@${DOMINIO}`;
  return email.endsWith(sufijo) ? email.slice(0, -sufijo.length) : email;
}
