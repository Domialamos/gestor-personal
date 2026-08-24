import Link from "next/link";
import { clienteServidor } from "@/lib/supabase/servidor";
import { fecha, monto, hoyChile } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function Personal() {
  const supabase = await clienteServidor();
  const hoy = hoyChile();
  const en7dias = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const inicioMes = hoy.slice(0, 8) + "01";

  const [noticias, cuentas, gastos, reembolsos] = await Promise.all([
    supabase.from("noticias").select("id,titulo,fuente,url,publicado_en").eq("tipo", "actualidad").order("publicado_en", { ascending: false }).limit(6),
    supabase.from("cuentas_por_pagar").select("id,nombre,monto,moneda,fecha_vencimiento").neq("estado", "pagada").lte("fecha_vencimiento", en7dias).order("fecha_vencimiento").limit(6),
    supabase.from("gastos").select("monto,moneda").gte("fecha", inicioMes),
    supabase.from("reembolsos").select("id,descripcion,saldo_pendiente,estado").not("estado", "in", "(cerrado,rechazado)").limit(6),
  ]);

  const gastoMes = (gastos.data ?? []).filter((g) => g.moneda === "CLP").reduce((s, g) => s + Number(g.monto), 0);
  const saldoReembolsos = (reembolsos.data ?? []).reduce((s, r) => s + Number(r.saldo_pendiente), 0);

  return (
    <main>
      <h1 className="titulo">
        Mi vida <em>personal</em>
      </h1>
      <p className="bajada">Actualidad, cuentas por pagar, gastos y reembolsos de salud.</p>

      <div className="kpis">
        <div className="card kpi revelar"><b>{cuentas.data?.length ?? 0}</b><span>Cuentas vencen en 7 días</span></div>
        <div className="card kpi revelar"><b>{monto(gastoMes)}</b><span>Gastado este mes</span></div>
        <div className="card kpi revelar"><b>{monto(saldoReembolsos)}</b><span>Reembolsos por recuperar</span></div>
        <div className="card kpi revelar"><b>{reembolsos.data?.length ?? 0}</b><span>Prestaciones abiertas</span></div>
      </div>

      <div className="grilla grilla--2">
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

      <p style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link className="pill" href="/gastos">Registrar un gasto</Link>
        <Link className="pill" href="/reembolsos">Ver reembolsos</Link>
      </p>
    </main>
  );
}
