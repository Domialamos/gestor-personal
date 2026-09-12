"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { hoyChile } from "@/lib/formato";
import { normalizarPrioridad } from "@/lib/tareas";
import { revalidatePath } from "next/cache";

export async function crearTarea(datos: FormData) {
  const supabase = await clienteServidor();

  // El campo de asunto llega como texto "Cliente — Asunto" (datalist); se resuelve
  // contra tb_proyectos y el cliente queda denormalizado para que la bitácora se busque sola
  const asuntoTexto = String(datos.get("asunto_texto") || "").trim();
  const delegadaA = String(datos.get("delegada_a") || "").trim();
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
    // El formulario la exige; si igual llega vacía, hoy — así nunca queda una
    // pendiente fuera del orden por día
    fecha_limite: String(datos.get("fecha_limite") || "") || hoyChile(),
    prioridad: normalizarPrioridad(datos.get("prioridad")),
    // Si nace encargada a otra persona, no es un pendiente propio: va a Esperando
    ...(delegadaA
      ? { estado: "esperando", delegada_a: delegadaA, delegada_en: hoyChile() }
      : {}),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tareas");
}

// Deriva una tarea que ya existía. Sale del to-do del día y queda esperando.
export async function delegarTarea(id: string, datos: FormData) {
  const aQuien = String(datos.get("delegada_a") || "").trim();
  if (!aQuien) return;

  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("tareas")
    .update({ estado: "esperando", delegada_a: aQuien, delegada_en: hoyChile() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tareas");
}

// Anota que hoy insististe. Es el historial que ordena el bloque Esperando.
export async function registrarSeguimiento(id: string, datos: FormData) {
  const supabase = await clienteServidor();
  const nota = String(datos.get("nota") || "").trim();
  const { error } = await supabase
    .from("seguimientos")
    .insert({ tarea_id: id, fecha: hoyChile(), nota: nota || null });
  if (error) throw new Error(error.message);
  revalidatePath("/tareas");
}

// La persona respondió: vuelve a tu to-do. Se conserva a quién y cuándo se le
// pidió, y el historial de seguimientos, para que la bitácora no pierda nada.
export async function retomarTarea(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("tareas")
    .update({ estado: "pendiente", fecha_limite: hoyChile() })
    .eq("id", id);
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
