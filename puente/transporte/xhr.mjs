// Transporte XHR contra el endpoint interno real de TimeBilling (LemonSuite),
// descubierto el 24-08-2026 observando el formulario "Agregar nuevo trabajo"
// de bsvv.thetimebilling.com:
//
//   POST /time_tracking/app/react/trabajos/guardar.php   (JSON)
//   GET  /time_tracking/app/react/trabajos/eliminar.php?id_trabajo=N
//
// El asunto se identifica por codigo_asunto (texto, ej. "000022-0004"), no por
// un id numérico. La duración va como "HH:MM" y solo en múltiplos de 5 minutos.

const RUTA_GUARDAR = "/time_tracking/app/react/trabajos/guardar.php";

function duracionHHMM(min) {
  const h = String(Math.floor(min / 60)).padStart(2, "0");
  const m = String(min % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// hora: { fecha_local, duracion_min, codigo_asunto, descripcion, facturable,
//         id_usuario, id_categoria_usuario }
export async function enviar(pagina, hora) {
  if (!hora.codigo_asunto) {
    throw new Error("La hora no tiene código de asunto de TimeBilling (tb_proyectos.codigo).");
  }
  if (hora.duracion_min % 5 !== 0) {
    throw new Error(`Duración ${hora.duracion_min} min no es múltiplo de 5; TimeBilling la rechaza.`);
  }

  const ahora = new Date().toISOString().slice(0, 19).replace("T", " ");
  const cuerpo = {
    id_trabajo: "",
    codigo_asunto: hora.codigo_asunto,
    id_usuario: String(hora.id_usuario),
    id_categoria_usuario: String(hora.id_categoria_usuario ?? ""),
    codigo_actividad: "",
    codigo_tarea: "",
    descripcion: hora.descripcion,
    fecha: hora.fecha_local,
    hora_inicio: "",
    estado_timer: "0",
    hora_inicio_timer: "",
    duracion: duracionHHMM(hora.duracion_min),
    duracion_cobrada: duracionHHMM(hora.duracion_min),
    cobrable: Boolean(hora.facturable),
    visible: true,
    revisado: false,
    fecha_creacion: ahora,
  };

  // La petición sale desde la página, así que lleva las cookies de sesión.
  const resultado = await pagina.evaluate(
    async ({ ruta, cuerpo }) => {
      const r = await fetch(ruta, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(cuerpo),
      });
      const texto = await r.text();
      return { estado: r.status, texto };
    },
    { ruta: RUTA_GUARDAR, cuerpo }
  );

  if (resultado.estado < 200 || resultado.estado >= 300) {
    throw new Error(`TimeBilling respondió ${resultado.estado}: ${resultado.texto.slice(0, 200)}`);
  }

  let id = null;
  try {
    const datos = JSON.parse(resultado.texto);
    id = Number(datos.id_trabajo ?? datos.id) || null;
  } catch {
    // Respuesta no-JSON: se guardó, pero no sabemos el id.
  }
  return { id };
}
