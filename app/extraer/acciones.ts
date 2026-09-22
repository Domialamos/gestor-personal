"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { alinear, indexar, trocear } from "@/lib/extraer";
import { extraerDeTramo } from "@/lib/extraer-claude";
import { MODELO_EXTRACCION, textoDeArchivo } from "@/lib/leer-documento";
import { clasesDe, clasesLibres, etiquetaClase, plantilla, type Clase } from "@/lib/plantillas-extraccion";
import { hoyChile } from "@/lib/formato";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Tramos que se procesan en paralelo por llamada. Cada llamada tiene que caber
// en el techo de tiempo de Vercel; el navegador va pidiendo lote tras lote.
const LOTE = 4;

export type DatosNueva = {
  titulo: string;
  plantilla: string;
  clasesLibres: string;
  instrucciones: string;
  asuntoTexto: string;
  cliente: string;
  archivoRuta: string | null;
  archivoNombre: string | null;
  textoPegado: string;
};

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

// El asunto llega como "Cliente — Asunto" desde el selector; mismo criterio que en Tareas
async function resolverAsunto(supabase: Awaited<ReturnType<typeof clienteServidor>>, asuntoTexto: string, clienteLibre: string) {
  let proyectoId: number | null = null;
  let cliente = clienteLibre.trim() || null;
  if (asuntoTexto.trim()) {
    const [parteCliente, parteNombre] = asuntoTexto.split(" — ");
    let consulta = supabase.from("tb_proyectos").select("proyecto_id,cliente,nombre").eq("activo", true).limit(1);
    consulta = parteNombre
      ? consulta.ilike("cliente", parteCliente).ilike("nombre", parteNombre)
      : consulta.or(`cliente.ilike.%${parteCliente}%,nombre.ilike.%${parteCliente}%`);
    const { data } = await consulta;
    const p = data?.[0];
    if (p) {
      proyectoId = p.proyecto_id;
      cliente = cliente || p.cliente || p.nombre;
    } else {
      cliente = cliente || asuntoTexto;
    }
  }
  return { proyectoId, cliente };
}

export async function crearExtraccion(datos: DatosNueva): Promise<Resultado<string>> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Falta ANTHROPIC_API_KEY en el servidor." };
    const supabase = await clienteServidor();

    const clases: Clase[] = datos.plantilla === "libre" ? clasesLibres(datos.clasesLibres) : plantilla(datos.plantilla).clases;
    if (clases.length === 0) return { ok: false, error: "Escribe al menos una categoría que buscar." };

    let texto = datos.textoPegado;
    let transcrito = false;
    if (datos.archivoRuta && datos.archivoNombre) {
      const { data: archivo, error } = await supabase.storage.from("documentos").download(datos.archivoRuta);
      if (error || !archivo) return { ok: false, error: `No se pudo leer el archivo subido: ${error?.message ?? "vacío"}` };
      const leido = await textoDeArchivo(new Uint8Array(await archivo.arrayBuffer()), datos.archivoNombre);
      texto = leido.texto;
      transcrito = leido.transcrito;
    }
    // Retornos de carro de Windows fuera (las posiciones tienen que ser las mismas
    // que se muestran) y sin las decenas de líneas vacías que dejan los Word
    texto = texto.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    if (!texto.trim()) return { ok: false, error: "El documento no tiene texto que analizar." };

    const { proyectoId, cliente } = await resolverAsunto(supabase, datos.asuntoTexto, datos.cliente);
    const titulo = datos.titulo.trim() || datos.archivoNombre || "Texto pegado";

    const { data, error } = await supabase
      .from("extracciones")
      .insert({
        titulo,
        plantilla: plantilla(datos.plantilla).codigo,
        clases,
        instrucciones: datos.instrucciones.trim() || null,
        proyecto_id: proyectoId,
        cliente,
        archivo_nombre: datos.archivoNombre,
        archivo_ruta: datos.archivoRuta,
        texto,
        transcrito,
        tramos_total: trocear(texto).length,
        estado: "procesando",
        modelo: MODELO_EXTRACCION,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    revalidatePath("/extraer");
    return { ok: true, valor: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type Avance = { hechos: number; total: number; estado: string; error: string | null };

// Procesa el siguiente lote de tramos. Es idempotente por tramo: si se repite
// una llamada, los ítems de esos tramos se reemplazan en vez de duplicarse.
export async function procesarTramos(id: string): Promise<Avance> {
  const supabase = await clienteServidor();
  const { data: ex, error } = await supabase
    .from("extracciones")
    .select("titulo,texto,clases,plantilla,instrucciones,tramos_hechos,estado")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);

  const tramos = trocear(ex.texto);
  const total = tramos.length;
  if (ex.estado !== "procesando") return { hechos: ex.tramos_hechos, total, estado: ex.estado, error: null };

  const desde = ex.tramos_hechos;
  const lote = tramos.slice(desde, desde + LOTE);
  const clases = clasesDe(ex.plantilla, ex.clases as Clase[]);

  const resultados = await Promise.allSettled(
    lote.map((t, i) =>
      extraerDeTramo({
        fragmento: ex.texto.slice(t.inicio, t.fin),
        clases,
        instrucciones: ex.instrucciones,
        titulo: ex.titulo,
        numero: desde + i + 1,
        total,
      }),
    ),
  );

  // Se avanza hasta el primer tramo que falló: así el progreso queda contiguo y
  // un reintento parte justo desde ahí
  const indice = indexar(ex.texto);
  const filas: Record<string, unknown>[] = [];
  let avanzados = 0;
  let fallo: string | null = null;
  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i];
    if (r.status === "rejected") {
      fallo = r.reason instanceof Error ? r.reason.message : String(r.reason);
      break;
    }
    const tramo = lote[i];
    let cursor = tramo.inicio;
    r.value.forEach((e, orden) => {
      const u = alinear(indice, e.texto, tramo.inicio, tramo.fin, cursor);
      if (u.inicio != null) cursor = u.inicio;
      filas.push({
        extraccion_id: id,
        tramo: desde + i,
        orden,
        clase: e.clase,
        texto: e.texto,
        atributos: e.atributos,
        fecha: e.fecha,
        inicio: u.inicio,
        fin: u.fin,
        alineacion: u.alineacion,
      });
    });
    avanzados++;
  }

  if (avanzados > 0) {
    const { error: errorBorrar } = await supabase
      .from("extraccion_items")
      .delete()
      .eq("extraccion_id", id)
      .gte("tramo", desde)
      .lt("tramo", desde + avanzados);
    if (errorBorrar) throw new Error(errorBorrar.message);
    if (filas.length > 0) {
      const { error: errorInsertar } = await supabase.from("extraccion_items").insert(filas);
      if (errorInsertar) throw new Error(errorInsertar.message);
    }
  }

  const hechos = desde + avanzados;
  const estado = fallo ? "error" : hechos >= total ? "lista" : "procesando";
  const { error: errorActualizar } = await supabase
    .from("extracciones")
    .update({ tramos_hechos: hechos, tramos_total: total, estado, error: fallo })
    .eq("id", id);
  if (errorActualizar) throw new Error(errorActualizar.message);

  if (estado !== "procesando") revalidatePath("/extraer");
  return { hechos, total, estado, error: fallo };
}

