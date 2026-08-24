"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";

export async function crearTarea(datos: FormData) {
  const supabase = await clienteServidor();
  const proyectoId = datos.get("proyecto_id") ? Number(datos.get("proyecto_id")) : null;

  // El cliente queda denormalizado en la tarea para que la bitácora se busque sola
  let cliente = String(datos.get("cliente") || "").trim() || null;
  if (proyectoId && !cliente) {
    const { data: p } = await supabase
      .from("tb_proyectos").select("cliente,nombre").eq("proyecto_id", proyectoId).maybeSingle();
    cliente = p?.cliente || p?.nombre || null;
  }

  const { error } = await supabase.from("tareas").insert({
    titulo: String(datos.get("titulo")),
    tipo: String(datos.get("tipo") || "encargo"),
    proyecto_id: proyectoId,
    cliente,
    detalle: datos.get("detalle") || null,
    documento: datos.get("documento") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tareas");
}

export async function completarTarea(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("tareas")
    .update({ estado: "hecha", completada_en: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tareas");
}

export async function reabrirTarea(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("tareas")
    .update({ estado: "pendiente", completada_en: null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tareas");
}

export async function eliminarTarea(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("tareas").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tareas");
}
