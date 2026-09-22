// Deja en la bóveda la nota del día con las glosas que se subieron, para poder
// revisarlas de un vistazo sin entrar a TimeBilling.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const BOVEDA = process.env.BOVEDA_GLOSAS ?? "C:/Users/dalamos/Obsidian/Segundo Cerebro/Notas Claude/Glosas";

if (!existsSync("dia.json")) process.exit(0);
const { dia, jobs } = JSON.parse(readFileSync("dia.json", "utf8"));
const glosas = existsSync("glosas.json") ? JSON.parse(readFileSync("glosas.json", "utf8")) : [];
const porId = new Map(jobs.map((j) => [String(j.id_trabajo), j]));

// Las ya cobradas nunca se subieron, asi que tampoco entran a la nota ni al total.
const cobrada = (id) => { const j = porId.get(String(id)); return j ? !j.editable : false; };
const subidas = glosas.filter((g) => !cobrada(g.id_trabajo));

mkdirSync(BOVEDA, { recursive: true });

const total = subidas.reduce((s, g) => {
  const [h, m] = (porId.get(String(g.id_trabajo))?.duracion ?? "0:0").split(":").map(Number);
  return s + (h || 0) * 60 + (m || 0);
}, 0);

const lineas = [
  "---",
  `fecha: ${dia}`,
  "tags: [timebilling, glosas]",
  "---",
  "",
  `# Glosas del ${dia}`,
  "",
  `${subidas.length} glosa(s) · ${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`,
  "",
];

for (const g of subidas) {
  const j = porId.get(String(g.id_trabajo));
  lineas.push(`## ${j?.cliente_asunto || "(sin asunto)"} — ${j?.duracion ?? "?"}`);
  lineas.push("");
  lineas.push(`**Apunte:** ${j?.descripcion || "(vacío)"}`);
  lineas.push("");
  lineas.push(g.descripcion);
  lineas.push("");
}

const omitidas = jobs.filter((j) => !j.editable);
if (omitidas.length) {
  lineas.push(`> ${omitidas.length} hora(s) ya cobrada(s) no se tocaron.`, "");
}

writeFileSync(join(BOVEDA, `${dia}.md`), lineas.join("\n"));
console.log(`Nota del día en ${join(BOVEDA, dia + ".md")}`);
