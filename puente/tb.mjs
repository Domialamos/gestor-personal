// Utilidades compartidas: abrir la sesion y buscar los trabajos de un dia en el
// listado "Revisar horas" (trabajos.php).
//
// Descubierto el 26-08-2026 sobre la sesion real. El listado NO es semana.php:
// es un formulario PHP clasico con opc=buscar, fecha_ini y fecha_fin en
// DD-MM-YYYY. La glosa vive en el <footer> de la celda cliente/asunto,
// precedida por "#<id_trabajo> ".

import { chromium } from "playwright";

export const LISTADO = (url, idUsuario) =>
  `${url}/time_tracking/app/interfaces/trabajos.php?popup=1&id_usuario=${idUsuario}&motivo=horas`;

export const aDDMMYYYY = (iso) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
};

export async function abrirSesion({ headless = true } = {}) {
  const contexto = await chromium.launchPersistentContext("./perfil", { headless });
  const pagina = contexto.pages()[0] ?? (await contexto.newPage());
  return { contexto, pagina };
}

export async function estaFuera(pagina) {
  return pagina.evaluate(() => {
    if (document.querySelector('input[type="password"]')) return true;
    return /Ingresa tus credenciales|¿Olvidaste tu contrase/i.test(document.body?.innerText ?? "");
  }).catch(() => true);
}

// Deja la pagina en el listado ya filtrado por el rango pedido.
export async function buscarDia(pagina, { url, idUsuario, desde, hasta }) {
  await pagina.goto(LISTADO(url, idUsuario), { waitUntil: "networkidle" });
  if (await estaFuera(pagina)) {
    throw new Error("La sesion de TimeBilling caduco. Hay que volver a iniciarla.");
  }
  // networkidle no garantiza que el formulario este pintado: el 29-08-2026 una
  // corrida fallo con "Cannot set properties of null" porque fecha_ini todavia
  // no existia. Se espera el campo antes de escribirlo.
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

// Lee las filas del listado ya buscado.
export async function leerTrabajos(pagina) {
  return pagina.evaluate(() =>
    [...document.querySelectorAll('tr[id^="t"]')].map((tr) => {
      const id = tr.id.slice(1);
      if (!/^\d+$/.test(id)) return null;
      const celdas = [...tr.querySelectorAll("td")];
      const texto = (e) => (e?.innerText ?? "").trim().replace(/\s+/g, " ");
      const asunto = tr.querySelector(".cliente-asunto");
      const pie = texto(asunto?.querySelector("footer"));
      // El pie viene como "#617213 la glosa...": se le saca el numero.
      const glosa = pie.replace(new RegExp(`^#${id}\s*`), "");
      const duracion = celdas.map(texto).find((t) => /^\d{1,2}:\d{2}$/.test(t)) ?? "";
      const cobrableCelda = celdas.map(texto).find((t) => t === "SI" || t === "NO");
      // Una hora ya cobrada no trae boton de editar: ese es el filtro fiable.
      const editable = Boolean(
        tr.querySelector(`[data-edit-job="${id}"]`) ||
        document.querySelector(`[data-edit-job="${id}"]`)
      );
      return {
        id_trabajo: Number(id),
        fecha: texto(celdas[1]),
        cliente_asunto: texto(asunto?.querySelector("strong")),
        duracion,
        cobrable: cobrableCelda === "SI",
        descripcion: glosa,
        editable,
      };
    }).filter(Boolean)
  );
}
