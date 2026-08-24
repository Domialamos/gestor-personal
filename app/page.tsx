import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { fecha, fechaHora, monto, hoyChile } from "@/lib/formato";

export const dynamic = "force-dynamic";

const ZONA = "America/Santiago";

export default async function Hoy() {
  const supabase = await clienteServidor();
  const hoy = hoyChile();
  const en7dias = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const inicioMes = hoy.slice(0, 8) + "01";

  const { data: { user } } = await supabase.auth.getUser();
  const nombre = (user?.user_metadata?.nombre as string | undefined)?.split(" ")[0] || user?.email?.split("@")[0] || "tú";

  const [eventos, legales, cuentas, gastos, reembolsos] = await Promise.all([
    supabase.from("eventos_cache").select("id,titulo,inicio,todo_el_dia").gte("inicio", new Date().toISOString()).order("inicio").limit(4),
    supabase.from("noticias").select("id,titulo,url").eq("tipo", "legal").order("publicado_en", { ascending: false }).limit(3),
    supabase.from("cuentas_por_pagar").select("id,nombre,monto,moneda,fecha_vencimiento").neq("estado", "pagada").lte("fecha_vencimiento", en7dias).order("fecha_vencimiento").limit(4),
    supabase.from("gastos").select("monto,moneda").gte("fecha", inicioMes),
    supabase.from("reembolsos").select("saldo_pendiente").not("estado", "in", "(cerrado,rechazado)"),
  ]);

  const gastoMes = (gastos.data ?? []).filter((g) => g.moneda === "CLP").reduce((s, g) => s + Number(g.monto), 0);
  const saldoReembolsos = (reembolsos.data ?? []).reduce((s, r) => s + Number(r.saldo_pendiente), 0);
  const saludo = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <main>
      <h1 className="titulo">
        Hola, <em>{nombre}</em>
      </h1>
      <p className="bajada">Es {saludo}. Tu día, dividido en dos mundos.</p>

      <div className="mundos">
        <section className="mundo mundo--trabajo revelar">
          <span className="etiqueta">Trabajo</span>
          <h2>La <span className="serif">oficina</span></h2>
          {(eventos.data ?? []).length === 0 ? (
            <p className="meta">Nada agendado próximamente.</p>
          ) : (
            <div>
              {(eventos.data ?? []).map((e) => (
                <p key={e.id} style={{ margin: "0.4rem 0", fontSize: "0.938rem" }}>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{e.todo_el_dia ? fecha(e.inicio) : fechaHora(e.inicio)}</strong> {e.titulo}
                </p>
              ))}
            </div>
          )}
          {(legales.data ?? []).length > 0 && (
            <div>
              <span className="meta">Radar legal</span>
              {(legales.data ?? []).map((n) => (
                <p key={n.id} style={{ margin: "0.3rem 0", fontSize: "0.875rem" }}>
                  <a className="enlace" href={n.url} target="_blank" rel="noreferrer">{n.titulo}</a>
                </p>
              ))}
            </div>
          )}
          <p style={{ margin: 0, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link className="pill pill--primaria" href="/trabajo">Entrar al trabajo</Link>
            <Link className="pill pill--mini" href="/horas" style={{ alignSelf: "center" }}>Horas</Link>
            <Link className="pill pill--mini" href="/calendario" style={{ alignSelf: "center" }}>Calendario</Link>
          </p>
        </section>

        <section className="mundo mundo--personal revelar">
          <span className="etiqueta">Personal</span>
          <h2>La <span className="serif">casa</span></h2>
          <div className="kpis" style={{ margin: 0 }}>
            <div className="kpi"><b>{monto(gastoMes)}</b><span>Gastado este mes</span></div>
            <div className="kpi"><b>{monto(saldoReembolsos)}</b><span>Por recuperar</span></div>
          </div>
          {(cuentas.data ?? []).length === 0 ? (
            <p className="meta">Nada vence esta semana.</p>
          ) : (
            <div>
              {(cuentas.data ?? []).map((c) => (
                <p key={c.id} style={{ margin: "0.4rem 0", fontSize: "0.938rem", display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <span>{c.nombre} <span className="meta">vence {fecha(c.fecha_vencimiento)}</span></span>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{monto(Number(c.monto), c.moneda as "CLP" | "UF")}</strong>
                </p>
              ))}
            </div>
          )}
          <p style={{ margin: 0, display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link className="pill pill--primaria" href="/personal">Entrar a lo personal</Link>
            <Link className="pill pill--mini" href="/cuentas" style={{ alignSelf: "center" }}>Cuentas</Link>
            <Link className="pill pill--mini" href="/noticias" style={{ alignSelf: "center" }}>Actualidad</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
