import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { pareceEscaneado } from "@/lib/extraer";

export const MODELO_EXTRACCION = "claude-opus-5";

// Un PDF escaneado se transcribe con Claude, que lo lee como imagen. Más allá
// de este número de páginas conviene dividirlo: la transcripción es una sola
// llamada y la función de Vercel tiene un techo de tiempo.
const PAGINAS_MAX_TRANSCRIPCION = 60;

export type Leido = { texto: string; transcrito: boolean };

export async function textoDeArchivo(bytes: Uint8Array, nombre: string): Promise<Leido> {
  const extension = nombre.toLowerCase().split(".").pop() ?? "";

  if (extension === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    // Un salto doble entre páginas: el troceo lo toma como fin de párrafo
    const texto = text.map((p) => p.trim()).join("\n\n");
    if (!pareceEscaneado(texto, totalPages)) return { texto, transcrito: false };
    if (totalPages > PAGINAS_MAX_TRANSCRIPCION) {
      throw new Error(
        `El PDF parece escaneado y tiene ${totalPages} páginas; se transcriben hasta ${PAGINAS_MAX_TRANSCRIPCION}. Divídelo en partes.`,
      );
    }
    return { texto: await transcribirPdf(bytes), transcrito: true };
  }

  if (extension === "docx") {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { texto: value, transcrito: false };
  }

  if (extension === "txt" || extension === "md") {
    return { texto: new TextDecoder("utf-8").decode(bytes), transcrito: false };
  }

  throw new Error("Formato no soportado. Sube un PDF, un Word (.docx) o un .txt.");
}

async function transcribirPdf(bytes: Uint8Array): Promise<string> {
  const cliente = new Anthropic();
  const flujo = cliente.beta.messages.stream({
    model: MODELO_EXTRACCION,
    // Si Opus 5 declina, la API reintenta sola con el modelo de respaldo que corresponda
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    max_tokens: 64000,
    system:
      "Transcribes documentos escaneados. Devuelve el texto completo, literal y en orden, " +
      "respetando párrafos y saltos de página (una línea en blanco entre páginas). " +
      "No resumas, no corrijas ni agregues comentarios. Si una parte es ilegible, escribe [ilegible].",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") },
          },
          { type: "text", text: "Transcribe este documento." },
        ],
      },
    ],
  });
  const mensaje = await flujo.finalMessage();
  if (mensaje.stop_reason === "refusal") throw new Error("Claude no quiso transcribir este documento.");
  const texto = mensaje.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!texto) throw new Error("No se pudo leer texto del PDF escaneado.");
  return texto;
}
