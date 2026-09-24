#!/usr/bin/env node
// CLI de TimeBilling. Cada subcomando imprime SOLO JSON por stdout; lo que es
// para leer con ojos humanos va a stderr.
//
// Lo llama el agente (ver glosas-agente.md). El agente puede equivocarse
// redactando, pero no puede mentir sobre lo que quedo guardado: eso lo decide
// "escribir", releyendo la glosa desde TimeBilling.
//
// Salidas: 0 bien · 1 fallo tecnico · 2 sesion caducada.
// (Excepcion documentada: "nota --asegurar" sale 1 cuando tuvo que escribir la
// nota de fallo porque faltaba. Ver asegurarNota.)

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

// Lo que se muestra como apunte de una hora procesada ANTES de que el registro
// empezara a guardar el apunte original (las 100 primeras entradas). Dice la
// verdad —no lo sabemos— en vez de repetir la glosa, que es el defecto que
// destruia el contraste apunte/glosa de la nota.
export const APUNTE_SIN_REGISTRO = "(apunte original no registrado)";

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const salir = (datos) => { process.stdout.write(JSON.stringify(datos, null, 2) + "\n"); process.exit(0); };
const aviso = (t) => process.stderr.write(t + "\n");

// Toda fecha que entra por la linea de comandos o por el JSON de la nota pasa
// por aca. Sin esto, "dia" aceptaba cualquier cosa y aDDMMYYYY devolvia basura
// en silencio, y "nota" escribia join(BOVEDA, datos.dia + ".md"): sin el campo
// quedaba "undefined.md" y un "../" escribia FUERA de la boveda.
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const exigirFecha = (fecha, donde) => {
  if (!ES_FECHA.test(String(fecha ?? ""))) {
    throw new Error(`${donde}: la fecha tiene que venir como AAAA-MM-DD (llegó "${fecha}")`);
  }
  return fecha;
};

