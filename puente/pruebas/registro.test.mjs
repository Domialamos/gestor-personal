import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { leerRegistro, marcarProcesada } from "../lib/registro.mjs";

const conCarpeta = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "glosas-"));
  try { return fn(join(dir, "procesadas.json")); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

test("un registro que no existe se lee como vacio", () => {
  conCarpeta((archivo) => assert.deepEqual(leerRegistro(archivo), {}));
});

test("lo marcado se puede volver a leer", () => {
  conCarpeta((archivo) => {
    marcarProcesada(623309, { dia: "2026-09-22", glosa: "Elaboracion del informe." }, archivo);
    assert.equal(leerRegistro(archivo)["623309"].glosa, "Elaboracion del informe.");
  });
});

test("marcar dos veces no pierde la primera", () => {
  conCarpeta((archivo) => {
    marcarProcesada(1, { dia: "2026-09-21", glosa: "a" }, archivo);
    marcarProcesada(2, { dia: "2026-09-22", glosa: "b" }, archivo);
    assert.deepEqual(Object.keys(leerRegistro(archivo)).sort(), ["1", "2"]);
  });
});

test("un registro corrupto se lee como vacio en vez de reventar", () => {
  conCarpeta((archivo) => {
    writeFileSync(archivo, "{ esto no es json");
    assert.deepEqual(leerRegistro(archivo), {});
  });
});
