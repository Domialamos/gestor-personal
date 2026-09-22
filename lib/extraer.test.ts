import test from "node:test";
import assert from "node:assert/strict";
import {
  alinear,
  atributosAObjeto,
  fechaIso,
  indexar,
  normalizarConMapa,
  pareceEscaneado,
  segmentar,
  trocear,
} from "./extraer";

const CONTRATO = `CONTRATO DE ARRENDAMIENTO

En Santiago, a 3 de marzo de 2026, entre Inmobiliaria Los Aromos SpA, RUT 76.123.456-7, en adelante “el Arrendador”, y don Pedro Soto Rojas, en adelante “el Arrendatario”, se conviene:

PRIMERO: La renta mensual será de UF 45, pagadera dentro de los cinco primeros días de cada mes.

SEGUNDO: El plazo del contrato es de dos años contados desde el 1 de abril de 2026.`;

test("trocear cubre todo el texto sin superponer tramos y respeta el máximo", () => {
  const texto = "Párrafo uno. ".repeat(300) + "\n\n" + "Segundo bloque, más texto. ".repeat(300);
  const tramos = trocear(texto, 1000);
  assert.ok(tramos.length > 5);
  for (let i = 0; i < tramos.length; i++) {
    assert.ok(tramos[i].fin - tramos[i].inicio <= 1000);
    if (i > 0) assert.ok(tramos[i].inicio >= tramos[i - 1].fin);
  }
  // Lo que queda fuera de los tramos son solo blancos
  let cubierto = "";
  for (const t of tramos) cubierto += texto.slice(t.inicio, t.fin);
  assert.equal(cubierto.replace(/\s/g, ""), texto.replace(/\s/g, ""));
});

test("trocear prefiere cortar en un párrafo antes que a media oración", () => {
  const texto = "a".repeat(700) + "\n\n" + "b ".repeat(400);
  const [primero] = trocear(texto, 1000);
  assert.equal(texto.slice(primero.inicio, primero.fin).trim(), "a".repeat(700));
});

test("trocear es determinista y un texto corto es un solo tramo", () => {
  assert.deepEqual(trocear(CONTRATO), trocear(CONTRATO));
  assert.equal(trocear(CONTRATO).length, 1);
  assert.deepEqual(trocear("   "), []);
});

test("normalizar quita tildes, mayúsculas, comillas tipográficas y colapsa blancos", () => {
  const { n, mapa } = normalizarConMapa("Él  dijo:\n“Plazo”");
  assert.equal(n, 'el dijo: "plazo"');
  assert.equal(mapa.length, n.length);
});

test("alinear encuentra la cita exacta aunque cambien tildes, mayúsculas y saltos de línea", () => {
  const indice = indexar(CONTRATO);
  const u = alinear(indice, "inmobiliaria los aromos spa");
  assert.equal(u.alineacion, "exacta");
  assert.equal(CONTRATO.slice(u.inicio!, u.fin!), "Inmobiliaria Los Aromos SpA");

  const renta = alinear(indice, "La renta mensual será de UF 45");
  assert.equal(CONTRATO.slice(renta.inicio!, renta.fin!), "La renta mensual será de UF 45");
});

test("alinear respeta las comillas tipográficas del original", () => {
  const indice = indexar(CONTRATO);
  const u = alinear(indice, '"el Arrendador"');
  assert.equal(u.alineacion, "exacta");
  assert.equal(CONTRATO.slice(u.inicio!, u.fin!), "“el Arrendador”");
});

test("alinear usa el cursor para elegir la aparición siguiente", () => {
  const texto = "El plazo vence. Otra cosa. El plazo vence.";
  const indice = indexar(texto);
  assert.equal(alinear(indice, "el plazo vence").inicio, 0);
  assert.equal(alinear(indice, "el plazo vence", 0, texto.length, 5).inicio, 27);
});

test("alinear aproxima una cita levemente distinta y la recorta a lo que calza", () => {
  const indice = indexar(CONTRATO);
  const u = alinear(indice, "plazo del contrato es de dos años contado desde el 1 de abril de 2026");
  assert.equal(u.alineacion, "aproximada");
  const subrayado = CONTRATO.slice(u.inicio!, u.fin!);
  assert.ok(subrayado.startsWith("plazo del contrato"), subrayado);
  assert.ok(subrayado.endsWith("2026"), subrayado);
});

test("alinear deja sin respaldo lo que el texto no dice", () => {
  const indice = indexar(CONTRATO);
  const u = alinear(indice, "multa de 10 UF por día de atraso en la restitución");
  assert.equal(u.alineacion, "sin_respaldo");
  assert.equal(u.inicio, null);
  assert.equal(alinear(indice, "   ").alineacion, "sin_respaldo");
  // Una sola palabra no se aproxima
  assert.equal(alinear(indice, "Valparaíso").alineacion, "sin_respaldo");
});

test("segmentar reconstruye el texto y descarta el subrayado que se pisa", () => {
  const texto = "abcdefghij";
  const seg = segmentar(texto, [
    { id: "b", inicio: 4, fin: 8 },
    { id: "a", inicio: 1, fin: 5 },
    { id: "c", inicio: null, fin: null },
  ]);
  assert.equal(seg.map((s) => s.texto).join(""), texto);
  assert.deepEqual(seg.filter((s) => s.id).map((s) => s.id), ["a"]);
});

test("fechaIso acepta solo fechas reales en AAAA-MM-DD", () => {
  assert.equal(fechaIso("2026-04-01"), "2026-04-01");
  assert.equal(fechaIso("2026-02-30"), null);
  assert.equal(fechaIso(""), null);
  assert.equal(fechaIso("01-04-2026"), null);
});

test("atributosAObjeto descarta nombres o valores vacíos", () => {
  assert.deepEqual(atributosAObjeto([{ nombre: "moneda", valor: "UF" }, { nombre: "", valor: "x" }, { nombre: "nota", valor: " " }]), { moneda: "UF" });
  assert.deepEqual(atributosAObjeto(undefined), {});
});

test("pareceEscaneado detecta un PDF casi sin capa de texto", () => {
  assert.equal(pareceEscaneado("  \n ", 10), true);
  assert.equal(pareceEscaneado(CONTRATO.repeat(5), 2), false);
});