// Comparar glosas. Se normaliza el espacio en blanco de los DOS lados: el
// listado llega con el espacio ya colapsado (parsearListado hace
// .replace(/\s+/g," ")), asi que una glosa enviada con saltos de linea no podia
// coincidir NUNCA con su relectura, y las suyas los llevan —#564518 en el
// fixture es un parrafo seguido de una lista de catorce documentos, y esa glosa
// se le pasa al agente como modelo de estilo—. El efecto era un ⚠️ falso
// diciendo que la hora seguia sin glosa cuando si se habia guardado, la hora no
// entraba al registro, y al dia siguiente se redactaba distinta: el cliente veia
// la glosa cambiar cada noche.
//
// Mayusculas y tildes NO se tocan a proposito: "revision" no es "revisión", y
// esa diferencia tiene que seguir contando como diferencia.
// TimeBilling normaliza las comillas al guardar: se le envia la tipografica
// (U+201C/U+201D) y devuelve la recta (U+0022). Comprobado el 24-09-2026 leyendo
// los codepoints de una glosa recien escrita. Sin igualarlas aca, toda glosa con
// comillas volveria distinta de lo enviado, escribir la daria por NO confirmada
// —un aviso falso en el unico canal— y la rutina la reescribiria cada noche sin
// parar. Misma clase de desajuste que el colapso de los saltos de linea.
export const normalizar = (t) =>
  String(t ?? "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
export const igual = (a, b) => normalizar(a) === normalizar(b);

// Guardas que tenia el flujo viejo (glosas-escribir.mjs:33-34) y se perdieron en
// la migracion. verificarGuardado solo comprueba fidelidad de transmision: una
// glosa vacia se guarda vacia, se relee vacia y queda "confirmada", marcada en
// el registro PARA SIEMPRE; lo mismo si el agente devuelve el apunte sin tocar.
// Se revisa ANTES de abrir el formulario, para no escribir nada en TimeBilling.
export function motivoRechazo(texto, textoActual) {
  if (!String(texto ?? "").trim()) return "la glosa venía vacía: no se escribió nada en TimeBilling";
  if (textoActual !== undefined && igual(texto, textoActual)) {
    return "la glosa es idéntica al texto que ya tenía la hora: no se escribió nada en TimeBilling";
  }
  return null;
}

// Exportada para poder probarla sin navegador: leerFilas se puede sustituir.
export async function verificarGuardado(pagina, { id, textoEnviado, dia, apunte, archivoRegistro, leerFilas = leerTrabajos }) {
  const filas = await leerFilas(pagina);
  const actual = filas.find((f) => String(f.id_trabajo) === String(id));
  if (!actual) return { confirmada: false, guardado: null, motivo: "la hora no aparece en el listado al releerla" };
  if (!igual(actual.descripcion, textoEnviado)) {
    return { confirmada: false, guardado: actual.descripcion, motivo: "TimeBilling guardó un texto distinto al enviado" };
  }
  // Solo lo verificado entra al registro. El apunte original se guarda AQUI, en
  // el momento de escribir, porque es el unico instante en que todavia existe:
  // apenas se guarda la glosa, el listado ya no lo tiene. Sin el, la nota
  // mostraba la glosa dos veces y el control de calidad que la spec define
  // —apunte y glosa lado a lado— no existia.
  const datos = { dia, glosa: String(textoEnviado).trim() };
  if (apunte !== undefined) datos.apunte = String(apunte).trim();
  marcarProcesada(id, datos, archivoRegistro);
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
//
// Y aca se detecta la DERIVA: TimeBillingX (la app de escritorio) re-empuja la
// fila y restaura su propia descripcion DESPUES de que "escribir" confirmo la
// glosa. Confirmado con datos reales: #623011 y #623516 estan en el registro
// con su glosa buena y en TimeBilling quedo el apunte crudo. Como el registro es
// de una sola escritura y esta funcion excluia de "trabajos" toda hora
// registrada sin volver a mirar su texto, el dano quedaba permanente y en
// silencio. Comparar la glosa del registro con el texto vivo del listado
// detecta la deriva gratis.
export function armarResumenDia(todos, procesadas) {
  const editables = todos.filter((t) => t.editable);
  const cobradas = todos.length - editables.length;

  const trabajos = [];
  const procesadas_hoy = [];
  const pisadas = [];       // la glosa confirmada ya no esta: hay que reescribirla
  const divergencias = [];  // el texto vivo no es ni la glosa ni el apunte conocidos

  for (const t of editables) {
    const reg = procesadas[String(t.id_trabajo)];
    const base = { id_trabajo: t.id_trabajo, duracion: t.duracion, cliente_asunto: t.cliente_asunto };

    if (!reg) { trabajos.push({ ...base, apunte: t.descripcion }); continue; }

    if (igual(reg.glosa, t.descripcion)) {
      procesadas_hoy.push({ ...base, apunte: reg.apunte ?? APUNTE_SIN_REGISTRO, glosa: reg.glosa ?? "" });
      continue;
    }

    // La glosa confirmada NO es la que esta hoy en TimeBilling. Si el texto vivo
    // es exactamente el apunte que el registro guardo al escribir, fue
    // TimeBillingX restaurando su propia fila: vuelve a "trabajos" para que el
    // agente la reescriba, con la glosa anterior al lado para reponer la misma
    // en vez de inventar otra.
    //
    // OJO: si el registro NO trae apunte, esta deriva NO se puede clasificar y
    // por eso NO se trata como pisada. Las entradas anteriores a este cambio no
    // lo tienen —el campo nace aqui—, asi que tratarlas como pisada convertia
    // CUALQUIER edicion a mano de Dominga en "TimeBillingX la restauro", le
    // reponia la glosa vieja encima de su correccion, y la nota afirmaba una
    // causa falsa. Sin apunte se cae a divergencia: no se reescribe nada.
    const esElApunteDeVuelta = reg.apunte !== undefined && igual(reg.apunte, t.descripcion);
    if (esElApunteDeVuelta) {
      trabajos.push({ ...base, apunte: t.descripcion, glosa_anterior: reg.glosa ?? "" });
      pisadas.push({ ...base, glosa_anterior: reg.glosa ?? "" });
      continue;
    }

    // No es la glosa ni el apunte: alguien mas edito esa hora (lo mas probable,
    // Dominga a mano). No se reescribe —seria pisarle su propia correccion— y se
    // informa en la nota con el texto que de verdad esta facturado.
    procesadas_hoy.push({ ...base, apunte: reg.apunte ?? APUNTE_SIN_REGISTRO, glosa: t.descripcion });
    divergencias.push({
      ...base,
      glosa_registrada: reg.glosa ?? "",
      glosa_en_timebilling: t.descripcion,
      // Con apunte registrado sabemos que el texto vivo no es ni la glosa ni el
      // apunte, asi que alguien lo edito. Sin apunte no sabemos quien cambio que.
      motivo: reg.apunte === undefined
        ? "la glosa guardada no coincide y no hay apunte registrado para saber quien la cambio"
        : "el texto en TimeBilling no es ni la glosa guardada ni el apunte: alguien lo edito a mano",
    });
  }

  return { trabajos, cobradas, ya_procesadas: procesadas_hoy.length, procesadas_hoy, pisadas, divergencias };
}

async function comandoDia(fecha) {
  exigirFecha(fecha, "dia");
  const f = aDDMMYYYY(fecha);
  const todos = await conSesion(async (pagina) => {
    await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });
    return leerTrabajos(pagina);
  });
  const procesadas = leerRegistro();
  salir({ dia: fecha, ...armarResumenDia(todos, procesadas) });
}

