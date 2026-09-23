// Prueba el reintento sin abrir ningun navegador: conReintento recibe la
// funcion a reintentar y la funcion de dormir, asi que se puede probar entero
// en milisegundos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { conReintento, aDDMMYYYY } from "../lib/sesion.mjs";

const sinDormir = async () => {};

test("si el primer intento sale bien, no reintenta", async () => {
  let llamadas = 0;
  const r = await conReintento(async () => { llamadas++; return "ok"; }, { dormir: sinDormir });
  assert.equal(r, "ok");
  assert.equal(llamadas, 1);
});

test("falla dos veces y a la tercera sale bien", async () => {
  let llamadas = 0;
  const r = await conReintento(async () => {
    llamadas++;
    if (llamadas < 3) throw new Error("Page crashed");
    return "ok";
  }, { dormir: sinDormir });
  assert.equal(r, "ok");
  assert.equal(llamadas, 3);
});

test("si fallan los tres intentos, propaga el ultimo error", async () => {
  let llamadas = 0;
  await assert.rejects(
    () => conReintento(async () => { llamadas++; throw new Error(`fallo ${llamadas}`); }, { dormir: sinDormir }),
    /fallo 3/,
  );
  assert.equal(llamadas, 3);
});

test("espera mas en cada reintento", async () => {
  const esperas = [];
  let llamadas = 0;
  await conReintento(async () => {
    llamadas++;
    if (llamadas < 3) throw new Error("x");
    return "ok";
  }, { espera: 100, dormir: async (ms) => { esperas.push(ms); } });
  assert.deepEqual(esperas, [100, 200]);
});

test("aDDMMYYYY da vuelta la fecha", () => {
  assert.equal(aDDMMYYYY("2026-09-22"), "22-09-2026");
  assert.equal(aDDMMYYYY("2026-01-05T12:00:00.000Z"), "05-01-2026");
});
