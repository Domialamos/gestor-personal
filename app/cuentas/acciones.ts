"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";

export async function crearCuenta(datos: FormData) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("cuentas_por_pagar").insert({
    nombre: String(datos.get("nombre")),
    categoria: String(datos.get("categoria") || "general"),
    monto: Number(datos.get("monto")),
    moneda: String(datos.get("moneda") || "CLP"),
    fecha_vencimiento: datos.get("fecha_vencimiento") || null,
    recurrente: datos.get("recurrente") === "on",
    dia_vencimiento: datos.get("dia_vencimiento") ? Number(datos.get("dia_vencimiento")) : null,
    notas: datos.get("notas") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/cuentas");
}

export async function marcarPagada(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("cuentas_por_pagar")
    .update({ estado: "pagada", pagada_en: new Date().toISOString().slice(0, 10) })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/cuentas");
}

export async function eliminarCuenta(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("cuentas_por_pagar").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/cuentas");
}
