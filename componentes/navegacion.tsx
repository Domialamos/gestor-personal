"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cerrarSesion } from "@/app/auth/acciones";

const TRABAJO = [
  { ruta: "/calendario", nombre: "Calendario" },
  { ruta: "/horas", nombre: "Horas" },
  { ruta: "/noticias-legales", nombre: "Legal" },
];

const PERSONAL = [
  { ruta: "/noticias", nombre: "Actualidad" },
  { ruta: "/cuentas", nombre: "Cuentas" },
  { ruta: "/gastos", nombre: "Gastos" },
  { ruta: "/reembolsos", nombre: "Reembolsos" },
];

// Cada módulo pinta el fondo de su familia: fría (trabajo) o cálida (personal)
const FONDOS: Record<string, string> = {
  "/": "fondo--papel",
  "/trabajo": "fondo--bruma",
  "/calendario": "fondo--hielo",
  "/horas": "fondo--arena",
  "/noticias-legales": "fondo--piedra",
  "/personal": "fondo--marfil",
  "/noticias": "fondo--durazno",
  "/cuentas": "fondo--barro",
  "/gastos": "fondo--salvia",
  "/reembolsos": "fondo--glicina",
  "/ingresar": "fondo--marfil",
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
      <Link className="ambito ambito--trabajo" href="/trabajo" aria-current={ruta === "/trabajo" ? "page" : undefined}>Trabajo</Link>
      {TRABAJO.map((s) => (
        <Link key={s.ruta} href={s.ruta} aria-current={ruta === s.ruta ? "page" : undefined}>
          {s.nombre}
        </Link>
      ))}
      <span className="separador" aria-hidden />
      <Link className="ambito ambito--personal" href="/personal" aria-current={ruta === "/personal" ? "page" : undefined}>Personal</Link>
      {PERSONAL.map((s) => (
        <Link key={s.ruta} href={s.ruta} aria-current={ruta === s.ruta ? "page" : undefined}>
          {s.nombre}
        </Link>
      ))}
      <button className="pill pill--mini" onClick={() => cerrarSesion()}>Salir</button>
    </nav>
  );
}
