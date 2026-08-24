"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";
import { PASO_MIN, redondearPaso, minutosEntre, transicionValida, type EstadoHora } from "@/lib/horas";
import { plantillaDe, tieneMarcadores } from "@/lib/plantillas-horas";

// Valida la transiciÃ³n contra la mÃ¡quina de estados y escribe con
// compare-and-swap: el update solo toca la fila si su estado sigue siendo
// el que leÃ­mos (.eq("estado", desde)). Si otra escritura se colÃ³ entremedio
// (doble clic, o el puente escribiendo directo a Supabase), el update no
// afecta ninguna fila y lanzamos un error legible en vez de pisar el cambio.
async function moverEstado(id: string, hasta: EstadoHora, campos: Record<string, unknown> = {}) {
  const supabase = await clienteServidor();
  const { data: fila, error: errorLectura } = await supabase
    .from("horas").select("estado").eq("id", id).single();
  if (errorLectura) throw new Error(errorLectura.message);

  const desde = fila.estado as EstadoHora;
  if (!transicionValida(desde, hasta)) {
    throw new Error(`No se puede pasar de ${desde} a ${hasta}.`);
  }

  const { data: actualizadas, error } = await supabase
    .from("horas")
    .update({ estado: hasta, ...campos })
    .eq("id", id)
    .eq("estado", desde) // compare-and-swap: si cambiÃ³ entremedio, no toca nada
    .select("id");
  if (error) throw new Error(error.message);
  if (!actualizadas || actualizadas.length === 0) {
    throw new Error("La hora cambiÃ³ de estado mientras la editabas. Recarga y reintenta.");
  }
  revalidatePath("/horas");
}

export async function iniciarCronometro(datos: FormData) {
  const supabase = await clienteServidor();
  const proyecto = datos.get("proyecto_id");
  const { error } = await supabase.from("horas").insert({
    tipo_trabajo: String(datos.get("tipo_trabajo") || "general"),
    proyecto_id: proyecto ? Number(proyecto) : null,
    estado: "corriendo",
  });
  if (error) {
    // El Ã­ndice parcial horas_una_corriendo es la garantÃ­a real; traducimos su
    // error de Postgres a algo legible en vez de mostrarlo crudo.
    if (error.code === "23505") throw new Error("Ya tienes un cronÃ³metro corriendo.");
    throw new Error(error.message);
  }
  revalidatePath("/horas");
}

export async function detenerCronometro() {
  const supabase = await clienteServidor();
  const { data: fila, error: errorLectura } = await supabase
    .from("horas").select("id, inicio, tipo_trabajo, descripcion")
    .eq("estado", "corriendo").maybeSingle();
  if (errorLectura) throw new Error(errorLectura.message);
  if (!fila) throw new Error("No hay ningÃºn cronÃ³metro corriendo.");

  const fin = new Date();
  // Piso de una dÃ©cima: minutosEntre da 0 bajo el minuto y la columna exige > 0.
  const duracion = Math.max(PASO_MIN, redondearPaso(minutosEntre(fila.inicio, fin)));
  const descripcion = fila.descripcion || plantillaDe(fila.tipo_trabajo);

  const { error } = await supabase.from("horas").update({
    fin: fin.toISOString(),
    duracion_min: duracion,
    descripcion,
    estado: "borrador",
  }).eq("id", fila.id);
  if (error) throw new Error(error.message);
  revalidatePath("/horas");
}

export async function actualizarHora(id: string, datos: FormData) {
  const supabase = await clienteServidor();
  const proyecto = datos.get("proyecto_id");
  const duracion = datos.get("duracion_min");
  // No basta con "duracion truthy": "0" tambiÃ©n lo es y redondearPaso(0) da 0,
  // lo que revienta el check (duracion_min > 0). Tampoco hay que confiar en que
  // el string sea numÃ©rico o positivo: texto no numÃ©rico da NaN, y un negativo
  // como "-5" pasa Number.isFinite y redondearPaso(-5) da 0 por su propia
  // guarda, lo que Math.max convertirÃ­a en 6 sin avisar. Cualquiera de esos
  // casos (vacÃ­o, no numÃ©rico, cero o negativo) se trata igual: null.
  const minutos = duracion ? Number(duracion) : null;
  const duracionMin = minutos !== null && Number.isFinite(minutos) && minutos > 0
    ? Math.max(PASO_MIN, redondearPaso(minutos))
    : null;
  const { data: actualizadas, error } = await supabase
    .from("horas")
    .update({
      proyecto_id: proyecto ? Number(proyecto) : null,
      duracion_min: duracionMin,
      tipo_trabajo: String(datos.get("tipo_trabajo") || "general"),
      descripcion: String(datos.get("descripcion") || ""),
      facturable: datos.get("facturable") === "on",
    })
    .eq("id", id)
    .in("estado", ["borrador", "aprobada", "error"])
    .select("id");
  if (error) throw new Error(error.message);
  if (!actualizadas || actualizadas.length === 0) {
    throw new Error("Esta hora ya se cargÃ³ en TimeBilling; no se puede editar.");
  }
  revalidatePath("/horas");
}

export async function aprobarHora(id: string) {
  const supabase = await clienteServidor();
  const { data: fila, error } = await supabase
    .from("horas").select("proyecto_id, duracion_min, descripcion").eq("id", id).single();
  if (error) throw new Error(error.message);

  if (!fila.proyecto_id) throw new Error("Falta el proyecto de TimeBilling.");
  if (!fila.duracion_min) throw new Error("Falta la duraciÃ³n.");
  if (!fila.descripcion.trim()) throw new Error("Falta la descripciÃ³n.");
  if (tieneMarcadores(fila.descripcion)) {
    throw new Error("La descripciÃ³n todavÃ­a tiene campos sin rellenar.");
  }

  await moverEstado(id, "aprobada", { error_carga: null });
}

export async function desaprobarHora(id: string) {
  await moverEstado(id, "borrador");
}

export async function eliminarHora(id: string) {
  const supabase = await clienteServidor();
  const { data: eliminadas, error } = await supabase
    .from("horas")
    .delete()
    .eq("id", id)
    .in("estado", ["borrador", "error"])
    .select("id");
  if (error) throw new Error(error.message);
  if (!eliminadas || eliminadas.length === 0) {
    throw new Error("Esta hora ya estÃ¡ aprobada o cargada en TimeBilling; no se puede borrar.");
  }
  revalidatePath("/horas");
}
