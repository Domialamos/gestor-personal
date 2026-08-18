"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Modo = "entrar" | "crear" | "recuperar";
type Estado = "inicial" | "enviando" | "enviado" | "error";

function supabaseNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

const MENSAJES_ERROR: Record<string, string> = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "Tu correo aún no está confirmado. Revisa tu bandeja.",
  "User already registered": "Ese correo ya tiene cuenta. Entra o recupera tu contraseña.",
  "Password should be at least 6 characters.": "La contraseña necesita al menos 6 caracteres.",
};

function Formulario() {
  const [modo, setModo] = useState<Modo>("entrar");
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [estado, setEstado] = useState<Estado>("inicial");
  const [error, setError] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const enlaceInvalido = params.get("error") === "enlace-invalido";

  function cambiarModo(m: Modo) {
    setModo(m);
    setEstado("inicial");
    setError("");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setError("");
    const supabase = supabaseNavegador();
    const origen = window.location.origin;

    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
      if (error) {
        setError(MENSAJES_ERROR[error.message] ?? "No se pudo entrar. Intenta de nuevo.");
        setEstado("error");
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    if (modo === "crear") {
      const { data, error } = await supabase.auth.signUp({
        email: correo.trim(),
        password: clave,
        options: {
          emailRedirectTo: `${origen}/auth/confirmar`,
          data: { nombre: nombre.trim() },
        },
      });
      if (error) {
        setError(MENSAJES_ERROR[error.message] ?? error.message);
        setEstado("error");
        return;
      }
      // Si la confirmación por correo está apagada, ya hay sesión.
      if (data.session) {
        router.push("/");
        router.refresh();
        return;
      }
      setEstado("enviado");
      return;
    }

    // recuperar
    const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
      redirectTo: `${origen}/auth/confirmar?siguiente=/auth/restablecer`,
    });
    if (error) {
      setError("No se pudo enviar el correo de recuperación.");
      setEstado("error");
      return;
    }
    setEstado("enviado");
  }

  const titulos: Record<Modo, React.ReactNode> = {
    entrar: <>Tu día, <em>ordenado</em></>,
    crear: <>Partamos <em>de cero</em></>,
    recuperar: <>¿La <em>olvidaste?</em></>,
  };
  const avisos: Record<Modo, string> = {
    entrar: "",
    crear: "Te llegará un correo para confirmar la cuenta. Pincha el enlace y quedas dentro.",
    recuperar: "Te llegará un correo con un enlace para elegir una contraseña nueva.",
  };

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "80dvh" }}>
      <div style={{ maxWidth: "24rem", width: "100%" }}>
        <h1 className="titulo" style={{ fontSize: "3rem" }}>{titulos[modo]}</h1>
        <p className="bajada">
          {modo === "entrar" && "Entra con tu correo y contraseña."}
          {modo === "crear" && "Crea tu cuenta. Tus datos son solo tuyos."}
          {modo === "recuperar" && "Dinos tu correo y te mandamos un enlace."}
        </p>
        {enlaceInvalido && <p style={{ color: "var(--peligro)", fontSize: "0.875rem" }}>Ese enlace ya no sirve. Pide uno nuevo.</p>}

        {estado === "enviado" ? (
          <div className="card card--destacada revelar">
            <strong>Revisa tu correo.</strong>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.938rem" }}>{avisos[modo]}</p>
          </div>
        ) : (
          <form onSubmit={enviar} style={{ display: "grid", gap: "0.75rem" }}>
            {modo === "crear" && (
              <label className="campo">
                ¿Tu nombre?
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Dominga" required />
              </label>
            )}
            <label className="campo">
              ¿Tu correo?
              <input type="email" required value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="dalamos@…" autoFocus />
            </label>
            {modo !== "recuperar" && (
              <label className="campo">
                {modo === "crear" ? "Elige una contraseña (mínimo 6)" : "Contraseña"}
                <input
                  type="password"
                  required
                  minLength={6}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  autoComplete={modo === "crear" ? "new-password" : "current-password"}
                />
              </label>
            )}
            <button className="pill pill--primaria" disabled={estado === "enviando"} style={{ justifyContent: "center" }}>
              {estado === "enviando"
                ? "Un segundo…"
                : modo === "entrar" ? "Entrar" : modo === "crear" ? "Crear mi cuenta" : "Mándame el enlace"}
            </button>
            {error && <p style={{ color: "var(--peligro)", fontSize: "0.875rem" }}>{error}</p>}
          </form>
        )}

        <div className="filtros" style={{ marginTop: "1.5rem" }}>
          {modo !== "entrar" && <button className="pill pill--mini" onClick={() => cambiarModo("entrar")}>Ya tengo cuenta</button>}
          {modo !== "crear" && <button className="pill pill--mini" onClick={() => cambiarModo("crear")}>Crear cuenta</button>}
          {modo === "entrar" && <button className="pill pill--mini" onClick={() => cambiarModo("recuperar")}>Olvidé mi contraseña</button>}
        </div>
      </div>
    </main>
  );
}

export default function Ingresar() {
  return (
    <Suspense>
      <Formulario />
    </Suspense>
  );
}
