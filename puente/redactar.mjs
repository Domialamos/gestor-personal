// Redacta las glosas del dia sin intervencion humana.
//
// Lee dia.json (trabajos + glosas pasadas del mismo asunto), le pide a Claude
// Code en modo headless que convierta cada apunte rapido en una glosa
// facturable imitando el estilo de las glosas anteriores de Dominga, y escribe
// glosas.json. No toca TimeBilling: de eso se encarga glosas-escribir.mjs.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { leerRegistro } from "./registro-glosas.mjs";

if (!existsSync("dia.json")) { console.error("Falta puente/dia.json. Corre glosas-leer.mjs primero."); process.exit(1); }
const { dia, jobs, ejemplos = {} } = JSON.parse(readFileSync("dia.json", "utf8"));

// Las ya cobradas no se pueden modificar: ni se le pasan al modelo.
// Las ya procesadas tampoco: cada corrida repasa el dia anterior y sin este
// filtro su glosa se reescribiria distinta cada noche.
const yaHechas = leerRegistro();
const editables = jobs.filter((j) => j.editable && !yaHechas[String(j.id_trabajo)]);
const saltadas = jobs.filter((j) => j.editable && yaHechas[String(j.id_trabajo)]).length;
if (saltadas) console.log(`${saltadas} hora(s) ya redactada(s) en una corrida anterior: se dejan como estan.`);
if (!editables.length) { console.log("No hay trabajos editables."); writeFileSync("glosas.json", "[]"); process.exit(0); }

const entradas = editables.map((j) => ({
  id_trabajo: j.id_trabajo,
  duracion: j.duracion ?? "",
  cliente_y_asunto: j.cliente_asunto ?? "",
  apunte: j.descripcion ?? "",
  glosas_anteriores_de_este_asunto: (ejemplos[j.cliente_asunto] ?? []).map((e) => e.glosa),
}));

// Contexto extra: las notas de la boveda de esta semana pueden mencionar el
const BOVEDA = process.env.BOVEDA_NOTAS ?? "C:/Users/dalamos/Obsidian/Segundo Cerebro/Notas Claude";
let notas = [];
try {
  const clientes = [...new Set(editables.map((j) => (j.cliente_asunto || "").split("/")[0].trim()))].filter(Boolean);
  for (const f of readdirSync(BOVEDA).filter((f) => f.endsWith(".md")).slice(-40)) {
    const texto = readFileSync(join(BOVEDA, f), "utf8");
    const mencionados = clientes.filter((c) => c.length > 3 && texto.toLowerCase().includes(c.toLowerCase()));
    if (mencionados.length) notas.push({ nota: f, menciona: mencionados, extracto: texto.slice(0, 1200) });
  }
} catch { /* sin boveda accesible, se sigue sin ese contexto */ }
notas = notas.slice(0, 5);

const INSTRUCCIONES = `Sos el asistente de Dominga, abogada chilena en el estudio Barros, Silva, Varela & Vigil. Convertí cada apunte rápido de su cronómetro en una glosa facturable para TimeBilling.

LO MÁS IMPORTANTE: en cada trabajo vienen "glosas_anteriores_de_este_asunto", escritas por ella misma. Imitá ese estilo, ese largo y ese nivel de detalle. Son la referencia principal; las reglas de abajo solo describen lo que ya se ve en ellas.

Estilo:
- Español de Chile, registro profesional de estudio jurídico.
- Empezá con una FRASE NOMINAL, no con un verbo conjugado: "Revisión de…", "Preparación de…", "Coordinación de…", "Elaboración de…". Nunca "Se revisa…" como apertura.
- Detallada. Nombrá el entregable concreto, el documento, la contraparte y las personas involucradas cuando aparezcan en el apunte o en las glosas anteriores.
- Si hubo varias actuaciones, encadenalas: "Asimismo, se…", "Por último, se…".
- El largo va con la duración: 5 minutos es una línea; dos horas admite varias oraciones con el detalle de lo obrado.
- Corregí ortografía, tildes, mayúsculas y nombres propios mal escritos (el apellido correcto es "Chadwick").
- No inventes actuaciones que no consten en el apunte. Podés explicitar lo que el apunte implica, y usar las glosas anteriores para nombrar bien documentos y personas recurrentes, pero no agregues hechos nuevos.
- Nunca dejes la glosa vacía.

Trabajos del ${dia}:
${JSON.stringify(entradas, null, 2)}
${notas.length ? `\nNotas de trabajo recientes que mencionan a estos clientes (contexto, no son actuaciones facturables por sí solas):\n${JSON.stringify(notas, null, 2)}` : ""}

Devolvé SOLO un array JSON, sin texto alrededor ni bloques de código:
[{"id_trabajo": <número>, "descripcion": "<glosa>"}]`;

console.log(`Redactando ${entradas.length} glosa(s) del ${dia}...`);

const salida = await new Promise((resolve, reject) => {
  // El prompt va por stdin, no como argumento: lleva comillas y saltos de linea
  // que cmd.exe destroza. Y se invoca via cmd.exe /c porque en Windows 'claude'
  // es un .cmd (el shim .ps1 lo bloquea la directiva del estudio).
  const p = process.platform === "win32"
    ? spawn("cmd.exe", ["/c", "claude.cmd", "-p"])
    : spawn("claude", ["-p"]);
  let out = "", err = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  p.on("error", (e) => reject(new Error(`No pude ejecutar claude: ${e.message}`)));
  p.on("close", (code) =>
    code === 0 ? resolve(out) : reject(new Error(`claude salio con codigo ${code}: ${err.slice(0, 300)}`)));
  p.stdin.write(INSTRUCCIONES);
  p.stdin.end();
});

// La respuesta puede venir con explicación o vallas de código alrededor.
const bloque = salida.match(/\[[\s\S]*\]/);
if (!bloque) { console.error("Claude no devolvio un array JSON. Respuesta:\n" + salida.slice(0, 500)); process.exit(1); }

let glosas;
try { glosas = JSON.parse(bloque[0]); }
catch (e) { console.error("El JSON devuelto no parsea: " + e.message); process.exit(1); }

const validos = new Set(editables.map((j) => String(j.id_trabajo)));
// El .trim() no es cosmetico: el modelo a veces devuelve la glosa con un
// espacio al principio y ese espacio se factura tal cual al cliente.
const limpias = glosas
  .filter((g) => validos.has(String(g.id_trabajo)) && g.descripcion?.trim())
  .map((g) => ({ ...g, descripcion: g.descripcion.trim() }));

for (const f of editables.filter((j) => !limpias.some((g) => String(g.id_trabajo) === String(j.id_trabajo)))) {
  console.error(`  ! #${f.id_trabajo} quedo sin glosa; se deja como esta.`);
}

writeFileSync("glosas.json", JSON.stringify(limpias, null, 2));
console.log(`${limpias.length} glosa(s) redactada(s) en glosas.json`);
