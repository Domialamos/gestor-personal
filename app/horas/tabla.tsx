"use client";

import { useState } from "react";
import { fecha } from "@/lib/formato";
import { TIPOS_TRABAJO } from "@/lib/plantillas-horas";
import { actualizarHora, aprobarHora, desaprobarHora, eliminarHora } from "./acciones";
import { PulirDescripcion } from "./pulir";

export type Hora = {
  id: string; inicio: string; fin: string | null; duracion_min: number | null;
  proyecto_id: number | null; tipo_trabajo: string; descripcion: string;
  facturable: boolean; estado: string; tb_time_entry_id: number | null;
  cargada_en: string | null; error_carga: string | null;
};
type Proyecto = { proyecto_id: number; nombre: string; cliente: string | null };

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador", aprobada: "Aprobada", cargada: "Cargada", error: "Error",
};

function horasYMinutos(min: number | null): string {
  if (!min) return "—";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function TablaHoras({ filas, proyectos, pulidoDisponible }: {
  filas: Hora[]; proyectos: Proyecto[]; pulidoDisponible: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  async function intentar(accion: () => Promise<void>) {
    setError(null);
    try { await accion(); } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal.");
    }
  }

  const porCargar = filas.filter((f) => f.estado === "aprobada").length;
  const totalMin = filas.filter((f) => f.estado !== "cargada")
    .reduce((s, f) => s + (f.duracion_min ?? 0), 0);

  if (filas.length === 0) {
    return <p className="vacio">Ninguna hora registrada todavía. <em>Parte el cronómetro.</em></p>;
  }

  return (
    <>
      <div className="kpis">
        <div className="card kpi revelar"><b>{horasYMinutos(totalMin)}</b><span>Sin cargar</span></div>
        <div className="card kpi revelar"><b>{porCargar}</b><span>Listas para el puente</span></div>
        <div className="card kpi revelar"><b>{filas.filter((f) => f.estado === "cargada").length}</b><span>Ya en TimeBilling</span></div>
      </div>

      {error && <p className="vacio">{error}</p>}

      <table className="tabla">
        <thead>
          <tr><th>Fecha</th><th>Tipo</th><th>Proyecto</th><th>Descripción</th>
              <th className="num">Duración</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>{fecha(f.inicio)}</td>
              <td>{TIPOS_TRABAJO.find((t) => t.codigo === f.tipo_trabajo)?.etiqueta ?? f.tipo_trabajo}</td>
              <td>{proyectos.find((p) => p.proyecto_id === f.proyecto_id)?.nombre ?? (f.proyecto_id ?? "—")}</td>
              <td>
                {f.descripcion || <em>sin descripción</em>}
                {f.error_carga && <><br /><small>{f.error_carga}</small></>}
              </td>
              <td className="num">{horasYMinutos(f.duracion_min)}</td>
              <td>{ETIQUETA_ESTADO[f.estado] ?? f.estado}</td>
              <td>
                {f.estado === "cargada" ? (
                  <small>#{f.tb_time_entry_id}</small>
                ) : (
                  <>
                    <button className="pill pill--mini" onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                      Editar
                    </button>
                    {f.estado === "aprobada" ? (
                      <button className="pill pill--mini" onClick={() => intentar(() => desaprobarHora(f.id))}>
                        Desaprobar
                      </button>
                    ) : (
                      <button className="pill pill--mini" onClick={() => intentar(() => aprobarHora(f.id))}>
                        Aprobar
                      </button>
                    )}
                    <button className="pill pill--mini" onClick={() => intentar(() => eliminarHora(f.id))}>
                      Borrar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {abierta && (() => {
        const f = filas.find((x) => x.id === abierta)!;
        return (
          <div className="card revelar" style={{ marginTop: "1.5rem" }}>
            <form action={actualizarHora.bind(null, f.id)} className="formulario">
              <label className="campo">
                Tipo
                <select name="tipo_trabajo" defaultValue={f.tipo_trabajo}>
                  {TIPOS_TRABAJO.map((t) => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
                </select>
              </label>
              <label className="campo">
                Proyecto
                <select name="proyecto_id" defaultValue={f.proyecto_id ?? ""}>
                  <option value="">— sin proyecto —</option>
                  {proyectos.map((p) => (
                    <option key={p.proyecto_id} value={p.proyecto_id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="campo">
                Minutos
                <input name="duracion_min" type="number" min="6" step="6" defaultValue={f.duracion_min ?? 6} />
              </label>
              <label className="campo" style={{ gridColumn: "1 / -1" }}>
                Descripción
                <textarea name="descripcion" rows={3} defaultValue={f.descripcion} />
              </label>
              <label className="campo">
                Facturable
                <input name="facturable" type="checkbox" defaultChecked={f.facturable} />
              </label>
              <button className="pill pill--primaria">Guardar</button>
            </form>
            {pulidoDisponible && <PulirDescripcion id={f.id} />}
          </div>
        );
      })()}
    </>
  );
}
