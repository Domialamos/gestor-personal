import { NextRequest, NextResponse } from "next/server";
import { clienteAdmin } from "@/lib/supabase/admin";
import { leerFeed } from "@/lib/rss";
import { autorizarCron } from "@/lib/cron";

export const maxDuration = 60;

const FUENTES = [
  { nombre: "Idealex", url: "https://idealex.press/feed/" },
  { nombre: "Estado Diario", url: "https://estadodiario.com/feed/" },
  { nombre: "Actualidad Jurídica (DO)", url: "https://actualidadjuridica.doe.cl/feed/" },
  { nombre: "LexLatin", url: "https://lexlatin.com/rss.xml" },
  { nombre: "Colegio de Abogados", url: "https://www.colegioabogados.cl/feed/" },
];

// Los temas que Dominga sigue, con las palabras que los delatan.
const TEMAS: { etiqueta: string; patron: RegExp }[] = [
  { etiqueta: "ley-20712", patron: /20\.?712|fondos de inversi[oó]n|administradora general de fondos|\bAGF\b/i },
  { etiqueta: "ley-18046-art57", patron: /18\.?046|sociedades? an[oó]nimas?|junta extraordinaria|gobierno corporativo/i },
  { etiqueta: "cc-2489", patron: /prelaci[oó]n de cr[eé]ditos|subordinaci[oó]n de cr[eé]ditos|2\.?489/i },
  { etiqueta: "ley-18092", patron: /18\.?092|pagar[eé]s?|letra de cambio|endoso/i },
  { etiqueta: "cc-881", patron: /servidumbre|loteo|conservador de bienes ra[ií]ces|destinaci[oó]n del padre de familia/i },
  { etiqueta: "ley-21595", patron: /21\.?595|delitos econ[oó]micos|responsabilidad penal.*persona jur[ií]dica|modelo de prevenci[oó]n/i },
  { etiqueta: "inmobiliario", patron: /inmobiliari|bienes ra[ií]ces|construcci[oó]n|permiso de edificaci[oó]n/i },
  { etiqueta: "cmf", patron: /\bCMF\b|comisi[oó]n para el mercado financiero|norma de car[aá]cter general/i },
];

function etiquetar(texto: string): string[] {
  return TEMAS.filter((t) => t.patron.test(texto)).map((t) => t.etiqueta);
}

export async function GET(solicitud: NextRequest) {
  const rechazo = autorizarCron(solicitud);
  if (rechazo) return rechazo;

  const supabase = clienteAdmin();
  const userId = process.env.USER_ID_DOMINGA!;
  const resultado: Record<string, number | string> = {};

  for (const fuente of FUENTES) {
    try {
      const items = (await leerFeed(fuente.url)).slice(0, 30);
      if (!items.length) { resultado[fuente.nombre] = 0; continue; }
      const { error, count } = await supabase.from("noticias").upsert(
        items.map((i) => ({
          user_id: userId,
          tipo: "legal",
          fuente: fuente.nombre,
          titulo: i.titulo,
          resumen: i.resumen,
          url: i.url,
          publicado_en: i.publicado_en,
          temas: etiquetar(`${i.titulo} ${i.resumen ?? ""}`),
        })),
        { onConflict: "url", ignoreDuplicates: true, count: "exact" }
      );
      resultado[fuente.nombre] = error ? `error: ${error.message}` : count ?? 0;
    } catch (e) {
      resultado[fuente.nombre] = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  await supabase.from("noticias").delete().eq("tipo", "legal")
    .lt("publicado_en", new Date(Date.now() - 120 * 864e5).toISOString());

  return NextResponse.json({ ok: true, nuevas: resultado });
}
