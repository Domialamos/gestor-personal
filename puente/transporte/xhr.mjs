// Transporte preferido: reusa el endpoint interno que la propia app de
// TimeBilling llama al guardar una hora. La URL y la forma del cuerpo salen de
// descubierto.json; ajustar NOMBRES si los campos se llaman distinto.

import { readFileSync } from "node:fs";

// Mapeo de nuestros campos a los que espera TimeBilling. Revisar contra
// descubierto.json antes del primer uso real.
const NOMBRES = {
  fecha: "string_date",
  duracion: "duration",
  descripcion: "description",
  proyecto: "project_id",
  facturable: "billable",
};

function endpoint() {
  const registros = JSON.parse(readFileSync(new URL("../descubierto.json", import.meta.url)));
  const json = registros.find(
    (r) => (r.cabeceras["content-type"] ?? "").includes("json") ||
           (r.cuerpo ?? "").trim().startsWith("{")
  );
  if (!json) throw new Error("descubierto.json no tiene un endpoint JSON; usa el transporte ui.");
  return json;
}

export async function enviar(pagina, hora) {
  const modelo = endpoint();

  const cuerpo = {
    [NOMBRES.fecha]: hora.fecha_local,
    [NOMBRES.duracion]: hora.duracion_min,
    [NOMBRES.descripcion]: hora.descripcion,
    [NOMBRES.proyecto]: hora.proyecto_id,
    [NOMBRES.facturable]: hora.facturable ? 1 : 0,
  };

  // La petición sale desde la página, así que lleva las cookies de sesión.
  const resultado = await pagina.evaluate(
    async ({ url, metodo, cuerpo }) => {
      const r = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(cuerpo),
      });
      const texto = await r.text();
      return { estado: r.status, texto };
    },
    { url: modelo.url, metodo: modelo.metodo, cuerpo }
  );

  if (resultado.estado < 200 || resultado.estado >= 300) {
    throw new Error(`TimeBilling respondió ${resultado.estado}: ${resultado.texto.slice(0, 200)}`);
  }

  let id = null;
  try {
    const datos = JSON.parse(resultado.texto);
    id = datos.id ?? datos.time_entry?.id ?? null;
  } catch {
    // Respuesta no-JSON: se guardó, pero no sabemos el id.
  }
  return { id };
}
