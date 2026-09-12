import { clienteServidor } from "@/lib/supabase/servidor";
import { fecha as fmtFecha, fechaHora, hoyChile } from "@/lib/formato";
import {
  crearTarea,
  completarTarea,
  reabrirTarea,
  eliminarTarea,
  delegarTarea,
  registrarSeguimiento,
  retomarTarea,
} from "./acciones";
import { SelectorClienteAsunto } from "@/componentes/selector-cliente-asunto";
import {
  agruparPendientes,
  diasSinMover,
  normalizarPrioridad,
  ordenarEsperando,
  PRIORIDADES,
  ultimoMovimiento,
} from "@/lib/tareas";

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
  const [pendientes, esperando, hechasHoy, proyectos, eventosHoy] = await Promise.all([
    // Las pendientes se arrastran, pero lo que vence en más de una semana (los plazos
    // largos de una carta Gantt) no ensucia el to-do del día: queda en la bitácora y
    // reaparece aquí cuando entra en los próximos 7 días
    // El orden final no sale de la base: agruparPendientes() ordena por día y
    // después por prioridad, para que nada de más adelante quede sobre lo de hoy
    supabase.from("tareas").select("*").eq("estado", "pendiente")
      .or(`fecha_limite.is.null,fecha_limite.lte.${new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)}`)
      .order("creado_en"),
    // Las delegadas traen su historial de seguimientos: el orden del bloque
    // "Esperando" se calcula con él, no con la fecha límite
    supabase.from("tareas").select("*, seguimientos(fecha, nota)").eq("estado", "esperando").order("delegada_en"),
    supabase.from("tareas").select("*").eq("estado", "hecha").gte("completada_en", hoy + "T03:00:00Z").order("completada_en", { ascending: false }),
    supabase.from("tb_proyectos").select("proyecto_id,nombre,cliente").eq("activo", true).order("cliente").order("nombre").limit(3000),
    supabase.from("eventos_cache").select("id,titulo,inicio,todo_el_dia,ubicacion").gte("inicio", hoy).lt("inicio", manana).order("inicio").limit(12),
  ]);

  const gruposPendientes = agruparPendientes(pendientes.data ?? [], hoy);
  const delegadas = ordenarEsperando(esperando.data ?? [], hoy);

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
          <SelectorClienteAsunto proyectos={proyectos.data ?? []} />
          <label className="campo">Cliente (si no está en la lista)<input name="cliente" placeholder="Se completa solo desde el asunto" /></label>
          <label className="campo">Documento o enlace<input name="documento" placeholder="Prórroga v2.docx, iwl://… , url" /></label>
          {/* Obligatoria: sin fecha el to-do no se puede ordenar por día */}
          <label className="campo">Para cuándo<input name="fecha_limite" type="date" required defaultValue={hoy} /></label>
          <label className="campo">Prioridad
            <select name="prioridad" defaultValue="media">
              {PRIORIDADES.map((p) => <option key={p.codigo} value={p.codigo}>{p.etiqueta}</option>)}
            </select>
          </label>
          <label className="campo">Detalle<input name="detalle" placeholder="A quién, con copia a…" /></label>
          {/* Si se llena, la tarea nace en Esperando en vez de en tu to-do */}
          <label className="campo">Encargar a (opcional)<input name="delegada_a" placeholder="Isidora, Benjamín… (queda esperando, no en tu día)" /></label>
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
          {gruposPendientes.length === 0 ? (
            <p className="meta">Nada pendiente. Día despejado.</p>
          ) : (
            gruposPendientes.map((grupo) => (
              <div key={grupo.clave} style={{ marginTop: "0.75rem" }}>
                <p style={{ margin: "0 0 0.25rem" }}>
                  {grupo.vencido ? (
                    <span className="estado estado--riesgo">{grupo.titulo}</span>
                  ) : (
                    <span
                      className="meta"
                      style={{ textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}
                    >
                      {grupo.titulo}
                    </span>
                  )}
                </p>
                {grupo.tareas.map((t) => (
                  <div key={t.id} style={{ display: "flex", alignItems: "baseline", gap: "0.6rem", margin: "0.5rem 0", flexWrap: "wrap" }}>
                    <form action={completarTarea.bind(null, t.id)}>
                      <button className="pill pill--mini" title="Marcar hecha" aria-label="Marcar hecha">✓ Hecha</button>
                    </form>
                    <span style={{ fontSize: "0.938rem" }}>
                      {normalizarPrioridad(t.prioridad) === "alta" && (
                        <span title="Prioridad alta" aria-label="Prioridad alta" style={{ marginRight: "0.35rem" }}>●</span>
                      )}
                      {t.titulo}
                      <span className="meta"> · {TIPOS[t.tipo] ?? t.tipo}{t.cliente ? ` · ${t.cliente}` : ""}{t.fecha !== hoy ? ` · desde ${fmtFecha(t.fecha)}` : ""}</span>
                      {/* El encabezado ya dice el día; la fecha exacta solo aporta en lo vencido */}
                      {grupo.vencido && t.fecha_limite && (
                        <span className="estado estado--riesgo" style={{ marginLeft: "0.4rem" }}>
                          venció {fmtFecha(t.fecha_limite)}
                        </span>
                      )}
                    </span>
                    {/* El campo de encargo va plegado: cuando estaba suelto en la fila,
                        en pantalla angosta se apretaba por error en vez de "Hecha" */}
                    <details style={{ marginLeft: "auto" }}>
                      <summary className="pill pill--mini" style={{ cursor: "pointer", listStyle: "none" }}>
                        Encargar…
                      </summary>
                      <form
                        action={delegarTarea.bind(null, t.id)}
                        style={{ display: "flex", gap: "0.3rem", marginTop: "0.3rem" }}
                      >
                        <input
                          name="delegada_a"
                          required
                          placeholder="¿A quién?"
                          style={{ width: "9rem", fontSize: "0.813rem", padding: "0.15rem 0.4rem" }}
                        />
                        <button className="pill pill--mini" title="Derivar y dejar esperando">Derivar</button>
                      </form>
                    </details>
                    <form action={eliminarTarea.bind(null, t.id)}>
                      <button className="pill pill--mini" title="Eliminar" aria-label="Eliminar">×</button>
                    </form>
                  </div>
                ))}
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

      {/* Lo que se le encargó a otra persona: no es tu to-do, pero no se olvida */}
      <section className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
        <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>
          Esperando <span className="serif">a otros</span>
        </h2>
        {delegadas.length === 0 ? (
          <p className="meta">No tienes nada encargado a otra persona.</p>
        ) : (
          delegadas.map((t) => {
            const dias = diasSinMover(t, hoy);
            const seguimientos = t.seguimientos ?? [];
            const ultimo = ultimoMovimiento(t);
            return (
              <div key={t.id} style={{ margin: "0.75rem 0", paddingBottom: "0.75rem", borderBottom: "1px solid var(--filete-suave)" }}>
                <p style={{ margin: "0 0 0.2rem", fontSize: "0.938rem" }}>
                  {normalizarPrioridad(t.prioridad) === "alta" && (
                    <span title="Prioridad alta" aria-label="Prioridad alta" style={{ marginRight: "0.35rem" }}>●</span>
                  )}
                  {t.titulo}
                  <span className="meta"> · {TIPOS[t.tipo] ?? t.tipo}{t.cliente ? ` · ${t.cliente}` : ""}</span>
                  <strong style={{ marginLeft: "0.4rem" }}>→ {t.delegada_a}</strong>
                  {/* Tres días sin moverse ya merece un aviso */}
                  {dias >= 3 && (
                    <span className={`estado ${dias >= 7 ? "estado--riesgo" : "estado--alerta"}`} style={{ marginLeft: "0.4rem" }}>
                      {dias} días sin moverse
                    </span>
                  )}
                </p>
                <p className="meta" style={{ margin: "0 0 0.4rem" }}>
                  pedido el {fmtFecha(t.delegada_en)}
                  {seguimientos.length === 0
                    ? " · sin insistir todavía"
                    : ` · insististe ${seguimientos.length} ${seguimientos.length === 1 ? "vez" : "veces"} · última el ${fmtFecha(ultimo)}`}
                </p>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                  <form action={registrarSeguimiento.bind(null, t.id)} style={{ display: "flex", gap: "0.3rem" }}>
                    <input
                      name="nota"
                      placeholder="Nota del seguimiento (opcional)"
                      style={{ width: "14rem", fontSize: "0.813rem", padding: "0.15rem 0.4rem" }}
                    />
                    <button className="pill pill--mini" title="Anotar que insististe hoy">Insistí hoy</button>
                  </form>
                  <form action={retomarTarea.bind(null, t.id)}>
                    <button className="pill pill--mini" title="Volvió a ti: pasa a tu to-do de hoy">Volvió</button>
                  </form>
                  <form action={completarTarea.bind(null, t.id)}>
                    <button className="pill pill--mini" title="Marcar hecha">✓</button>
                  </form>
                </div>
                {seguimientos.length > 0 && (
                  <details style={{ marginTop: "0.4rem" }}>
                    <summary className="meta" style={{ cursor: "pointer" }}>Ver historial</summary>
                    {[...seguimientos]
                      .sort((a, b) => b.fecha.localeCompare(a.fecha))
                      .map((s, i) => (
                        <p key={i} className="meta" style={{ margin: "0.2rem 0 0" }}>
                          {fmtFecha(s.fecha)}{s.nota ? ` · ${s.nota}` : ""}
                        </p>
                      ))}
                  </details>
                )}
              </div>
            );
          })
        )}
      </section>

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
              <th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Tarea</th><th>Derivado a</th><th>Documento</th><th>Enviado / hecho</th>
            </tr>
          </thead>
          <tbody>
            {(historial ?? []).map((t) => (
              <tr key={t.id}>
                <td style={{ whiteSpace: "nowrap" }}>{fmtFecha(t.fecha)}</td>
                <td>{t.cliente ?? <span className="meta">—</span>}</td>
                <td><span className={`estado ${t.tipo === "correo" ? "estado--info" : "estado--neutro"}`}>{TIPOS[t.tipo] ?? t.tipo}</span></td>
                <td>{t.titulo}{t.detalle ? <span className="meta"> · {t.detalle}</span> : null}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {t.delegada_a
                    ? <>{t.delegada_a}<span className="meta"> · {fmtFecha(t.delegada_en)}</span></>
                    : <span className="meta">—</span>}
                </td>
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