// Tras un error: sigue desde el tramo que falló, sin repetir lo ya hecho
export async function reanudarExtraccion(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase.from("extracciones").update({ estado: "procesando", error: null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/extraer/${id}`);
}

// Un dato extraído pasa a ser tarea: con su cliente y asunto, y para su fecha
// si la tiene (un vencimiento, una audiencia); si no, para hoy
export async function crearTareaDesdeItem(itemId: string) {
  const supabase = await clienteServidor();
  const { data: item, error } = await supabase
    .from("extraccion_items")
    .select("id,clase,texto,atributos,fecha,tarea_id,extraccion_id,extracciones(titulo,cliente,proyecto_id,clases,plantilla)")
    .eq("id", itemId)
    .single();
  if (error) throw new Error(error.message);
  if (item.tarea_id) return;

  const ex = item.extracciones as unknown as { titulo: string; cliente: string | null; proyecto_id: number | null; clases: Clase[]; plantilla: string };
  const etiqueta = etiquetaClase(clasesDe(ex.plantilla, ex.clases), item.clase);
  const cita = item.texto.length > 140 ? item.texto.slice(0, 137) + "…" : item.texto;
  const atributos = Object.entries((item.atributos ?? {}) as Record<string, string>)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");

  const { data: tarea, error: errorTarea } = await supabase
    .from("tareas")
    .insert({
      titulo: `${etiqueta}: ${cita}`,
      tipo: "documento",
      proyecto_id: ex.proyecto_id,
      cliente: ex.cliente,
      documento: ex.titulo,
      detalle: atributos || null,
      fecha_limite: item.fecha ?? hoyChile(),
      prioridad: "media",
    })
    .select("id")
    .single();
  if (errorTarea) throw new Error(errorTarea.message);

  const { error: errorVinculo } = await supabase.from("extraccion_items").update({ tarea_id: tarea.id }).eq("id", itemId);
  if (errorVinculo) throw new Error(errorVinculo.message);
  revalidatePath(`/extraer/${item.extraccion_id}`);
  revalidatePath("/tareas");
}

// Borra la extracción, sus ítems (en cascada) y el archivo original.
// Solo se llama desde el botón "Eliminar", que pide confirmación.
export async function eliminarExtraccion(id: string) {
  const supabase = await clienteServidor();
  const { data: ex } = await supabase.from("extracciones").select("archivo_ruta").eq("id", id).single();
  if (ex?.archivo_ruta) await supabase.storage.from("documentos").remove([ex.archivo_ruta]);
  const { error } = await supabase.from("extracciones").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/extraer");
  redirect("/extraer");
}
