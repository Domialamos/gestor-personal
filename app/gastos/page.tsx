import { clienteServidor } from "@/lib/supabase/servidor";
import { hoyChile } from "@/lib/formato";
import { TablaGastos } from "./tabla";
import { crearGasto } from "./acciones";

export const dynamic = "force-dynamic";

export default async function Gastos() {
  const supabase = await clienteServidor();
  const { data } = await supabase.from("gastos").select("*").order("fecha", { ascending: false }).limit(1000);

  return (
    <main>
      <h1 className="titulo">
        Mis <em>gastos</em>
      </h1>
      <p className="bajada">Cada peso registrado a mano hoy; mañana, importado desde el banco.</p>

      <details className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Nuevo gasto</summary>
        <form action={crearGasto} className="formulario" style={{ marginTop: "1rem" }}>
          <label className="campo">Fecha<input name="fecha" type="date" defaultValue={hoyChile()} required /></label>
          <label className="campo">¿En qué?<input name="descripcion" required placeholder="Supermercado, bencina…" /></label>
          <label className="campo">Categoría<input name="categoria" placeholder="hogar, comida, auto…" /></label>
          <label className="campo">Monto<input name="monto" type="number" step="0.01" min="0" required /></label>
          <label className="campo">Moneda<select name="moneda"><option>CLP</option><option>UF</option></select></label>
          <label className="campo">Medio de pago<input name="medio_pago" placeholder="tarjeta, débito, efectivo…" /></label>
          <button className="pill pill--primaria">Guardar</button>
        </form>
      </details>

      <TablaGastos filas={data ?? []} />
    </main>
  );
}