// Los ejemplos se filtran excluyendo POR ID las horas del propio dia, como hacia
// el flujo viejo (el Set deHoy de glosas-leer.mjs). Excluir por fecha no
// funciona y fallaba en silencio: la celda de fecha del listado viene DD/MM/AA
// con barras ("02/01/26") y se comparaba contra aDDMMYYYY ("23-09-2026"), asi
// que el filtro nunca calzaba y las glosas que el propio agente acababa de
// escribir volvian como "ejemplos de como escribe ella", desplazando del top 10
// a las de Dominga. Separada de comandoEjemplos para poder probarla.
export function armarEjemplos(historial, { asunto, excluir = [] }) {
  const fuera = new Set([...excluir].map(String));
  return historial
    .filter((h) => h.cliente_asunto === asunto && h.descripcion && !fuera.has(String(h.id_trabajo)))
    // Las mas largas muestran mejor el nivel de detalle que ella busca.
    .sort((a, b) => b.descripcion.length - a.descripcion.length)
    .slice(0, EJEMPLOS_POR_ASUNTO)
    // La duracion va al lado a proposito: sin ella el modelo calibra el largo a ojo.
    .map((h) => ({ duracion: h.duracion, glosa: h.descripcion }));
}

async function comandoEjemplos(asunto, fecha) {
  exigirFecha(fecha, "ejemplos");
  const hasta = new Date(fecha);
  const desde = new Date(fecha);
  desde.setDate(desde.getDate() - DIAS_HISTORIAL);
  const f = aDDMMYYYY(fecha);

  const { historial, delDia } = await conSesion(async (pagina) => {
    // Primero el dia solo, para saber QUE IDS son de ese dia.
    await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });
    const delDia = (await leerTrabajos(pagina)).map((t) => t.id_trabajo);
    const historial = await traerRango(pagina, {
      url: TB_URL, idUsuario: TB_ID_USUARIO,
      desde: aDDMMYYYY(desde.toISOString()), hasta: aDDMMYYYY(hasta.toISOString()),
    });
    return { historial, delDia };
  });

  salir({ asunto, ejemplos: armarEjemplos(historial, { asunto, excluir: delDia }) });
}

function comandoContexto(cliente) {
  const notas = buscarNotas([cliente], { carpeta: BOVEDA_NOTAS })
    .map(({ nota, texto }) => ({ nota, texto }));
  salir({ cliente, notas });
}

async function comandoEscribir(id, texto, fecha) {
  exigirFecha(fecha, "escribir");

  // La glosa vacia se rechaza sin abrir siquiera el navegador.
  const vacia = motivoRechazo(texto);
  if (vacia) return salir({ id_trabajo: Number(id), confirmada: false, guardado: null, motivo: vacia });

  const f = aDDMMYYYY(fecha);
  const r = await conSesion(async (pagina) => {
    await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });

    // Se lee la fila ANTES de tocar el formulario, por dos razones: rechazar una
    // glosa igual a la que ya esta sin escribir nada, y quedarse con el apunte
    // original, que despues de guardar ya no existe.
    const filas = await leerTrabajos(pagina);
    const antes = filas.find((fila) => String(fila.id_trabajo) === String(id));
    if (!antes) return { confirmada: false, guardado: null, motivo: "la hora no aparece en el listado de ese día" };

    const rechazo = motivoRechazo(texto, antes.descripcion);
    if (rechazo) return { confirmada: false, guardado: antes.descripcion, motivo: rechazo };

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
    return verificarGuardado(pagina, { id, textoEnviado: texto, dia: fecha, apunte: antes.descripcion });
  });
  salir({ id_trabajo: Number(id), ...r });
}

