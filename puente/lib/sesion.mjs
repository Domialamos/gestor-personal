// Sesion de TimeBilling y lectura del listado.
//
// El listado NO es semana.php: es app/interfaces/trabajos.php, un formulario
// PHP clasico con opc=buscar y fechas en DD-MM-AAAA.
//
// El arranque en frio de Chromium falla de forma intermitente (Page crashed, o
// timeout esperando fecha_ini) y a la segunda funciona. Por eso abrirSesion va
// envuelta en conReintento, que ademas relanza el contexto entero: reintentar
// sobre un navegador muerto no sirve de nada.

import { chromium } from "playwright";
import { parsearListado } from "./listado.mjs";

export class SesionCaida extends Error {
  constructor() { super("La sesion de TimeBilling caduco. Corre: npm.cmd run configurar-auto"); this.name = "SesionCaida"; }
}

export const LISTADO = (url, idUsuario) =>
  `${url}/time_tracking/app/interfaces/trabajos.php?popup=1&id_usuario=${idUsuario}&motivo=horas`;

export const aDDMMYYYY = (iso) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
};

const dormirDeVerdad = (ms) => new Promise((r) => setTimeout(r, ms));

export async function conReintento(fn, { intentos = 3, espera = 2000, dormir = dormirDeVerdad } = {}) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try { return await fn(); }
    catch (e) {
      // Una sesion caducada no se arregla reintentando: se corta de inmediato.
      if (e instanceof SesionCaida) throw e;
      ultimo = e;
      if (i < intentos - 1) await dormir(espera * (i + 1));
    }
  }
  throw ultimo;
}

export async function abrirSesion({ headless = true } = {}) {
  const contexto = await chromium.launchPersistentContext("./perfil", { headless });
  const pagina = contexto.pages()[0] ?? (await contexto.newPage());
  return { contexto, pagina };
}

export async function estaFuera(pagina) {
  // Por la URL no se puede: la pantalla de acceso vive en /time_tracking/ y no
  // dice "login" en ninguna parte. Se detecta por el campo de contrasena.
  return pagina.evaluate(() => {
    if (document.querySelector('input[type="password"]')) return true;
    return /Ingresa tus credenciales|¿Olvidaste tu contrase/i.test(document.body?.innerText ?? "");
  }).catch(() => true);
}

export async function buscarDia(pagina, { url, idUsuario, desde, hasta }) {
  await pagina.goto(LISTADO(url, idUsuario), { waitUntil: "networkidle" });
  if (await estaFuera(pagina)) throw new SesionCaida();
  // networkidle no garantiza que el formulario este pintado.
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
}

export const leerTrabajos = (pagina) => pagina.evaluate(parsearListado);

// Abre la sesion, corre el trabajo y cierra, reintentando el ciclo COMPLETO si
// el navegador se cae al arrancar. Relanzar es la clave: el reintento sobre la
// misma pagina muerta fue lo que fallo el 22-09-2026.
export async function conSesion(trabajo, opciones = {}) {
  return conReintento(async () => {
    const { contexto, pagina } = await abrirSesion(opciones);
    try { return await trabajo(pagina); }
    finally { await contexto.close().catch(() => {}); }
  }, opciones);
}

// Pagina de a 20 mediante el campo oculto "desde". Subir x_pag no funciona: el
// reenvio lo resetea.
export async function traerRango(pagina, { url, idUsuario, desde, hasta, maxPaginas = 20 }) {
  await buscarDia(pagina, { url, idUsuario, desde, hasta });
  const todos = new Map();
  for (let p = 0; p < maxPaginas; p++) {
    const lote = await leerTrabajos(pagina);
    const antes = todos.size;
    for (const t of lote) todos.set(String(t.id_trabajo), t);
    if (todos.size === antes) break;
    if (lote.length < 20) break;
    const avanzo = await pagina.evaluate((salto) => {
      const f = (n) => document.querySelector(`[name="${n}"]`);
      if (!f("desde") || !f("opc")) return false;
      f("desde").value = String(salto);
      f("opc").value = "buscar";
      f("opc").closest("form").submit();
      return true;
    }, (p + 1) * 20);
    if (!avanzo) break;
    await pagina.waitForLoadState("networkidle").catch(() => {});
    await pagina.waitForTimeout(2000);
  }
  return [...todos.values()];
}
