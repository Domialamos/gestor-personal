export type EventoIcs = {
  uid: string;
  titulo: string;
  inicio: string;
  fin: string | null;
  todo_el_dia: boolean;
  ubicacion: string | null;
};

// Parser ICS mínimo: VEVENT con DTSTART/DTEND/SUMMARY/LOCATION/UID.
// No expande recurrencias (RRULE); suficiente para la vista de próximos días.
export function parsearIcs(texto: string): EventoIcs[] {
  // Despliega líneas plegadas (RFC 5545: continuación con espacio inicial)
  const lineas = texto.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const eventos: EventoIcs[] = [];
  let actual: Record<string, string> | null = null;

  for (const linea of lineas) {
    if (linea === "BEGIN:VEVENT") { actual = {}; continue; }
    if (linea === "END:VEVENT") {
      if (actual?.DTSTART && actual.SUMMARY) {
        const todoElDia = actual.DTSTART_VALUE === "DATE" || /^\d{8}$/.test(actual.DTSTART);
        const inicio = aIso(actual.DTSTART, actual.DTSTART_TZID);
        if (inicio) {
          eventos.push({
            uid: actual.UID ?? `${actual.SUMMARY}-${actual.DTSTART}`,
            titulo: desescapar(actual.SUMMARY),
            inicio,
            fin: actual.DTEND ? aIso(actual.DTEND, actual.DTEND_TZID) : null,
            todo_el_dia: todoElDia,
            ubicacion: actual.LOCATION ? desescapar(actual.LOCATION) : null,
          });
        }
      }
      actual = null;
      continue;
    }
    if (!actual) continue;
    const idx = linea.indexOf(":");
    if (idx < 0) continue;
    const cabecera = linea.slice(0, idx);
    const valor = linea.slice(idx + 1);
    const [nombre, ...params] = cabecera.split(";");
    if (!["DTSTART", "DTEND", "SUMMARY", "LOCATION", "UID"].includes(nombre)) continue;
    actual[nombre] = valor;
    for (const p of params) {
      const [k, v] = p.split("=");
      if (k === "TZID") actual[`${nombre}_TZID`] = v;
      if (k === "VALUE") actual[`${nombre}_VALUE`] = v;
    }
  }
  return eventos;
}

function desescapar(s: string): string {
  return s.replace(/\\n/g, " · ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function aIso(valor: string, tzid?: string): string | null {
  // 20260818, 20260818T143000, 20260818T143000Z
  const m = valor.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, a, me, d, h = "00", mi = "00", s = "00", z] = m;
  if (z) return `${a}-${me}-${d}T${h}:${mi}:${s}Z`;
  if (!tzid || tzid === "America/Santiago") {
    // Hora local de Chile: calcula el desfase vigente en esa fecha
    const fechaUtc = new Date(`${a}-${me}-${d}T${h}:${mi}:${s}Z`);
    const enChile = new Date(fechaUtc.toLocaleString("en-US", { timeZone: "America/Santiago" }));
    const desfaseMin = Math.round((fechaUtc.getTime() - enChile.getTime()) / 60000);
    return new Date(fechaUtc.getTime() + desfaseMin * 60000).toISOString();
  }
  // Otras zonas: se asume UTC como aproximación
  return `${a}-${me}-${d}T${h}:${mi}:${s}Z`;
}
