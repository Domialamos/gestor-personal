import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Icono PNG para pantalla de inicio (iOS y manifest): D rosada sobre burdeo,
// con la misma Instrument Serif del gestor incrustada (Satori no trae Georgia).
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const serif = await readFile(join(process.cwd(), "app/fuentes/InstrumentSerif-Regular.ttf"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#6d1f38",
          color: "#f4c8d9",
          fontSize: 132,
          fontFamily: "Instrument Serif",
        }}
      >
        D
      </div>
    ),
    { ...size, fonts: [{ name: "Instrument Serif", data: serif, style: "normal", weight: 400 }] }
  );
}
