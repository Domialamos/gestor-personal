#!/usr/bin/env node
// CLI de TimeBilling. Cada subcomando imprime SOLO JSON por stdout; lo que es
// para leer con ojos humanos va a stderr.
//
// Lo llama el agente (ver glosas-agente.md). El agente puede equivocarse
// redactando, pero no puede mentir sobre lo que quedo guardado: eso lo decide
// "escribir", releyendo la glosa desde TimeBilling.
//
// Salidas: 0 bien · 1 fallo tecnico · 2 sesion caducada.

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { conSesion, buscarDia, leerTrabajos, traerRango, aDDMMYYYY, SesionCaida } from "./lib/sesion.mjs";
import { leerRegistro, marcarProcesada } from "./lib/registro.mjs";
import { renderNota } from "./lib/nota.mjs";
import { buscarNotas } from "./lib/contexto.mjs";

const { TB_URL, TB_ID_USUARIO } = process.env;
const ZONA = "America/Santiago";
const BOVEDA = process.env.BOVEDA_GLOSAS ?? "C:/Users/dalamos/Obsidian/Segundo Cerebro/Notas Claude/Glosas";
const BOVEDA_NOTAS = process.env.BOVEDA_NOTAS ?? "C:/Users/dalamos/Obsidian/Segundo Cerebro/Notas Claude";
const DIAS_HISTORIAL = 90;
const EJEMPLOS_POR_ASUNTO = 10;

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const salir = (datos) => { process.stdout.write(JSON.stringify(datos, null, 2) + "\n"); process.exit(0); };
const aviso = (t) => process.stderr.write(t + "\n");

// Comparar glosas: lo unico que se ignora son los espacios de los bordes. El
// modelo a veces devuelve un espacio inicial, y ese espacio se factura tal cual.
const igual = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();

// Exportada para poder probarla sin navegador: leerFilas se puede sustituir.
export async function verificarGuardado(pagina, { id, textoEnviado, dia, archivoRegistro, leerFilas = leerTrabajos }) {
  const filas = await leerFilas(pagina);
  const actual = filas.find((f) => String(f.id_trabajo) === String(id));
  if (!actual) return { confirmada: false, guardado: null, motivo: "la hora no aparece en el listado al releerla" };
  if (!igual(actual.descripcion, textoEnviado)) {
    return { confirmada: false, guardado: actual.descripcion, motivo: "TimeBilling guardó un texto distinto al enviado" };
  }
  // Solo lo verificado entra al registro.
  marcarProcesada(id, { dia, glosa: String(textoEnviado).trim() }, archivoRegistro);
  return { confirmada: true, guardado: actual.descripcion, motivo: null };
}

// Arma la salida de "dia" a partir de las filas del listado y el registro de
// procesadas. Separada de comandoDia para poder probarla sin navegador.
//
// procesadas_hoy existe porque la nota diaria es el UNICO canal por el que
// Dominga se entera de lo que paso, y la tarea de Windows reintenta cada 30
// minutos: sin esto, una corrida que no encuentra nada nuevo que hacer no
// tiene como incluir en la nota las horas que ya quedaron listas en una
// corrida anterior del mismo dia, y termina pisandola con una nota vacia.
//
// La fila del listado (no el campo "dia" del registro) es la fuente de verdad
// de que la hora es del dia consultado: el registro solo aporta la glosa.
export function armarResumenDia(todos, procesadas) {
  const editables = todos.filter((t) => t.editable);
  const cobradas = todos.length - editables.length;
  const pendientes = editables.filter((t) => !procesadas[String(t.id_trabajo)]);
  const hechas = editables.filter((t) => procesadas[String(t.id_trabajo)]);

  const trabajos = pendientes.map((t) => ({
    id_trabajo: t.id_trabajo, duracion: t.duracion,
    cliente_asunto: t.cliente_asunto, apunte: t.descripcion,
  }));
  const procesadas_hoy = hechas.map((t) => ({
    id_trabajo: t.id_trabajo, duracion: t.duracion,
    cliente_asunto: t.cliente_asunto, apunte: t.descripcion,
    glosa: procesadas[String(t.id_trabajo)]?.glosa ?? "",
  }));

  return { trabajos, cobradas, ya_procesadas: hechas.length, procesadas_hoy };
}

async function comandoDia(fecha) {
  const f = aDDMMYYYY(fecha);
  const todos = await conSesion(async (pagina) => {
    await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });
    return leerTrabajos(pagina);
  });
  const procesadas = leerRegistro();
  const { trabajos, cobradas, ya_procesadas, procesadas_hoy } = armarResumenDia(todos, procesadas);
  salir({ dia: fecha, trabajos, cobradas, ya_procesadas, procesadas_hoy });
}

