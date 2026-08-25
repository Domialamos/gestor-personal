import { clienteServidor } from "@/lib/supabase/servidor";
import { fecha as fmtFecha, fechaHora, hoyChile } from "@/lib/formato";
import { crearTarea, completarTarea, reabrirTarea, eliminarTarea } from "./acciones";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = {
  correo: "Correo",
  documento: "Documento",
  encargo: "Encargo",
  llamada: "Llamada",
  reunion: "Reunión",
  otro: "Otro",
};

export default async function Tareas({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await clienteServidor();
  const hoy = hoyChile();

  const manana = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const [pendientes, hechasHoy, proyectos, eventosHoy] = await Promise.all([
    // Las pendientes se arrastran: se muestran todas, con las de fecha límite primero
    supabase.from("tareas").select("*").eq("estado", "pendiente").order("fecha_limite", { ascending: true, nullsFirst: false }).order("creado_en"),
    supabase.from("tareas").select("*").eq("estado", "hecha").gte("completada_en", hoy + "T03:00:00Z").order("completada_en", { ascending: false }),
    supabase.from("tb_proyectos").select("proyecto_id,nombre,cliente").eq("activo", true).order("cliente").order("nombre").limit(3000),
    supabase.from("eventos_cache").select("id,titulo,inicio,todo_el_dia,ubicacion").gte("inicio", hoy).lt("inicio", manana).order("inicio").limit(12),
  ]);

  let bitacora = supabase.from("tareas").select("*").order("creado_en", { ascending: false }).limit(300);
  if (q) bitacora = bitacora.or(`cliente.ilike.%${q}%,titulo.ilike.%${q}%,detalle.ilike.%${q}%,documento.ilike.%${q}%`);
  const { data: historial } = await bitacora;

  return (
    <main>
      <h1 className="titulo">
        Tareas y <em>bitácora</em>
      </h1>
      <p className="bajada">
        El to-do de hoy alimenta un historial por cliente: qué se hizo, qué documento fue y cuándo se envió.
      </p>

      <details className="card card--destacada revelar" open style={{ marginBottom: "2rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Nueva tarea</summary>
        <form action={crearTarea} className="formulario" style={{ marginTop: "1rem" }}>
          <label className="campo">¿Qué hay que hacer?<input name="titulo" required placeholder="Enviar prórroga firmada…" /></label>
          <label className="campo">Tipo
            <select name="tipo" defaultValue="encargo">
              {Object.entries(TIPOS).map(([v, e]) => <option key={v} value={v}>{e}</option>)}
            </select>
          </label>
          <label className="campo">Cliente — Asunto (TimeBilling)
            <input name="asunto_texto" list="asuntos" placeholder="Escribe el cliente: Food Group…" autoComplete="off" />
          </label>
          <datalist id="asuntos">
            {(proyectos.data ?? []).map((p) => (
              <option key={p.proyecto_id} value={`${p.cliente ? p.cliente + " — " : ""}${p.nombre}`} />
            ))}
          </datalist>
          <label className="campo">Cliente (si no está en la lista)<input name="cliente" placeholder="Se completa solo desde el asunto" /></label>
          <label className="campo">Documento o enlace<input name="documento" placeholder="Prórroga v2.docx, iwl://… , url" /></label>
          <label className="campo">Recordar el (opcional)<input name="fecha_limite" type="date" /></label>
          <label className="campo">Detalle<input name="detalle" placeholder="A quién, con copia a…" /></label>
          <button className="pill pill--primaria">Anotar</button>
        </form>
      </details>

      <div className="grilla grilla--2" style={{ marginBottom: "2rem" }}>
        <section className="card card--destacada revelar">
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>Para <span className="serif">hoy</span></h2>
          {(eventosHoy.data ?? []).length > 0 && (
            <div style={{ marginBottom: "0.75rem", paddingBottom: "0.75rem", borderBottom: "1px solid var(--filete-suave)" }}>
              {(eventosHoy.data ?? []).map((e) => (
                <p key={e.id} style={{ margin: "0.3rem 0", fontSize: "0.875rem" }}>
                  <span className="estado estado--info">{e.todo_el_dia ? "todo el día" : fechaHora(e.inicio).split(" ").pop()}</span>{" "}
                  {e.titulo}{e.ubicacion ? <span className="meta"> · {e.ubicacion}</span> : null}
                </p>
              ))}
            </div>
          )}
          {(pendientes.data ?? []).length === 0 ? (
            <p className="meta">Nada pendiente. Día despejado.</p>
          ) : (
            (pendientes.data ?? []).map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", margin: "0.5rem 0" }}>
                <form action={completarTarea.bind(null, t.id)}>
                  <button className="pill pill--mini" title="Marcar hecha">✓</button>
                </form>
                <span style={{ fontSize: "0.938rem" }}>
                  {t.titulo}
                  <span className="meta"> · {TIPOS[t.tipo] ?? t.tipo}{t.cliente ? ` · ${t.cliente}` : ""}{t.fecha !== hoy ? ` · desde ${fmtFecha(t.fecha)}` : ""}</span>
                  {t.fecha_limite && (
                    <span className={`estado ${t.fecha_limite <= hoy ? "estado--riesgo" : "estado--alerta"}`} style={{ marginLeft: "0.4rem" }}>
                      {t.fecha_limite < hoy ? `venció ${fmtFecha(t.fecha_limite)}` : t.fecha_limite === hoy ? "para hoy" : fmtFecha(t.fecha_limite)}
                    </span>
                  )}
                </span>
                <form action={eliminarTarea.bind(null, t.id)} style={{ marginLeft: "auto" }}>
                  <button className="pill pill--mini" title="Eliminar">×</button>
                </form>
              </div>
            ))
          )}
        </section>

        <section className="card card--destacada revelar">
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>Hecho <span className="serif">hoy</span></h2>
          {(hechasHoy.data ?? []).length === 0 ? (
            <p className="meta">Aún nada marcado hoy.</p>
          ) : (
            (hechasHoy.data ?? []).map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", margin: "0.5rem 0" }}>
                <span className="estado estado--ok">✓</span>
                <span style={{ fontSize: "0.938rem" }}>
                  {t.titulo}
                  <span className="meta"> · {TIPOS[t.tipo] ?? t.tipo}{t.cliente ? ` · ${t.cliente}` : ""}</span>
                </span>
                <form action={reabrirTarea.bind(null, t.id)} style={{ marginLeft: "auto" }}>
                  <button className="pill pill--mini" title="Reabrir">↩</button>
                </form>
              </div>
            ))
          )}
        </section>
      </div>

      <section className="revelar">
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.5rem" }}>La <span className="serif">bitácora</span></h2>
        <form className="filtros" method="get">
          <input className="buscador" name="q" defaultValue={q ?? ""} placeholder="Buscar cliente, tarea, documento…" />
          <button className="pill">Buscar</button>
          {q && <a className="pill" href="/tareas">Limpiar</a>}
          <span className="contador">{historial?.length ?? 0} registros</span>
        </form>
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Tarea</th><th>Documento</th><th>Enviado / hecho</th>
            </tr>
          </thead>
          <tbody>
            {(historial ?? []).map((t) => (
              <tr key={t.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtFecha(t.fecha)}</td>
                <td>{t.cliente ?? <span className="meta">—</span>}</td>
                <td><span className={`estado ${t.tipo === "correo" ? "estado--info" : "estado--neutro"}`}>{TIPOS[t.tipo] ?? t.tipo}</span></td>
                <td>{t.titulo}{t.detalle ? <span className="meta"> · {t.detalle}</span> : null}</td>
                <td>
                  {t.documento
                    ? /^(https?|iwl):/.test(t.documento)
                      ? <a className="enlace" href={t.documento}>{t.documento.length > 40 ? t.documento.slice(0, 40) + "…" : t.documento}</a>
                      : t.documento
                    : <span className="meta">—</span>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {t.estado === "hecha" && t.completada_en
                    ? fechaHora(t.completada_en)
                    : <span className="estado estado--alerta">pendiente</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(historial ?? []).length === 0 && <p className="vacio">Nada registrado {q ? "con esa búsqueda" : "aún"}.</p>}
      </section>
    </main>
  );
}
