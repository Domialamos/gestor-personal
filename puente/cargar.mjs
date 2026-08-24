// Lee las horas aprobadas desde Supabase, las muestra, pide confirmación y las
// carga en TimeBilling una por una.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import readline from "node:readline/promises";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const { TB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, GESTOR_EMAIL, GESTOR_PASSWORD } = process.env;
for (const [nombre, valor] of Object.entries({ TB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, GESTOR_EMAIL, GESTOR_PASSWORD })) {
  if (!valor) { console.error(`Falta ${nombre} en puente/.env`); process.exit(1); }
}

const ZONA = "America/Santiago";
const fechaLocalChile = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));

// Centinela contra el doble envío: si el proceso muere entre el envío y el
// marcado, este archivo queda y obliga a verificar antes de seguir.
const EN_VUELO = "en-vuelo.json";
if (existsSync(EN_VUELO)) {
  const pendiente = JSON.parse(readFileSync(EN_VUELO, "utf8"));
  console.error(`\nLa carga anterior se cortó mientras enviaba la hora ${pendiente.id}:`);
  console.error(`  ${pendiente.fecha_local} · ${pendiente.duracion_min} min · ${pendiente.descripcion}`);
  console.error("\nRevisa en TimeBilling si esa hora quedó cargada.");
  console.error("Si quedó, márcala a mano en el gestor. Si no, borra puente/en-vuelo.json y vuelve a correr.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { error: errorLogin } = await supabase.auth.signInWithPassword({
  email: GESTOR_EMAIL, password: GESTOR_PASSWORD,
});
if (errorLogin) { console.error(`No pude entrar al gestor: ${errorLogin.message}`); process.exit(1); }

const { data: filas, error } = await supabase
  .from("horas")
  .select("id, inicio, duracion_min, proyecto_id, descripcion, facturable")
  .eq("estado", "aprobada")
  .order("inicio");
if (error) { console.error(error.message); process.exit(1); }
if (!filas.length) { console.log("No hay horas aprobadas por cargar."); process.exit(0); }

const horas = filas.map((f) => ({ ...f, fecha_local: fechaLocalChile(f.inicio) }));

console.log(`\n${horas.length} hora(s) por cargar:\n`);
for (const h of horas) {
  console.log(`  ${h.fecha_local}  ${String(h.duracion_min).padStart(3)} min  proyecto ${h.proyecto_id}`);
  console.log(`      ${h.descripcion}`);
}

if (!process.argv.includes("--si")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question("\n¿Las cargo? (escribe: si) ");
  rl.close();
  if (respuesta.trim().toLowerCase() !== "si") { console.log("Cancelado."); process.exit(0); }
}

// El transporte lo decide descubrimiento; ver puente/README.md sección Transporte.
const { enviar } = existsSync("descubierto.json") &&
  JSON.parse(readFileSync("descubierto.json", "utf8")).some(
    (r) => (r.cabeceras["content-type"] ?? "").includes("json") || (r.cuerpo ?? "").trim().startsWith("{"))
  ? await import("./transporte/xhr.mjs")
  : await import("./transporte/ui.mjs");

const contexto = await chromium.launchPersistentContext("./perfil", { headless: false });
const pagina = contexto.pages()[0] ?? (await contexto.newPage());
await pagina.goto(TB_URL);

if (pagina.url().toLowerCase().includes("login")) {
  await contexto.close();
  console.error("\nLa sesión de TimeBilling caducó. Corre `npm run configurar` y vuelve a intentar.");
  process.exit(1);
}

let cargadas = 0, fallidas = 0;
for (const hora of horas) {
  writeFileSync(EN_VUELO, JSON.stringify(hora, null, 2));
  try {
    const { id } = await enviar(pagina, hora);
    await supabase.from("horas").update({
      estado: "cargada",
      tb_time_entry_id: id,
      cargada_en: new Date().toISOString(),
      error_carga: null,
    }).eq("id", hora.id);
    unlinkSync(EN_VUELO);
    cargadas++;
    console.log(`  ✓ ${hora.fecha_local} ${hora.duracion_min} min`);
  } catch (e) {
    unlinkSync(EN_VUELO);
    await supabase.from("horas").update({
      estado: "error", error_carga: String(e.message).slice(0, 500),
    }).eq("id", hora.id);
    fallidas++;
    console.log(`  ✗ ${hora.fecha_local} ${hora.duracion_min} min — ${e.message}`);
  }
}

await contexto.close();
console.log(`\nCargadas: ${cargadas}. Con error: ${fallidas}.`);
if (fallidas) console.log("Las que fallaron quedaron en estado 'error' en el gestor, con el motivo.");
