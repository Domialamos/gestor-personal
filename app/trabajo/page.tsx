import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { fecha, fechaHora, hoyChile } from "@/lib/formato";
import { ETIQUETAS_TEMAS } from "@/lib/temas";

export const dynamic = "force-dynamic";

export default async function Trabajo() {
  const supabase = await clienteServidor();
  const hoy = hoyChile();
  const inicioSemana = new Date(Date.now() - 6 * 864e5).toISOString();

  const [eventos, legales, horas, tareas, recordatorios] = await Promise.all([
    supabase.from("eventos_cache").select("id,titulo,inicio,todo_el_dia,ubicacion").gte("inicio", new Date().toISOString()).order("inicio").limit(8),
    supabase.from("noticias").select("id,titulo,fuente,url,publicado_en,temas").eq("tipo", "legal").order("publicado_en", { ascending: false }).limit(6),
    supabase.from("horas").select("inicio,fin,estado").gte("inicio", inicioSemana).limit(500),
    supabase.from("tareas").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    supabase.from("tareas").select("id,titulo,cliente,fecha_limite").eq("estado", "pendiente").not("fecha_limite", "is", null)
      .lte("fecha_limite", new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)).order("fecha_limite").limit(12),
  ]);

  const eventosHoy = (eventos.data ?? []).filter((e) => e.inicio.slice(0, 10) === hoy);
  const minutosSemana = (horas.data ?? [])
    .filter((h) => h.fin)
    .reduce((s, h) => s + (new Date(h.fin as string).getTime() - new Date(h.inicio).getTime()) / 60000, 0);
  const horasSemana = (minutosSemana / 60).toFixed(1);
  const corriendo = (horas.data ?? []).some((h) => h.estado === "corriendo");

  return (
    <main>
      <h1 className="titulo">
        Mi <em>trabajo</em>
      </h1>
      <p className="bajada">Agenda de Outlook y Teams, carga de horas y radar legal, en un solo lugar.</p>

      <div className="kpis">
        <div className="card kpi revelar"><b>{eventosHoy.length}</b><span>Reuniones hoy</span></div>
        <div className="card kpi revelar"><b>{horasSemana}</b><span>Horas últimos 7 días</span></div>
        <div className="card kpi revelar"><b>{tareas.count ?? 0}</b><span>Tareas pendientes</span></div>
        <div className="card kpi revelar"><b>{corriendo ? "Sí" : "No"}</b><span>Cronómetro corriendo</span></div>
        <div className="card kpi revelar"><b>{legales.data?.length ?? 0}</b><span>Novedades legales</span></div>
      </div>

      {/* Espacio fijo del hub: se muestra siempre, aunque no haya nada que recordar */}
      <section className="card card--destacada revelar" style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>No <span className="serif">olvidar</span></h2>
        {(recordatorios.data ?? []).length === 0 ? (
          <p className="meta">Nada con fecha en los próximos 7 días.</p>
        ) : (
          (recordatorios.data ?? []).map((t) => (
            <p key={t.id} style={{ margin: "0.4rem 0", fontSize: "0.938rem" }}>
              <span className={`estado ${t.fecha_limite! <= hoy ? "estado--riesgo" : "estado--alerta"}`}>{fecha(t.fecha_limite)}</span>{" "}
              {t.titulo}{t.cliente ? <span className="meta"> · {t.cliente}</span> : null}
            </p>
          ))
        )}
        <Link className="pill pill--mini" href="/tareas" style={{ marginTop: "0.5rem" }}>Ver tareas</Link>
      </section>

      <div className="grilla grilla--2">
        <section className="card card--destacada revelar">
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>Agenda <span className="serif">próxima</span></h2>
          {(eventos.data ?? []).length === 0 ? (
            <p className="meta">Nada agendado. <Link className="enlace" href="/calendario">Conectar calendarios</Link></p>
          ) : (
            (eventos.data ?? []).map((e) => (
              <p key={e.id} style={{ margin: "0.4rem 0", fontSize: "0.938rem" }}>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{e.todo_el_dia ? fecha(e.inicio) : fechaHora(e.inicio)}</strong>{" "}
                {e.titulo}
                {e.ubicacion ? <span className="meta"> · {e.ubicacion}</span> : null}
              </p>
            ))
          )}
          <Link className="pill pill--mini" href="/calendario" style={{ marginTop: "0.5rem" }}>Ver calendario</Link>
        </section>

        <section className="card card--destacada revelar">
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>Radar <span className="serif">legal</span></h2>
          {(legales.data ?? []).length === 0 ? (
            <p className="meta">Sin novedades legales aún; el radar corre cada mañana hábil.</p>
          ) : (
            (legales.data ?? []).map((n) => (
              <p key={n.id} style={{ margin: "0.4rem 0", fontSize: "0.938rem" }}>
                <a className="enlace" href={n.url} target="_blank" rel="noreferrer">{n.titulo}</a>{" "}
                <span className="meta">{n.fuente}{(n.temas ?? []).length ? " · " + (n.temas as string[]).map((t) => ETIQUETAS_TEMAS[t] ?? t).join(", ") : ""}</span>
              </p>
            ))
          )}
          <Link className="pill pill--mini" href="/noticias-legales" style={{ marginTop: "0.5rem" }}>Ver radar</Link>
        </section>
      </div>

      <p style={{ marginTop: "1.25rem" }}>
        <Link className="pill" href="/tareas">Ir a tareas y bitácora</Link>{" "}
        <Link className="pill" href="/horas">Ir a la carga de horas</Link>
      </p>
    </main>
  );
}
