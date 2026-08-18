"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Llega aquí desde el correo de recuperación, ya con sesión temporal.
export default function Restablecer() {
  const [clave, setClave] = useState("");
  const [estado, setEstado] = useState<"inicial" | "guardando" | "error">("inicial");
  const router = useRouter();

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("guardando");
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error } = await supabase.auth.updateUser({ password: clave });
    if (error) {
      setEstado("error");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "80dvh" }}>
      <form onSubmit={guardar} style={{ maxWidth: "24rem", width: "100%", display: "grid", gap: "0.75rem" }}>
        <h1 className="titulo" style={{ fontSize: "3rem" }}>
          Contraseña <em>nueva</em>
        </h1>
        <label className="campo">
          Elige una contraseña (mínimo 6)
          <input type="password" required minLength={6} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="new-password" autoFocus />
        </label>
        <button className="pill pill--primaria" disabled={estado === "guardando"} style={{ justifyContent: "center" }}>
          {estado === "guardando" ? "Guardando…" : "Guardar y entrar"}
        </button>
        {estado === "error" && <p style={{ color: "var(--peligro)", fontSize: "0.875rem" }}>No se pudo cambiar. ¿El enlace ya expiró?</p>}
      </form>
    </main>
  );
}
