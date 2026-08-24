"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cerrarSesion } from "@/app/auth/acciones";

const SECCIONES = [
  { ruta: "/", nombre: "Hoy" },
  { ruta: "/noticias", nombre: "Actualidad" },
  { ruta: "/noticias-legales", nombre: "Legal" },
  { ruta: "/calendario", nombre: "Calendario" },
  { ruta: "/horas", nombre: "Horas" },
  { ruta: "/cuentas", nombre: "Cuentas" },
  { ruta: "/gastos", nombre: "Gastos" },
  { ruta: "/reembolsos", nombre: "Reembolsos" },
];

// Cada módulo pinta el fondo de su pastel, al estilo serious.business
const FONDOS: Record<string, string> = {
  "/": "fondo--papel",
  "/noticias": "fondo--crema",
  "/noticias-legales": "fondo--ecru",
  "/calendario": "fondo--celeste",
  "/horas": "fondo--amarillo",
  "/cuentas": "fondo--rosa",
  "/gastos": "fondo--menta",
  "/reembolsos": "fondo--lila",
  "/ingresar": "fondo--crema",
};

export function Navegacion() {
  const ruta = usePathname();
  useEffect(() => {
    document.body.className = FONDOS[ruta] ?? "fondo--papel";
  }, [ruta]);
  if (ruta.startsWith("/ingresar")) return null;
  return (
    <nav className="nav">
      <Link className="marca" href="/">
        Gestor <em>personal</em>
      </Link>
      {SECCIONES.map((s) => (
        <Link key={s.ruta} href={s.ruta} aria-current={ruta === s.ruta ? "page" : undefined}>
          {s.nombre}
        </Link>
      ))}
      <button className="pill pill--mini" onClick={() => cerrarSesion()}>Salir</button>
    </nav>
  );
}
