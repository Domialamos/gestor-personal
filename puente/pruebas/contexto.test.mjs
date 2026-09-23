import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buscarNotas } from "../lib/contexto.mjs";

const conBoveda = (archivos, fn) => {
  const dir = mkdtempSync(join(tmpdir(), "boveda-"));
  try {
    for (const [nombre, texto] of Object.entries(archivos)) writeFileSync(join(dir, nombre), texto);
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

test("encuentra la nota que menciona al cliente", () => {
  conBoveda({ "2026-09-20 Maxagro.md": "Reunión con Maxagro sobre los títulos." }, (dir) => {
    const r = buscarNotas(["Maxagro"], { carpeta: dir });
    assert.equal(r.length, 1);
    assert.match(r[0].texto, /títulos/);
  });
});

test("trae la nota COMPLETA, no un extracto", () => {
  const largo = "x".repeat(5000) + " Maxagro " + "y".repeat(5000);
  conBoveda({ "larga.md": largo }, (dir) => {
    const r = buscarNotas(["Maxagro"], { carpeta: dir });
    assert.equal(r[0].texto.length, largo.length, "la nota no puede venir cortada");
  });
});

test("ignora los nombres de cliente demasiado cortos", () => {
  // Un cliente de 3 letras o menos acierta en cualquier parte y trae basura.
  conBoveda({ "a.md": "El SII resolvió el caso." }, (dir) => {
    assert.deepEqual(buscarNotas(["SII"], { carpeta: dir }), []);
  });
});

test("no distingue mayusculas", () => {
  conBoveda({ "a.md": "reunión con MAXAGRO" }, (dir) => {
    assert.equal(buscarNotas(["Maxagro"], { carpeta: dir }).length, 1);
  });
});

test("una boveda que no existe no revienta", () => {
  assert.deepEqual(buscarNotas(["Maxagro"], { carpeta: "C:/no/existe/para/nada" }), []);
});

test("respeta el tope de notas", () => {
  const archivos = {};
  for (let i = 0; i < 10; i++) archivos[`n${i}.md`] = "Maxagro";
  conBoveda(archivos, (dir) => {
    assert.equal(buscarNotas(["Maxagro"], { carpeta: dir, max: 3 }).length, 3);
  });
});
