// La nota diaria de la boveda. Es el UNICO canal por el que Dominga se entera
// de lo que paso: no hay aviso al gestor ni correo.
//
// Regla de diseno: si la nota no tiene ⚠️, no paso nada. Todo lo que fallo va
// arriba y con el texto redactado a la vista, para poder pegarlo a mano.

const aMinutos = (duracion) => {
  const [h, m] = String(duracion ?? "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function renderNota({ dia, glosas = [], pendientes = [], cobradas = 0, fallos = [] }) {
  const total = glosas.reduce((s, g) => s + aMinutos(g.duracion), 0);

  const avisos = [];
  if (pendientes.length === 1) avisos.push("⚠️ 1 hora quedó pendiente");
  else if (pendientes.length > 1) avisos.push(`⚠️ ${pendientes.length} horas quedaron pendientes`);
  if (fallos.length) avisos.push(`⚠️ ${fallos.length} problema(s) en la corrida`);

  const l = [
    "---",
    `fecha: ${dia}`,
    "tags: [timebilling, glosas]",
    "---",
    "",
    `# Glosas del ${dia}`,
    "",
    `${glosas.length} glosa(s) · ${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m${avisos.length ? "          " + avisos.join(" · ") : ""}`,
    "",
  ];

  // Lo pendiente va PRIMERO: es lo unico que le pide accion.
  for (const p of pendientes) {
    l.push(`## ${p.cliente_asunto || "(sin asunto)"} — ${p.duracion ?? "?"}   ⚠️ NO SE PUDO GUARDAR`, "");
    l.push(`**Apunte:** ${p.apunte || "(vacío)"}`, "");
    l.push(p.glosa, "");
    l.push(`> ${p.motivo}. La hora sigue sin esta glosa en TimeBilling.`, "");
  }

  for (const g of glosas) {
    l.push(`## ${g.cliente_asunto || "(sin asunto)"} — ${g.duracion ?? "?"}`, "");
    l.push(`**Apunte:** ${g.apunte || "(vacío)"}`, "");
    l.push(g.glosa, "");
  }

  if (cobradas) l.push(`> ${cobradas} hora(s) ya cobrada(s) no se tocaron.`, "");

  if (fallos.length) {
    l.push("---", "");
    for (const f of fallos) l.push(`> ⚠️ ${f}`, "");
  }

  return l.join("\n");
}
