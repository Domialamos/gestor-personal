"use client";

import { useEffect, useState } from "react";
import { TIPOS_TRABAJO } from "@/lib/plantillas-horas";
import { iniciarCronometro, detenerCronometro } from "./acciones";

type Corriendo = { id: string; inicio: string; tipo_trabajo: string } | null;
type Proyecto = { proyecto_id: number; nombre: string; cliente: string | null };

// El transcurrido se calcula desde `inicio`, que vive en la base de datos.
// Recargar la página no pierde nada: no hay estado de cronómetro en el cliente.
function transcurrido(inicio: string): string {
  const seg = Math.max(0, Math.floor((Date.now() - new Date(inicio).getTime()) / 1000));
  const h = String(Math.floor(seg / 3600)).padStart(2, "0");
  const m = String(Math.floor((seg % 3600) / 60)).padStart(2, "0");
  const s = String(seg % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function Cronometro({ corriendo, proyectos }: { corriendo: Corriendo; proyectos: Proyecto[] }) {
  const [reloj, setReloj] = useState(corriendo ? transcurrido(corriendo.inicio) : "00:00:00");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!corriendo) return;
    const t = setInterval(() => setReloj(transcurrido(corriendo.inicio)), 1000);
    return () => clearInterval(t);
  }, [corriendo]);

  async function detener() {
    setError(null);
    try {
      await detenerCronometro();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo detener.");
    }
  }

  if (corriendo) {
    return (
      <div className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
        <p style={{ fontSize: "2.5rem", fontVariantNumeric: "tabular-nums", margin: 0 }}>{reloj}</p>
        <p className="bajada" style={{ marginTop: 0 }}>
          {TIPOS_TRABAJO.find((t) => t.codigo === corriendo.tipo_trabajo)?.etiqueta ?? "General"} en curso
        </p>
        <button className="pill pill--primaria" onClick={detener}>Detener</button>
        {error && <p className="vacio">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
      <form action={iniciarCronometro} className="formulario">
        <label className="campo">
          Tipo de trabajo
          <select name="tipo_trabajo" defaultValue="general">
            {TIPOS_TRABAJO.map((t) => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
          </select>
        </label>
        <label className="campo">
          Proyecto
          <select name="proyecto_id" defaultValue="">
            <option value="">— elegir después —</option>
            {proyectos.map((p) => (
              <option key={p.proyecto_id} value={p.proyecto_id}>
                {p.nombre}{p.cliente ? ` · ${p.cliente}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button className="pill pill--primaria">Empezar</button>
      </form>
    </div>
  );
}
