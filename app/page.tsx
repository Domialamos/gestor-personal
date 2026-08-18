import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { fecha, fechaHora, monto, hoyChile } from "@/lib/formato";
import { ETIQUETAS_TEMAS } from "@/lib/temas";

export const dynamic = "force-dynamic";

const ZONA = "America/Santiago";

export default async function Hoy() {
  const supabase = await clienteServidor();
  const hoy = hoyChile();
  const en7dias = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const inicioMes = hoy.slice(0, 8) + "01";

  const { data: { user } } = await supabase.auth.getUser();
  const nombre = (user?.user_metadata?.nombre as string | undefined)?.split(" ")[0] || user?.email?.split("@")[0] || "tú";

  const [noticias, legales, eventos, cuentas, gastos, reembolsos] = await Promise.all([
    supabase.from("noticias").select("id,titulo,fuente,url,publicado_en").eq("tipo", "actualidad").order("publicado_en", { ascending: false }).limit(5),
    supabase.from("noticias").select("id,titulo,fuente,url,publicado_en,temas").eq("tipo", "legal").order("publicado_en", { ascending: false }).limit(5),
    supabase.from("eventos_cache").select("id,titulo,inicio,todo_el_dia,ubicacion").gte("inicio", new Date().toISOString()).order("inicio").limit(6),
    supabase.from("cuentas_por_pagar").select("id,nombre,monto,moneda,fecha_vencimiento").neq("estado", "pagada").lte("fecha_vencimiento", en7dias).order("fecha_vencimiento").limit(6),
    supabase.from("gastos").select("monto,moneda").gte("fecha", inicioMes),
    supabase.from("reembolsos").select("id,descripcion,saldo_pendiente,estado").not("estado", "in", "(cerrado,rechazado)").limit(6),
  ]);

  const gastoMes = (gastos.data ?? []).filter((g) => g.moneda === "CLP").reduce((s, g) => s + Number(g.monto), 0);
  const saldoReembolsos = (reembolsos.data ?? []).reduce((s, r) => s + Number(r.saldo_pendiente), 0);
  const saludo = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <main>
      <h1 className="titulo">
        Hola, <em>{nombre}</em>
      </h1>
      <p className="bajada">Es {saludo}. Esto es lo que importa hoy.</p>

      <div className="kpis">
        <div className="card kpi revelar"><b>{cuentas.data?.length ?? 0}</b><span>Cuentas vencen en 7 días</span></div>
        <div className="card kpi revelar"><b>{monto(gastoMes)}</b><span>Gastado este mes</span></div>
        <div className="card kpi revelar"><b>{monto(saldoReembolsos)}</b><span>Reembolsos por recuperar</span></div>
        <div className="card kpi revelar"><b>{eventos.data?.length ?? 0}</b><span>Próximos eventos</span></div>
      </div>

      <div className="grilla grilla--2">
        <section className="card card--destacada revelar">
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>Agenda <span className="serif">próxima</span></h2>
          {(eventos.data ?? []).length === 0 ? (
            <p className="meta">Nada agendado. <Link className="enlace" href="/calendario">Conectar calendarios</Link></p>
          ) : (
            (eventos.data ?? []).map((e) => (
              <p key={e.id} style={{ margin: "0.4rem 0", fontSize: "0.938rem" }}>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{e.todo_el_dia ? fecha(e.inicio) : fechaHora(e.inicio)}</strong>{" "}
                {e.titulo}{e.ubicacion ? <span className="meta"> · {e.ubicacion}</span> : null}
              </p>
            ))
          )}
          <Link className="pill pill--mini" href="/calendario" style={{ marginTop: "0.5rem" }}>Ver calendario</Link>
        </section>

        <section className="card card--destacada revelar">
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>Por <span className="serif">pagar</span></h2>
          {(cuentas.data ?? []).length === 0 ? (
            <p className="meta">Nada vence esta semana.</p>
          ) : (
            (cuentas.data ?? []).map((c) => (
              <p key={c.id} style={{ margin: "0.4rem 0", fontSize: "0.938rem", display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                <span>{c.nombre} <span className="meta">vence {fecha(c.fecha_vencimiento)}</span></span>
                <strong style={{ fontVariantNumeric: "tabular-nums" }}>{monto(Number(c.monto), c.moneda as "CLP" | "UF")}</strong>
              </p>
            ))
          )}
          <Link className="pill pill--mini" href="/cuentas" style={{ marginTop: "0.5rem" }}>Ver cuentas</Link>
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

        <section className="card card--destacada revelar">
          <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem" }}>Qué pasa <span className="serif">hoy</span></h2>
          {(noticias.data ?? []).length === 0 ? (
            <p className="meta">Sin titulares aún; llegan tres veces al día.</p>
          ) : (
            (noticias.data ?? []).map((n) => (
              <p key={n.id} style={{ margin: "0.4rem 0", fontSize: "0.938rem" }}>
                <a className="enlace" href={n.url} target="_blank" rel="noreferrer">{n.titulo}</a> <span className="meta">{n.fuente}</span>
              </p>
            ))
          )}
          <Link className="pill pill--mini" href="/noticias" style={{ marginTop: "0.5rem" }}>Ver actualidad</Link>
        </section>
      </div>
    </main>
  );
}
