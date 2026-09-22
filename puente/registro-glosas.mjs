// Registro de las horas cuya glosa ya se redacto y subio.
//
// Existe porque cada corrida repasa tambien el dia anterior: sin este registro,
// una hora ya pulida se volveria a redactar cada noche y su texto cambiaria solo.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const ARCHIVO = "registro/procesadas.json";

export function leerRegistro() {
  if (!existsSync(ARCHIVO)) return {};
  try { return JSON.parse(readFileSync(ARCHIVO, "utf8")); }
  catch { return {}; }   // registro corrupto: se prefiere rehacer a caerse
}

export function marcarProcesada(id, datos) {
  mkdirSync("registro", { recursive: true });
  const r = leerRegistro();
  r[String(id)] = datos;
  writeFileSync(ARCHIVO, JSON.stringify(r, null, 2));
}
