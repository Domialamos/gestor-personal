import { XMLParser } from "fast-xml-parser";

export type ItemRss = { titulo: string; url: string; resumen: string | null; publicado_en: string | null };

const parser = new XMLParser({ ignoreAttributes: false });

function limpiar(html: string | undefined | null): string | null {
  if (!html) return null;
  const texto = String(html).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return texto ? texto.slice(0, 500) : null;
}

function aLista<T>(x: T | T[] | undefined): T[] {
  return x == null ? [] : Array.isArray(x) ? x : [x];
}

// Parsea RSS 2.0 y Atom.
export async function leerFeed(url: string): Promise<ItemRss[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const xml = parser.parse(await res.text());

  const itemsRss = aLista<Record<string, unknown>>(xml?.rss?.channel?.item);
  if (itemsRss.length) {
    return itemsRss.map((i) => ({
      titulo: limpiar(String(i.title ?? "")) ?? "(sin título)",
      url: String(i.link ?? ""),
      resumen: limpiar(i.description as string),
      publicado_en: i.pubDate ? new Date(String(i.pubDate)).toISOString() : null,
    })).filter((i) => i.url);
  }

  const entradas = aLista<Record<string, unknown>>(xml?.feed?.entry);
  return entradas.map((e) => {
    const enlaces = aLista<Record<string, string>>(e.link as never);
    const enlace = enlaces.find((l) => l["@_rel"] !== "self") ?? enlaces[0];
    return {
      titulo: limpiar(String((e.title as { "#text"?: string })?.["#text"] ?? e.title ?? "")) ?? "(sin título)",
      url: enlace?.["@_href"] ?? "",
      resumen: limpiar((e.summary as { "#text"?: string })?.["#text"] ?? (e.summary as string)),
      publicado_en: e.updated || e.published ? new Date(String(e.updated ?? e.published)).toISOString() : null,
    };
  }).filter((i) => i.url);
}
