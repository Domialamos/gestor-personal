// Núcleo del módulo Extraer, la idea de LangExtract (Google) rehecha en TypeScript:
// el documento se corta en tramos, Claude extrae citas literales de cada tramo y
// cada cita se vuelve a buscar en el texto original. Lo que no aparece queda
// marcado "sin respaldo" en vez de pasar por dato verdadero.
//
// Todo aquí es lógica pura (sin red ni base), para probarlo con `npm test`.

export type Alineacion = "exacta" | "aproximada" | "sin_respaldo";

export type Ubicacion = { inicio: number; fin: number; alineacion: Alineacion } | { inicio: null; fin: null; alineacion: "sin_respaldo" };

export type Tramo = { inicio: number; fin: number };

// ---------------------------------------------------------------------------
// Tramos

// Corta en párrafo si puede, si no en fin de oración, si no en un espacio.
// Nunca deja un tramo más largo que `maximo`. Determinista: el mismo texto da
// siempre los mismos tramos, así el proceso se puede retomar por número de tramo.
export function trocear(texto: string, maximo = 12000): Tramo[] {
  const tramos: Tramo[] = [];
  let inicio = 0;
  while (inicio < texto.length) {
    // Sin blancos al comienzo: un tramo que empieza en saltos de línea desperdicia contexto
    while (inicio < texto.length && /\s/.test(texto[inicio])) inicio++;
    if (inicio >= texto.length) break;

    let fin = Math.min(inicio + maximo, texto.length);
    if (fin < texto.length) {
      const ventana = texto.slice(inicio, fin);
      const minimo = Math.floor(maximo * 0.5); // no cortar tan temprano que el tramo quede enano
      const corte =
        ultimoIndice(ventana, /\n\s*\n/g, minimo) ??
        ultimoIndice(ventana, /[.;:!?]["”»)]?\s/g, minimo) ??
        ultimoIndice(ventana, /\s/g, minimo);
      if (corte != null) fin = inicio + corte;
    }
    tramos.push({ inicio, fin });
    inicio = fin;
  }
  return tramos;
}

// Posición justo después del último calce de `patron` que termina pasado `minimo`.
function ultimoIndice(s: string, patron: RegExp, minimo: number): number | null {
  let ultimo: number | null = null;
  for (const m of s.matchAll(patron)) {
    const fin = (m.index ?? 0) + m[0].length;
    if (fin >= minimo) ultimo = fin;
  }
  return ultimo;
}

// ---------------------------------------------------------------------------
// Normalización con mapa de posiciones

// Minúsculas, sin tildes, blancos colapsados y comillas o guiones tipográficos
// unificados. `mapa[i]` dice de qué carácter del original viene el carácter i
// del texto normalizado: así una coincidencia en el normalizado se traduce de
// vuelta a posiciones exactas del documento.
export function normalizarConMapa(s: string): { n: string; mapa: number[] } {
  let n = "";
  const mapa: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch) || ch === "­") {
      if (ch === "­") continue; // guion blando de los PDF
      if (n.length > 0 && n[n.length - 1] !== " ") {
        n += " ";
        mapa.push(i);
      }
      continue;
    }
    const c = unificar(ch);
    for (const x of c) {
      n += x;
      mapa.push(i);
    }
  }
  // Sin espacio final colgando
  if (n.endsWith(" ")) {
    n = n.slice(0, -1);
    mapa.pop();
  }
  return { n, mapa };
}

function unificar(ch: string): string {
  switch (ch) {
    case "“": case "”": case "„": case "«": case "»": return '"';
    case "‘": case "’": case "‚": return "'";
    case "–": case "—": case "‑": return "-";
  }
  return ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function normalizar(s: string): string {
  return normalizarConMapa(s).n;
}

// Primer índice del normalizado cuyo origen es >= posición del original
function aNormalizado(mapa: number[], posicion: number): number {
  let lo = 0, hi = mapa.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (mapa[m] < posicion) lo = m + 1;
    else hi = m;
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Alineación

export type Indice = { original: string; n: string; mapa: number[] };

export function indexar(texto: string): Indice {
  return { original: texto, ...normalizarConMapa(texto) };
}

// Umbral de la búsqueda aproximada: al menos 3 de cada 4 palabras de la cita
// tienen que estar en la ventana (el mismo 0,75 que usa LangExtract).
export const UMBRAL_APROXIMADO = 0.75;

// Ubica una cita dentro del tramo [desde, hasta) del original.
// 1) Coincidencia exacta tras normalizar; si hay varias, la primera desde `cursor`
//    (las extracciones vienen en orden de aparición).
// 2) Si no, la misma búsqueda en todo el documento.
// 3) Si no, la ventana del tramo que contiene más palabras de la cita.
export function alinear(indice: Indice, cita: string, desde = 0, hasta = indice.original.length, cursor = desde): Ubicacion {
  const buscada = normalizar(cita);
  if (!buscada) return SIN_RESPALDO;

  const nDesde = aNormalizado(indice.mapa, desde);
  const nHasta = aNormalizado(indice.mapa, hasta);
  const nCursor = aNormalizado(indice.mapa, cursor);

  const exacta =
    buscarExacta(indice, buscada, nDesde, nHasta, nCursor) ??
    buscarExacta(indice, buscada, 0, indice.n.length, nCursor);
  if (exacta) return { ...exacta, alineacion: "exacta" };

  const aproximada = buscarAproximada(indice, buscada, nDesde, nHasta);
  if (aproximada) return { ...aproximada, alineacion: "aproximada" };

  return SIN_RESPALDO;
}

const SIN_RESPALDO: Ubicacion = { inicio: null, fin: null, alineacion: "sin_respaldo" };

function aOriginal(indice: Indice, nInicio: number, nFin: number) {
  return { inicio: indice.mapa[nInicio], fin: indice.mapa[nFin - 1] + 1 };
}

function buscarExacta(indice: Indice, buscada: string, nDesde: number, nHasta: number, nCursor: number) {
  let primera: number | null = null;
  let pos = indice.n.indexOf(buscada, nDesde);
  while (pos !== -1 && pos + buscada.length <= nHasta) {
    if (primera == null) primera = pos;
    if (pos >= nCursor) return aOriginal(indice, pos, pos + buscada.length);
    pos = indice.n.indexOf(buscada, pos + 1);
  }
  return primera == null ? null : aOriginal(indice, primera, primera + buscada.length);
}

type Token = { t: string; inicio: number; fin: number };

function tokens(s: string, desde = 0, hasta = s.length): Token[] {
  const lista: Token[] = [];
  const re = /[\p{L}\p{N}]+/gu;
  re.lastIndex = desde;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) && m.index < hasta) {
    if (m.index + m[0].length > hasta) break;
    lista.push({ t: m[0], inicio: m.index, fin: m.index + m[0].length });
  }
  return lista;
}

