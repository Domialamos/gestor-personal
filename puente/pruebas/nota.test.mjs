import { test } from "node:test";
import assert from "node:assert/strict";
import { renderNota } from "../lib/nota.mjs";

const base = { dia: "2026-09-22", glosas: [], pendientes: [], cobradas: 0, fallos: [] };

test("suma bien las horas de las glosas confirmadas", () => {
  const md = renderNota({ ...base, glosas: [
    { cliente_asunto: "BSVV / Academicas", duracion: "3:35", apunte: "Informe", glosa: "Elaboracion del informe." },
    { cliente_asunto: "Maxagro / DD", duracion: "1:45", apunte: "titulos", glosa: "Revision de titulos." },
  ]});
  assert.match(md, /2 glosa\(s\) · 5h 20m/);
});

test("un dia limpio no lleva ninguna advertencia", () => {
  const md = renderNota({ ...base, glosas: [
    { cliente_asunto: "BSVV / Academicas", duracion: "0:30", apunte: "x", glosa: "Revision de x." },
  ]});
  assert.ok(!md.includes("⚠️"), "un dia sin problemas no deberia tener ⚠️");
});

test("las pendientes salen con advertencia y con el texto para pegar a mano", () => {
  const md = renderNota({ ...base, pendientes: [
    { cliente_asunto: "Maxagro / DD", duracion: "1:45", apunte: "revision titulos",
      glosa: "Revision de los titulos de dominio.", motivo: "fallo al verificar dos veces" },
  ]});
  assert.match(md, /⚠️ 1 hora quedó pendiente/);
  assert.match(md, /NO SE PUDO GUARDAR/);
  assert.ok(md.includes("Revision de los titulos de dominio."), "el texto redactado tiene que estar para poder pegarlo");
  assert.match(md, /fallo al verificar dos veces/);
});

test("la advertencia de pendientes concuerda en numero", () => {
  const dos = renderNota({ ...base, pendientes: [
    { cliente_asunto: "A", duracion: "1:00", apunte: "a", glosa: "A.", motivo: "x" },
    { cliente_asunto: "B", duracion: "1:00", apunte: "b", glosa: "B.", motivo: "x" },
  ]});
  assert.match(dos, /⚠️ 2 horas quedaron pendientes/);
});

test("los fallos del dia salen al pie", () => {
  const md = renderNota({ ...base, fallos: ["Repaso del 2026-09-21: falló al leer (sesión caducada)."] });
  assert.match(md, /Repaso del 2026-09-21/);
  assert.match(md, /⚠️/);
});

test("las horas cobradas se mencionan pero no cuentan como problema", () => {
  const md = renderNota({ ...base, glosas: [
    { cliente_asunto: "A", duracion: "1:00", apunte: "a", glosa: "A." },
  ], cobradas: 2 });
  assert.match(md, /2 hora\(s\) ya cobrada\(s\) no se tocaron/);
  assert.ok(!md.includes("⚠️"), "una hora cobrada es normal, no una advertencia");
});

test("una corrida sin nada igual produce una nota valida", () => {
  const md = renderNota(base);
  assert.match(md, /^---\nfecha: 2026-09-22/);
  assert.match(md, /# Glosas del 2026-09-22/);
});

test("el frontmatter lleva la fecha y los tags", () => {
  const md = renderNota(base);
  assert.match(md, /tags: \[timebilling, glosas\]/);
});