// El aviso de fallo va ARRIBA, no al final. Pegado al final, el encabezado
// seguia diciendo "6 glosa(s) · 6h 30m" sin ningun ⚠️ y habia que bajar hasta el
// pie para enterarse, justo al contrario de la regla de la nota: lo que fallo se
// ve primero.
export function insertarAvisoArriba(previo, avisos) {
  const bloque = avisos.flatMap((a) => [`> ⚠️ ${a}`, ""]);
  const lineas = previo.split("\n");
  const titulo = lineas.findIndex((l) => l.startsWith("# "));
  const partido = titulo === -1
    ? [...bloque, ...lineas]
    : [...lineas.slice(0, titulo + 1), "", ...bloque, ...lineas.slice(titulo + 1)];
  return partido.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\s+$/, "") + "\n";
}

// Exportada para poder probarla sin CLI ni process.exit (ver Fix round 1,
// Critical 1). "glosas-agente.md" hace que el agente escriba la nota real como su
// ULTIMO paso; si claude.cmd muere DESPUES de eso (turnos agotados, herramienta
// fuera de --allowed-tools, un hipo al cerrar), glosas-dia.cmd igual llama a
// "nota --fallo". Si esa llamada reemplazara la nota del dia sin mirar, borraria
// el trabajo real de la corrida que si sirvio y lo reemplazaria por "0 glosa(s) ·
// fallo": el mismo dano que el bug de agosto de 2026, en la direccion contraria
// (en vez de callar un fallo, inventa uno y se come el trabajo real).
// Invariante: una corrida fallida NUNCA destruye la nota de una corrida que si
// trabajo. Por eso, si ya hay nota del dia, no se pisa: se le agrega el aviso,
// arriba y conservando todo lo anterior.
export function escribirNotaFallo(motivo) {
  const motivoFinal = motivo ?? "la corrida falló sin dejar motivo";
  const detalle = "Detalle en puente/registro/" + hoy() + ".txt";
  mkdirSync(BOVEDA, { recursive: true });
  const archivo = join(BOVEDA, `${hoy()}.md`);

  if (existsSync(archivo)) {
    const previo = readFileSync(archivo, "utf8").replace(/\s+$/, "");
    writeFileSync(archivo, insertarAvisoArriba(previo, [motivoFinal, detalle]));
    return { archivo, agregado: true };
  }

  const datos = { dia: hoy(), glosas: [], pendientes: [], cobradas: 0, fallos: [motivoFinal, detalle] };
  writeFileSync(archivo, renderNota(datos));
  return { archivo, agregado: false };
}

// "La nota se escribe siempre" era falso: glosas-dia.cmd solo llamaba a --fallo
// cuando claude salia distinto de cero. Si el agente salia 0 sin haber llamado
// nunca a "tb.mjs nota" —las corridas del 22-09-2026 a las 21:58 y 22:01 son
// exactamente eso— no quedaba nota, no quedaba ⚠️, y el .cmd escribia LISTO. y
// salia 0: la firma del fallo mudo de agosto de 2026, que costo dos dias de
// glosas.
//
// Esto cierra todas las variantes de golpe sin depender de que el agente se
// porte bien, y el .cmd no necesita saber donde vive la boveda ni que dia es en
// horario de Chile: lo sabe tb.mjs. Sale 1 si tuvo que escribir la nota de
// fallo, porque una corrida sin nota es una corrida fallida y la tarea de
// Windows tiene que reintentar.
export function asegurarNota(motivo) {
  const archivo = join(BOVEDA, `${hoy()}.md`);
  if (existsSync(archivo)) return { archivo, escrita: false };
  escribirNotaFallo(motivo ?? "la corrida terminó sin dejar la nota del día");
  return { archivo, escrita: true };
}

function comandoNota(argumentos) {
  if (argumentos[0] === "--asegurar") {
    const r = asegurarNota(argumentos[1]);
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    process.exit(r.escrita ? 1 : 0);
  }
  if (argumentos[0] === "--fallo") {
    const { archivo } = escribirNotaFallo(argumentos[1]);
    salir({ archivo });
  }
  const datos = JSON.parse(readFileSync(argumentos[0], "utf8"));
  exigirFecha(datos.dia, "nota");
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
        aviso("Uso: tb.mjs dia <AAAA-MM-DD> | ejemplos <asunto> [fecha] | contexto <cliente> | escribir <id> <texto> [fecha] | nota <datos.json>|--fallo <motivo>|--asegurar <motivo>");
        process.exit(1);
    }
  } catch (e) {
    aviso(e.message);
    process.exit(e instanceof SesionCaida ? 2 : 1);
  }
}
