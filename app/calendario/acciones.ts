"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { desdeHoraChile } from "@/lib/formato";
import { revalidatePath } from "next/cache";

export async function crearEvento(datos: FormData) {
  const supabase = await clienteServidor();
  const fecha = String(datos.get("fecha"));
  const hora = String(datos.get("hora") || "");
  const { error } = await supabase.from("eventos_cache").insert({
    origen: "manual",
    uid_externo: crypto.randomUUID(),
    titulo: String(datos.get("titulo")),
    inicio: hora ? desdeHoraChile(fecha, hora) : `${fecha}T00:00:00Z`,
    todo_el_dia: !hora,
    ubicacion: datos.get("ubicacion") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/calendario");
}

export async function eliminarEvento(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("eventos_cache").delete().eq("id", id).eq("origen", "manual");
  if (error) throw new Error(error.message);
  revalidatePath("/calendario");
}
