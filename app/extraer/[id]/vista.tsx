"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { segmentar, type Alineacion } from "@/lib/extraer";
import type { Clase } from "@/lib/plantillas-extraccion";
import { fecha as fmtFecha } from "@/lib/formato";
import { Exportadores } from "@/componentes/exportadores";
import { crearTareaDesdeItem, eliminarExtraccion } from "../acciones";

export type Item = {
  id: string;
  tramo: number;
  orden: number;
  clase: string;
  texto: string;
  atributos: Record<string, string>;
  fecha: string | null;
  inicio: number | null;
  fin: number | null;
  alineacion: Alineacion;
  tarea_id: string | null;
};

const ALINEACION: Record<Alineacion, { texto: string; clase: string; ayuda: string } | null> = {
  exacta: null,
  aproximada: { texto: "cita aproximada", clase: "estado--alerta", ayuda: "La cita no calza letra por letra; se subrayó el pasaje más parecido. Revísalo." },
  sin_respaldo: { texto: "sin respaldo", clase: "estado--riesgo", ayuda: "No se encontró en el documento. Puede ser un error del modelo: no lo uses sin verificar." },
};

const COLUMNAS = [
  { clave: "clase", titulo: "Categoría" },
  { clave: "texto", titulo: "Cita" },
  { clave: "atributos", titulo: "Detalle" },
  { clave: "fecha", titulo: "Fecha" },
  { clave: "alineacion", titulo: "Respaldo" },
];

