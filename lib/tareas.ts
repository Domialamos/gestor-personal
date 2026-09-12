// Orden del to-do del día: primero la urgencia (qué día), después la prioridad.
//
// La regla que manda: nada que sea para más adelante puede quedar sobre algo de
// hoy. Antes las tareas con fecha_limite se ordenaban todas juntas arriba y las
// sin fecha caían al final, así que una tarea para el jueves aparecía encima de
// lo que había que hacer hoy. Ahora el día es el criterio grueso y la prioridad
// solo desempata dentro de un mismo día.

export type Prioridad = "alta" | "media" | "baja";

export const PRIORIDADES: { codigo: Prioridad; etiqueta: string }[] = [
  { codigo: "alta", etiqueta: "Alta" },
  { codigo: "media", etiqueta: "Media" },
  { codigo: "baja", etiqueta: "Baja" },
];

const PESO: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

export function esPrioridad(valor: unknown): valor is Prioridad {
  return valor === "alta" || valor === "media" || valor === "baja";
}

export function normalizarPrioridad(valor: unknown): Prioridad {
  return esPrioridad(valor) ? valor : "media";
}

export type TareaOrdenable = {
  fecha_limite?: string | null;
  prioridad?: string | null;
  creado_en?: string | null;
};

export type GrupoTareas<T> = {
  clave: string;
  titulo: string;
  // Marca el grupo de lo que ya se pasó de fecha, para pintarlo distinto
  vencido: boolean;
  tareas: T[];
};

const ZONA = "America/Santiago";

// "2026-08-29" -> "viernes 29". Se parsea al mediodía para que el cambio de
// huso no corra el día hacia atrás.
function nombreDelDia(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, weekday: "long", day: "numeric" }).format(d);
}

function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);
}

export function etiquetaDia(iso: string, hoy: string): string {
  if (iso === hoy) return "Hoy";
  if (iso === sumarDias(hoy, 1)) return "Mañana";
  return nombreDelDia(iso);
}

// A qué día pertenece una tarea en el to-do. Las que no tienen fecha son cosas
// que hay que hacer igual, así que entran al día de hoy y compiten por
// prioridad en vez de quedar arrumbadas al final de la lista.
function diaDe(tarea: TareaOrdenable, hoy: string): string {
  const limite = tarea.fecha_limite;
  if (!limite) return hoy;
  return limite < hoy ? hoy : limite;
}

function ordenarDentroDelGrupo<T extends TareaOrdenable>(tareas: T[]): T[] {
  return [...tareas].sort((a, b) => {
    const pa = PESO[normalizarPrioridad(a.prioridad)];
    const pb = PESO[normalizarPrioridad(b.prioridad)];
    if (pa !== pb) return pa - pb;
    return (a.creado_en ?? "").localeCompare(b.creado_en ?? "");
  });
}

/**
 * Agrupa las tareas pendientes en bloques por día, del más urgente al menos.
 *
 * Orden de los grupos: Vencidas, Hoy, Mañana, y después un grupo por cada día
 * con fecha. Dentro de cada grupo: alta, media, baja, y a igualdad la más
 * antigua primero.
 */
export function agruparPendientes<T extends TareaOrdenable>(
  tareas: T[],
  hoy: string
): GrupoTareas<T>[] {
  const vencidas: T[] = [];
  const porDia = new Map<string, T[]>();

  for (const t of tareas) {
    if (t.fecha_limite && t.fecha_limite < hoy) {
      vencidas.push(t);
      continue;
    }
    const dia = diaDe(t, hoy);
    const lista = porDia.get(dia);
    if (lista) lista.push(t);
    else porDia.set(dia, [t]);
  }

  const grupos: GrupoTareas<T>[] = [];

  if (vencidas.length > 0) {
    // Lo más atrasado arriba; la prioridad desempata dentro de un mismo día
    const ordenadas = [...vencidas].sort((a, b) => {
      const fa = a.fecha_limite ?? "";
      const fb = b.fecha_limite ?? "";
      if (fa !== fb) return fa.localeCompare(fb);
      const pa = PESO[normalizarPrioridad(a.prioridad)];
      const pb = PESO[normalizarPrioridad(b.prioridad)];
      if (pa !== pb) return pa - pb;
      return (a.creado_en ?? "").localeCompare(b.creado_en ?? "");
    });
    grupos.push({ clave: "vencidas", titulo: "Vencidas", vencido: true, tareas: ordenadas });
  }

  for (const dia of [...porDia.keys()].sort()) {
    grupos.push({
      clave: dia,
      titulo: etiquetaDia(dia, hoy),
      vencido: false,
      tareas: ordenarDentroDelGrupo(porDia.get(dia)!),
    });
  }

  return grupos;
}

// ---------------------------------------------------------------------------
// Delegación: lo que se le encargó a otra persona
// ---------------------------------------------------------------------------

export type TareaDelegada = {
  delegada_en?: string | null;
  seguimientos?: { fecha: string }[] | null;
};

/** Día del último movimiento: el seguimiento más reciente, o el encargo si nunca se insistió. */
export function ultimoMovimiento(tarea: TareaDelegada): string | null {
  const fechas = (tarea.seguimientos ?? []).map((s) => s.fecha).filter(Boolean);
  if (fechas.length === 0) return tarea.delegada_en ?? null;
  return fechas.reduce((a, b) => (a > b ? a : b));
}

/** Días completos desde el último movimiento. Nunca negativo. */
export function diasSinMover(tarea: TareaDelegada, hoy: string): number {
  const desde = ultimoMovimiento(tarea);
  if (!desde) return 0;
  const ms = new Date(hoy + "T12:00:00").getTime() - new Date(desde + "T12:00:00").getTime();
  return Math.max(0, Math.round(ms / 864e5));
}

/**
 * Ordena las delegadas por lo más estancado arriba.
 *
 * En este bloque no importa cuándo la querías, sino cuánto lleva parada: manda
 * el último movimiento (seguimiento o encargo), del más antiguo al más nuevo.
 * La prioridad solo desempata.
 */
export function ordenarEsperando<T extends TareaDelegada & TareaOrdenable>(
  tareas: T[],
  hoy: string
): T[] {
  return [...tareas].sort((a, b) => {
    const da = diasSinMover(a, hoy);
    const db = diasSinMover(b, hoy);
    if (da !== db) return db - da;
    const pa = PESO[normalizarPrioridad(a.prioridad)];
    const pb = PESO[normalizarPrioridad(b.prioridad)];
    if (pa !== pb) return pa - pb;
    return (a.creado_en ?? "").localeCompare(b.creado_en ?? "");
  });
}
