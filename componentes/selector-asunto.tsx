"use client";

import { useMemo, useState } from "react";

type Proyecto = { proyecto_id: number; nombre: string; cliente: string | null };

// Combobox con búsqueda: filtra los asuntos de TimeBilling por cliente o nombre,
// porque un <select> de mil asuntos ordenado por nombre es inencontrable.
export function SelectorAsunto({ proyectos, name = "proyecto_id" }: { proyectos: Proyecto[]; name?: string }) {
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<Proyecto | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return [];
    const sinEspacios = q.replace(/ /g, "");
    return proyectos
      .filter((p) => {
        const texto = `${p.cliente ?? ""} ${p.nombre}`.toLowerCase();
        return texto.includes(q) || texto.replace(/ /g, "").includes(sinEspacios);
      })
      .slice(0, 8);
  }, [busqueda, proyectos]);

  if (elegido) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <input type="hidden" name={name} value={elegido.proyecto_id} />
        <span className="estado estado--info">
          {elegido.cliente ? `${elegido.cliente} · ` : ""}{elegido.nombre}
        </span>
        <button type="button" className="pill pill--mini" onClick={() => { setElegido(null); setBusqueda(""); }}>
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Escribe el cliente o asunto…"
        autoComplete="off"
      />
      {filtrados.length > 0 && (
        <div
          className="card"
          style={{ position: "absolute", zIndex: 10, top: "100%", left: 0, right: 0, marginTop: "0.25rem", background: "#fff", maxHeight: "14rem", overflowY: "auto", padding: "0.5rem" }}
        >
          {filtrados.map((p) => (
            <button
              key={p.proyecto_id}
              type="button"
              onClick={() => setElegido(p)}
              style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", font: "inherit", fontSize: "0.875rem", padding: "0.4rem 0.5rem", cursor: "pointer", borderRadius: "0.375rem" }}
            >
              <strong>{p.cliente ?? "Sin cliente"}</strong> · {p.nombre}
            </button>
          ))}
        </div>
      )}
      {busqueda.trim() && filtrados.length === 0 && (
        <p className="meta" style={{ margin: "0.25rem 0 0" }}>Sin coincidencias; puedes escribir el cliente en el campo de al lado.</p>
      )}
    </div>
  );
}
