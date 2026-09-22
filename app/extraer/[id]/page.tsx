import Link from "next/link";
import { notFound } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";
import { fechaHora } from "@/lib/formato";
import { clasesDe, plantilla, type Clase } from "@/lib/plantillas-extraccion";
import { Procesador, Reanudar } from "./procesador";
import { VistaExtraccion, type Item } from "./vista";

export const dynamic = "force-dynamic";
// Cada lote de tramos es una llamada a Claude dentro de una Server Action de esta página
export const maxDuration = 300;

export default async function Extraccion({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await clienteServidor();

  const [{ data: ex }, { data: items }] = await Promise.all([
    supabase.from("extracciones").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("extraccion_items")
      .select("id,tramo,orden,clase,texto,atributos,fecha,inicio,fin,alineacion,tarea_id")
      .eq("extraccion_id", id)
      .order("tramo")
      .order("orden"),
  ]);
  if (!ex) notFound();

  const clases = clasesDe(ex.plantilla, ex.clases as Clase[]);
  let urlOriginal: string | null = null;
  if (ex.archivo_ruta) {
    const { data } = await supabase.storage.from("documentos").createSignedUrl(ex.archivo_ruta, 3600);
    urlOriginal = data?.signedUrl ?? null;
  }

  return (
    <main>
      <p className="meta" style={{ margin: "0 0 0.5rem" }}>
        <Link className="enlace" href="/extraer">← Extracciones</Link>
      </p>
      <h1 className="titulo">{ex.titulo}</h1>
      <p className="bajada" style={{ marginBottom: "1.5rem", maxWidth: "none" }}>
        {plantilla(ex.plantilla).nombre}
        {ex.cliente ? ` · ${ex.cliente}` : ""}
        {` · ${fechaHora(ex.creado_en)}`}
        {ex.transcrito ? " · PDF escaneado, texto transcrito por Claude" : ""}
        {urlOriginal && (
          <>
            {" · "}
            <a className="enlace" href={urlOriginal} target="_blank" rel="noreferrer">
              Ver original{ex.archivo_nombre ? ` (${ex.archivo_nombre})` : ""}
            </a>
          </>
        )}
      </p>

      {ex.estado === "procesando" && <Procesador id={ex.id} hechos={ex.tramos_hechos} total={ex.tramos_total} />}
      {ex.estado === "error" && <Reanudar id={ex.id} error={ex.error} />}

      <VistaExtraccion
        id={ex.id}
        titulo={ex.titulo}
        texto={ex.texto}
        clases={clases}
        items={(items ?? []) as Item[]}
        instrucciones={ex.instrucciones}
      />
    </main>
  );
}
