// Abre Chromium con perfil persistente en el login de TimeBilling y espera a que
// la usuaria entre a mano. Las credenciales de TimeBilling NO pasan por acá:
// se escriben en la ventana. Lo que queda guardado es la cookie de sesión.

import { chromium } from "playwright";
import "dotenv/config";
import readline from "node:readline/promises";

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
await pagina.goto(TB_URL);

console.log("\nEntra a TimeBilling en la ventana que se abrió.");
console.log("Escribe tú misma tu usuario y contraseña: no pasan por este programa.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question("Cuando ya estés dentro, apreta Enter acá… ");
rl.close();

const url = pagina.url();
await contexto.close();

if (url.toLowerCase().includes("login") || url.toLowerCase().includes("sign_in")) {
  console.error("\nParece que la sesión no quedó iniciada. Corre `npm run configurar` de nuevo.");
  process.exit(1);
}
console.log("\nSesión guardada en puente/perfil/. Ahora corre `npm run descubrir`.");
