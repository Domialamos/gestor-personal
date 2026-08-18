import { NextRequest, NextResponse } from "next/server";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerFeed } from "@/lib/rss";
import { autorizarCron } from "@/lib/cron";

export const maxDuration = 60;

const FUENTES = [
  { nombre: "La Tercera", url: "https://www.latercera.com/arc/outboundfeeds/rss/?outputType=xml" },
  { nombre: "Diario Financiero", url: "https://www.df.cl/noticias/site/list/port/rss.xml" },
  { nombre: "Cooperativa", url: "https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml" },
];

export async function GET(solicitud: NextRequest) {
  const rechazo = autorizarCron(solicitud);
  if (rechazo) return rechazo;

  const supabase = clienteAdmin();
  const userId = process.env.USER_ID_DOMINGA!;
  const resultado: Record<string, number | string> = {};

  for (const fuente of FUENTES) {
    try {
      const items = (await leerFeed(fuente.url)).slice(0, 25);
      if (!items.length) { resultado[fuente.nombre] = 0; continue; }
      const { error, count } = await supabase.from("noticias").upsert(
        items.map((i) => ({
          user_id: userId,
          tipo: "actualidad",
          fuente: fuente.nombre,
          titulo: i.titulo,
          resumen: i.resumen,
          url: i.url,
          publicado_en: i.publicado_en,
        })),
        { onConflict: "url", ignoreDuplicates: true, count: "exact" }
      );
      resultado[fuente.nombre] = error ? `error: ${error.message}` : count ?? 0;
    } catch (e) {
      resultado[fuente.nombre] = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // Limpieza: conserva 60 días
  await supabase.from("noticias").delete().eq("tipo", "actualidad")
    .lt("publicado_en", new Date(Date.now() - 60 * 864e5).toISOString());

  return NextResponse.json({ ok: true, nuevas: resultado });
}
