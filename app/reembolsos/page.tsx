import { clienteServidor } from "@/lib/supabase/servidor";
import { TablaReembolsos } from "./tabla";
import { crearReembolso } from "./acciones";

export const dynamic = "force-dynamic";

export default async function Reembolsos() {
  const supabase = await clienteServidor();
  const { data } = await supabase.from("reembolsos").select("*").order("creado_en", { ascending: false });

  return (
    <main>
      <h1 className="titulo">
        Reembolsos de <em>salud</em>
      </h1>
      <p className="bajada">
        El circuito completo: primero bonifica la isapre y el saldo va al seguro complementario. Aquí no se pierde ninguna boleta.
      </p>

      <details className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Nueva prestación</summary>
        <form action={crearReembolso} className="formulario" style={{ marginTop: "1rem" }}>
          <label className="campo">¿Qué prestación?<input name="descripcion" required placeholder="Consulta, examen, dental…" /></label>
          <label className="campo">Prestador<input name="prestador" placeholder="Clínica Alemana…" /></label>
          <label className="campo">Fecha de la prestación<input name="fecha_prestacion" type="date" /></label>
          <label className="campo">Monto total<input name="monto_total" type="number" step="1" min="0" required /></label>
          <label className="campo">Notas<input name="notas" /></label>
          <button className="pill pill--primaria">Guardar</button>
        </form>
      </details>

      <TablaReembolsos filas={data ?? []} />
    </main>
  );
}
