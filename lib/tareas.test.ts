import test from "node:test";
import assert from "node:assert/strict";
import {
  agruparPendientes,
  diasSinMover,
  etiquetaDia,
  normalizarPrioridad,
  ordenarEsperando,
  PRIORIDADES,
  ultimoMovimiento,
} from "./tareas";

const HOY = "2026-08-29"; // sábado

function t(parcial: Partial<{ id: string; fecha_limite: string | null; prioridad: string | null; creado_en: string }>) {
  return {
    id: parcial.id ?? "x",
    fecha_limite: parcial.fecha_limite ?? null,
    prioridad: parcial.prioridad ?? "media",
    creado_en: parcial.creado_en ?? "2026-08-01T10:00:00Z",
  };
}

function ids(grupos: ReturnType<typeof agruparPendientes<ReturnType<typeof t>>>) {
  return grupos.flatMap((g) => g.tareas.map((x) => x.id));
}

test("hay tres prioridades y no se repiten", () => {
  assert.equal(PRIORIDADES.length, 3);
  assert.equal(new Set(PRIORIDADES.map((p) => p.codigo)).size, 3);
});

test("normalizarPrioridad cae en media si el valor no sirve", () => {
  assert.equal(normalizarPrioridad("alta"), "alta");
  assert.equal(normalizarPrioridad(null), "media");
  assert.equal(normalizarPrioridad("urgentisimo"), "media");
});

// La regla que pidió Dominga, explícita: lo de dentro de tres días nunca arriba.
test("una tarea para dentro de 3 dias no queda sobre las de hoy ni sobre las sin fecha", () => {
  const grupos = agruparPendientes(
    [
      t({ id: "en3dias", fecha_limite: "2026-09-01" }),
      t({ id: "sinFecha", fecha_limite: null }),
      t({ id: "paraHoy", fecha_limite: HOY }),
    ],
    HOY
  );
  const orden = ids(grupos);
  assert.ok(orden.indexOf("en3dias") > orden.indexOf("paraHoy"));
  assert.ok(orden.indexOf("en3dias") > orden.indexOf("sinFecha"));
});

test("ni siquiera una prioridad alta futura se adelanta a algo de hoy", () => {
  const grupos = agruparPendientes(
    [
      t({ id: "futuraAlta", fecha_limite: "2026-09-01", prioridad: "alta" }),
      t({ id: "hoyBaja", fecha_limite: HOY, prioridad: "baja" }),
    ],
    HOY
  );
  assert.deepEqual(ids(grupos), ["hoyBaja", "futuraAlta"]);
});

test("las vencidas van primero, la mas atrasada arriba", () => {
  const grupos = agruparPendientes(
    [
      t({ id: "hoy", fecha_limite: HOY }),
      t({ id: "anteayer", fecha_limite: "2026-08-27" }),
      t({ id: "ayer", fecha_limite: "2026-08-28" }),
    ],
    HOY
  );
  assert.equal(grupos[0].clave, "vencidas");
  assert.equal(grupos[0].vencido, true);
  assert.deepEqual(ids(grupos), ["anteayer", "ayer", "hoy"]);
});

test("las tareas sin fecha entran al grupo de hoy, no al final", () => {
  const grupos = agruparPendientes(
    [t({ id: "sinFecha", fecha_limite: null }), t({ id: "manana", fecha_limite: "2026-08-30" })],
    HOY
  );
  assert.equal(grupos[0].titulo, "Hoy");
  assert.deepEqual(grupos[0].tareas.map((x) => x.id), ["sinFecha"]);
  assert.equal(grupos[1].titulo, "Mañana");
});

test("dentro de un mismo dia manda la prioridad", () => {
  const grupos = agruparPendientes(
    [
      t({ id: "baja", fecha_limite: HOY, prioridad: "baja" }),
      t({ id: "alta", fecha_limite: null, prioridad: "alta" }),
      t({ id: "media", fecha_limite: HOY, prioridad: "media" }),
    ],
    HOY
  );
  assert.equal(grupos.length, 1);
  assert.deepEqual(ids(grupos), ["alta", "media", "baja"]);
});

