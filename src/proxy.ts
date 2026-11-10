import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { nombreCookieAuth, type AreaSesion } from "@/lib/supabase/cookies";

const LOGIN_ADMIN = "/admin/login";
const LOGIN_MESERO = "/mesero/login";

// Rutas accesibles sin sesión.
const RUTAS_PUBLICAS = [
  LOGIN_ADMIN,
  "/admin/registro",
  LOGIN_MESERO,
];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const esZonaMesero =
    pathname === "/mesero" || pathname.startsWith("/mesero/");
  const area: AreaSesion = esZonaMesero ? "mesero" : "admin";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-sazon-area", area);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name: nombreCookieAuth(area) },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          requestHeaders.set(
            "cookie",
            request.cookies
              .getAll()
              .map(({ name, value }) => `${name}=${value}`)
              .join("; "),
          );
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);
  const loginPath = esZonaMesero ? LOGIN_MESERO : LOGIN_ADMIN;
  const esRutaPublica = RUTAS_PUBLICAS.includes(pathname);

  if (!isAuthenticated && !esRutaPublica) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = loginPath;
    redirectUrl.searchParams.set("next", pathname);
    const redirect = NextResponse.redirect(redirectUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/mesero/:path*"],
};
