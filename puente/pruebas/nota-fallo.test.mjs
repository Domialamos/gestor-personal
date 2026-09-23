// Fix round 1, Critical 1: "glosas-agente.md" hace que el agente escriba la
// nota real como su ULTIMO paso. Si claude.cmd muere DESPUES de eso,
// glosas-dia.cmd llama a "tb.mjs nota --fallo" de todas formas. Antes del fix,
// eso pisaba sin mirar la nota del dia con "0 glosa(s) · fallo", borrando el
// trabajo real de una corrida que si sirvio: el mismo dano que el bug de
// agosto de 2026, en la direccion contraria. Aca se prueba que
// escribirNotaFallo() ya no hace eso.
//
// BOVEDA se lee una sola vez al importar tb.mjs, asi que cada prueba fija
// BOVEDA_GLOSAS y despues importa el modulo con un query string distinto
// para forzar una instancia nueva (si no, la segunda prueba heredaria la
// carpeta de la primera por el cache de modulos ESM).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ZONA = "America/Santiago";
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());

let contador = 0;
const conBovedaTemporal = async (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "boveda-fallo-"));
  const anterior = process.env.BOVEDA_GLOSAS;
  process.env.BOVEDA_GLOSAS = dir;
  try {
    const { escribirNotaFallo } = await import(`../tb.mjs?prueba-nota-fallo=${contador++}`);
    return await fn({ dir, escribirNotaFallo });
  } finally {
    if (anterior === undefined) delete process.env.BOVEDA_GLOSAS;
    else process.env.BOVEDA_GLOSAS = anterior;
    rmSync(dir, { recursive: true, force: true });
  }
};

test("si ya hay nota del dia, --fallo conserva su contenido y le agrega el aviso al final", async () => {
  await conBovedaTemporal(async ({ dir, escribirNotaFallo }) => {
    const archivo = join(dir, `${hoy()}.md`);
    const notaDeUnaCorridaQueSiTrabajo = [
      "---",
      `fecha: ${hoy()}`,
      "tags: [timebilling, glosas]",
      "---",
      "",
      `# Glosas del ${hoy()}`,
      "",
      "1 glosa(s) · 3h 35m",
      "",
      "## BSVV / Actividades Academicas — 3:35",
      "",
      "**Apunte:** Informe de brechas",
      "",
      "Elaboración del informe de brechas, con revisión de la normativa aplicable.",
      "",
    ].join("\n");
    writeFileSync(archivo, notaDeUnaCorridaQueSiTrabajo);

    const r = escribirNotaFallo("El agente se quedó sin turnos después de escribir la nota");

    assert.equal(r.archivo, archivo);
    assert.equal(r.agregado, true);

    const contenido = readFileSync(archivo, "utf8");
    assert.ok(contenido.includes("1 glosa(s) · 3h 35m"), "no debe perder el resumen de la corrida que si trabajo");
    assert.ok(
      contenido.includes("Elaboración del informe de brechas, con revisión de la normativa aplicable."),
      "no debe perder la glosa real ya redactada y confirmada"
    );
    assert.match(contenido, /⚠️ El agente se quedó sin turnos después de escribir la nota/);
    assert.match(contenido, /⚠️ Detalle en puente[\\/]registro/);
  });
});

test("si no hay nota del dia, --fallo escribe la nota minima de fallo como antes", async () => {
  await conBovedaTemporal(async ({ dir, escribirNotaFallo }) => {
    const archivo = join(dir, `${hoy()}.md`);

    const r = escribirNotaFallo("fallo técnico sin más detalle");

    assert.equal(r.archivo, archivo);
    assert.equal(r.agregado, false);

    const contenido = readFileSync(archivo, "utf8");
    assert.match(contenido, /0 glosa\(s\) · 0h 00m/);
    assert.match(contenido, /⚠️ fallo técnico sin más detalle/);
  });
});

test("--fallo sin motivo explicito deja un texto por defecto, no vacio", async () => {
  await conBovedaTemporal(async ({ dir, escribirNotaFallo }) => {
    const archivo = join(dir, `${hoy()}.md`);
    const r = escribirNotaFallo(undefined);
    assert.equal(r.agregado, false);
    const contenido = readFileSync(archivo, "utf8");
    assert.match(contenido, /la corrida falló sin dejar motivo/);
  });
});
