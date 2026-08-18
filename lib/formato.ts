// Formatos chilenos: fechas DD-MM-AAAA, miles con punto, decimales con coma, UF, RUT.

const ZONA = "America/Santiago";

export function fecha(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = typeof valor === "string" ? new Date(valor.length === 10 ? valor + "T12:00:00" : valor) : valor;
  if (isNaN(d.getTime())) return "—";
  const p = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return p.replace(/\//g, "-");
}

export function fechaHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return "—";
  const f = fecha(d);
  const h = new Intl.DateTimeFormat("es-CL", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${f} ${h}`;
}

export function numero(valor: number, decimales = 0): string {
  return new Intl.NumberFormat("es-CL", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
}

export function monto(valor: number | null | undefined, moneda: "CLP" | "UF" = "CLP"): string {
  if (valor == null) return "—";
  return moneda === "UF" ? `UF ${numero(valor, 2)}` : `$ ${numero(valor, 0)}`;
}

export function rutValido(rut: string): boolean {
  const limpio = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

export function formatearRut(rut: string): string {
  const limpio = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
}

// Convierte fecha y hora locales de Chile a ISO UTC, respetando el horario de verano.
export function desdeHoraChile(fechaLocal: string, hora = "00:00"): string {
  const base = new Date(`${fechaLocal}T${hora}:00Z`);
  const enChile = new Date(base.toLocaleString("en-US", { timeZone: ZONA }));
  const desfaseMin = Math.round((base.getTime() - enChile.getTime()) / 60000);
  return new Date(base.getTime() + desfaseMin * 60000).toISOString();
}

export function hoyChile(): string {
  // AAAA-MM-DD en hora de Chile, para columnas date
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
}
