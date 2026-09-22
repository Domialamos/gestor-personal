import Anthropic from "@anthropic-ai/sdk";
import { atributosAObjeto, fechaIso } from "@/lib/extraer";
import type { Clase } from "@/lib/plantillas-extraccion";
import { MODELO_EXTRACCION } from "@/lib/leer-documento";

export type ExtraccionCruda = {
  clase: string;
  texto: string;
  atributos: Record<string, string>;
  fecha: string | null;
};

const SISTEMA = `Extraes información de documentos jurídicos chilenos (contratos, expedientes
judiciales, informes, minutas) para una abogada.

Reglas:
- "texto" es una cita LITERAL del fragmento, copiada carácter por carácter: sin
  parafrasear, sin corregir, sin completar abreviaturas. Es el trozo más corto que
  contiene el dato completo (una frase o cláusula, no un párrafo entero).
- Solo extraes lo que dice el fragmento. No infieras datos que no estén escritos.
- En orden de aparición en el fragmento. Una extracción por dato; si un dato se
  repite igual, extráelo solo la primera vez.
- "atributos" agrega contexto útil en pares nombre/valor, en español y breves
  (por ejemplo moneda: UF, obligado: Arrendatario). Pueden derivarse del resto
  del fragmento; ahí sí puedes interpretar.
- "fecha" es AAAA-MM-DD solo cuando el dato corresponde a un día calendario
  determinable a partir del texto (un vencimiento, una audiencia, la fecha de
  firma). Si no, cadena vacía.
- Si el fragmento no tiene nada de lo pedido, devuelve la lista vacía.`;

function esquema(clases: Clase[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["extracciones"],
    properties: {
      extracciones: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["clase", "texto", "atributos", "fecha"],
          properties: {
            clase: { type: "string", enum: clases.map((c) => c.codigo) },
            texto: { type: "string" },
            atributos: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["nombre", "valor"],
                properties: { nombre: { type: "string" }, valor: { type: "string" } },
              },
            },
            fecha: { type: "string" },
          },
        },
      },
    },
  };
}

export async function extraerDeTramo(params: {
  fragmento: string;
  clases: Clase[];
  instrucciones: string | null;
  titulo: string;
  numero: number;
  total: number;
}): Promise<ExtraccionCruda[]> {
  const { fragmento, clases, instrucciones, titulo, numero, total } = params;
  const guia = clases.map((c) => `- ${c.codigo} (${c.etiqueta}): ${c.guia}`).join("\n");

  const cliente = new Anthropic();
  const flujo = cliente.beta.messages.stream({
    model: MODELO_EXTRACCION,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SISTEMA,
    output_config: { format: { type: "json_schema", schema: esquema(clases) } },
    messages: [
      {
        role: "user",
        content:
          `Documento: ${titulo}\nFragmento ${numero} de ${total}.\n\n` +
          `Qué extraer:\n${guia}\n` +
          (instrucciones ? `\nIndicaciones adicionales de la abogada:\n${instrucciones}\n` : "") +
          `\n<fragmento>\n${fragmento}\n</fragmento>`,
      },
    ],
  });
  const mensaje = await flujo.finalMessage();

  if (mensaje.stop_reason === "refusal") throw new Error(`Claude declinó el fragmento ${numero}.`);
  if (mensaje.stop_reason === "max_tokens") throw new Error(`La respuesta del fragmento ${numero} quedó cortada.`);

  const json = mensaje.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const datos = JSON.parse(json) as {
    extracciones: { clase: string; texto: string; atributos: { nombre: string; valor: string }[]; fecha: string }[];
  };

  const validas = new Set(clases.map((c) => c.codigo));
  return datos.extracciones
    .filter((e) => validas.has(e.clase) && e.texto.trim())
    .map((e) => ({
      clase: e.clase,
      texto: e.texto.trim(),
      atributos: atributosAObjeto(e.atributos),
      fecha: fechaIso(e.fecha),
    }));
}
