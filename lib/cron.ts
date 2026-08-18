import { NextRequest, NextResponse } from "next/server";

// Autoriza una ruta de cron: Vercel manda Authorization: Bearer CRON_SECRET.
export function autorizarCron(solicitud: NextRequest): NextResponse | null {
  const cabecera = solicitud.headers.get("authorization");
  if (cabecera !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  return null;
}
