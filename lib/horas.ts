// Lógica pura del módulo de horas: redondeo al paso de TimeBilling, transiciones
// de estado y fechas en hora de Chile. Sin I/O, para poder probarlo directo.

const ZONA = "America/Santiago";

// TimeBilling solo acepta duraciones en múltiplos de 5 minutos (verificado en
// el formulario real de bsvv.thetimebilling.com el 24-08-2026).
export const PASO_MIN = 5;

export type EstadoHora = "corriendo" | "borrador" | "aprobada" | "cargada" | "error";

// Siempre hacia arriba: el trabajo empezado se cobra entero.
export function redondearPaso(minutos: number): number {
  if (minutos <= 0) return 0;
  return Math.ceil(minutos / PASO_MIN) * PASO_MIN;
}

const TRANSICIONES: Record<EstadoHora, EstadoHora[]> = {
  corriendo: ["borrador"],
  borrador: ["aprobada"],
  aprobada: ["borrador", "cargada", "error"],
  cargada: [], // una hora ya escrita en facturación no se toca desde acá
  error: ["aprobada"],
};

export function transicionValida(desde: EstadoHora, hasta: EstadoHora): boolean {
  return TRANSICIONES[desde].includes(hasta);
}

// AAAA-MM-DD del día chileno. Nunca usar toISOString(): a las 21:00 de Chile
// el UTC ya está en el día siguiente y la hora se cargaría con fecha errada.
export function fechaLocalChile(instante: string | Date): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);
}

export function minutosEntre(inicio: string | Date, fin: string | Date): number {
  const a = typeof inicio === "string" ? new Date(inicio) : inicio;
  const b = typeof fin === "string" ? new Date(fin) : fin;
  const min = Math.round((b.getTime() - a.getTime()) / 60000);
  return min > 0 ? min : 0;
}
