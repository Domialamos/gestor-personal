// Escucha lo que hace TimeBilling cuando la usuaria carga UNA hora a mano, y
// guarda la petición resultante. De acá sale la decisión de transporte:
// endpoint interno JSON (preferido) o relleno de formulario.

import { chromium } from "playwright";
import "dotenv/config";
import readline from "node:readline/promises";
import { writeFileSync } from "node:fs";

const TB_URL = process.env.TB_URL;
if (!TB_URL) {
  console.error("Falta TB_URL en puente/.env");
  process.exit(1);
}

const contexto = await chromium.launchPersistentContext("./perfil", {
  headless: false,
  viewport: { width: 1400, height: 900 },
});
const pagina = contexto.pages()[0] ?? (await contexto.newPage());

const candidatas = [];
pagina.on("request", (peticion) => {
  const metodo = peticion.method();
  if (metodo !== "POST" && metodo !== "PUT") return;
  const url = peticion.url();
  if (!url.startsWith(TB_URL)) return;
  candidatas.push({
    metodo,
    url,
    cabeceras: peticion.headers(),
    cuerpo: peticion.postData(),
    momento: candidatas.length,
  });
  console.log(`  ${metodo} ${url}`);
});

pagina.on("response", async (respuesta) => {
  const peticion = respuesta.request();
  const metodo = peticion.method();
  if (metodo !== "POST" && metodo !== "PUT") return;
  if (!peticion.url().startsWith(TB_URL)) return;
  const registro = candidatas.find((c) => c.url === peticion.url() && !c.respuesta);
  if (!registro) return;
  registro.estado = respuesta.status();
  try {
    registro.respuesta = (await respuesta.text()).slice(0, 4000);
  } catch {
    registro.respuesta = null;
  }
});

await pagina.goto(TB_URL);
console.log("\nCarga UNA hora a mano en TimeBilling. Voy anotando lo que pasa:\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question("\nCuando la hora ya esté guardada, apreta Enter acá… ");
rl.close();
await contexto.close();

if (candidatas.length === 0) {
  console.error("\nNo vi ninguna petición POST/PUT. ¿Se guardó la hora? Intenta de nuevo.");
  process.exit(1);
}

writeFileSync("descubierto.json", JSON.stringify(candidatas, null, 2));
console.log(`\nGuardé ${candidatas.length} petición(es) en puente/descubierto.json.`);

const conJson = candidatas.filter(
  (c) => (c.cabeceras["content-type"] ?? "").includes("json") ||
         (c.cuerpo ?? "").trim().startsWith("{")
);
if (conJson.length > 0) {
  console.log("\nHay un endpoint JSON. Se puede usar el transporte XHR:");
  for (const c of conJson) console.log(`  ${c.metodo} ${c.url}`);
} else {
  console.log("\nNo vi JSON. Habrá que usar el transporte por formulario (UI).");
}
