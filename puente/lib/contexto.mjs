// Notas de la boveda que mencionan a un cliente, para darle al agente de donde
// deducir cuando el apunte del cronometro es corto.
//
// Van COMPLETAS a proposito. La version anterior las cortaba a 1200 caracteres
// y el corte caia justo donde suele estar el detalle util.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const LARGO_MINIMO_CLIENTE = 4;   // "SII" acierta en cualquier parte y trae basura

export function buscarNotas(clientes, { carpeta, max = 5 } = {}) {
  const utiles = clientes.filter((c) => c && c.length >= LARGO_MINIMO_CLIENTE);
  if (!utiles.length) return [];

  let archivos;
  try {
    archivos = readdirSync(carpeta)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ f, t: statSync(join(carpeta, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)     // las mas recientes primero
      .map(({ f }) => f);
  } catch { return []; }             // sin boveda accesible se sigue sin contexto

  const encontradas = [];
  for (const f of archivos) {
    if (encontradas.length >= max) break;
    let texto;
    try { texto = readFileSync(join(carpeta, f), "utf8"); } catch { continue; }
    const bajo = texto.toLowerCase();
    const menciona = utiles.filter((c) => bajo.includes(c.toLowerCase()));
    if (menciona.length) encontradas.push({ nota: f, menciona, texto });
  }
  return encontradas;
}
