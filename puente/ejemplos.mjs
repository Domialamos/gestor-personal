// Trae glosas pasadas de Dominga para usarlas como ejemplo de estilo.
// El listado pagina de a 20 mediante el campo oculto "desde".
//
//   node ejemplos.mjs 01-06-2026 31-07-2026            -> todo el rango
//   node ejemplos.mjs 01-06-2026 31-07-2026 "Chadwick" -> solo ese asunto

import "dotenv/config";
import { abrirSesion, buscarDia, leerTrabajos } from "./tb.mjs";

const [desde, hasta, filtro] = process.argv.slice(2);
const { TB_URL, TB_ID_USUARIO } = process.env;
const MAX_PAGINAS = 20;

export async function traerRango(pagina, { desde, hasta }) {
  await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde, hasta });
  const todos = new Map();
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const lote = await leerTrabajos(pagina);
    const antes = todos.size;
    for (const t of lote) todos.set(String(t.id_trabajo), t);
    if (todos.size === antes) break;          // la pagina no aporto nada nuevo
    if (lote.length < 20) break;              // ultima pagina
    const avanzo = await pagina.evaluate((salto) => {
      const f = (n) => document.querySelector(`[name="${n}"]`);
      // Si falta cualquiera de los dos, se corta la paginacion en vez de
      // reventar: mejor devolver menos ejemplos que perder la corrida entera.
      if (!f("desde") || !f("opc")) return false;
      f("desde").value = String(salto);
      f("opc").value = "buscar";
      f("opc").closest("form").submit();
      return true;
    }, (p + 1) * 20);
    if (!avanzo) break;
    await pagina.waitForLoadState("networkidle").catch(() => {});
    await pagina.waitForTimeout(2000);
  }
  return [...todos.values()];
}

if (process.argv[1] && process.argv[1].endsWith("ejemplos.mjs")) {
  const { contexto, pagina } = await abrirSesion();
  try {
    let t = await traerRango(pagina, { desde, hasta });
    if (filtro) t = t.filter((x) => new RegExp(filtro, "i").test(x.cliente_asunto));
    console.log(`${t.length} trabajo(s) entre ${desde} y ${hasta}${filtro ? ` (filtro: ${filtro})` : ""}\n`);
    for (const x of t) {
      if (!x.descripcion) continue;
      console.log(`[${x.fecha} ${x.duracion}] ${x.cliente_asunto}`);
      console.log(`   ${x.descripcion}\n`);
    }
  } finally { await contexto.close().catch(() => {}); }
}