test("a igual prioridad y dia, primero la mas antigua", () => {
  const grupos = agruparPendientes(
    [
      t({ id: "nueva", fecha_limite: HOY, creado_en: "2026-08-29T09:00:00Z" }),
      t({ id: "vieja", fecha_limite: HOY, creado_en: "2026-08-20T09:00:00Z" }),
    ],
    HOY
  );
  assert.deepEqual(ids(grupos), ["vieja", "nueva"]);
});

test("los dias futuros van en orden ascendente", () => {
  const grupos = agruparPendientes(
    [
      t({ id: "sep2", fecha_limite: "2026-09-02" }),
      t({ id: "ago30", fecha_limite: "2026-08-30" }),
      t({ id: "sep1", fecha_limite: "2026-09-01" }),
    ],
    HOY
  );
  assert.deepEqual(ids(grupos), ["ago30", "sep1", "sep2"]);
});

test("sin tareas no hay grupos", () => {
  assert.deepEqual(agruparPendientes([], HOY), []);
});

test("etiquetaDia nombra hoy, manana y el resto por dia de la semana", () => {
  assert.equal(etiquetaDia(HOY, HOY), "Hoy");
  assert.equal(etiquetaDia("2026-08-30", HOY), "Mañana");
  assert.equal(etiquetaDia("2026-09-01", HOY), "martes 1");
});

// --- Delegadas: lo encargado a otra persona -------------------------------

function d(parcial: Partial<{ id: string; delegada_en: string; seguimientos: { fecha: string }[]; prioridad: string; creado_en: string }>) {
  return {
    id: parcial.id ?? "x",
    delegada_en: parcial.delegada_en ?? "2026-08-25",
    seguimientos: parcial.seguimientos ?? [],
    prioridad: parcial.prioridad ?? "media",
    creado_en: parcial.creado_en ?? "2026-08-25T10:00:00Z",
    fecha_limite: null as string | null,
  };
}

test("sin seguimientos, el ultimo movimiento es el dia del encargo", () => {
  assert.equal(ultimoMovimiento(d({ delegada_en: "2026-08-24" })), "2026-08-24");
});

test("con seguimientos, manda el mas reciente aunque venga desordenado", () => {
  const t = d({
    delegada_en: "2026-08-24",
    seguimientos: [{ fecha: "2026-08-26" }, { fecha: "2026-08-31" }, { fecha: "2026-08-28" }],
  });
  assert.equal(ultimoMovimiento(t), "2026-08-31");
});

test("diasSinMover cuenta desde el ultimo movimiento", () => {
  assert.equal(diasSinMover(d({ delegada_en: "2026-08-24" }), HOY), 5);
  assert.equal(diasSinMover(d({ delegada_en: "2026-08-24", seguimientos: [{ fecha: "2026-08-28" }] }), HOY), 1);
  assert.equal(diasSinMover(d({ delegada_en: HOY }), HOY), 0);
});

test("diasSinMover no devuelve negativos si la fecha es futura", () => {
  assert.equal(diasSinMover(d({ delegada_en: "2026-09-05" }), HOY), 0);
});

test("en Esperando va arriba lo mas estancado, no lo mas antiguo", () => {
  const grupos = ordenarEsperando(
    [
      // pedida hace mucho, pero insististe ayer: se movio recien
      d({ id: "vieja_pero_movida", delegada_en: "2026-08-10", seguimientos: [{ fecha: "2026-08-28" }] }),
      // pedida despues, pero nadie la toca desde entonces
      d({ id: "estancada", delegada_en: "2026-08-20", seguimientos: [] }),
    ],
    HOY
  );
  assert.deepEqual(grupos.map((x) => x.id), ["estancada", "vieja_pero_movida"]);
});

test("a igual estancamiento en Esperando desempata la prioridad", () => {
  const grupos = ordenarEsperando(
    [
      d({ id: "media", delegada_en: "2026-08-25", prioridad: "media" }),
      d({ id: "alta", delegada_en: "2026-08-25", prioridad: "alta" }),
    ],
    HOY
  );
  assert.deepEqual(grupos.map((x) => x.id), ["alta", "media"]);
});

test("ordenarEsperando no muta el arreglo original", () => {
  const lista = [d({ id: "a", delegada_en: "2026-08-28" }), d({ id: "b", delegada_en: "2026-08-20" })];
  ordenarEsperando(lista, HOY);
  assert.deepEqual(lista.map((x) => x.id), ["a", "b"]);
});
