"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";

export async function crearGasto(datos: FormData) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("gastos").insert({
    fecha: String(datos.get("fecha")),
    descripcion: String(datos.get("descripcion")),
    categoria: String(datos.get("categoria") || "general"),
    monto: Number(datos.get("monto")),
    moneda: String(datos.get("moneda") || "CLP"),
    medio_pago: datos.get("medio_pago") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/gastos");
}

export async function eliminarGasto(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/gastos");
}
