// I4 de la revision final: faltaba validacion de entrada.
//
// "dia" aceptaba cualquier fecha (el flujo viejo exigia AAAA-MM-DD y salia 1) y
// "nota" escribia join(BOVEDA, datos.dia + ".md") sin mirar el campo: sin el
// quedaba "undefined.md" en la boveda, y un "../" escribia FUERA de la carpeta
// de glosas, en el resto de la boveda de Dominga.
//
// Los subcomandos se prueban lanzando el CLI de verdad, pero ninguna prueba toca
// TimeBilling: "nota" ni abre navegador, y el caso de "dia" corre con TB_URL
// apuntando a un puerto muerto, porque la fecha se rechaza ANTES de abrir
// sesion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { exigirFecha } from "../tb.mjs";

const PUENTE = dirname(dirname(fileURLToPath(import.meta.url)));

// Devuelve { codigo, stderr }. El CLI nunca debe reventar con un stack pelado.
const correr = (argumentos, env) => {
  try {
    execFileSync(process.execPath, ["tb.mjs", ...argumentos], {
      cwd: PUENTE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TB_URL: "http://127.0.0.1:9", TB_ID_USUARIO: "1", ...env },
    });
    return { codigo: 0, stderr: "" };
  } catch (e) {
    return { codigo: e.status, stderr: String(e.stderr ?? "") };
  }
};

const conBoveda = (fn) => {
  const raiz = mkdtempSync(join(tmpdir(), "boveda-validacion-"));
  const glosas = join(raiz, "Glosas");
  try { return fn({ raiz, glosas }); }
  finally { rmSync(raiz, { recursive: true, force: true }); }
};

test("exigirFecha acepta AAAA-MM-DD y rechaza el resto", () => {
  assert.equal(exigirFecha("2026-09-23", "dia"), "2026-09-23");
  for (const mala of ["23-09-2026", "23/09/26", "2026-9-3", "hoy", "", undefined, null, "../fuera", "2026-09-23.md"]) {
    assert.throws(() => exigirFecha(mala, "dia"), /AAAA-MM-DD/, `deberia rechazar ${JSON.stringify(mala)}`);
  }
});

test("nota con un dia valido escribe el archivo del dia", () => {
  conBoveda(({ glosas }) => {
    const datos = join(glosas, "..", "datos.json");
    writeFileSync(datos, JSON.stringify({ dia: "2026-09-23", glosas: [], pendientes: [], cobradas: 0, fallos: [] }));
    const r = correr(["nota", datos], { BOVEDA_GLOSAS: glosas });
    assert.equal(r.codigo, 0, r.stderr);
    assert.ok(existsSync(join(glosas, "2026-09-23.md")));
  });
});

test("nota sin el campo dia sale 1 y no deja undefined.md", () => {
  conBoveda(({ glosas }) => {
    const datos = join(glosas, "..", "datos.json");
    writeFileSync(datos, JSON.stringify({ glosas: [], pendientes: [] }));
    const r = correr(["nota", datos], { BOVEDA_GLOSAS: glosas });
    assert.equal(r.codigo, 1);
    assert.match(r.stderr, /AAAA-MM-DD/);
    assert.ok(!existsSync(join(glosas, "undefined.md")));
  });
});

test("nota con un dia que sale de la carpeta no escribe nada fuera", () => {
  conBoveda(({ raiz, glosas }) => {
    const datos = join(raiz, "datos.json");
    writeFileSync(datos, JSON.stringify({ dia: "../fuera", glosas: [], pendientes: [] }));
    const r = correr(["nota", datos], { BOVEDA_GLOSAS: glosas });
    assert.equal(r.codigo, 1);
    assert.deepEqual(readdirSync(raiz).filter((n) => n.endsWith(".md")), [],
      "un ../ en el campo dia escribiria en el resto de la boveda");
  });
});

test("dia con una fecha mal formada sale 1 antes de abrir sesion", () => {
  const r = correr(["dia", "23-09-2026"]);
  assert.equal(r.codigo, 1);
  assert.match(r.stderr, /AAAA-MM-DD/);
});
