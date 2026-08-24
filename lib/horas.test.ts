import test from "node:test";
import assert from "node:assert/strict";
import { redondearPaso, transicionValida, fechaLocalChile, minutosEntre } from "./horas";

test("redondearPaso sube al múltiplo de 5 más cercano hacia arriba", () => {
  assert.equal(redondearPaso(1), 5);
  assert.equal(redondearPaso(5), 5);
  assert.equal(redondearPaso(6), 10);
  assert.equal(redondearPaso(60), 60);
  assert.equal(redondearPaso(61), 65);
});

test("redondearPaso nunca devuelve cero para trabajo real", () => {
  assert.equal(redondearPaso(0.1), 5);
});

test("redondearPaso devuelve 0 solo para 0", () => {
  assert.equal(redondearPaso(0), 0);
});

test("transicionValida acepta el camino feliz", () => {
  assert.ok(transicionValida("corriendo", "borrador"));
  assert.ok(transicionValida("borrador", "aprobada"));
  assert.ok(transicionValida("aprobada", "cargada"));
});

test("transicionValida acepta las vueltas atrás permitidas", () => {
  assert.ok(transicionValida("aprobada", "borrador"));
  assert.ok(transicionValida("aprobada", "error"));
  assert.ok(transicionValida("error", "aprobada"));
});

test("transicionValida cierra el estado cargada", () => {
  assert.equal(transicionValida("cargada", "borrador"), false);
  assert.equal(transicionValida("cargada", "aprobada"), false);
  assert.equal(transicionValida("cargada", "error"), false);
});

test("transicionValida rechaza saltarse la revisión", () => {
  assert.equal(transicionValida("corriendo", "aprobada"), false);
  assert.equal(transicionValida("borrador", "cargada"), false);
});

test("fechaLocalChile usa el día chileno, no el UTC", () => {
  // 2026-08-25T01:30:00Z son las 21:30 del 24 en Chile (UTC-4)
  assert.equal(fechaLocalChile("2026-08-25T01:30:00Z"), "2026-08-24");
});

test("fechaLocalChile no adelanta el día dentro de la jornada", () => {
  assert.equal(fechaLocalChile("2026-08-24T13:00:00Z"), "2026-08-24");
});

test("minutosEntre cuenta los minutos transcurridos", () => {
  assert.equal(minutosEntre("2026-08-24T10:00:00Z", "2026-08-24T11:30:00Z"), 90);
});

test("minutosEntre nunca devuelve negativo", () => {
  assert.equal(minutosEntre("2026-08-24T11:00:00Z", "2026-08-24T10:00:00Z"), 0);
});

test("minutosEntre devuelve 0 para menos de medio minuto", () => {
  // Un cronómetro detenido a los 20 segundos no alcanza un minuto. Quien lo
  // llame debe poner el piso: la columna duracion_min exige > 0.
  assert.equal(minutosEntre("2026-08-24T10:00:00Z", "2026-08-24T10:00:20Z"), 0);
});
