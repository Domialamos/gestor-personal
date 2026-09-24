// C5 de la revision final: una glosa con salto de linea NUNCA podia
// confirmarse. parsearListado colapsa todo el espacio en blanco al leer el
// listado, mientras igual() solo recortaba los bordes, asi que un texto enviado
// con "\n" no coincidia jamas con su relectura. Y sus glosas reales si llevan
// saltos: #564518 del fixture es un parrafo seguido de una lista de catorce
// documentos, y esa glosa se le pasa al agente como modelo de estilo.
//
// Camino de fallo completo: el agente escribe una glosa con lista, TimeBilling
// la guarda bien, la relectura la trae colapsada, confirmada:false dos veces, la
// nota dice "NO SE PUDO GUARDAR" y "la hora sigue sin esta glosa" —que es
// falso—, la hora no entra al registro, y manana se redacta distinta: el cliente
// ve la glosa cambiar cada noche.

import { test } from "node:test";
import assert from "node:assert/strict";
import { igual, normalizar } from "../tb.mjs";

test("un salto de linea contra su version colapsada NO es una diferencia", () => {
  const enviada = [
    "Revisión exhaustiva de los documentos del Modelo de Prevención de Delitos.",
    "",
    "Los documentos revisados fueron:",
    "Matriz de riesgos",
    "Política de donaciones y aportes en general",
  ].join("\n");
  const releida = "Revisión exhaustiva de los documentos del Modelo de Prevención de Delitos. " +
    "Los documentos revisados fueron: Matriz de riesgos Política de donaciones y aportes en general";
  assert.equal(igual(enviada, releida), true, "el listado llega colapsado: esta glosa tiene que poder confirmarse");
});

test("las mayusculas SI cuentan como diferencia", () => {
  assert.equal(igual("Revisión de títulos.", "revisión de títulos."), false);
});

test("las tildes SI cuentan como diferencia", () => {
  assert.equal(igual("Revisión de títulos.", "Revision de titulos."), false);
});

test("un espacio interno significativo SI cuenta como diferencia", () => {
  // Colapsar no es borrar: "de títulos" y "detítulos" siguen siendo distintas.
  assert.equal(igual("Revisión de títulos", "Revisión detítulos"), false);
});

test("el espacio de los bordes, las tabulaciones y los espacios dobles no cuentan", () => {
  assert.equal(igual("  Revisión \t de  títulos  ", "Revisión de títulos"), true);
});

test("normalizar colapsa el espacio y no toca mayusculas ni tildes", () => {
  assert.equal(normalizar(" Revisión \n de  Títulos "), "Revisión de Títulos");
});

test("comparar con null o undefined no revienta", () => {
  assert.equal(igual(undefined, ""), true);
  assert.equal(igual(null, "algo"), false);
});

// TimeBilling normaliza las comillas al guardar: recibe la tipografica y devuelve
// la recta. Comprobado el 24-09-2026 con #619628: se envio la charla entre “ ”
// y volvio entre ". Sin igualarlas, escribir daria NO confirmada para siempre y la
// rutina reescribiria esa hora cada noche.
test("una comilla tipografica es igual a la recta que devuelve TimeBilling", () => {
  assert.ok(igual(
    'Exposicion de la charla “Autorizaciones ambientales”.',
    'Exposicion de la charla "Autorizaciones ambientales".',
  ));
  assert.ok(igual('el ‘modelo’ vigente', "el 'modelo' vigente"));
});

test("igualar las comillas no borra diferencias de contenido", () => {
  assert.ok(!igual('Charla “A”.', 'Charla "B".'));
  assert.ok(!igual('Revision', 'revision'), 'las mayusculas siguen contando');
  assert.ok(!igual('accion', 'acción'), 'las tildes siguen contando');
});