// Ventana deslizante del largo de la cita, contando cuántas de sus palabras
// (con repeticiones) caen dentro. El resultado se recorta a la primera y la
// última palabra que sí calzan, para no subrayar relleno.
function buscarAproximada(indice: Indice, buscada: string, nDesde: number, nHasta: number) {
  const cita = tokens(buscada).map((x) => x.t);
  if (cita.length < 2) return null; // una palabra suelta no se aproxima: o está o no está

  const bolsa = new Map<string, number>();
  for (const t of cita) bolsa.set(t, (bolsa.get(t) ?? 0) + 1);

  const tramo = tokens(indice.n, nDesde, nHasta);
  const w = cita.length;
  if (tramo.length === 0) return null;

  const ventana = new Map<string, number>();
  let coincidencias = 0;
  const entra = (t: string) => {
    const b = bolsa.get(t);
    if (!b) return;
    const v = ventana.get(t) ?? 0;
    if (v < b) coincidencias++;
    ventana.set(t, v + 1);
  };
  const sale = (t: string) => {
    const b = bolsa.get(t);
    if (!b) return;
    const v = (ventana.get(t) ?? 0) - 1;
    ventana.set(t, v);
    if (v < b) coincidencias--;
  };

  let mejor = -1, mejorInicio = 0;
  for (let i = 0; i < tramo.length; i++) {
    entra(tramo[i].t);
    if (i >= w) sale(tramo[i - w].t);
    if (coincidencias > mejor) {
      mejor = coincidencias;
      mejorInicio = Math.max(0, i - w + 1);
    }
  }
  if (mejor / w < UMBRAL_APROXIMADO) return null;

  let a = mejorInicio, z = Math.min(mejorInicio + w, tramo.length) - 1;
  while (a < z && !bolsa.has(tramo[a].t)) a++;
  while (z > a && !bolsa.has(tramo[z].t)) z--;
  return aOriginal(indice, tramo[a].inicio, tramo[z].fin);
}

// ---------------------------------------------------------------------------
// Segmentos para pintar el documento con sus subrayados

export type Marcable = { id: string; inicio: number | null; fin: number | null };
export type Segmento = { texto: string; id: string | null; inicio: number };

// Parte el texto en trozos subrayados y sin subrayar. Si dos extracciones se
// pisan, gana la que empieza antes (y a igual inicio, la más larga); la otra
// sigue en la lista, solo que sin subrayado propio.
export function segmentar(texto: string, items: Marcable[]): Segmento[] {
  const ordenados = items
    .filter((x): x is Marcable & { inicio: number; fin: number } => x.inicio != null && x.fin != null && x.fin > x.inicio)
    .sort((a, b) => a.inicio - b.inicio || b.fin - a.fin);

  const segmentos: Segmento[] = [];
  let pos = 0;
  for (const x of ordenados) {
    if (x.inicio < pos) continue;
    if (x.inicio > pos) segmentos.push({ texto: texto.slice(pos, x.inicio), id: null, inicio: pos });
    segmentos.push({ texto: texto.slice(x.inicio, x.fin), id: x.id, inicio: x.inicio });
    pos = x.fin;
  }
  if (pos < texto.length) segmentos.push({ texto: texto.slice(pos), id: null, inicio: pos });
  return segmentos;
}

// ---------------------------------------------------------------------------
// Utilidades de la respuesta del modelo

// Fecha ISO válida o null. El modelo a veces devuelve "", "N/A" o fechas imposibles.
export function fechaIso(valor: string | null | undefined): string | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(valor + "T12:00:00Z");
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor ? null : valor;
}

// [{nombre, valor}] del modelo a un objeto plano, sin vacíos
export function atributosAObjeto(lista: { nombre: string; valor: string }[] | undefined): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const { nombre, valor } of lista ?? []) {
    const k = String(nombre ?? "").trim();
    const v = String(valor ?? "").trim();
    if (k && v) obj[k] = v;
  }
  return obj;
}

// Un PDF con capa de texto trae bastante texto por página; uno escaneado casi nada
export function pareceEscaneado(texto: string, paginas: number): boolean {
  const utiles = texto.replace(/\s+/g, "").length;
  return utiles < Math.max(200, paginas * 100);
}
