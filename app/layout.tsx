import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Navegacion } from "@/componentes/navegacion";

const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Gestor personal",
  description: "El día de Dominga, en una sola página",
};

export default function RaizLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CL" className={serif.variable}>
      <body>
        <Navegacion />
        {children}
      </body>
    </html>
  );
}
