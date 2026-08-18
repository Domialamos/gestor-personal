import { NextRequest, NextResponse } from "next/server";
import { clienteAdmin } from "@/lib/supabase/admin";
import { parsearIcs } from "@/lib/ics";
import { autorizarCron } from "@/lib/cron";

export const maxDuration = 60;

// Sincroniza los ICS secretos (Google y Outlook) hacia eventos_cache.
export async function GET(solicitud: NextRequest) {
  const rechazo = autorizarCron(solicitud);
  if (rechazo) return rechazo;

  const supabase = clienteAdmin();
  const userId = process.env.USER_ID_DOMINGA!;
  const fuentes = [
    { origen: "google" as const, url: process.env.ICS_URL_GOOGLE },
    { origen: "microsoft" as const, url: process.env.ICS_URL_MICROSOFT },
  ].filter((f) => f.url);

  if (!fuentes.length) {
    return NextResponse.json({ ok: false, mensaje: "Sin URLs ICS configuradas (ICS_URL_GOOGLE / ICS_URL_MICROSOFT)" });
  }

  const desde = new Date(Date.now() - 7 * 864e5);
  const hasta = new Date(Date.now() + 90 * 864e5);
  const resultado: Record<string, number | string> = {};

  for (const fuente of fuentes) {
    try {
      const res = await fetch(fuente.url!, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const eventos = parsearIcs(await res.text()).filter((e) => {
        const d = new Date(e.inicio);
        return d >= desde && d <= hasta;
      });

      // Reemplaza la ventana completa de ese origen
      await supabase.from("eventos_cache").delete().eq("origen", fuente.origen);
      if (eventos.length) {
        const { error } = await supabase.from("eventos_cache").upsert(
          eventos.map((e) => ({
            user_id: userId,
            origen: fuente.origen,
            uid_externo: e.uid,
            titulo: e.titulo,
            inicio: e.inicio,
            fin: e.fin,
            todo_el_dia: e.todo_el_dia,
            ubicacion: e.ubicacion,
          })),
          { onConflict: "origen,uid_externo,inicio", ignoreDuplicates: true }
        );
        if (error) throw new Error(error.message);
      }
      resultado[fuente.origen] = eventos.length;
    } catch (e) {
      resultado[fuente.origen] = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return NextResponse.json({ ok: true, eventos: resultado });
}
