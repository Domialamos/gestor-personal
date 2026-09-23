// LA prueba que protege todo el diseno: si TimeBilling guardo algo distinto a
// lo que se envio, "escribir" tiene que decir que NO, y no marcar la hora como
// procesada. Se prueba con una pagina simulada, sin navegador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verificarGuardado, motivoRechazo } from "../tb.mjs";
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

// C4 de la revision final: "escribir" aceptaba una glosa vacia, o igual al
// apunte, la guardaba, la releia igual y devolvia confirmada:true, marcando la
// hora en el registro PARA SIEMPRE. verificarGuardado solo comprueba fidelidad
// de transmision, no que la glosa sirva de algo. El flujo viejo tenia las dos
// guardas (glosas-escribir.mjs:33-34) y se perdieron en la migracion.

test("C4: una glosa vacia se rechaza con motivo, sin llegar al DOM", () => {
  for (const vacia of ["", "   ", "\n\t ", undefined, null]) {
    const motivo = motivoRechazo(vacia);
    assert.ok(motivo, `deberia rechazar ${JSON.stringify(vacia)}`);
    assert.match(motivo, /vacía/);
  }
});

test("C4: una glosa igual al texto que ya tiene la hora se rechaza", () => {
  const apunte = "Informe de brechas";
  assert.match(motivoRechazo(apunte, apunte), /idéntica/);
  // Y con el espacio distinto tambien: es el mismo texto.
  assert.match(motivoRechazo("  Informe  de brechas ", apunte), /idéntica/);
});

test("C4: una glosa de verdad distinta no se rechaza", () => {
  assert.equal(motivoRechazo("Elaboración del informe de brechas.", "Informe de brechas"), null);
});

test("C4: sin texto actual solo se revisa que no venga vacia", () => {
  // Asi se usa antes de abrir el navegador: la comparacion con el texto vivo
  // viene despues, cuando ya se leyo la fila.
  assert.equal(motivoRechazo("Informe de brechas"), null);
});

// C2: el apunte original solo existe ANTES de escribir la glosa. Si no se
// guarda en ese momento, la nota no puede mostrar apunte y glosa lado a lado.
test("C2: el apunte original queda guardado en el registro al confirmar", async () => {
  await conCarpeta(async (archivo) => {
    const enviado = "Elaboración del informe de brechas, con revisión normativa.";
    const r = await verificarGuardado(paginaQueGuardo(enviado), {
      id: 623309, textoEnviado: enviado, archivoRegistro: archivo, dia: "2026-09-22",
      apunte: "Informe de brechas",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, true);
    assert.deepEqual(leerRegistro(archivo)["623309"], {
      dia: "2026-09-22", glosa: enviado, apunte: "Informe de brechas",
    });
  });
});

// C5 de punta a punta por donde de verdad pasa: el listado devuelve el texto con
// el espacio colapsado, y la glosa se envio con saltos de linea.
test("C5: una glosa con saltos de linea se confirma contra su relectura colapsada", async () => {
  await conCarpeta(async (archivo) => {
    const enviado = "Revisión del Modelo de Prevención de Delitos.\n\nDocumentos:\nMatriz de riesgos\nPolítica de compras";
    const colapsado = "Revisión del Modelo de Prevención de Delitos. Documentos: Matriz de riesgos Política de compras";
    const r = await verificarGuardado(paginaQueGuardo(colapsado), {
      id: 623309, textoEnviado: enviado, archivoRegistro: archivo, dia: "2026-09-22", apunte: "MPD",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, true, "asi son sus glosas reales: parrafo mas lista");
    assert.equal(leerRegistro(archivo)["623309"].glosa, enviado.trim(),
      "el registro guarda el texto tal cual se envio, con sus saltos");
  });
});
