// Sube a TimeBilling las glosas redactadas, usando el propio formulario de
// edicion de la aplicacion (abrir "Editar", cambiar el texto, "Guardar").
//
// Se hace asi a proposito y no armando la peticion a mano: el formulario lleva
// campos ocultos (metadata, actividad, categoria) que TimeBilling necesita y que
// no conviene adivinar.
//
//   node glosas-escribir.mjs        -> muestra el antes/despues y pide confirmacion
//   node glosas-escribir.mjs --si   -> sin preguntar (lo usa la rutina automatica)

import "dotenv/config";
import readline from "node:readline/promises";
import { readFileSync, existsSync } from "node:fs";
import { abrirSesion, buscarDia, leerTrabajos, aDDMMYYYY } from "./tb.mjs";
import { marcarProcesada } from "./registro-glosas.mjs";

const { TB_URL, TB_ID_USUARIO } = process.env;
if (!TB_URL || !TB_ID_USUARIO) { console.error("Faltan TB_URL o TB_ID_USUARIO en puente/.env"); process.exit(1); }

for (const f of ["dia.json", "glosas.json"]) {
  if (!existsSync(f)) { console.error(`Falta puente/${f}.`); process.exit(1); }
}
const { dia, jobs } = JSON.parse(readFileSync("dia.json", "utf8"));
const glosas = JSON.parse(readFileSync("glosas.json", "utf8"));
const porId = new Map(jobs.map((j) => [String(j.id_trabajo), j]));

const aEnviar = [];
for (const g of glosas) {
  const job = porId.get(String(g.id_trabajo));
  if (!job) { console.error(`  ! #${g.id_trabajo} no esta en dia.json - se omite.`); continue; }
  if (!job.editable) { console.error(`  ! #${g.id_trabajo} ya esta cobrada - se omite.`); continue; }
  if (!g.descripcion?.trim()) { console.error(`  ! #${g.id_trabajo} sin glosa - se omite.`); continue; }
  if (g.descripcion.trim() === job.descripcion.trim()) { console.error(`  = #${g.id_trabajo} sin cambios - se omite.`); continue; }
  aEnviar.push({ job, descripcion: g.descripcion.trim() });
}
if (!aEnviar.length) { console.log("Nada por subir."); process.exit(0); }

console.log(`\n${dia} - ${aEnviar.length} glosa(s) por actualizar:\n`);
for (const { job, descripcion } of aEnviar) {
  console.log(`  #${job.id_trabajo}  ${job.duracion}  ${job.cliente_asunto}`);
  console.log(`      antes:   ${job.descripcion || "(sin glosa)"}`);
  console.log(`      despues: ${descripcion}\n`);
}

if (!process.argv.includes("--si")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question("Las subo? (escribe: si) ");
  rl.close();
  if (r.trim().toLowerCase() !== "si") { console.log("Cancelado."); process.exit(0); }
}

const f = aDDMMYYYY(dia);
const { contexto, pagina } = await abrirSesion();
let ok = 0, mal = 0;

try {
  for (const { job, descripcion } of aEnviar) {
    try {
      // Se rehace la busqueda antes de cada edicion: al guardar, el listado se
      // recarga y los botones anteriores quedan sueltos.
      await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });

      const boton = pagina.locator(`[data-edit-job="${job.id_trabajo}"]`).first();
      if (!(await boton.count())) throw new Error("no encontre el boton de editar (puede estar cobrada)");
      await boton.click();

      const caja = pagina.locator('textarea[name="descripcion"]').first();
      await caja.waitFor({ state: "visible", timeout: 15000 });
      // fill() dispara los eventos que el formulario escucha; asignar .value no.
      await caja.fill(descripcion);

      const guardar = pagina.locator('button.btn-primary:has-text("Guardar")').first();
      await guardar.click();
      await pagina.waitForLoadState("networkidle").catch(() => {});
      await pagina.waitForTimeout(2500);

      ok++;
      console.log(`  ok #${job.id_trabajo}`);
    } catch (e) {
      mal++;
      console.log(`  ERROR #${job.id_trabajo} - ${e.message}`);
    }
  }

  // Comprobacion: se vuelve a leer el dia y se contrasta con lo que se quiso dejar.
  console.log("\nComprobando lo que quedo guardado...");
  await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });
  const ahora = new Map((await leerTrabajos(pagina)).map((t) => [String(t.id_trabajo), t]));
  let confirmadas = 0;
  for (const { job, descripcion } of aEnviar) {
    const actual = ahora.get(String(job.id_trabajo))?.descripcion ?? "";
    if (actual.trim() === descripcion.trim()) {
      confirmadas++;
      // Solo se anota lo verificado en TimeBilling, no lo meramente enviado.
      marcarProcesada(job.id_trabajo, { dia, glosa: descripcion });
    } else {
      console.log(`  NO COINCIDE #${job.id_trabajo}: quedo "${actual.slice(0, 70)}"`);
    }
  }
  console.log(`\nConfirmadas en TimeBilling: ${confirmadas} de ${aEnviar.length}.`);
} finally {
  await contexto.close().catch(() => {});
}

console.log(`Enviadas: ${ok}. Con error: ${mal}.`);
if (mal) process.exit(1);
