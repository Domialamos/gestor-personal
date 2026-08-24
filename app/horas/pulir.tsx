"use client";

import { useState, useTransition } from "react";
import { pulirDescripcion } from "./pulir-accion";

export function PulirDescripcion({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  function pulir() {
    setMensaje(null);
    iniciar(async () => {
      try {
        await pulirDescripcion(id);
        setMensaje("Descripción pulida.");
      } catch (e) {
        setMensaje(e instanceof Error ? e.message : "No se pudo pulir.");
      }
    });
  }

  return (
    <p style={{ marginTop: "1rem" }}>
      <button className="pill pill--mini" onClick={pulir} disabled={pendiente}>
        {pendiente ? "Puliendo…" : "Pulir con IA"}
      </button>
      {mensaje && <small style={{ marginLeft: "0.75rem" }}>{mensaje}</small>}
    </p>
  );
}
