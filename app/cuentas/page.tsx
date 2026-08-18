import { clienteServidor } from "@/lib/supabase/servidor";
import { TablaCuentas } from "./tabla";
import { crearCuenta } from "./acciones";

export const dynamic = "force-dynamic";

export default async function Cuentas() {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("cuentas_por_pagar")
    .select("*")
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

  return (
    <main>
      <h1 className="titulo">
        Cuentas <em>por pagar</em>
      </h1>
      <p className="bajada">Lo que vence, cuándo vence y qué ya quedó saldado.</p>

      <details className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Nueva cuenta</summary>
        <form action={crearCuenta} className="formulario" style={{ marginTop: "1rem" }}>
          <label className="campo">¿Qué cuenta?<input name="nombre" required placeholder="Arriendo, gastos comunes…" /></label>
          <label className="campo">Categoría<input name="categoria" placeholder="hogar, salud, estudio…" /></label>
          <label className="campo">Monto<input name="monto" type="number" step="0.01" min="0" required /></label>
          <label className="campo">Moneda<select name="moneda"><option>CLP</option><option>UF</option></select></label>
          <label className="campo">Vence<input name="fecha_vencimiento" type="date" /></label>
          <label className="campo">Día del mes (si es recurrente)<input name="dia_vencimiento" type="number" min="1" max="31" /></label>
          <label className="campo" style={{ gridTemplateColumns: "auto 1fr", alignItems: "center", display: "flex", gap: "0.5rem" }}>
            <input name="recurrente" type="checkbox" style={{ height: "1.25rem", width: "1.25rem" }} /> Se repite cada mes
          </label>
          <label className="campo">Notas<input name="notas" /></label>
          <button className="pill pill--primaria">Guardar</button>
        </form>
      </details>

      <TablaCuentas filas={data ?? []} />
    </main>
  );
}
