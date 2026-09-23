// Cubre el defecto encontrado en produccion el 22-09-2026: la tarea de
// Windows reintenta cada 30 minutos, y una corrida que no encuentra nada
// nuevo que hacer sobrescribia la nota del dia con una vacia, porque
// comandoDia no dejaba ver las horas que ya se habian redactado. Aca se
// prueba armarResumenDia() aislada, sin navegador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { armarResumenDia } from "../tb.mjs";

test("procesadas_hoy trae la glosa ya guardada de una hora del dia", () => {
  const todos = [
    { id_trabajo: 623309, cliente_asunto: "BSVV / Actividades Academicas", duracion: "3:35", descripcion: "Informe de brechas", editable: true },
    { id_trabajo: 999999, cliente_asunto: "Otro / Asunto", duracion: "1:00", descripcion: "apunte sin redactar", editable: true },
  ];
  const procesadas = { "623309": { dia: "2026-09-22", glosa: "Elaboración del informe de brechas." } };

  const r = armarResumenDia(todos, procesadas);

  assert.equal(r.trabajos.length, 1, "la hora ya procesada no debe volver a ofrecerse para redactar");
  assert.equal(r.trabajos[0].id_trabajo, 999999);
  assert.equal(r.ya_procesadas, 1);
  assert.deepEqual(r.procesadas_hoy, [{
    id_trabajo: 623309, duracion: "3:35", cliente_asunto: "BSVV / Actividades Academicas",
    apunte: "Informe de brechas", glosa: "Elaboración del informe de brechas.",
  }]);
});

test("sin nada procesado, procesadas_hoy sale vacio", () => {
  const todos = [{ id_trabajo: 1, cliente_asunto: "A / B", duracion: "0:30", descripcion: "x", editable: true }];
  const r = armarResumenDia(todos, {});
  assert.deepEqual(r.procesadas_hoy, []);
  assert.equal(r.trabajos.length, 1);
});

test("las horas cobradas (sin boton editar) no cuentan ni como pendientes ni como procesadas_hoy", () => {
  const todos = [
    { id_trabajo: 1, cliente_asunto: "A / B", duracion: "1:00", descripcion: "x", editable: false },
    { id_trabajo: 2, cliente_asunto: "A / B", duracion: "0:30", descripcion: "y", editable: true },
  ];
  const procesadas = { "1": { dia: "2026-09-22", glosa: "no deberia importar" } };
  const r = armarResumenDia(todos, procesadas);
  assert.equal(r.cobradas, 1);
  assert.deepEqual(r.procesadas_hoy, []);
  assert.equal(r.trabajos.length, 1);
});
