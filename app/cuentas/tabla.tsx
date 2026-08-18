"use client";

import { useMemo, useState } from "react";
import { fecha, monto, hoyChile } from "@/lib/formato";
import { Exportadores } from "@/componentes/exportadores";
import { marcarPagada, eliminarCuenta } from "./acciones";

type Cuenta = {
  id: string; nombre: string; categoria: string; monto: number; moneda: "CLP" | "UF";
  fecha_vencimiento: string | null; recurrente: boolean; dia_vencimiento: number | null;
  estado: string; pagada_en: string | null; notas: string | null;
};

const ESTADOS = ["pendiente", "pagada", "vencida"] as const;

export function TablaCuentas({ filas }: { filas: Cuenta[] }) {
  const [filtroEstado, setFiltroEstado] = useState<string | null>("pendiente");
  const [busqueda, setBusqueda] = useState("");
  const hoy = hoyChile();

  const conEstado = useMemo(
    () =>
      filas.map((f) =>
        f.estado === "pendiente" && f.fecha_vencimiento && f.fecha_vencimiento < hoy ? { ...f, estado: "vencida" } : f
      ),
    [filas, hoy]
  );

  const visibles = useMemo(() => {
    const q = busqueda.toLowerCase();
    return conEstado.filter(
      (f) =>
        (!filtroEstado || f.estado === filtroEstado) &&
        (!q || `${f.nombre} ${f.categoria} ${f.notas ?? ""}`.toLowerCase().includes(q))
    );
  }, [conEstado, filtroEstado, busqueda]);

  const totalClp = visibles.filter((f) => f.moneda === "CLP").reduce((s, f) => s + Number(f.monto), 0);
  const totalUf = visibles.filter((f) => f.moneda === "UF").reduce((s, f) => s + Number(f.monto), 0);
  const proximas = conEstado.filter((f) => f.estado !== "pagada" && f.fecha_vencimiento && f.fecha_vencimiento >= hoy && f.fecha_vencimiento <= new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10)).length;

  const clase = (e: string) => (e === "pagada" ? "estado--ok" : e === "vencida" ? "estado--riesgo" : "estado--alerta");

  return (
    <>
      <div className="kpis">
        <div className="card kpi revelar"><b>{monto(totalClp)}</b><span>Total CLP filtrado</span></div>
        <div className="card kpi revelar"><b>{monto(totalUf, "UF")}</b><span>Total UF filtrado</span></div>
        <div className="card kpi revelar"><b>{proximas}</b><span>Vencen en 7 días</span></div>
      </div>

      <div className="filtros">
        <button className={`pill pill--mini ${filtroEstado === null ? "pill--activa" : ""}`} onClick={() => setFiltroEstado(null)}>Todas</button>
        {ESTADOS.map((e) => (
          <button key={e} className={`pill pill--mini ${filtroEstado === e ? "pill--activa" : ""}`} onClick={() => setFiltroEstado(e)}>
            {e[0].toUpperCase() + e.slice(1)}
          </button>
        ))}
        <input className="buscador" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <span className="contador">mostrando {visibles.length} de {conEstado.length}</span>
      </div>

      {visibles.length === 0 ? (
        <p className="vacio">Nada por aquí. <em>Qué alivio.</em></p>
      ) : (
        <table className="tabla">
          <thead>
            <tr><th>Cuenta</th><th>Categoría</th><th className="num">Monto</th><th>Vence</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id}>
                <td>{f.nombre}{f.recurrente && <span className="meta"> · mensual{f.dia_vencimiento ? ` (día ${f.dia_vencimiento})` : ""}</span>}</td>
                <td>{f.categoria}</td>
                <td className="num">{monto(Number(f.monto), f.moneda)}</td>
                <td>{fecha(f.fecha_vencimiento)}</td>
                <td><span className={`estado ${clase(f.estado)}`}>{f.estado}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {f.estado !== "pagada" && (
                    <button className="pill pill--mini" onClick={() => marcarPagada(f.id)}>Pagada</button>
                  )}{" "}
                  <button className="pill pill--mini" onClick={() => confirm("¿Eliminar esta cuenta?") && eliminarCuenta(f.id)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Exportadores
        nombre="cuentas-por-pagar"
        columnas={[
          { clave: "nombre", titulo: "Cuenta" }, { clave: "categoria", titulo: "Categoría" },
          { clave: "montoTxt", titulo: "Monto" }, { clave: "venceTxt", titulo: "Vence" },
          { clave: "estado", titulo: "Estado" }, { clave: "notas", titulo: "Notas" },
        ]}
        filas={visibles.map((f) => ({ ...f, montoTxt: monto(Number(f.monto), f.moneda), venceTxt: fecha(f.fecha_vencimiento) }))}
      />
    </>
  );
}
