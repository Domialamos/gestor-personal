"use server";

import Anthropic from "@anthropic-ai/sdk";
import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";

const SISTEMA = `Reescribes descripciones de trabajo para el registro de horas de un
estudio de abogados chileno.

Reglas:
- Español de Chile, registro profesional, tercera persona impersonal.
- Una o dos oraciones. Sin viñetas, sin encabezados, sin comillas.
- No inventes NADA que no esté en el texto de entrada: ni nombres, ni fechas,
  ni materias, ni partes, ni montos. Si el texto es vago, entrega una versión
  vaga pero bien redactada.
- Si quedan marcadores entre llaves, déjalos tal cual.
- Responde solo con la descripción. Nada más.`;

export async function pulirDescripcion(id: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY; el pulido no está disponible.");
  }

  const supabase = await clienteServidor();
  const { data: fila, error: errorLectura } = await supabase
    .from("horas").select("descripcion, estado").eq("id", id).single();
  if (errorLectura) throw new Error(errorLectura.message);
  if (fila.estado === "cargada") throw new Error("Esta hora ya se cargó; no se edita.");
  if (!fila.descripcion.trim()) throw new Error("Escribe algo antes de pulir.");

  const cliente = new Anthropic();
  const respuesta = await cliente.messages.create({
    model: "claude-opus-5",
    max_tokens: 1000,
    system: SISTEMA,
    messages: [{ role: "user", content: fila.descripcion }],
  });

  const texto = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!texto) throw new Error("El modelo no devolvió texto; se mantiene la descripción original.");

  const { error } = await supabase.from("horas").update({ descripcion: texto }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/horas");
  return texto;
}