export function VistaExtraccion(props: {
  id: string;
  titulo: string;
  texto: string;
  clases: Clase[];
  items: Item[];
  instrucciones: string | null;
}) {
  const { id, titulo, texto, clases, items } = props;
  const [filtro, setFiltro] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  const color = useMemo(() => new Map(clases.map((c, i) => [c.codigo, i % 8])), [clases]);
  const etiqueta = (codigo: string) => clases.find((c) => c.codigo === codigo)?.etiqueta ?? codigo;

  // Orden del documento: primero por posición; lo sin respaldo, al final de su tramo
  const ordenados = useMemo(
    () => [...items].sort((a, b) => (a.inicio ?? Infinity) - (b.inicio ?? Infinity) || a.tramo - b.tramo || a.orden - b.orden),
    [items],
  );
  const conteo = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of items) m.set(x.clase, (m.get(x.clase) ?? 0) + 1);
    return m;
  }, [items]);

  const visibles = ordenados.filter((x) => {
    if (filtro === "_revisar") { if (x.alineacion === "exacta") return false; }
    else if (filtro && x.clase !== filtro) return false;
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const enAtributos = Object.values(x.atributos ?? {}).some((v) => v.toLowerCase().includes(q));
      if (!x.texto.toLowerCase().includes(q) && !enAtributos) return false;
    }
    return true;
  });
  const idsVisibles = new Set(visibles.map((x) => x.id));
  const claseDe = useMemo(() => new Map(items.map((x) => [x.id, x.clase])), [items]);
  const segmentos = useMemo(() => segmentar(texto, ordenados), [texto, ordenados]);
  const porRevisar = items.filter((x) => x.alineacion !== "exacta").length;

  function ir(itemId: string, destino: "texto" | "lista") {
    setElegido(itemId);
    document.getElementById(`${destino}-${itemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const filas = visibles.map((x) => ({
    clase: etiqueta(x.clase),
    texto: x.texto,
    atributos: Object.entries(x.atributos ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · "),
    fecha: x.fecha ? fmtFecha(x.fecha) : "",
    alineacion: ALINEACION[x.alineacion]?.texto ?? "exacta",
  }));

  return (
    <>
      <div className="filtros">
        <button className={`pill pill--mini ${filtro === null ? "pill--activa" : ""}`} onClick={() => setFiltro(null)}>
          Todo · {items.length}
        </button>
        {clases.filter((c) => conteo.get(c.codigo)).map((c) => (
          <button
            key={c.codigo}
            className={`pill pill--mini ${filtro === c.codigo ? "pill--activa" : ""}`}
            onClick={() => setFiltro(filtro === c.codigo ? null : c.codigo)}
          >
            <span className={`punto marca-${color.get(c.codigo)}`} aria-hidden />
            {c.etiqueta} · {conteo.get(c.codigo)}
          </button>
        ))}
        {porRevisar > 0 && (
          <button className={`pill pill--mini ${filtro === "_revisar" ? "pill--activa" : ""}`} onClick={() => setFiltro(filtro === "_revisar" ? null : "_revisar")}>
            Por revisar · {porRevisar}
          </button>
        )}
        <input className="buscador" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en los datos" />
      </div>

      <div className="extraer-grilla">
        <section aria-label="Datos extraídos" className="extraer-lista">
          {visibles.length === 0 ? (
            <p className="vacio">{items.length ? "Nada con ese filtro." : "Todavía no hay datos."}</p>
          ) : (
            visibles.map((x) => {
              const aviso = ALINEACION[x.alineacion];
              return (
                <article
                  key={x.id}
                  id={`lista-${x.id}`}
                  className={`card dato ${elegido === x.id ? "dato--elegido" : ""}`}
                >
                  <p style={{ margin: "0 0 0.4rem", display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
                    <span className={`estado marca-${color.get(x.clase)}`}>{etiqueta(x.clase)}</span>
                    {x.fecha && <span className="estado estado--info">{fmtFecha(x.fecha)}</span>}
                    {aviso && <span className={`estado ${aviso.clase}`} title={aviso.ayuda}>{aviso.texto}</span>}
                  </p>
                  <blockquote className="cita">“{x.texto}”</blockquote>
                  {Object.keys(x.atributos ?? {}).length > 0 && (
                    <p className="meta" style={{ margin: "0.4rem 0 0" }}>
                      {Object.entries(x.atributos).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                    </p>
                  )}
                  <p style={{ margin: "0.6rem 0 0", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {x.inicio != null && (
                      <button className="pill pill--mini" onClick={() => ir(x.id, "texto")}>Ver en el documento</button>
                    )}
                    {x.tarea_id ? (
                      <Link className="pill pill--mini" href="/tareas">✓ En tareas</Link>
                    ) : (
                      <button
                        className="pill pill--mini"
                        disabled={pendiente}
                        title={x.fecha ? `Tarea para el ${fmtFecha(x.fecha)}` : "Tarea para hoy"}
                        onClick={() => iniciar(() => crearTareaDesdeItem(x.id))}
                      >
                        → Tarea
                      </button>
                    )}
                  </p>
                </article>
              );
            })
          )}
        </section>

        <section aria-label="Documento" className="card card--destacada documento">
          {segmentos.map((s) =>
            s.id ? (
              <mark
                key={s.inicio}
                id={`texto-${s.id}`}
                className={`marca-${color.get(claseDe.get(s.id) ?? "") ?? 0} ${idsVisibles.has(s.id) ? "" : "marca--atenuada"} ${elegido === s.id ? "marca--elegida" : ""}`}
                onClick={() => ir(s.id!, "lista")}
              >
                {s.texto}
              </mark>
            ) : (
              <span key={s.inicio}>{s.texto}</span>
            ),
          )}
        </section>
      </div>

      <Exportadores columnas={COLUMNAS} filas={filas} nombre={titulo.slice(0, 60)} />

      {props.instrucciones && <p className="meta" style={{ marginTop: "1.5rem" }}>Indicaciones usadas: {props.instrucciones}</p>}
      <p style={{ marginTop: "2rem" }}>
        <button
          className="pill pill--mini"
          disabled={pendiente}
          onClick={() => {
            if (confirm("¿Eliminar esta extracción, sus datos y el archivo original? No se puede deshacer.")) {
              iniciar(() => eliminarExtraccion(id));
            }
          }}
        >
          Eliminar extracción
        </button>
      </p>
    </>
  );
}
