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
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PUENTE = dirname(dirname(fileURLToPath(import.meta.url)));

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

// M4: el aviso se agregaba al FINAL, dejando el encabezado intacto diciendo
// "6 glosa(s) · 6h 30m" sin ningun ⚠️. La regla de la nota es la contraria: lo
// que fallo se ve primero, porque es lo unico que le pide accion.
test("el aviso de fallo queda ARRIBA, antes del resumen del dia", async () => {
  await conBovedaTemporal(async ({ dir, escribirNotaFallo }) => {
    const archivo = join(dir, `${hoy()}.md`);
    writeFileSync(archivo, [
      "---", `fecha: ${hoy()}`, "tags: [timebilling, glosas]", "---", "",
      `# Glosas del ${hoy()}`, "", "6 glosa(s) · 6h 30m", "",
      "## BSVV / Actividades Academicas — 3:35", "", "**Apunte:** Informe de brechas", "",
      "Elaboración del informe de brechas.", "",
    ].join("\n"));

    escribirNotaFallo("El agente se quedó sin turnos");

    const contenido = readFileSync(archivo, "utf8");
    const dondeElAviso = contenido.indexOf("⚠️");
    const dondeElResumen = contenido.indexOf("6 glosa(s)");
    assert.ok(dondeElAviso > -1 && dondeElResumen > -1);
    assert.ok(dondeElAviso < dondeElResumen, "el ⚠️ tiene que estar antes del resumen, no al pie");
    assert.ok(contenido.indexOf(`# Glosas del ${hoy()}`) < dondeElAviso, "pero despues del titulo");
    assert.ok(contenido.includes("Elaboración del informe de brechas."), "sin perder nada de lo anterior");
    assert.ok(!/\n{3,}/.test(contenido), "sin dejar renglones en blanco de sobra");
  });
});

// C3: "la nota se escribe siempre" era falso. El .cmd solo llamaba a --fallo
// cuando claude salia distinto de cero; si el agente salia 0 sin haber llamado a
// "tb.mjs nota", no quedaba nota ni ⚠️ y el .cmd escribia LISTO. (las corridas
// del 22-09-2026 a las 21:58 y 22:01 son exactamente eso).
test("asegurarNota no toca la nota del dia si ya existe", async () => {
  await conBovedaTemporal(async ({ dir }) => {
    const { asegurarNota } = await import(`../tb.mjs?asegurar-existe=${Date.now()}`);
    const archivo = join(dir, `${hoy()}.md`);
    writeFileSync(archivo, "nota de verdad de la corrida que si trabajo\n");
    const r = asegurarNota("no deberia usarse");
    assert.equal(r.escrita, false);
    assert.equal(readFileSync(archivo, "utf8"), "nota de verdad de la corrida que si trabajo\n");
  });
});

test("asegurarNota escribe la nota de fallo cuando el agente no dejo ninguna", async () => {
  await conBovedaTemporal(async ({ dir }) => {
    const { asegurarNota } = await import(`../tb.mjs?asegurar-falta=${Date.now()}`);
    const archivo = join(dir, `${hoy()}.md`);
    assert.ok(!existsSync(archivo));
    const r = asegurarNota("El agente termino sin error pero no dejo la nota del dia");
    assert.equal(r.escrita, true);
    assert.match(readFileSync(archivo, "utf8"), /⚠️ El agente termino sin error pero no dejo la nota del dia/);
  });
});

// El codigo de salida es el contrato con glosas-dia.cmd: 0 = habia nota,
// 1 = no habia y esta corrida es fallida, que la tarea de Windows reintente.
test("el CLI: nota --asegurar sale 0 si hay nota y 1 si tuvo que escribirla", () => {
  const dir = mkdtempSync(join(tmpdir(), "boveda-asegurar-"));
  try {
    const correr = () => {
      try {
        execFileSync(process.execPath, ["tb.mjs", "nota", "--asegurar", "sin nota del dia"], {
          cwd: PUENTE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, TB_URL: "http://127.0.0.1:9", TB_ID_USUARIO: "1", BOVEDA_GLOSAS: dir },
        });
        return 0;
      } catch (e) { return e.status; }
    };
    assert.equal(correr(), 1, "sin nota del dia, la corrida es fallida");
    assert.equal(correr(), 0, "ya escrita la nota de fallo, la segunda vez no vuelve a fallar");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
