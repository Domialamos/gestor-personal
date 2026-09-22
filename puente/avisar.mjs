// Aviso de que la rutina de glosas fallo. Crea una tarea en el gestor con
// fecha de hoy, para que aparezca en "No olvidar" del hub y en el celular.
//
// Por que existe: hasta el 29-08-2026 la rutina fallaba en silencio (ver
// README-glosas.md, "El fallo mudo"). El aviso tiene que sobrevivir al caso
// mas comun de fallo, que es quedarse sin internet: si no puede mandarlo, lo
// deja encolado en registro/aviso-pendiente.json y lo despacha el reintento
// siguiente.
//
//   node avisar.mjs "motivo del fallo"   anota un fallo (avisa al 3ro seguido)
//   node avisar.mjs --ok                 la corrida salio bien: cierra el aviso
//
// Las claves salen de ../.env.local del gestor (gitignorado). No pide nada
// nuevo: son las mismas que ya usa la app.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: "../.env.local" });

const ZONA = "America/Santiago";
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

const REGISTRO = "registro";
const PENDIENTE = join(REGISTRO, "aviso-pendiente.json");
const FALLOS = join(REGISTRO, `fallos-${hoy}.txt`);

// Cuantos fallos seguidos aguantamos antes de molestarla. A 30 minutos por
// reintento, tres son hora y media: lo suficiente para que un corte de red
// pasajero se resuelva solo sin aparecer en el telefono.
const FALLOS_PARA_AVISAR = 3;

const TITULO = `La rutina de glosas de TimeBilling fallo (${hoy})`;

mkdirSync(REGISTRO, { recursive: true });

// Salida ordenada. process.exit() a secas aborta node en Windows si el socket
// de Supabase todavia se esta cerrando (Assertion failed: UV_HANDLE_CLOSING).
// Se deja que el proceso drene solo, con un tope de 5 s por si algo queda vivo.
function terminar(codigo) {
  process.exitCode = codigo;
  setTimeout(() => process.exit(codigo), 5000).unref();
}


function conectar() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const usuario = process.env.USER_ID_DOMINGA;
  if (!url || !clave || !usuario) return null;
  return { supabase: createClient(url, clave, { auth: { persistSession: false } }), usuario };
}

async function crearTarea(detalle) {
  const con = conectar();
  if (!con) throw new Error("faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o USER_ID_DOMINGA en ../.env.local");
  const { supabase, usuario } = con;

  // Una sola por dia: si ya hay una pendiente con este titulo, no se duplica.
  const { data: yaHay, error: errorBusca } = await supabase
    .from("tareas").select("id")
    .eq("user_id", usuario).eq("titulo", TITULO).eq("estado", "pendiente").limit(1);
  if (errorBusca) throw new Error(errorBusca.message);
  if (yaHay?.length) return "ya-existia";

  const { error } = await supabase.from("tareas").insert({
    user_id: usuario,
    titulo: TITULO,
    tipo: "otro",
    prioridad: "alta",
    fecha: hoy,
    fecha_limite: hoy,
    detalle: `${detalle}\n\nRevisa puente/registro/${hoy}.txt. Si la sesion de TimeBilling caduco: npm.cmd run configurar-auto`,
  });
  if (error) throw new Error(error.message);
  return "creada";
}

async function cerrarTarea() {
  const con = conectar();
  if (!con) return;
  const { supabase, usuario } = con;
  await supabase.from("tareas")
    .update({ estado: "hecha", completada_en: new Date().toISOString() })
    .eq("user_id", usuario).eq("titulo", TITULO).eq("estado", "pendiente");
}

// Intenta despachar un aviso encolado de una corrida anterior sin internet.
async function despacharPendiente() {
  if (!existsSync(PENDIENTE)) return;
  const { detalle } = JSON.parse(readFileSync(PENDIENTE, "utf8"));
  await crearTarea(detalle);
  unlinkSync(PENDIENTE);
  console.log("Aviso pendiente despachado.");
}

await principal();
terminar(0);

async function principal() {
const esOk = process.argv[2] === "--ok";

if (esOk) {
  // La corrida salio bien: se borra la cuenta de fallos, se descarta el aviso
  // encolado que ya no corresponde y se cierra el que estuviera abierto.
  try { if (existsSync(FALLOS)) unlinkSync(FALLOS); } catch {}
  try { if (existsSync(PENDIENTE)) unlinkSync(PENDIENTE); } catch {}
  // Si un reintento anterior dejo la nota de fallo en la boveda, se retira:
  // el dia termino bien y esa nota ya no dice la verdad.
  try {
    const boveda = process.env.BOVEDA_GLOSAS ?? "C:/Users/dalamos/Obsidian/Segundo Cerebro/Notas Claude/Glosas";
    const nota = join(boveda, `${hoy} — FALLO.md`);
    if (existsSync(nota)) { unlinkSync(nota); console.log("Retirada la nota de fallo de la boveda."); }
  } catch {}
  try {
    await cerrarTarea();
  } catch (e) {
    console.log(`(no pude cerrar el aviso en el gestor: ${e.message})`);
  }
  return;
}

const motivo = process.argv.slice(2).join(" ").trim() || "sin detalle";
const previos = existsSync(FALLOS) ? Number(readFileSync(FALLOS, "utf8").trim()) || 0 : 0;
const seguidos = previos + 1;
writeFileSync(FALLOS, String(seguidos));

console.log(`Fallo ${seguidos} de hoy. Motivo: ${motivo}`);

if (seguidos < FALLOS_PARA_AVISAR) {
  console.log(`Todavia no aviso: espero a ${FALLOS_PARA_AVISAR} seguidos por si la red vuelve sola.`);
  return;
}

const detalle = `Fallo ${seguidos} veces seguidas hoy.\nUltimo motivo: ${motivo}`;
try {
  await despacharPendiente();
  const que = await crearTarea(detalle);
  console.log(que === "creada" ? "Aviso creado en el gestor." : "El aviso de hoy ya estaba en el gestor.");
} catch (e) {
  writeFileSync(PENDIENTE, JSON.stringify({ dia: hoy, detalle }, null, 2));
  console.log(`No pude avisar ahora (${e.message}). Queda encolado y se manda al proximo reintento.`);
  avisarEnLaBoveda(detalle, e.message);
}
}

// Red de seguridad: si el gestor no esta alcanzable (sin internet, o la clave
// de servicio mal puesta en ../.env.local), el aviso igual tiene que quedar en
// algun lado que ella mire. La nota va junto a las del dia, en la boveda.
function avisarEnLaBoveda(detalle, porque) {
  try {
    const boveda = process.env.BOVEDA_GLOSAS ?? "C:/Users/dalamos/Obsidian/Segundo Cerebro/Notas Claude/Glosas";
    mkdirSync(boveda, { recursive: true });
    writeFileSync(join(boveda, `${hoy} — FALLO.md`), [
      "---", `fecha: ${hoy}`, "tags: [timebilling, glosas, fallo]", "---", "",
      `# La rutina de glosas fallo el ${hoy}`, "",
      detalle, "",
      `No se pudo avisar en el gestor: ${porque}`, "",
      `Detalle tecnico en \`puente/registro/${hoy}.txt\`.`,
      "Si la sesion de TimeBilling caduco: `npm.cmd run configurar-auto`.", "",
    ].join("\n"));
    console.log("Aviso dejado en la boveda como respaldo.");
  } catch (e) {
    console.log(`Tampoco pude dejar la nota en la boveda: ${e.message}`);
  }
}
