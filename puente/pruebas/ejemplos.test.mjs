// I1 de la revision final: el filtro que excluye el propio dia de sus propios
// ejemplos nunca calzaba. La celda de fecha del listado viene DD/MM/AA con
// barras ("02/01/26") y se comparaba contra aDDMMYYYY ("23-09-2026"), asi que
// las glosas que el agente acababa de escribir volvian como "ejemplos de como
// escribe ella" y desplazaban del top 10 a las de Dominga. El flujo viejo
// excluia POR ID y funcionaba (el Set deHoy de glosas-leer.mjs).

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEjemplos } from "../tb.mjs";
import { aDDMMYYYY } from "../lib/sesion.mjs";

const ASUNTO = "BSVV / Actividades Academicas";

// Ojo: "fecha" viene como la trae el listado de verdad, con barras y el ano de
// dos cifras. Es el formato por el que se colo el defecto.
const fila = (id, descripcion, { fecha = "01/09/26", asunto = ASUNTO, duracion = "1:00" } = {}) =>
  ({ id_trabajo: id, fecha, cliente_asunto: asunto, duracion, descripcion });

test("excluye por id las horas del propio dia, aunque la fecha no calce con aDDMMYYYY", () => {
  const historial = [
    fila(700001, "Glosa que el agente acaba de escribir hoy, larguisima y por eso primera", { fecha: "23/09/26" }),
    fila(600001, "Glosa de ella, mas corta"),
  ];
  const ejemplos = armarEjemplos(historial, { asunto: ASUNTO, excluir: [700001] });
  assert.equal(ejemplos.length, 1);
  assert.equal(ejemplos[0].glosa, "Glosa de ella, mas corta");
});

test("el formato de fecha del listado NO es el de aDDMMYYYY: excluir por fecha no puede funcionar", () => {
  // Esta es la prueba que faltaba y es el hueco por donde paso I1.
  assert.equal(aDDMMYYYY("2026-09-23"), "23-09-2026");
  assert.notEqual("23/09/26", aDDMMYYYY("2026-09-23"));
  const historial = [fila(700001, "la de hoy", { fecha: "23/09/26" })];
  const porFecha = historial.filter((h) => h.fecha !== aDDMMYYYY("2026-09-23"));
  assert.equal(porFecha.length, 1, "filtrar por fecha deja pasar la hora del propio dia: por eso se excluye por id");
});

test("acepta los ids como numero o como texto", () => {
  const historial = [fila(700001, "la de hoy"), fila(600001, "la de ella")];
  assert.equal(armarEjemplos(historial, { asunto: ASUNTO, excluir: ["700001"] }).length, 1);
});

test("solo trae glosas del asunto pedido y descarta las vacias", () => {
  const historial = [
    fila(1, "del asunto"),
    fila(2, "de otro asunto", { asunto: "Maxagro / Due diligence" }),
    fila(3, ""),
  ];
  const ejemplos = armarEjemplos(historial, { asunto: ASUNTO });
  assert.equal(ejemplos.length, 1);
  assert.equal(ejemplos[0].glosa, "del asunto");
});

test("ordena de mas larga a mas corta y tope de 10", () => {
  const historial = Array.from({ length: 14 }, (_, i) => fila(i + 1, "x".repeat(i + 1)));
  const ejemplos = armarEjemplos(historial, { asunto: ASUNTO });
  assert.equal(ejemplos.length, 10);
  assert.equal(ejemplos[0].glosa.length, 14);
  assert.equal(ejemplos[9].glosa.length, 5);
});

test("cada ejemplo lleva su duracion al lado", () => {
  const ejemplos = armarEjemplos([fila(1, "una glosa", { duracion: "3:35" })], { asunto: ASUNTO });
  assert.deepEqual(ejemplos, [{ duracion: "3:35", glosa: "una glosa" }]);
});
