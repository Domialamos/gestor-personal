import { clienteServidor } from "@/lib/supabase/servidor";
import { Cronometro } from "./cronometro";
import { TablaHoras, type Hora } from "./tabla";

export const dynamic = "force-dynamic";

export default async function Horas() {
  const supabase = await clienteServidor();
  const { data: filas } = await supabase
    .from("horas").select("*").order("inicio", { ascending: false }).limit(500);
  const { data: proyectos } = await supabase
    .from("tb_proyectos").select("proyecto_id, nombre, cliente").eq("activo", true).order("nombre");

  const todas = (filas ?? []) as Hora[];
  const corriendo = todas.find((f) => f.estado === "corriendo") ?? null;
  const resto = todas.filter((f) => f.estado !== "corriendo");

  return (
    <main>
      <h1 className="titulo">Mis <em>horas</em></h1>
      <p className="bajada">Cronómetro, revisión y carga a TimeBilling. Nada se envía sin que lo apruebes.</p>

      <Cronometro
        corriendo={corriendo ? { id: corriendo.id, inicio: corriendo.inicio, tipo_trabajo: corriendo.tipo_trabajo } : null}
        proyectos={proyectos ?? []}
      />

      <TablaHoras
        filas={resto}
        proyectos={proyectos ?? []}
        pulidoDisponible={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </main>
  );
}
