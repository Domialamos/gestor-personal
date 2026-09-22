// Guarda una pagina real del listado para usarla como fixture de pruebas.
// Solo lectura: no edita nada en TimeBilling.
//
//   node pruebas/fixtures/capturar.mjs 01-09-2026 22-09-2026

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const [desde, hasta] = process.argv.slice(2);
const { TB_URL, TB_ID_USUARIO } = process.env;
if (!desde || !hasta) { console.error("Uso: node pruebas/fixtures/capturar.mjs DD-MM-AAAA DD-MM-AAAA"); process.exit(1); }

const contexto = await chromium.launchPersistentContext("./perfil", { headless: true });
const pagina = contexto.pages()[0] ?? (await contexto.newPage());
try {
  await pagina.goto(`${TB_URL}/time_tracking/app/interfaces/trabajos.php?popup=1&id_usuario=${TB_ID_USUARIO}&motivo=horas`, { waitUntil: "networkidle" });
  await pagina.waitForSelector('[name="fecha_ini"]', { timeout: 15000 });
  await pagina.evaluate(({ desde, hasta }) => {
    const f = (n) => document.querySelector(`[name="${n}"]`);
    f("fecha_ini").value = desde;
    f("fecha_fin").value = hasta;
    f("opc").value = "buscar";
    f("opc").closest("form").submit();
  }, { desde, hasta });
  await pagina.waitForLoadState("networkidle").catch(() => {});
  await pagina.waitForTimeout(2500);
  const html = await pagina.content();
  writeFileSync("pruebas/fixtures/listado.html", html);
  const filas = await pagina.locator('tr[id^="t"]').count();
  console.log(`Guardadas ${filas} fila(s) en pruebas/fixtures/listado.html`);
} finally {
  await contexto.close().catch(() => {});
}
