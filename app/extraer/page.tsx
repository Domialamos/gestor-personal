import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { fechaHora } from "@/lib/formato";
import { plantilla } from "@/lib/plantillas-extraccion";
import { FormularioExtraccion } from "./formulario";

export const dynamic = "force-dynamic";
// Leer un PDF escaneado lo transcribe Claude en esta misma llamada
export const maxDuration = 300;

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  procesando: { texto: "en proceso", clase: "estado--alerta" },
  lista: { texto: "lista", clase: "estado--ok" },
  error: { texto: "con error", clase: "estado--riesgo" },
};

export default async function Extraer({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await clienteServidor();

  let consulta = supabase
    .from("extracciones")
    .select("id,titulo,plantilla,cliente,archivo_nombre,estado,tramos_hechos,tramos_total,creado_en,extraccion_items(count)")
    .order("creado_en", { ascending: false })
    .limit(200);
  if (q) consulta = consulta.or(`titulo.ilike.%${q}%,cliente.ilike.%${q}%,archivo_nombre.ilike.%${q}%`);

  const [{ data: extracciones }, proyectos] = await Promise.all([
    consulta,
    supabase.from("tb_proyectos").select("proyecto_id,nombre,cliente").eq("activo", true).order("cliente").order("nombre").limit(3000),
  ]);

  return (
    <main>
      <h1 className="titulo">
        Extraer <em>datos</em>
      </h1>
      <p className="bajada">
        Contratos, expedientes e informes convertidos en una tabla de datos. Cada dato trae la cita exacta y se subraya en el documento.
      </p>

      <details className="card card--destacada revelar" open={!extracciones?.length} style={{ marginBottom: "2rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Nueva extracción</summary>
        <FormularioExtraccion proyectos={proyectos.data ?? []} />
      </details>

      <form className="filtros">
        <input className="buscador" name="q" defaultValue={q ?? ""} placeholder="Buscar por título, cliente o archivo" />
        <span className="contador">{extracciones?.length ?? 0} extracciones</span>
      </form>

      {!extracciones?.length ? (
        <p className="vacio">Todavía no hay <em>extracciones</em>.</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Documento</th><th>Tipo</th><th>Cliente</th><th className="num">Datos</th><th>Estado</th><th>Fecha</th></tr>
          </thead>
          <tbody>
            {extracciones.map((e) => {
              const estado = ESTADOS[e.estado] ?? ESTADOS.error;
              const datos = (e.extraccion_items as unknown as { count: number }[])[0]?.count ?? 0;
              return (
                <tr key={e.id}>
                  <td>
                    <Link className="enlace" href={`/extraer/${e.id}`}>{e.titulo}</Link>
                    {e.archivo_nombre && e.archivo_nombre !== e.titulo && <div className="meta">{e.archivo_nombre}</div>}
                  </td>
                  <td>{plantilla(e.plantilla).nombre}</td>
                  <td>{e.cliente ?? "—"}</td>
                  <td className="num">{datos}</td>
                  <td>
                    <span className={`estado ${estado.clase}`}>
                      {estado.texto}{e.estado === "procesando" ? ` ${e.tramos_hechos}/${e.tramos_total}` : ""}
                    </span>
                  </td>
                  <td className="meta">{fechaHora(e.creado_en)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
