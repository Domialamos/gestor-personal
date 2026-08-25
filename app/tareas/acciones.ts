"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";

export async function crearTarea(datos: FormData) {
  const supabase = await clienteServidor();

  // El campo de asunto llega como texto "Cliente — Asunto" (datalist); se resuelve
  // contra tb_proyectos y el cliente queda denormalizado para que la bitácora se busque sola
  const asuntoTexto = String(datos.get("asunto_texto") || "").trim();
  let proyectoId: number | null = null;
  let cliente = String(datos.get("cliente") || "").trim() || null;

  if (asuntoTexto) {
    const [parteCliente, parteNombre] = asuntoTexto.split(" — ");
    let consulta = supabase.from("tb_proyectos").select("proyecto_id,cliente,nombre").eq("activo", true).limit(1);
    consulta = parteNombre
      ? consulta.ilike("cliente", parteCliente).ilike("nombre", parteNombre)
      : consulta.or(`cliente.ilike.%${parteCliente}%,nombre.ilike.%${parteCliente}%`);
    const { data: candidatos } = await consulta;
    const p = candidatos?.[0];
    if (p) {
      proyectoId = p.proyecto_id;
      cliente = cliente || p.cliente || p.nombre;
    } else {
      // No calzó con TimeBilling: se guarda igual como cliente de texto libre
      cliente = cliente || asuntoTexto;
    }
  }

  const { error } = await supabase.from("tareas").insert({
    titulo: String(datos.get("titulo")),
    tipo: String(datos.get("tipo") || "encargo"),
    proyecto_id: proyectoId,
    cliente,
    detalle: datos.get("detalle") || null,
    documento: datos.get("documento") || null,
    fecha_limite: datos.get("fecha_limite") || null,
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
