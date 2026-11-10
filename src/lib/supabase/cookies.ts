export type AreaSesion = "admin" | "mesero";

function proyectoActual() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://local";
  try {
    return new URL(url).hostname.replace(/[^a-z0-9]/gi, "");
  } catch {
    return "local";
  }
}

export function nombreCookieAuth(area: AreaSesion) {
  return `sb-${proyectoActual()}-${area}-auth-token`;
}
