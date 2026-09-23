// Registro de las horas cuya glosa ya se redacto, subio Y VERIFICO.
//
// Existe porque cada corrida repasa tambien el dia anterior: sin el, una hora
// ya pulida se volveria a redactar cada noche y su texto cambiaria solo.
//
// Solo escribe aca el subcomando "escribir", despues de releer la glosa desde
// TimeBilling. El agente no tiene forma de tocarlo.
//
// Forma de cada entrada: { dia, glosa, apunte }.
//
// El "apunte" es el texto que la hora tenia ANTES de escribirle la glosa, y se
// guarda aca porque es el unico momento en que todavia existe. Sirve para dos
// cosas: que la nota diaria pueda mostrar apunte y glosa lado a lado (el unico
// control de calidad que define la spec) y que se pueda distinguir una glosa
// que TimeBillingX restauro al apunte crudo de una que Dominga edito a mano.
//
// Las 100 primeras entradas son anteriores a este campo y no lo tienen: quien
// lea el registro tiene que aguantar que "apunte" venga undefined.

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
