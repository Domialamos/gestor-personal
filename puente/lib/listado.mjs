// Parseo del listado "Revisar horas" de TimeBilling.
//
// parsearListado() se INYECTA en el navegador con page.evaluate, asi que tiene
// que ser autocontenida: sin closures, sin imports, sin variables de fuera.
// Cualquier ayuda va definida adentro.

export function parsearListado() {
  const texto = (e) => (e?.innerText ?? "").trim().replace(/\s+/g, " ");

  return [...document.querySelectorAll('tr[id^="t"]')].map((tr) => {
    const id = tr.id.slice(1);
    if (!/^\d+$/.test(id)) return null;

    const celdas = [...tr.querySelectorAll("td")];
    const asunto = tr.querySelector(".cliente-asunto");
    const pie = texto(asunto?.querySelector("footer"));

    // El pie viene como "#617213 la glosa...". El bug historico fue escribir
    // "\s" dentro de un string pasado a RegExp, donde se pierde la barra: hay
    // que escribir "\\s" o usar un literal. Aca se recorta sin RegExp.
    let glosa = pie;
    const prefijo = `#${id}`;
    if (glosa.startsWith(prefijo)) glosa = glosa.slice(prefijo.length).trim();

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
  }).filter(Boolean);
}
