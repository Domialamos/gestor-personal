// El parseo se prueba en un navegador real contra una pagina real guardada.
// Es mas lento que un DOM simulado, pero es lo unico que detecta de verdad una
// regresion de selectores cuando TimeBilling cambia el HTML.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { parsearListado } from "../lib/listado.mjs";

let navegador, pagina, filas;

before(async () => {
  navegador = await chromium.launch();
  pagina = await navegador.newPage();

  // El fixture es una pagina completa capturada de TimeBilling: trae decenas de
  // referencias a CSS/JS externos con URLs "//host/..." (protocol-relative) y
  // scripts sin async/defer. Al abrir la pagina como file://, Chrome en Windows
  // interpreta esas URLs como rutas UNC de red y se cuelga tratando de
  // resolverlas, en vez de fallar rapido: page.goto() nunca llega a "load".
  // Como el parseo solo lee el HTML estatico (no depende de que esos recursos
  // carguen), se bloquea todo lo que no sea el propio archivo del fixture.
  const fixtureUrl = pathToFileURL(resolve("pruebas/fixtures/listado.html")).href;
  await pagina.route("**/*", (route) => {
    if (route.request().url() === fixtureUrl) return route.continue();
    return route.abort();
  });

  await pagina.goto(fixtureUrl);
  filas = await pagina.evaluate(parsearListado);
});

after(async () => { await navegador?.close(); });

test("encuentra las filas de trabajo del listado", () => {
  assert.ok(filas.length >= 5, `esperaba al menos 5 filas, hubo ${filas.length}`);
});

test("cada fila trae un id numerico", () => {
  for (const f of filas) {
    assert.equal(typeof f.id_trabajo, "number");
    assert.ok(Number.isInteger(f.id_trabajo) && f.id_trabajo > 0);
  }
});

test("la duracion viene como H:MM o HH:MM", () => {
  for (const f of filas) {
    assert.match(f.duracion, /^\d{1,2}:\d{2}$/, `duracion rara en #${f.id_trabajo}: "${f.duracion}"`);
  }
});

test("la glosa no arrastra el prefijo #<id>", () => {
  for (const f of filas) {
    assert.ok(!f.descripcion.startsWith("#"), `#${f.id_trabajo} arrastra el prefijo: "${f.descripcion.slice(0, 30)}"`);
    assert.ok(!f.descripcion.startsWith(String(f.id_trabajo)), `#${f.id_trabajo} arrastra el numero`);
  }
});

test("editable sale del boton data-edit-job, no de adivinar", () => {
  // El fixture tiene que traer de las dos: si no, la prueba no prueba nada.
  assert.ok(filas.some((f) => f.editable), "el fixture no trae ninguna fila editable");
  assert.ok(filas.some((f) => !f.editable), "el fixture no trae ninguna fila cobrada");
});

test("el cliente y asunto no vienen vacios", () => {
  for (const f of filas) {
    assert.ok(f.cliente_asunto.length > 0, `#${f.id_trabajo} sin cliente/asunto`);
  }
});

test("las tildes y la enie no vienen con mojibake", () => {
  // "Ã" y "Â" son la firma de bytes UTF-8 redecodificados como ISO-8859-1
  // (p.ej. "Planificación" -> "PlanificaciÃ³n"). Si el fixture o el charset
  // del navegador vuelven a desalinearse, esto tiene que fallar.
  const mojibake = /[ÃÂ]/;
  for (const f of filas) {
    assert.ok(!mojibake.test(f.descripcion), `#${f.id_trabajo} con mojibake en descripcion: "${f.descripcion.slice(0, 40)}"`);
    assert.ok(!mojibake.test(f.cliente_asunto), `#${f.id_trabajo} con mojibake en cliente_asunto: "${f.cliente_asunto}"`);
  }

  // Sin esto, la prueba de arriba pasaria igual con un fixture sin ninguna
  // tilde ni enie: hay que confirmar que de verdad hay texto acentuado bien
  // formado, no solo ausencia de la firma de mojibake.
  const acentuado = /[áéíóúñÁÉÍÓÚÑ]/;
  assert.ok(
    filas.some((f) => acentuado.test(f.descripcion) || acentuado.test(f.cliente_asunto)),
    "ninguna fila trae una tilde o enie bien formada; la prueba de mojibake no prueba nada"
  );
});

test("la fecha viene DD/MM/AA con barras, no en el formato de aDDMMYYYY", () => {
  // Es el hueco por donde paso I1: comandoEjemplos comparaba esta celda contra
  // aDDMMYYYY ("23-09-2026") para excluir el propio dia, y nunca calzaba. Si
  // algun dia TimeBilling cambia este formato, que se entere una prueba y no el
  // filtro en silencio.
  for (const f of filas) {
    assert.match(f.fecha, /^\d{2}\/\d{2}\/\d{2}$/, `fecha rara en #${f.id_trabajo}: "${f.fecha}"`);
    assert.doesNotMatch(f.fecha, /^\d{2}-\d{2}-\d{4}$/, "si la celda pasara a DD-MM-AAAA hay que revisar quien la compara");
  }
});

test("el parseo colapsa el espacio de una glosa de varias lineas", () => {
  // #564518 en el fixture es un parrafo seguido de una lista de catorce
  // documentos, con saltos de linea de verdad en el HTML. El listado la entrega
  // colapsada, y por eso igual() tiene que normalizar los dos lados (C5).
  const conLista = filas.find((f) => f.id_trabajo === 564518);
  assert.ok(conLista, "el fixture tiene que traer #564518: es la glosa con lista");
  assert.ok(!/\n/.test(conLista.descripcion), "el listado entrega la glosa sin saltos de linea");
  assert.match(conLista.descripcion, /Matriz de riesgos Modelo de Prevención de Delitos/,
    "dos renglones del HTML llegan pegados por un espacio");
});
