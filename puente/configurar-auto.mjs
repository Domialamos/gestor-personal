// Igual que configurar.mjs, pero sin pedir Enter: abre la ventana de TimeBilling
// y espera sola hasta detectar que la sesion quedo iniciada. Asi la puede lanzar
// Claude sin necesitar teclado.
//
// Las credenciales las escribe Dominga en la ventana; nunca pasan por aca.
//
// OJO: la deteccion NO puede guiarse por la URL. La pantalla de acceso vive en
// /time_tracking/, que no contiene "login", y eso hacia que el script se diera
// por satisfecho al instante y cerrara la ventana antes de tiempo. Se mira el
// contenido: mientras haya campo de contrasena, todavia no ha entrado.

import { chromium } from "playwright";
import "dotenv/config";

const TB_URL = process.env.TB_URL;
if (!TB_URL) { console.error("Falta TB_URL en puente/.env"); process.exit(1); }

const ESPERA_MAX_MIN = 10;

const contexto = await chromium.launchPersistentContext("./perfil", {
  headless: false,
  viewport: { width: 1400, height: 900 },
});
const pagina = contexto.pages()[0] ?? (await contexto.newPage());
await pagina.goto(TB_URL).catch(() => {});

console.log("\nVentana abierta en TimeBilling.");
console.log("Escribe tu usuario y contrasena ahi: no pasan por este programa.");
console.log(`Esperando hasta ${ESPERA_MAX_MIN} minutos a que entres...\n`);

// Sigue fuera mientras haya campo de contrasena o el texto de bienvenida.
async function siguesFuera() {
  return pagina.evaluate(() => {
    if (document.querySelector('input[type="password"]')) return true;
    const t = document.body?.innerText ?? "";
    return /Ingresa tus credenciales|Iniciar sesi[oó]n|¿Olvidaste tu contrase/i.test(t);
  });
}

const limite = ESPERA_MAX_MIN * 60 * 1000;
const arranque = process.hrtime.bigint();
const transcurrido = () => Number(process.hrtime.bigint() - arranque) / 1e6;

let dentro = false;
let confirmaciones = 0;
while (transcurrido() < limite) {
  await pagina.waitForTimeout(3000);
  let fuera;
  try { fuera = await siguesFuera(); } catch { break; }   // navegando o cerrada
  if (fuera) { confirmaciones = 0; continue; }
  // Tres lecturas seguidas sin formulario: entro de verdad, no es un parpadeo.
  if (++confirmaciones >= 3) { dentro = true; break; }
}

if (dentro) {
  console.log("Sesion iniciada. Queda guardada en puente/perfil/.");
  await pagina.waitForTimeout(3000);   // que alcance a escribir las cookies
}
try { await contexto.close(); } catch { /* ya cerrada a mano */ }

if (!dentro) {
  console.error("No detecte la sesion iniciada. Vuelve a lanzarla.");
  process.exit(1);
}
