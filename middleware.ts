import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión y exige estar dentro para todo lo que no es público.
// Los datos quedan aislados por usuario vía RLS en Supabase.
export async function middleware(solicitud: NextRequest) {
  let respuesta = NextResponse.next({ request: solicitud });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => solicitud.cookies.getAll(),
        setAll: (lista) => {
          lista.forEach(({ name, value }) => solicitud.cookies.set(name, value));
          respuesta = NextResponse.next({ request: solicitud });
          lista.forEach(({ name, value, options }) => respuesta.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const ruta = solicitud.nextUrl.pathname;
  const esPublica = ruta.startsWith("/ingresar") || ruta.startsWith("/auth") || ruta.startsWith("/api/cron");

  if (!user && !esPublica) {
    const url = solicitud.nextUrl.clone();
    url.pathname = "/ingresar";
    return NextResponse.redirect(url);
  }

  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fuentes|apple-icon|manifest.webmanifest|.*\\.(?:svg|png|jpg|woff2)$).*)"],
};
