import { NextRequest, NextResponse } from "next/server";
import { clienteAdmin } from "@/lib/supabase/admin";

export const maxDuration = 30;

// Buzón de registro: cada correo reenviado a la casilla de bitácora
// se convierte en una entrada hecha de tipo "correo" en la tabla tareas.
// Resend llama aquí con el evento email.received; el token de la URL
// (mismo CRON_SECRET) evita que cualquiera inserte en la bitácora.

function limpiarAsunto(asunto: string): string {
  // Quita los prefijos de reenvío/respuesta acumulados: FW:, RV:, RE:, FWD:…
  return asunto.replace(/^(\s*(fw|fwd|rv|re|res)\s*:\s*)+/i, "").trim() || asunto.trim();
}

export async function POST(solicitud: NextRequest) {
  if (solicitud.nextUrl.searchParams.get("token") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const evento = await solicitud.json().catch(() => null);
  if (!evento || evento.type !== "email.received") {
    return NextResponse.json({ ignorado: true });
  }

  const datos = evento.data ?? {};
  const remitente: string = String(datos.from?.email ?? datos.from ?? "");
  const permitidos = (process.env.EMAIL_PERMITIDO ?? "")
    .toLowerCase().split(",").map((c) => c.trim()).filter(Boolean);
  if (!permitidos.some((c) => remitente.toLowerCase().includes(c))) {
    return NextResponse.json({ ignorado: "remitente no permitido" });
  }

  const asunto = limpiarAsunto(String(datos.subject ?? "(sin asunto)"));
  const texto: string = String(datos.text ?? "");
  const supabase = clienteAdmin();
  const userId = process.env.USER_ID_DOMINGA!;

  // Intenta reconocer el cliente buscando nombres de tb_proyectos en el asunto o el cuerpo
  const { data: proyectos } = await supabase
    .from("tb_proyectos")
    .select("proyecto_id,cliente")
    .eq("user_id", userId)
    .eq("activo", true)
    .not("cliente", "is", null)
    .limit(3000);
  const pajar = `${asunto}\n${texto.slice(0, 2000)}`.toLowerCase();
  const calce = (proyectos ?? [])
    .filter((p) => p.cliente && p.cliente.length > 3 && pajar.includes(p.cliente.toLowerCase()))
    .sort((a, b) => (b.cliente!.length - a.cliente!.length))[0];

  // El destinatario original suele venir en el encabezado citado del reenvío
  const paraOriginal = texto.match(/^\s*(?:Para|To):\s*(.+)$/im)?.[1]?.trim().slice(0, 200) ?? null;

  const { error } = await supabase.from("tareas").insert({
    user_id: userId,
    titulo: asunto,
    tipo: "correo",
    proyecto_id: calce?.proyecto_id ?? null,
    cliente: calce?.cliente ?? null,
    detalle: paraOriginal ? `Para: ${paraOriginal}` : "Registrado por reenvío",
    estado: "hecha",
    completada_en: datos.created_at ?? new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ registrado: asunto, cliente: calce?.cliente ?? null });
}
