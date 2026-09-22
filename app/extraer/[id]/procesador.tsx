"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { procesarTramos, reanudarExtraccion } from "../acciones";

// Tramos en curso en esta pestaña. El ciclo sigue aunque Dominga se vaya a
// otro módulo; si vuelve, no se lanza un segundo ciclo sobre la misma extracción.
const enCurso = new Set<string>();

// Pide los tramos lote por lote. Si se cierra la pestaña no se pierde nada: al
// volver a abrir la extracción sigue desde donde quedó.
export function Procesador({ id, hechos, total }: { id: string; hechos: number; total: number }) {
  const router = useRouter();
  const [local, setLocal] = useState({ hechos, total });
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    if (enCurso.has(id)) {
      // Otro montaje ya lo está procesando: solo refrescar para ver el avance
      const reloj = setInterval(() => router.refresh(), 5000);
      return () => {
        montado.current = false;
        clearInterval(reloj);
      };
    }
    enCurso.add(id);
    (async () => {
      try {
        for (;;) {
          const r = await procesarTramos(id);
          if (montado.current) setLocal({ hechos: r.hechos, total: r.total });
          router.refresh(); // los datos aparecen a medida que llegan
          if (r.estado !== "procesando") break;
        }
      } catch (e) {
        if (montado.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        enCurso.delete(id);
      }
    })();
    return () => {
      montado.current = false;
    };
  }, [id, router]);

  const avance = { hechos: Math.max(hechos, local.hechos), total: Math.max(total, local.total) };
  const pct = avance.total ? Math.round((avance.hechos / avance.total) * 100) : 0;
  return (
    <div className="card card--destacada" style={{ marginBottom: "1.25rem" }}>
      <p style={{ margin: "0 0 0.5rem", fontWeight: 600 }}>
        Leyendo con Claude… fragmento {Math.min(avance.hechos + 1, avance.total)} de {avance.total}
      </p>
      <div className="barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="meta" style={{ margin: "0.5rem 0 0" }}>
        Puedes dejar esta página abierta y seguir en otra cosa. Si la cierras, retoma al volver.
      </p>
      {error && <p className="estado estado--riesgo" style={{ display: "inline-block", marginTop: "0.5rem" }}>{error}</p>}
    </div>
  );
}

export function Reanudar({ id, error }: { id: string; error: string | null }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  return (
    <div className="card card--destacada" style={{ marginBottom: "1.25rem" }}>
      <p style={{ margin: "0 0 0.5rem" }}>
        <span className="estado estado--riesgo">Se detuvo</span> {error ?? "Error desconocido."}
      </p>
      <p className="meta" style={{ margin: "0 0 0.75rem" }}>Lo ya extraído se conserva; al reanudar sigue desde el fragmento que falló.</p>
      <button
        className="pill pill--mini"
        disabled={enviando}
        onClick={async () => {
          setEnviando(true);
          await reanudarExtraccion(id);
          router.refresh();
        }}
      >
        {enviando ? "Reanudando…" : "Reanudar"}
      </button>
    </div>
  );
}
