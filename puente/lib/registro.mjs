// Registro de las horas cuya glosa ya se redacto, subio Y VERIFICO.
//
// Existe porque cada corrida repasa tambien el dia anterior: sin el, una hora
// ya pulida se volveria a redactar cada noche y su texto cambiaria solo.
//
// Solo escribe aca el subcomando "escribir", despues de releer la glosa desde
// TimeBilling. El agente no tiene forma de tocarlo.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const POR_DEFECTO = "registro/procesadas.json";

export function leerRegistro(archivo = POR_DEFECTO) {
  if (!existsSync(archivo)) return {};
  try { return JSON.parse(readFileSync(archivo, "utf8")); }
  catch { return {}; }   // registro corrupto: se prefiere rehacer a caerse
}

export function marcarProcesada(id, datos, archivo = POR_DEFECTO) {
  mkdirSync(dirname(archivo), { recursive: true });
  const r = leerRegistro(archivo);
  r[String(id)] = datos;
  writeFileSync(archivo, JSON.stringify(r, null, 2));
}
