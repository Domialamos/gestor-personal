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
