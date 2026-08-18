"use client";

import { useMemo, useState } from "react";
import { fecha, monto } from "@/lib/formato";
import { Exportadores } from "@/componentes/exportadores";
import { cambiarEstado, eliminarReembolso, registrarIsapre, registrarSeguro } from "./acciones";

type Reembolso = {
  id: string; descripcion: string; prestador: string | null; fecha_prestacion: string | null;
  monto_total: number; monto_isapre: number | null; fecha_isapre: string | null;
  monto_seguro: number | null; fecha_seguro: string | null; estado: string;
  saldo_pendiente: number; notas: string | null;
};

const ETIQUETAS: Record<string, string> = {
  pendiente_isapre: "Pendiente isapre",
  bonificado_isapre: "Bonificado isapre",
  enviado_seguro: "Enviado al seguro",
  reembolsado_seguro: "Reembolsado",
  cerrado: "Cerrado",
  rechazado: "Rechazado",
};

const CLASES: Record<string, string> = {
  pendiente_isapre: "estado--alerta",
  bonificado_isapre: "estado--info",
  enviado_seguro: "estado--info",
  reembolsado_seguro: "estado--ok",
  cerrado: "estado--neutro",
  rechazado: "estado--riesgo",
};

export function TablaReembolsos({ filas }: { filas: Reembolso[] }) {
  const [filtro, setFiltro] = useState<"abiertos" | "todos">("abiertos");
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => {
    const q = busqueda.toLowerCase();
    return filas.filter(
      (f) =>
        (filtro === "todos" || !["cerrado", "reembolsado_seguro", "rechazado"].includes(f.estado)) &&
        (!q || `${f.descripcion} ${f.prestador ?? ""}`.toLowerCase().includes(q))
    );
  }, [filas, filtro, busqueda]);

  const saldoAbierto = filas
    .filter((f) => !["cerrado", "rechazado"].includes(f.estado))
    .reduce((s, f) => s + Number(f.saldo_pendiente), 0);
  const recuperado = filas.reduce((s, f) => s + Number(f.monto_isapre ?? 0) + Number(f.monto_seguro ?? 0), 0);

  function pedirMonto(texto: string): number | null {
    const v = prompt(texto);
    if (v == null) return null;
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    return isNaN(n) || n < 0 ? null : n;
  }

  return (
    <>
      <div className="kpis">
        <div className="card kpi revelar"><b>{monto(saldoAbierto)}</b><span>Saldo por recuperar</span></div>
        <div className="card kpi revelar"><b>{monto(recuperado)}</b><span>Recuperado histórico</span></div>
        <div className="card kpi revelar"><b>{visibles.length}</b><span>Casos en la vista</span></div>
      </div>

      <div className="filtros">
        <button className={`pill pill--mini ${filtro === "abiertos" ? "pill--activa" : ""}`} onClick={() => setFiltro("abiertos")}>Abiertos</button>
        <button className={`pill pill--mini ${filtro === "todos" ? "pill--activa" : ""}`} onClick={() => setFiltro("todos")}>Todos</button>
        <input className="buscador" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <span className="contador">mostrando {visibles.length} de {filas.length}</span>
      </div>

      {visibles.length === 0 ? (
        <p className="vacio">Ningún reembolso pendiente. <em>Todo cobrado.</em></p>
      ) : (
        <div className="grilla grilla--2">
          {visibles.map((f) => (
            <div key={f.id} className="card revelar">
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "start" }}>
                <div>
                  <strong>{f.descripcion}</strong>
                  <div className="meta">{f.prestador ?? "Sin prestador"} · {fecha(f.fecha_prestacion)}</div>
                </div>
                <span className={`estado ${CLASES[f.estado]}`}>{ETIQUETAS[f.estado]}</span>
              </div>
              <table className="tabla" style={{ margin: "0.75rem 0" }}>
                <tbody>
                  <tr><td>Total prestación</td><td className="num">{monto(Number(f.monto_total))}</td></tr>
                  <tr><td>Isapre {f.fecha_isapre ? `(${fecha(f.fecha_isapre)})` : ""}</td><td className="num">{monto(f.monto_isapre != null ? Number(f.monto_isapre) : null)}</td></tr>
                  <tr><td>Seguro {f.fecha_seguro ? `(${fecha(f.fecha_seguro)})` : ""}</td><td className="num">{monto(f.monto_seguro != null ? Number(f.monto_seguro) : null)}</td></tr>
                  <tr><td><strong>Saldo pendiente</strong></td><td className="num"><strong>{monto(Number(f.saldo_pendiente))}</strong></td></tr>
                </tbody>
              </table>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {f.estado === "pendiente_isapre" && (
                  <button className="pill pill--mini pill--primaria" onClick={() => { const m = pedirMonto("¿Cuánto bonificó la isapre? (en pesos)"); if (m != null) registrarIsapre(f.id, m); }}>
                    Registrar bono isapre
                  </button>
                )}
                {f.estado === "bonificado_isapre" && (
                  <button className="pill pill--mini pill--primaria" onClick={() => cambiarEstado(f.id, "enviado_seguro")}>
                    Enviado al seguro
                  </button>
                )}
                {f.estado === "enviado_seguro" && (
                  <button className="pill pill--mini pill--primaria" onClick={() => { const m = pedirMonto("¿Cuánto reembolsó el seguro? (en pesos)"); if (m != null) registrarSeguro(f.id, m); }}>
                    Registrar reembolso del seguro
                  </button>
                )}
                {["reembolsado_seguro", "bonificado_isapre"].includes(f.estado) && (
                  <button className="pill pill--mini" onClick={() => cambiarEstado(f.id, "cerrado")}>Cerrar</button>
                )}
                {!["rechazado", "cerrado"].includes(f.estado) && (
                  <button className="pill pill--mini" onClick={() => cambiarEstado(f.id, "rechazado")}>Rechazado</button>
                )}
                <button className="pill pill--mini" onClick={() => confirm("¿Eliminar este caso?") && eliminarReembolso(f.id)}>Eliminar</button>
              </div>
              {f.notas && <p className="meta" style={{ marginTop: "0.5rem" }}>{f.notas}</p>}
            </div>
          ))}
        </div>
      )}

      <Exportadores
        nombre="reembolsos"
        columnas={[
          { clave: "descripcion", titulo: "Prestación" }, { clave: "prestador", titulo: "Prestador" },
          { clave: "fechaTxt", titulo: "Fecha" }, { clave: "totalTxt", titulo: "Total" },
          { clave: "isapreTxt", titulo: "Isapre" }, { clave: "seguroTxt", titulo: "Seguro" },
          { clave: "saldoTxt", titulo: "Saldo" }, { clave: "estadoTxt", titulo: "Estado" },
        ]}
        filas={visibles.map((f) => ({
          ...f,
          fechaTxt: fecha(f.fecha_prestacion),
          totalTxt: monto(Number(f.monto_total)),
          isapreTxt: monto(f.monto_isapre != null ? Number(f.monto_isapre) : null),
          seguroTxt: monto(f.monto_seguro != null ? Number(f.monto_seguro) : null),
          saldoTxt: monto(Number(f.saldo_pendiente)),
          estadoTxt: ETIQUETAS[f.estado],
        }))}
      />
    </>
  );
}
