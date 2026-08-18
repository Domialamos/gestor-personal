import { clienteServidor } from "@/lib/supabase/servidor";
import { hoyChile } from "@/lib/formato";
import { VistaCalendario } from "./vista";
import { crearEvento } from "./acciones";

export const dynamic = "force-dynamic";

export default async function Calendario() {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("eventos_cache")
    .select("*")
    .gte("inicio", new Date(Date.now() - 864e5).toISOString())
    .order("inicio", { ascending: true })
    .limit(500);

  const sinIcs = !process.env.ICS_URL_GOOGLE && !process.env.ICS_URL_MICROSOFT;

  return (
    <main>
      <h1 className="titulo">
        Lo que <em>viene</em>
      </h1>
      <p className="bajada">Tus próximos días, con los calendarios de la universidad y del estudio en un solo lugar.</p>

      {sinIcs && (
        <div className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
          <strong>Falta conectar tus calendarios.</strong>
          <p style={{ fontSize: "0.938rem", margin: "0.5rem 0 0" }}>
            En Google Calendar: Configuración → tu calendario → Integrar → copia la «Dirección secreta en formato iCal».
            En Outlook: Configuración → Calendario → Calendarios compartidos → Publicar → copia el enlace ICS.
            Pega ambas URLs en Vercel como <code>ICS_URL_GOOGLE</code> e <code>ICS_URL_MICROSOFT</code> y el sitio se sincroniza solo.
            Mientras tanto puedes anotar eventos a mano aquí abajo.
          </p>
        </div>
      )}

      <details className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Nuevo evento manual</summary>
        <form action={crearEvento} className="formulario" style={{ marginTop: "1rem" }}>
          <label className="campo">¿Qué cosa?<input name="titulo" required /></label>
          <label className="campo">Fecha<input name="fecha" type="date" defaultValue={hoyChile()} required /></label>
          <label className="campo">Hora (vacío = todo el día)<input name="hora" type="time" /></label>
          <label className="campo">Lugar<input name="ubicacion" /></label>
          <button className="pill pill--primaria">Guardar</button>
        </form>
      </details>

      <VistaCalendario eventos={data ?? []} />
    </main>
  );
}
