// LA prueba que protege todo el diseno: si TimeBilling guardo algo distinto a
// lo que se envio, "escribir" tiene que decir que NO, y no marcar la hora como
// procesada. Se prueba con una pagina simulada, sin navegador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verificarGuardado } from "../tb.mjs";
import { leerRegistro } from "../lib/registro.mjs";

// Una "pagina" falsa que devuelve lo que digamos que quedo guardado.
const paginaQueGuardo = (texto) => ({
  __filas: [{ id_trabajo: 623309, descripcion: texto, editable: true, duracion: "3:35", cliente_asunto: "BSVV / Academicas" }],
});

const conCarpeta = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "glosas-"));
  try { return fn(join(dir, "procesadas.json")); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

test("confirma cuando el texto guardado coincide", async () => {
  await conCarpeta(async (archivo) => {
    const enviado = "Elaboración del informe de brechas.";
    const r = await verificarGuardado(paginaQueGuardo(enviado), {
      id: 623309, textoEnviado: enviado, archivoRegistro: archivo, dia: "2026-09-22",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, true);
    assert.equal(leerRegistro(archivo)["623309"].glosa, enviado);
  });
});

test("NO confirma si TimeBilling guardo otra cosa, y no marca procesada", async () => {
  await conCarpeta(async (archivo) => {
    const r = await verificarGuardado(paginaQueGuardo("otra cosa completamente"), {
      id: 623309, textoEnviado: "Elaboración del informe de brechas.", archivoRegistro: archivo, dia: "2026-09-22",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, false);
    assert.deepEqual(leerRegistro(archivo), {}, "una glosa no verificada NUNCA se marca como procesada");
  });
});

test("NO confirma si la hora desaparecio del listado", async () => {
  await conCarpeta(async (archivo) => {
    const r = await verificarGuardado({ __filas: [] }, {
      id: 623309, textoEnviado: "x", archivoRegistro: archivo, dia: "2026-09-22",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, false);
    assert.deepEqual(leerRegistro(archivo), {});
  });
});

test("los espacios de los bordes no cuentan como diferencia", async () => {
  await conCarpeta(async (archivo) => {
    const r = await verificarGuardado(paginaQueGuardo("  Elaboración del informe.  "), {
      id: 623309, textoEnviado: "Elaboración del informe.", archivoRegistro: archivo, dia: "2026-09-22",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, true);
  });
});