async function comandoEjemplos(asunto, fecha) {
  const hasta = new Date(fecha);
  const desde = new Date(fecha);
  desde.setDate(desde.getDate() - DIAS_HISTORIAL);
  const historial = await conSesion((pagina) => traerRango(pagina, {
    url: TB_URL, idUsuario: TB_ID_USUARIO,
    desde: aDDMMYYYY(desde.toISOString()), hasta: aDDMMYYYY(hasta.toISOString()),
  }));
  // OJO: h.fecha sale de la celda del listado y se compara contra DD-MM-AAAA.
  // Si el fixture de la Task 1 muestra otro formato (por ejemplo con hora
  // pegada), ajusta esta comparacion: si no calza, el dia que se esta
  // redactando se cuela entre sus propios ejemplos.
  const ejemplos = historial
    .filter((h) => h.cliente_asunto === asunto && h.descripcion && h.fecha !== aDDMMYYYY(fecha))
    // Las mas largas muestran mejor el nivel de detalle que ella busca.
    .sort((a, b) => b.descripcion.length - a.descripcion.length)
    .slice(0, EJEMPLOS_POR_ASUNTO)
    // La duracion va al lado a proposito: sin ella el modelo calibra el largo a ojo.
    .map((h) => ({ duracion: h.duracion, glosa: h.descripcion }));
  salir({ asunto, ejemplos });
}

function comandoContexto(cliente) {
  const notas = buscarNotas([cliente], { carpeta: BOVEDA_NOTAS })
    .map(({ nota, texto }) => ({ nota, texto }));
  salir({ cliente, notas });
}

async function comandoEscribir(id, texto, fecha) {
  const f = aDDMMYYYY(fecha);
  const r = await conSesion(async (pagina) => {
    await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });

    const boton = pagina.locator(`[data-edit-job="${id}"]`).first();
    if (!(await boton.count())) {
      return { confirmada: false, guardado: null, motivo: "no hay botón de editar (la hora puede estar cobrada)" };
    }
    await boton.click();
    const caja = pagina.locator('textarea[name="descripcion"]').first();
    await caja.waitFor({ state: "visible", timeout: 15000 });
    // fill() dispara los eventos que el formulario escucha; asignar .value no.
    await caja.fill(texto);
    await pagina.locator('button.btn-primary:has-text("Guardar")').first().click();
    await pagina.waitForLoadState("networkidle").catch(() => {});
    await pagina.waitForTimeout(2500);

    // Al guardar, el listado se recarga: hay que rehacer la busqueda.
    await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });
    return verificarGuardado(pagina, { id, textoEnviado: texto, dia: fecha });
  });
  salir({ id_trabajo: Number(id), ...r });
}

function comandoNota(argumentos) {
  let datos;
  if (argumentos[0] === "--fallo") {
    datos = { dia: hoy(), glosas: [], pendientes: [], cobradas: 0,
      fallos: [argumentos[1] ?? "la corrida falló sin dejar motivo", "Detalle en puente/registro/" + hoy() + ".txt"] };
  } else {
    datos = JSON.parse(readFileSync(argumentos[0], "utf8"));
  }
  mkdirSync(BOVEDA, { recursive: true });
  const archivo = join(BOVEDA, `${datos.dia}.md`);
  writeFileSync(archivo, renderNota(datos));
  salir({ archivo });
}

const [comando, ...resto] = process.argv.slice(2);

// El import desde las pruebas no debe ejecutar el CLI.
if (comando) {
  try {
    if (!TB_URL || !TB_ID_USUARIO) throw new Error("Faltan TB_URL o TB_ID_USUARIO en puente/.env");
    switch (comando) {
      case "dia":      await comandoDia(resto[0] ?? hoy()); break;
      case "ejemplos": await comandoEjemplos(resto[0], resto[1] ?? hoy()); break;
      case "contexto": comandoContexto(resto[0]); break;
      case "escribir": await comandoEscribir(resto[0], resto[1], resto[2] ?? hoy()); break;
      case "nota":     comandoNota(resto); break;
      default:
        aviso(`Subcomando desconocido: ${comando}`);
        aviso("Uso: tb.mjs dia <AAAA-MM-DD> | ejemplos <asunto> [fecha] | contexto <cliente> | escribir <id> <texto> [fecha] | nota <datos.json>|--fallo <motivo>");
        process.exit(1);
    }
  } catch (e) {
    aviso(e.message);
    process.exit(e instanceof SesionCaida ? 2 : 1);
  }
}
