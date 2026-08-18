"use client";

import { useMemo, useState } from "react";
import { fecha, monto, hoyChile } from "@/lib/formato";
import { Exportadores } from "@/componentes/exportadores";
import { eliminarGasto } from "./acciones";

type Gasto = {
  id: string; fecha: string; descripcion: string; categoria: string; monto: number;
  moneda: "CLP" | "UF"; medio_pago: string | null; origen: string;
};

export function TablaGastos({ filas }: { filas: Gasto[] }) {
  const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
  const [filtroMes, setFiltroMes] = useState<string>(hoyChile().slice(0, 7));
  const [busqueda, setBusqueda] = useState("");

  const categorias = useMemo(() => [...new Set(filas.map((f) => f.categoria))].sort(), [filas]);
  const meses = useMemo(() => [...new Set(filas.map((f) => f.fecha.slice(0, 7)))].sort().reverse(), [filas]);

  const visibles = useMemo(() => {
    const q = busqueda.toLowerCase();
    return filas.filter(
      (f) =>
        (!filtroCategoria || f.categoria === filtroCategoria) &&
        (!filtroMes || f.fecha.startsWith(filtroMes)) &&
        (!q || `${f.descripcion} ${f.categoria} ${f.medio_pago ?? ""}`.toLowerCase().includes(q))
    );
  }, [filas, filtroCategoria, filtroMes, busqueda]);

  const totalClp = visibles.filter((f) => f.moneda === "CLP").reduce((s, f) => s + Number(f.monto), 0);
  const porDia = visibles.length ? totalClp / new Set(visibles.map((f) => f.fecha)).size : 0;

  return (
    <>
      <div className="kpis">
        <div className="card kpi revelar"><b>{monto(totalClp)}</b><span>Total filtrado</span></div>
        <div className="card kpi revelar"><b>{visibles.length}</b><span>Movimientos</span></div>
        <div className="card kpi revelar"><b>{monto(Math.round(porDia))}</b><span>Promedio por día con gasto</span></div>
      </div>

      <div className="filtros">
        <select className="buscador" style={{ minWidth: "8rem" }} value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {meses.map((m) => <option key={m} value={m}>{m.slice(5, 7)}-{m.slice(0, 4)}</option>)}
        </select>
        <button className={`pill pill--mini ${filtroCategoria === null ? "pill--activa" : ""}`} onClick={() => setFiltroCategoria(null)}>Todas</button>
        {categorias.map((c) => (
          <button key={c} className={`pill pill--mini ${filtroCategoria === c ? "pill--activa" : ""}`} onClick={() => setFiltroCategoria(c)}>{c}</button>
        ))}
        <input className="buscador" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <span className="contador">mostrando {visibles.length} de {filas.length}</span>
      </div>

      {visibles.length === 0 ? (
        <p className="vacio">Sin gastos con este filtro. <em>¿Mes austero?</em></p>
      ) : (
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Medio</th><th className="num">Monto</th><th></th></tr></thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.id}>
                <td>{fecha(f.fecha)}</td>
                <td>{f.descripcion}{f.origen !== "manual" && <span className="meta"> · {f.origen}</span>}</td>
                <td>{f.categoria}</td>
                <td>{f.medio_pago ?? "—"}</td>
                <td className="num">{monto(Number(f.monto), f.moneda)}</td>
                <td><button className="pill pill--mini" onClick={() => confirm("¿Eliminar este gasto?") && eliminarGasto(f.id)}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Exportadores
        nombre="gastos"
        columnas={[
          { clave: "fechaTxt", titulo: "Fecha" }, { clave: "descripcion", titulo: "Descripción" },
          { clave: "categoria", titulo: "Categoría" }, { clave: "medio_pago", titulo: "Medio" },
          { clave: "montoTxt", titulo: "Monto" },
        ]}
        filas={visibles.map((f) => ({ ...f, fechaTxt: fecha(f.fecha), montoTxt: monto(Number(f.monto), f.moneda) }))}
      />
    </>
  );
}
