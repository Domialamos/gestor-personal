"use client";

import { useMemo, useState, useTransition } from "react";
import { fechaHora } from "@/lib/formato";
import { actualizarAhora, destacar, marcarLeida } from "@/app/noticias/acciones";

export type Noticia = {
  id: string; fuente: string; titulo: string; resumen: string | null; url: string;
  publicado_en: string | null; temas: string[]; leida: boolean; destacada: boolean;
};

export function ListaNoticias({ filas, tipo, etiquetas }: { filas: Noticia[]; tipo: "noticias" | "noticias-legales"; etiquetas?: Record<string, string> }) {
  const [filtroFuente, setFiltroFuente] = useState<string | null>(null);
  const [filtroTema, setFiltroTema] = useState<string | null>(null);
  const [soloNoLeidas, setSoloNoLeidas] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [actualizando, iniciar] = useTransition();

  const fuentes = useMemo(() => [...new Set(filas.map((f) => f.fuente))].sort(), [filas]);
  const temas = useMemo(() => [...new Set(filas.flatMap((f) => f.temas))].sort(), [filas]);

  const visibles = useMemo(() => {
    const q = busqueda.toLowerCase();
    return filas.filter(
      (f) =>
        (!filtroFuente || f.fuente === filtroFuente) &&
        (!filtroTema || f.temas.includes(filtroTema)) &&
        (!soloNoLeidas || !f.leida || f.destacada) &&
        (!q || `${f.titulo} ${f.resumen ?? ""}`.toLowerCase().includes(q))
    );
  }, [filas, filtroFuente, filtroTema, soloNoLeidas, busqueda]);

  return (
    <>
      <div className="filtros">
        <button className={`pill pill--mini ${filtroFuente === null ? "pill--activa" : ""}`} onClick={() => setFiltroFuente(null)}>Todas</button>
        {fuentes.map((f) => (
          <button key={f} className={`pill pill--mini ${filtroFuente === f ? "pill--activa" : ""}`} onClick={() => setFiltroFuente(f)}>{f}</button>
        ))}
        <button className={`pill pill--mini ${soloNoLeidas ? "pill--activa" : ""}`} onClick={() => setSoloNoLeidas(!soloNoLeidas)}>Sin leer</button>
        <input className="buscador" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <span className="contador">mostrando {visibles.length} de {filas.length}</span>
      </div>

      {temas.length > 0 && (
        <div className="filtros">
          <span className="meta">Temas:</span>
          {temas.map((t) => (
            <button key={t} className={`pill pill--mini ${filtroTema === t ? "pill--activa" : ""}`} onClick={() => setFiltroTema(filtroTema === t ? null : t)}>
              {etiquetas?.[t] ?? t}
            </button>
          ))}
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="vacio">
          Sin noticias en la vista.{" "}
          <button className="pill pill--mini" disabled={actualizando} onClick={() => iniciar(() => actualizarAhora(tipo))}>
            {actualizando ? "Buscando…" : "Buscar ahora"}
          </button>
        </p>
      ) : (
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {visibles.map((f) => (
            <article key={f.id} className={`card revelar`} style={f.leida && !f.destacada ? { opacity: 0.55 } : undefined}>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", flexWrap: "wrap" }}>
                <span className="meta">{f.fuente} · {fechaHora(f.publicado_en)}</span>
                {f.temas.map((t) => <span key={t} className="estado estado--neutro">{etiquetas?.[t] ?? t}</span>)}
              </div>
              <a className="enlace" href={f.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: "1.125rem", display: "block", margin: "0.25rem 0" }}>
                {f.titulo}
              </a>
              {f.resumen && <p style={{ margin: "0.25rem 0 0.5rem", fontSize: "0.938rem", opacity: 0.75 }}>{f.resumen}</p>}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button className="pill pill--mini" onClick={() => marcarLeida(f.id, !f.leida)}>{f.leida ? "No leída" : "Leída"}</button>
                <button className={`pill pill--mini ${f.destacada ? "pill--activa" : ""}`} onClick={() => destacar(f.id, !f.destacada)}>
                  {f.destacada ? "Destacada ★" : "Destacar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
