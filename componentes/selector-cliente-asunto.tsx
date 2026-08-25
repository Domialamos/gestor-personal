"use client";

import { useMemo, useState } from "react";

type Proyecto = { proyecto_id: number; cliente: string | null; nombre: string };

// Primero el cliente, después el asunto: con 1117 asuntos una sola lista es
// inservible (el datalist del navegador deja de desplegar sugerencias). Al
// elegir cliente, la segunda lista queda en dos o tres asuntos.
export function SelectorClienteAsunto({ proyectos }: { proyectos: Proyecto[] }) {
  const [cliente, setCliente] = useState("");

  const clientes = useMemo(() => {
    const vistos = new Set<string>();
    for (const p of proyectos) {
      const c = (p.cliente ?? "").trim();
      if (c) vistos.add(c);
    }
    return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
  }, [proyectos]);

  const asuntos = useMemo(
    () =>
      cliente
        ? proyectos
            .filter((p) => (p.cliente ?? "").trim() === cliente)
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        : [],
    [proyectos, cliente],
  );

  return (
    <>
      <label className="campo">
        Cliente (TimeBilling)
        <select
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          autoComplete="off"
        >
          <option value="">— Sin cliente —</option>
          {clientes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="campo">
        Asunto
        <select name="asunto_texto" disabled={!cliente} autoComplete="off" defaultValue="">
          <option value={cliente}>
            {cliente ? "— Todo el cliente —" : "Elige primero el cliente"}
          </option>
          {asuntos.map((p) => (
            <option key={p.proyecto_id} value={`${cliente} — ${p.nombre}`}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
