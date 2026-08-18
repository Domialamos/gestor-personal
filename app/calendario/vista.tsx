"use client";

import { useMemo, useState, useTransition } from "react";
import { actualizarAhora } from "@/app/noticias/acciones";
import { eliminarEvento } from "./acciones";

type Evento = {
  id: string; origen: "google" | "microsoft" | "manual"; titulo: string;
  inicio: string; fin: string | null; todo_el_dia: boolean; ubicacion: string | null;
};

const ZONA = "America/Santiago";
const ORIGENES: Record<string, { nombre: string; clase: string }> = {
  google: { nombre: "Universidad", clase: "estado--info" },
  microsoft: { nombre: "Estudio", clase: "estado--alerta" },
  manual: { nombre: "Manual", clase: "estado--neutro" },
};

function claveDia(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));
}

function tituloDia(clave: string): string {
  const d = new Date(clave + "T12:00:00");
  const txt = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" }).format(d);
  return txt[0].toUpperCase() + txt.slice(1);
}

function hora(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function VistaCalendario({ eventos }: { eventos: Evento[] }) {
  const [filtroOrigen, setFiltroOrigen] = useState<string | null>(null);
  const [sincronizando, iniciar] = useTransition();

  const visibles = useMemo(() => eventos.filter((e) => !filtroOrigen || e.origen === filtroOrigen), [eventos, filtroOrigen]);

  const porDia = useMemo(() => {
    const mapa = new Map<string, Evento[]>();
    for (const e of visibles) {
      const clave = claveDia(e.inicio);
      mapa.set(clave, [...(mapa.get(clave) ?? []), e]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibles]);

  const hoy = claveDia(new Date().toISOString());

  return (
    <>
      <div className="filtros">
        <button className={`pill pill--mini ${filtroOrigen === null ? "pill--activa" : ""}`} onClick={() => setFiltroOrigen(null)}>Todos</button>
        {Object.entries(ORIGENES).map(([clave, o]) => (
          <button key={clave} className={`pill pill--mini ${filtroOrigen === clave ? "pill--activa" : ""}`} onClick={() => setFiltroOrigen(clave)}>
            {o.nombre}
          </button>
        ))}
        <button className="pill pill--mini" disabled={sincronizando} onClick={() => iniciar(() => actualizarAhora("calendario"))}>
          {sincronizando ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
        <span className="contador">mostrando {visibles.length} de {eventos.length}</span>
      </div>

      {porDia.length === 0 ? (
        <p className="vacio">Agenda despejada. <em>Aprovéchala.</em></p>
      ) : (
        <div style={{ display: "grid", gap: "1.25rem" }}>
          {porDia.map(([dia, lista]) => (
            <section key={dia} className="revelar">
              <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
                {tituloDia(dia)} {dia === hoy && <span className="estado estado--ok">hoy</span>}
              </h2>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {lista.map((e) => (
                  <div key={e.id} className="card" style={{ display: "flex", gap: "1rem", alignItems: "center", padding: "0.75rem 1.25rem" }}>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, minWidth: "3.5rem" }}>
                      {e.todo_el_dia ? "Día" : hora(e.inicio)}
                    </span>
                    <span style={{ flex: 1 }}>
                      {e.titulo}
                      {e.ubicacion && <span className="meta"> · {e.ubicacion}</span>}
                    </span>
                    <span className={`estado ${ORIGENES[e.origen].clase}`}>{ORIGENES[e.origen].nombre}</span>
                    {e.origen === "manual" && (
                      <button className="pill pill--mini" onClick={() => confirm("¿Eliminar este evento?") && eliminarEvento(e.id)}>Eliminar</button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
