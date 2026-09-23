// Cubre tres defectos encontrados en produccion, todos sobre armarResumenDia y
// todos sin navegador:
//
// - El del 22-09-2026: la tarea de Windows reintenta cada 30 minutos y una
//   corrida que no encontraba nada nuevo sobrescribia la nota del dia con una
//   vacia, porque comandoDia no dejaba ver las horas ya redactadas.
// - C2: procesadas_hoy usaba "apunte: t.descripcion", el texto VIVO, que para
//   una hora ya procesada ES la glosa. La nota mostraba la glosa dos veces y el
//   unico control de calidad que define la spec —apunte y glosa lado a lado—
//   desaparecia.
// - C1: TimeBillingX re-empuja la fila y restaura su propia descripcion DESPUES
//   de que "escribir" confirmo la glosa (#623011 y #623516). Como el registro es
//   de una sola escritura y esta funcion excluia para siempre toda hora
//   registrada sin volver a mirar su texto, el dano quedaba permanente y mudo.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarResumenDia, APUNTE_SIN_REGISTRO } from "../tb.mjs";

const hora = (id, descripcion, extra = {}) => ({
  id_trabajo: id, cliente_asunto: "BSVV / Actividades Academicas", duracion: "3:35",
  descripcion, editable: true, ...extra,
});

test("procesadas_hoy trae la glosa guardada Y el apunte original del registro", () => {
  // La hora ya procesada tiene en TimeBilling la glosa: el apunte original solo
  // existe en el registro, y de ahi tiene que salir.
  const glosa = "Elaboración del informe de brechas, con revisión de la normativa aplicable.";
  const todos = [hora(623309, glosa), hora(999999, "apunte sin redactar")];
  const procesadas = { "623309": { dia: "2026-09-22", glosa, apunte: "Informe de brechas" } };

  const r = armarResumenDia(todos, procesadas);

  assert.equal(r.trabajos.length, 1, "la hora ya procesada no debe volver a ofrecerse para redactar");
  assert.equal(r.trabajos[0].id_trabajo, 999999);
  assert.equal(r.ya_procesadas, 1);
  assert.equal(r.procesadas_hoy[0].apunte, "Informe de brechas");
  assert.equal(r.procesadas_hoy[0].glosa, glosa);
  assert.notEqual(r.procesadas_hoy[0].apunte, r.procesadas_hoy[0].glosa,
    "apunte igual a glosa destruye el unico control de calidad de la nota");
  assert.deepEqual(r.pisadas, []);
  assert.deepEqual(r.divergencias, []);
});

test("una entrada vieja del registro, sin apunte, no revienta ni repite la glosa", () => {
  // Las 100 entradas anteriores al arreglo de C2 no tienen el campo.
  const glosa = "Elaboración del informe de brechas.";
  const r = armarResumenDia([hora(623309, glosa)], { "623309": { dia: "2026-09-22", glosa } });
  assert.equal(r.procesadas_hoy[0].apunte, APUNTE_SIN_REGISTRO);
  assert.notEqual(r.procesadas_hoy[0].apunte, r.procesadas_hoy[0].glosa);
});

test("sin nada procesado, procesadas_hoy sale vacio", () => {
  const r = armarResumenDia([hora(1, "x")], {});
  assert.deepEqual(r.procesadas_hoy, []);
  assert.equal(r.trabajos.length, 1);
  assert.equal(r.trabajos[0].apunte, "x");
});

test("las horas cobradas (sin boton editar) no cuentan ni como pendientes ni como procesadas_hoy", () => {
  const todos = [hora(1, "x", { editable: false }), hora(2, "y")];
  const procesadas = { "1": { dia: "2026-09-22", glosa: "no deberia importar" } };
  const r = armarResumenDia(todos, procesadas);
  assert.equal(r.cobradas, 1);
  assert.deepEqual(r.procesadas_hoy, []);
  assert.equal(r.trabajos.length, 1);
});

test("C1: si TimeBillingX restauro el apunte, la hora vuelve a trabajos con su glosa anterior", () => {
  // El caso real de #623011: en el registro la glosa buena, en TimeBilling el
  // apunte crudo de vuelta.
  const todos = [hora(623011, "Informe Pampa", { duracion: "7:15" })];
  const procesadas = { "623011": { dia: "2026-09-21", glosa: "Elaboración del informe Pampa.", apunte: "Informe Pampa" } };

  const r = armarResumenDia(todos, procesadas);

  assert.equal(r.trabajos.length, 1, "la glosa se perdio: la hora tiene que volver a redactarse");
  assert.equal(r.trabajos[0].apunte, "Informe Pampa");
  assert.equal(r.trabajos[0].glosa_anterior, "Elaboración del informe Pampa.",
    "se le pasa la glosa perdida para reponer LA MISMA, no una nueva");
  assert.deepEqual(r.procesadas_hoy, [], "no puede figurar como lista en la nota");
  assert.equal(r.pisadas.length, 1, "la nota tiene que poder contarlo: es el unico canal");
  assert.equal(r.pisadas[0].id_trabajo, 623011);
});

test("C1: una entrada vieja del registro sin apunte tambien se detecta como pisada", () => {
  // Las 100 entradas viejas no tienen apunte, asi que no hay con que comparar:
  // se tratan como pisadas, que es exactamente lo que le paso a #623011.
  const r = armarResumenDia([hora(623516, "Rev. borrador", { duracion: "1:20" })],
    { "623516": { dia: "2026-09-22", glosa: "Revisión del borrador de contrato." } });
  assert.equal(r.trabajos.length, 1);
  assert.equal(r.pisadas.length, 1);
  assert.equal(r.ya_procesadas, 0);
});

test("C1 y C5 juntos: un salto de linea colapsado NO se confunde con una glosa pisada", () => {
  // El registro guarda el texto tal cual se envio (con saltos); el listado lo
  // devuelve colapsado. Sin la misma normalizacion en los dos lados, toda hora
  // con lista pareceria pisada TODAS las noches y se reescribiria sin parar.
  const conSaltos = "Revisión del Modelo.\n\nDocumentos:\nMatriz de riesgos\nPolítica de compras";
  const colapsada = "Revisión del Modelo. Documentos: Matriz de riesgos Política de compras";
  const r = armarResumenDia([hora(564518, colapsada)],
    { "564518": { dia: "2026-09-22", glosa: conSaltos, apunte: "MPD" } });
  assert.deepEqual(r.pisadas, [], "no hay deriva: es la misma glosa con el espacio colapsado");
  assert.equal(r.procesadas_hoy.length, 1);
});

test("si el texto vivo no es ni la glosa ni el apunte, se informa pero NO se reescribe", () => {
  // Lo mas probable es que Dominga la haya corregido a mano. Reescribirla seria
  // pisarle su propia correccion, y la nota tiene que mostrar lo que de verdad
  // esta facturado.
  const aMano = "Elaboración del informe de brechas del Grupo Pampa, corregido a mano.";
  const r = armarResumenDia([hora(623011, aMano)],
    { "623011": { dia: "2026-09-21", glosa: "Elaboración del informe Pampa.", apunte: "Informe Pampa" } });
  assert.deepEqual(r.trabajos, [], "no se toca: no se puede distinguir de una correccion suya");
  assert.deepEqual(r.pisadas, []);
  assert.equal(r.divergencias.length, 1);
  assert.equal(r.procesadas_hoy[0].glosa, aMano, "la nota muestra el texto que de verdad esta en TimeBilling");
  assert.equal(r.procesadas_hoy[0].apunte, "Informe Pampa");
});
