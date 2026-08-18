"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";

export async function crearReembolso(datos: FormData) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("reembolsos").insert({
    descripcion: String(datos.get("descripcion")),
    prestador: datos.get("prestador") || null,
    fecha_prestacion: datos.get("fecha_prestacion") || null,
    monto_total: Number(datos.get("monto_total")),
    notas: datos.get("notas") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/reembolsos");
}

// Flujo chileno: primero bonifica la isapre, el saldo va al seguro complementario.
export async function registrarIsapre(id: string, montoIsapre: number) {
  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("reembolsos")
    .update({ monto_isapre: montoIsapre, fecha_isapre: new Date().toISOString().slice(0, 10), estado: "bonificado_isapre" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reembolsos");
}

export async function cambiarEstado(id: string, estado: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("reembolsos").update({ estado }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reembolsos");
}

export async function registrarSeguro(id: string, montoSeguro: number) {
  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("reembolsos")
    .update({ monto_seguro: montoSeguro, fecha_seguro: new Date().toISOString().slice(0, 10), estado: "reembolsado_seguro" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reembolsos");
}

export async function eliminarReembolso(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("reembolsos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/reembolsos");
}
