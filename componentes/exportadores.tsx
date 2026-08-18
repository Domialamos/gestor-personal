"use client";

import { useState } from "react";
import { aCsv, aMarkdown, aXls, copiar, descargar, type Columna, type Fila } from "@/lib/exportar";

// Botonera de exportación: siempre exporta la vista filtrada, no el total.
export function Exportadores({ columnas, filas, nombre }: { columnas: Columna[]; filas: Fila[]; nombre: string }) {
  const [aviso, setAviso] = useState("");
  const avisar = (t: string) => {
    setAviso(t);
    setTimeout(() => setAviso(""), 2000);
  };
  return (
    <div className="filtros" style={{ marginTop: "1.25rem" }}>
      <span className="meta">Exportar lo filtrado:</span>
      <button className="pill pill--mini" onClick={() => descargar(aCsv(columnas, filas), `${nombre}.csv`, "text/csv;charset=utf-8")}>CSV</button>
      <button className="pill pill--mini" onClick={() => descargar(aXls(columnas, filas, nombre), `${nombre}.xls`, "application/vnd.ms-excel")}>Excel</button>
      <button className="pill pill--mini" onClick={() => descargar(JSON.stringify(filas, null, 2), `${nombre}.json`, "application/json")}>JSON</button>
      <button className="pill pill--mini" onClick={() => descargar(aMarkdown(columnas, filas), `${nombre}.md`, "text/markdown")}>Markdown</button>
      <button className="pill pill--mini" onClick={async () => avisar((await copiar(aMarkdown(columnas, filas))) ? "Copiado" : "No se pudo copiar")}>
        Copiar
      </button>
      {aviso && <span className="meta">{aviso}</span>}
    </div>
  );
}
