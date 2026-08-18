import { clienteServidor } from "@/lib/supabase/servidor";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Destino de los enlaces de correo (confirmación, magic link, recuperación):
// verifica el token, deja la sesión en cookies y redirige.
export async function GET(solicitud: NextRequest) {
  const { searchParams, origin } = new URL(solicitud.url);
  const token_hash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const siguiente = searchParams.get("siguiente") ?? (type === "recovery" ? "/auth/restablecer" : "/");

  if (token_hash) {
    const supabase = await clienteServidor();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}${siguiente}`);
  }
  return NextResponse.redirect(`${origin}/ingresar?error=enlace-invalido`);
}
