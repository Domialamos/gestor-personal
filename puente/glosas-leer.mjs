// Lee de TimeBilling los trabajos de un dia y los deja en dia.json, junto con
// glosas pasadas del mismo asunto que sirven de ejemplo de estilo.
// No modifica nada.
//
//   node glosas-leer.mjs            -> hoy
//   node glosas-leer.mjs 2026-08-25 -> ese dia

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { abrirSesion, buscarDia, leerTrabajos, aDDMMYYYY } from "./tb.mjs";
import { traerRango } from "./ejemplos.mjs";

const { TB_URL, TB_ID_USUARIO } = process.env;
if (!TB_URL || !TB_ID_USUARIO) { console.error("Faltan TB_URL o TB_ID_USUARIO en puente/.env"); process.exit(1); }

const DIAS_ATRAS = 90;          // cuanto historial se mira para los ejemplos
const EJEMPLOS_POR_ASUNTO = 6;

const ZONA = "America/Santiago";
const dia = process.argv[2] ?? new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) { console.error(`Fecha "${dia}" invalida. Usa AAAA-MM-DD.`); process.exit(1); }

const { contexto, pagina } = await abrirSesion();
let trabajos = [], ejemplos = {};
try {
  const f = aDDMMYYYY(dia);
  await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });
  trabajos = await leerTrabajos(pagina);

  if (trabajos.length) {
    // Historial reciente, para que la redaccion imite las glosas de ella misma
    // en ese mismo asunto en vez de seguir reglas genericas.
    const inicio = new Date(dia);
    inicio.setDate(inicio.getDate() - DIAS_ATRAS);
    const historial = await traerRango(pagina, {
      desde: aDDMMYYYY(inicio.toISOString()),
      hasta: f,
    });
    const deHoy = new Set(trabajos.map((t) => String(t.id_trabajo)));
    const asuntos = new Set(trabajos.map((t) => t.cliente_asunto));
    for (const asunto of asuntos) {
      ejemplos[asunto] = historial
        .filter((h) => h.cliente_asunto === asunto && h.descripcion && !deHoy.has(String(h.id_trabajo)))
        // Las mas largas muestran mejor el nivel de detalle que ella busca.
        .sort((a, b) => b.descripcion.length - a.descripcion.length)
        .slice(0, EJEMPLOS_POR_ASUNTO)
        .map((h) => ({ duracion: h.duracion, glosa: h.descripcion }));
    }
  }
} catch (e) {
  console.error("\n" + e.message);
  await contexto.close().catch(() => {});
  process.exit(1);
} finally {
  await contexto.close().catch(() => {});
}

writeFileSync("dia.json", JSON.stringify({ dia, jobs: trabajos, ejemplos }, null, 2));

if (!trabajos.length) {
  console.log(`\n${dia}: no hay trabajos cargados.`);
  console.log("Puede ser que el cronometro de escritorio aun no haya sincronizado.");
  process.exit(0);
}

console.log(`\n${dia} - ${trabajos.length} trabajo(s):\n`);
for (const t of trabajos) {
  const marca = t.editable ? "" : "  [YA COBRADA - no se toca]";
  const n = (ejemplos[t.cliente_asunto] ?? []).length;
  console.log(`  #${t.id_trabajo}  ${t.duracion}  ${t.cliente_asunto}${marca}`);
  console.log(`      ${t.descripcion || "(sin glosa)"}`);
  console.log(`      (${n} glosa(s) anterior(es) de este asunto como referencia)\n`);
}
console.log("Crudo en puente/dia.json");
