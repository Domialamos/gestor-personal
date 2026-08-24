import test from "node:test";
import assert from "node:assert/strict";
import { TIPOS_TRABAJO, plantillaDe, tieneMarcadores } from "./plantillas-horas";

test("hay una plantilla por cada tipo de trabajo", () => {
  assert.equal(TIPOS_TRABAJO.length, 8);
  for (const t of TIPOS_TRABAJO) {
    assert.ok(t.codigo.length > 0);
    assert.ok(t.etiqueta.length > 0);
  }
});

test("los códigos no se repiten", () => {
  const codigos = TIPOS_TRABAJO.map((t) => t.codigo);
  assert.equal(new Set(codigos).size, codigos.length);
});

test("plantillaDe devuelve el texto del tipo", () => {
  assert.equal(plantillaDe("redaccion"), "Redacción de {documento}.");
});

test("plantillaDe con general devuelve texto vacío", () => {
  assert.equal(plantillaDe("general"), "");
});

test("plantillaDe con un código desconocido devuelve texto vacío", () => {
  assert.equal(plantillaDe("inventado"), "");
});

test("tieneMarcadores detecta los campos sin rellenar", () => {
  assert.ok(tieneMarcadores("Redacción de {documento}."));
  assert.equal(tieneMarcadores("Redacción de la escritura de compraventa."), false);
});

test("tieneMarcadores ignora llaves sin contenido", () => {
  assert.equal(tieneMarcadores("Cálculo del monto {} pendiente"), false);
});
