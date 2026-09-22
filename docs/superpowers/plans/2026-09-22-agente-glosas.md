# Agente de glosas de TimeBilling — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la cadena `glosas-dia.cmd` → cuatro scripts por un agente que orquesta herramientas deterministas, que no se cae en el arranque en frío del navegador y que deja siempre una nota en la bóveda.

**Architecture:** `tb.mjs` pasa a ser un CLI con subcomandos que devuelven JSON por stdout. La lógica se parte en módulos chicos bajo `lib/`: parseo del listado (puro), sesión de navegador (con reintento), registro de procesadas, y render de la nota (puro). Un agente `claude -p` guiado por `glosas-agente.md` llama a esos subcomandos, redacta él mismo las glosas, y no puede declarar éxito: lo declara `tb.mjs escribir`, que relee la glosa desde TimeBilling antes de confirmar.

**Tech Stack:** Node 24.19 (runner `node --test` incorporado, sin dependencias nuevas), Playwright 1.62 con contexto persistente, Claude Code en modo `-p`.

**Spec:** `docs/superpowers/specs/2026-09-22-agente-glosas-design.md`

## Global Constraints

- **Nunca se crean horas.** El cronómetro titular es TimeBillingX. Esta rutina solo reemplaza el texto de glosas de horas que ya existen.
- **Nunca se tocan horas cobradas.** Editable = la fila tiene botón `[data-edit-job]`. Las cobradas no lo traen.
- **Nada se marca como procesado sin verificar contra TimeBilling.** Solo `tb.mjs escribir` escribe en `registro/procesadas.json`, y solo tras releer la glosa guardada.
- **Windows, PowerShell del estudio:** usar `npm.cmd` y `claude.cmd`, nunca los shims `.ps1`. Separar comandos con `;`, nunca con `&&`.
- **Rutas de Windows con barras normales** (`C:/Users/...`) dentro de los scripts: las invertidas se pierden al generar archivos.
- **El prompt a `claude` va por stdin**, nunca como argumento: `cmd.exe` destroza comillas y saltos de línea.
- **Texto en español de Chile**, tuteando. Comillas tipográficas “ ”, nunca « ».
- **Zona horaria `America/Santiago`** para resolver qué día es hoy.
- `TB_URL`, `TB_ID_USUARIO` salen de `puente/.env` vía `dotenv/config`.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/listado.mjs` | **Puro.** `parsearListado()`: de un `document` de TimeBilling a filas. Se inyecta en el navegador y se prueba contra un fixture. |
| `lib/sesion.mjs` | Abrir el contexto persistente con reintento de arranque en frío, detectar sesión caída, ejecutar la búsqueda de un rango. |
| `lib/registro.mjs` | `procesadas.json`. Reemplaza `registro-glosas.mjs` sin cambios de lógica. |
| `lib/nota.mjs` | **Puro.** De un objeto de resultados al markdown de la nota diaria. |
| `tb.mjs` | CLI: `dia`, `ejemplos`, `escribir`, `nota`. Solo despacho y salida JSON. |
| `glosas-agente.md` | El prompt del agente, versionado. |
| `glosas-dia.cmd` | Lanza el agente; si el agente muere, escribe la nota de fallo. |
| `pruebas/*.test.mjs` | Pruebas con `node --test`. |
| `pruebas/fixtures/listado.html` | Página real guardada, sin datos de clientes reales más allá de lo que ya está en git. |

Se eliminan al final: `glosas-leer.mjs`, `redactar.mjs`, `glosas-escribir.mjs`, `ejemplos.mjs`, `resumen.mjs`, `registro-glosas.mjs`, `avisar.mjs`.

---

### Task 1: Andamiaje de pruebas y fixture real del listado

Sin un fixture real, todas las pruebas de parseo son fantasía. Se captura uno de la sesión viva, en modo solo lectura.

**Files:**
- Modify: `puente/package.json`
- Create: `puente/pruebas/fixtures/capturar.mjs`
- Create: `puente/pruebas/fixtures/listado.html`
- Modify: `puente/.gitignore`

**Interfaces:**
- Consumes: nada.
- Produces: `pruebas/fixtures/listado.html`, usado por la Task 2. `npm.cmd test` corre `node --test pruebas/`.

- [ ] **Step 1: Agregar el script de pruebas**

En `puente/package.json`, dentro de `"scripts"`, agregar:

```json
    "test": "node --test pruebas/"
```

- [ ] **Step 2: Escribir el capturador del fixture**

Crear `puente/pruebas/fixtures/capturar.mjs`:

```javascript
// Guarda una pagina real del listado para usarla como fixture de pruebas.
// Solo lectura: no edita nada en TimeBilling.
//
//   node pruebas/fixtures/capturar.mjs 01-09-2026 22-09-2026

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

const [desde, hasta] = process.argv.slice(2);
const { TB_URL, TB_ID_USUARIO } = process.env;
if (!desde || !hasta) { console.error("Uso: node pruebas/fixtures/capturar.mjs DD-MM-AAAA DD-MM-AAAA"); process.exit(1); }

const contexto = await chromium.launchPersistentContext("./perfil", { headless: true });
const pagina = contexto.pages()[0] ?? (await contexto.newPage());
try {
  await pagina.goto(`${TB_URL}/time_tracking/app/interfaces/trabajos.php?popup=1&id_usuario=${TB_ID_USUARIO}&motivo=horas`, { waitUntil: "networkidle" });
  await pagina.waitForSelector('[name="fecha_ini"]', { timeout: 15000 });
  await pagina.evaluate(({ desde, hasta }) => {
    const f = (n) => document.querySelector(`[name="${n}"]`);
    f("fecha_ini").value = desde;
    f("fecha_fin").value = hasta;
    f("opc").value = "buscar";
    f("opc").closest("form").submit();
  }, { desde, hasta });
  await pagina.waitForLoadState("networkidle").catch(() => {});
  await pagina.waitForTimeout(2500);
  const html = await pagina.content();
  writeFileSync("pruebas/fixtures/listado.html", html);
  const filas = await pagina.locator('tr[id^="t"]').count();
  console.log(`Guardadas ${filas} fila(s) en pruebas/fixtures/listado.html`);
} finally {
  await contexto.close().catch(() => {});
}
```

- [ ] **Step 3: Capturar el fixture**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node pruebas/fixtures/capturar.mjs 01-09-2026 22-09-2026`

Expected: imprime "Guardadas N fila(s)" con N ≥ 5. Si falla con un mensaje de sesión o un timeout, correr `npm.cmd run configurar-auto`, iniciar sesión en la ventana que se abre, y repetir.

**Importante:** abrir `pruebas/fixtures/listado.html` y confirmar que trae al menos una fila con botón `[data-edit-job]` y al menos una sin él (una hora ya cobrada). Si no hay de las dos, capturar un rango más ancho. Sin ese contraste, la prueba de "editable" no prueba nada.

- [ ] **Step 4: Verificar que el fixture no lleve secretos**

Run: `grep -icE "password|token|PHPSESSID|Authorization" pruebas/fixtures/listado.html`

Expected: `0`. Si aparece algo, recortar a mano esa parte del HTML antes de commitear. El fixture lleva nombres de clientes del estudio; eso es aceptable porque el repo es privado, pero credenciales no.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/dalamos/gestor-personal
git add puente/package.json puente/pruebas/
git commit -m "Andamiaje de pruebas y fixture real del listado de TimeBilling"
```

---

### Task 2: `lib/listado.mjs` — parseo puro, probado contra el fixture

**Files:**
- Create: `puente/lib/listado.mjs`
- Create: `puente/pruebas/listado.test.mjs`

**Interfaces:**
- Consumes: `pruebas/fixtures/listado.html` (Task 1).
- Produces: `parsearListado()` — función **autocontenida** (sin closures, sin imports en su cuerpo) para poder pasarla a `page.evaluate`. Devuelve un array de
  `{id_trabajo: number, fecha: string, cliente_asunto: string, duracion: string, cobrable: boolean, descripcion: string, editable: boolean}`.
  La usan `lib/sesion.mjs` (Task 3) y `tb.mjs`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `puente/pruebas/listado.test.mjs`:

```javascript
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
  await pagina.goto(pathToFileURL(resolve("pruebas/fixtures/listado.html")).href);
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
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/listado.test.mjs`

Expected: FAIL — `Cannot find module '../lib/listado.mjs'`.

- [ ] **Step 3: Escribir el parseo**

Crear `puente/lib/listado.mjs`:

```javascript
// Parseo del listado "Revisar horas" de TimeBilling.
//
// parsearListado() se INYECTA en el navegador con page.evaluate, asi que tiene
// que ser autocontenida: sin closures, sin imports, sin variables de fuera.
// Cualquier ayuda va definida adentro.

export function parsearListado() {
  const texto = (e) => (e?.innerText ?? "").trim().replace(/\s+/g, " ");

  return [...document.querySelectorAll('tr[id^="t"]')].map((tr) => {
    const id = tr.id.slice(1);
    if (!/^\d+$/.test(id)) return null;

    const celdas = [...tr.querySelectorAll("td")];
    const asunto = tr.querySelector(".cliente-asunto");
    const pie = texto(asunto?.querySelector("footer"));

    // El pie viene como "#617213 la glosa...". El bug historico fue escribir
    // "\s" dentro de un string pasado a RegExp, donde se pierde la barra: hay
    // que escribir "\\s" o usar un literal. Aca se recorta sin RegExp.
    let glosa = pie;
    const prefijo = `#${id}`;
    if (glosa.startsWith(prefijo)) glosa = glosa.slice(prefijo.length).trim();

    const duracion = celdas.map(texto).find((t) => /^\d{1,2}:\d{2}$/.test(t)) ?? "";
    const cobrableCelda = celdas.map(texto).find((t) => t === "SI" || t === "NO");

    // Una hora ya cobrada no trae boton de editar: ese es el filtro fiable.
    const editable = Boolean(
      tr.querySelector(`[data-edit-job="${id}"]`) ||
      document.querySelector(`[data-edit-job="${id}"]`)
    );

    return {
      id_trabajo: Number(id),
      fecha: texto(celdas[1]),
      cliente_asunto: texto(asunto?.querySelector("strong")),
      duracion,
      cobrable: cobrableCelda === "SI",
      descripcion: glosa,
      editable,
    };
  }).filter(Boolean);
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/listado.test.mjs`

Expected: PASS, 6 pruebas.

Si falla "la glosa no arrastra el prefijo": el `tb.mjs` viejo tenía `new RegExp(`^#${id}\s*`)` — dentro de un template string `\s` se convierte en `s` literal, así que el prefijo nunca se sacaba bien. La versión de arriba no usa RegExp justamente por eso. No lo "arregles" volviendo a RegExp.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/dalamos/gestor-personal
git add puente/lib/listado.mjs puente/pruebas/listado.test.mjs
git commit -m "Parseo del listado como funcion pura, probado contra pagina real"
```

---

### Task 3: `lib/sesion.mjs` — arranque en frío con reintento

Esta es la causa del 100% de los fallos registrados: la **primera** carga del navegador revienta (`Page crashed`) o da timeout, y la segunda funciona.

**Files:**
- Create: `puente/lib/sesion.mjs`
- Create: `puente/pruebas/sesion.test.mjs`

**Interfaces:**
- Consumes: `parsearListado` de `lib/listado.mjs` (Task 2).
- Produces:
  - `conReintento(fn, {intentos = 3, espera = 2000, dormir})` → resultado de `fn()`. Lanza el último error si se agotan los intentos.
  - `abrirSesion({headless = true})` → `{contexto, pagina}`.
  - `estaFuera(pagina)` → `boolean`.
  - `buscarDia(pagina, {url, idUsuario, desde, hasta})` → `undefined`. `desde`/`hasta` en DD-MM-AAAA.
  - `leerTrabajos(pagina)` → filas de `parsearListado`.
  - `aDDMMYYYY(iso)` → string.
  - `SesionCaida` — clase de error para distinguir sesión caducada de fallo técnico.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `puente/pruebas/sesion.test.mjs`:

```javascript
// Prueba el reintento sin abrir ningun navegador: conReintento recibe la
// funcion a reintentar y la funcion de dormir, asi que se puede probar entero
// en milisegundos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { conReintento, aDDMMYYYY } from "../lib/sesion.mjs";

const sinDormir = async () => {};

test("si el primer intento sale bien, no reintenta", async () => {
  let llamadas = 0;
  const r = await conReintento(async () => { llamadas++; return "ok"; }, { dormir: sinDormir });
  assert.equal(r, "ok");
  assert.equal(llamadas, 1);
});

test("falla dos veces y a la tercera sale bien", async () => {
  let llamadas = 0;
  const r = await conReintento(async () => {
    llamadas++;
    if (llamadas < 3) throw new Error("Page crashed");
    return "ok";
  }, { dormir: sinDormir });
  assert.equal(r, "ok");
  assert.equal(llamadas, 3);
});

test("si fallan los tres intentos, propaga el ultimo error", async () => {
  let llamadas = 0;
  await assert.rejects(
    () => conReintento(async () => { llamadas++; throw new Error(`fallo ${llamadas}`); }, { dormir: sinDormir }),
    /fallo 3/,
  );
  assert.equal(llamadas, 3);
});

test("espera mas en cada reintento", async () => {
  const esperas = [];
  let llamadas = 0;
  await conReintento(async () => {
    llamadas++;
    if (llamadas < 3) throw new Error("x");
    return "ok";
  }, { espera: 100, dormir: async (ms) => { esperas.push(ms); } });
  assert.deepEqual(esperas, [100, 200]);
});

test("aDDMMYYYY da vuelta la fecha", () => {
  assert.equal(aDDMMYYYY("2026-09-22"), "22-09-2026");
  assert.equal(aDDMMYYYY("2026-01-05T12:00:00.000Z"), "05-01-2026");
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/sesion.test.mjs`

Expected: FAIL — `Cannot find module '../lib/sesion.mjs'`.

- [ ] **Step 3: Escribir el módulo de sesión**

Crear `puente/lib/sesion.mjs`:

```javascript
// Sesion de TimeBilling y lectura del listado.
//
// El listado NO es semana.php: es app/interfaces/trabajos.php, un formulario
// PHP clasico con opc=buscar y fechas en DD-MM-AAAA.
//
// El arranque en frio de Chromium falla de forma intermitente (Page crashed, o
// timeout esperando fecha_ini) y a la segunda funciona. Por eso abrirSesion va
// envuelta en conReintento, que ademas relanza el contexto entero: reintentar
// sobre un navegador muerto no sirve de nada.

import { chromium } from "playwright";
import { parsearListado } from "./listado.mjs";

export class SesionCaida extends Error {
  constructor() { super("La sesion de TimeBilling caduco. Corre: npm.cmd run configurar-auto"); this.name = "SesionCaida"; }
}

export const LISTADO = (url, idUsuario) =>
  `${url}/time_tracking/app/interfaces/trabajos.php?popup=1&id_usuario=${idUsuario}&motivo=horas`;

export const aDDMMYYYY = (iso) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${a}`;
};

const dormirDeVerdad = (ms) => new Promise((r) => setTimeout(r, ms));

export async function conReintento(fn, { intentos = 3, espera = 2000, dormir = dormirDeVerdad } = {}) {
  let ultimo;
  for (let i = 0; i < intentos; i++) {
    try { return await fn(); }
    catch (e) {
      // Una sesion caducada no se arregla reintentando: se corta de inmediato.
      if (e instanceof SesionCaida) throw e;
      ultimo = e;
      if (i < intentos - 1) await dormir(espera * (i + 1));
    }
  }
  throw ultimo;
}

export async function abrirSesion({ headless = true } = {}) {
  const contexto = await chromium.launchPersistentContext("./perfil", { headless });
  const pagina = contexto.pages()[0] ?? (await contexto.newPage());
  return { contexto, pagina };
}

export async function estaFuera(pagina) {
  // Por la URL no se puede: la pantalla de acceso vive en /time_tracking/ y no
  // dice "login" en ninguna parte. Se detecta por el campo de contrasena.
  return pagina.evaluate(() => {
    if (document.querySelector('input[type="password"]')) return true;
    return /Ingresa tus credenciales|¿Olvidaste tu contrase/i.test(document.body?.innerText ?? "");
  }).catch(() => true);
}

export async function buscarDia(pagina, { url, idUsuario, desde, hasta }) {
  await pagina.goto(LISTADO(url, idUsuario), { waitUntil: "networkidle" });
  if (await estaFuera(pagina)) throw new SesionCaida();
  // networkidle no garantiza que el formulario este pintado.
  await pagina.waitForSelector('[name="fecha_ini"]', { timeout: 15000 });
  await pagina.evaluate(({ desde, hasta }) => {
    const f = (n) => document.querySelector(`[name="${n}"]`);
    f("fecha_ini").value = desde;
    f("fecha_fin").value = hasta;
    f("opc").value = "buscar";
    f("opc").closest("form").submit();
  }, { desde, hasta });
  await pagina.waitForLoadState("networkidle").catch(() => {});
  await pagina.waitForTimeout(2500);
}

export const leerTrabajos = (pagina) => pagina.evaluate(parsearListado);

// Abre la sesion, corre el trabajo y cierra, reintentando el ciclo COMPLETO si
// el navegador se cae al arrancar. Relanzar es la clave: el reintento sobre la
// misma pagina muerta fue lo que fallo el 22-09-2026.
export async function conSesion(trabajo, opciones = {}) {
  return conReintento(async () => {
    const { contexto, pagina } = await abrirSesion(opciones);
    try { return await trabajo(pagina); }
    finally { await contexto.close().catch(() => {}); }
  }, opciones);
}

// Pagina de a 20 mediante el campo oculto "desde". Subir x_pag no funciona: el
// reenvio lo resetea.
export async function traerRango(pagina, { url, idUsuario, desde, hasta, maxPaginas = 20 }) {
  await buscarDia(pagina, { url, idUsuario, desde, hasta });
  const todos = new Map();
  for (let p = 0; p < maxPaginas; p++) {
    const lote = await leerTrabajos(pagina);
    const antes = todos.size;
    for (const t of lote) todos.set(String(t.id_trabajo), t);
    if (todos.size === antes) break;
    if (lote.length < 20) break;
    const avanzo = await pagina.evaluate((salto) => {
      const f = (n) => document.querySelector(`[name="${n}"]`);
      if (!f("desde") || !f("opc")) return false;
      f("desde").value = String(salto);
      f("opc").value = "buscar";
      f("opc").closest("form").submit();
      return true;
    }, (p + 1) * 20);
    if (!avanzo) break;
    await pagina.waitForLoadState("networkidle").catch(() => {});
    await pagina.waitForTimeout(2000);
  }
  return [...todos.values()];
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/sesion.test.mjs`

Expected: PASS, 5 pruebas.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/dalamos/gestor-personal
git add puente/lib/sesion.mjs puente/pruebas/sesion.test.mjs
git commit -m "Sesion con reintento de arranque en frio, la causa de los fallos"
```

---

### Task 4: `lib/registro.mjs` — procesadas, con ruta inyectable

Igual que `registro-glosas.mjs`, pero con la ruta como parámetro para poder probarlo sin ensuciar el registro real.

**Files:**
- Create: `puente/lib/registro.mjs`
- Create: `puente/pruebas/registro.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `leerRegistro(archivo = "registro/procesadas.json")` → objeto `{[id]: {dia, glosa}}`.
  - `marcarProcesada(id, datos, archivo = "registro/procesadas.json")` → `undefined`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `puente/pruebas/registro.test.mjs`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { leerRegistro, marcarProcesada } from "../lib/registro.mjs";

const conCarpeta = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "glosas-"));
  try { return fn(join(dir, "procesadas.json")); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

test("un registro que no existe se lee como vacio", () => {
  conCarpeta((archivo) => assert.deepEqual(leerRegistro(archivo), {}));
});

test("lo marcado se puede volver a leer", () => {
  conCarpeta((archivo) => {
    marcarProcesada(623309, { dia: "2026-09-22", glosa: "Elaboracion del informe." }, archivo);
    assert.equal(leerRegistro(archivo)["623309"].glosa, "Elaboracion del informe.");
  });
});

test("marcar dos veces no pierde la primera", () => {
  conCarpeta((archivo) => {
    marcarProcesada(1, { dia: "2026-09-21", glosa: "a" }, archivo);
    marcarProcesada(2, { dia: "2026-09-22", glosa: "b" }, archivo);
    assert.deepEqual(Object.keys(leerRegistro(archivo)).sort(), ["1", "2"]);
  });
});

test("un registro corrupto se lee como vacio en vez de reventar", () => {
  conCarpeta((archivo) => {
    writeFileSync(archivo, "{ esto no es json");
    assert.deepEqual(leerRegistro(archivo), {});
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/registro.test.mjs`

Expected: FAIL — `Cannot find module '../lib/registro.mjs'`.

- [ ] **Step 3: Escribir el módulo**

Crear `puente/lib/registro.mjs`:

```javascript
// Registro de las horas cuya glosa ya se redacto, subio Y VERIFICO.
//
// Existe porque cada corrida repasa tambien el dia anterior: sin el, una hora
// ya pulida se volveria a redactar cada noche y su texto cambiaria solo.
//
// Solo escribe aca el subcomando "escribir", despues de releer la glosa desde
// TimeBilling. El agente no tiene forma de tocarlo.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const POR_DEFECTO = "registro/procesadas.json";

export function leerRegistro(archivo = POR_DEFECTO) {
  if (!existsSync(archivo)) return {};
  try { return JSON.parse(readFileSync(archivo, "utf8")); }
  catch { return {}; }   // registro corrupto: se prefiere rehacer a caerse
}

export function marcarProcesada(id, datos, archivo = POR_DEFECTO) {
  mkdirSync(dirname(archivo), { recursive: true });
  const r = leerRegistro(archivo);
  r[String(id)] = datos;
  writeFileSync(archivo, JSON.stringify(r, null, 2));
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/registro.test.mjs`

Expected: PASS, 4 pruebas.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/dalamos/gestor-personal
git add puente/lib/registro.mjs puente/pruebas/registro.test.mjs
git commit -m "Registro de procesadas con ruta inyectable para poder probarlo"
```

---

### Task 5: `lib/nota.mjs` — la nota diaria, con lo que falló arriba

**Files:**
- Create: `puente/lib/nota.mjs`
- Create: `puente/pruebas/nota.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `renderNota({dia, glosas, pendientes, cobradas, fallos})` → string markdown.
  - `glosas`: `[{cliente_asunto, duracion, apunte, glosa}]` — las confirmadas.
  - `pendientes`: `[{cliente_asunto, duracion, apunte, glosa, motivo}]` — redactadas pero no guardadas.
  - `cobradas`: número de horas que no se tocaron.
  - `fallos`: `[string]` — días que no se pudieron leer, u otros problemas.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `puente/pruebas/nota.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/nota.test.mjs`

Expected: FAIL — `Cannot find module '../lib/nota.mjs'`.

- [ ] **Step 3: Escribir el render**

Crear `puente/lib/nota.mjs`:

```javascript
// La nota diaria de la boveda. Es el UNICO canal por el que Dominga se entera
// de lo que paso: no hay aviso al gestor ni correo.
//
// Regla de diseno: si la nota no tiene ⚠️, no paso nada. Todo lo que fallo va
// arriba y con el texto redactado a la vista, para poder pegarlo a mano.

const aMinutos = (duracion) => {
  const [h, m] = String(duracion ?? "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function renderNota({ dia, glosas = [], pendientes = [], cobradas = 0, fallos = [] }) {
  const total = glosas.reduce((s, g) => s + aMinutos(g.duracion), 0);

  const avisos = [];
  if (pendientes.length === 1) avisos.push("⚠️ 1 hora quedó pendiente");
  else if (pendientes.length > 1) avisos.push(`⚠️ ${pendientes.length} horas quedaron pendientes`);
  if (fallos.length) avisos.push(`⚠️ ${fallos.length} problema(s) en la corrida`);

  const l = [
    "---",
    `fecha: ${dia}`,
    "tags: [timebilling, glosas]",
    "---",
    "",
    `# Glosas del ${dia}`,
    "",
    `${glosas.length} glosa(s) · ${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m${avisos.length ? "          " + avisos.join(" · ") : ""}`,
    "",
  ];

  // Lo pendiente va PRIMERO: es lo unico que le pide accion.
  for (const p of pendientes) {
    l.push(`## ${p.cliente_asunto || "(sin asunto)"} — ${p.duracion ?? "?"}   ⚠️ NO SE PUDO GUARDAR`, "");
    l.push(`**Apunte:** ${p.apunte || "(vacío)"}`, "");
    l.push(p.glosa, "");
    l.push(`> ${p.motivo}. La hora sigue sin esta glosa en TimeBilling.`, "");
  }

  for (const g of glosas) {
    l.push(`## ${g.cliente_asunto || "(sin asunto)"} — ${g.duracion ?? "?"}`, "");
    l.push(`**Apunte:** ${g.apunte || "(vacío)"}`, "");
    l.push(g.glosa, "");
  }

  if (cobradas) l.push(`> ${cobradas} hora(s) ya cobrada(s) no se tocaron.`, "");

  if (fallos.length) {
    l.push("---", "");
    for (const f of fallos) l.push(`> ⚠️ ${f}`, "");
  }

  return l.join("\n");
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/nota.test.mjs`

Expected: PASS, 8 pruebas.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/dalamos/gestor-personal
git add puente/lib/nota.mjs puente/pruebas/nota.test.mjs
git commit -m "Nota diaria: lo que fallo va arriba y con el texto para pegar"
```

---

### Task 6: `tb.mjs` — el CLI, con `escribir` honesto

El subcomando `escribir` es la protección central del diseño: el agente no puede declarar éxito, lo declara esta herramienta contra la página.

**Files:**
- Create: `puente/lib/contexto.mjs`
- Create: `puente/pruebas/contexto.test.mjs`
- Modify: `puente/tb.mjs` (se reescribe entero)
- Create: `puente/pruebas/escribir.test.mjs`

**Interfaces:**
- Consumes: todo `lib/` (Tasks 2-5).
- Produces: `buscarNotas(clientes, {carpeta, max})` → `[{nota, menciona, texto}]` en `lib/contexto.mjs`.
- Produces: el CLI. Todos los subcomandos imprimen **solo JSON** por stdout; los mensajes para humanos van a stderr.
  - `node tb.mjs dia <AAAA-MM-DD>` → `{"dia", "trabajos": [...], "cobradas": n, "ya_procesadas": n}`. Solo trabajos editables y no procesados.
  - `node tb.mjs ejemplos "<asunto>" [AAAA-MM-DD]` → `{"asunto", "ejemplos": [{"duracion","glosa"}]}`, hasta 10, de los últimos 90 días.
  - `node tb.mjs contexto "<cliente>"` → `{"cliente", "notas": [{"nota","texto"}]}`, hasta 5 notas **completas** de la bóveda.
  - `node tb.mjs escribir <id> <texto>` → `{"id_trabajo", "confirmada": bool, "motivo": string|null, "guardado": string}`.
  - `node tb.mjs nota <datos.json>` → `{"archivo": ruta}`.
  - `node tb.mjs nota --fallo "<motivo>"` → `{"archivo": ruta}`.
  - Código de salida: `0` bien, `1` fallo técnico, `2` sesión caducada.
- Produces también: `verificarGuardado(pagina, {id, textoEnviado, ...})` → `{confirmada, guardado}`, exportada para poder probarla sin navegador real.

- [ ] **Step 1a: Escribir la prueba del contexto de la bóveda**

La spec pide que las notas de la bóveda lleguen **completas**, no cortadas a
1.200 caracteres como hoy: el corte cae justo donde suele estar el detalle. El
agente no puede buscarlas solo —no tiene `Glob` ni `Grep`—, así que se las
entrega esta herramienta.

Crear `puente/pruebas/contexto.test.mjs`:

```javascript
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
```

- [ ] **Step 1b: Correr la prueba y verificar que falla**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/contexto.test.mjs`

Expected: FAIL — `Cannot find module '../lib/contexto.mjs'`.

- [ ] **Step 1c: Escribir `lib/contexto.mjs`**

```javascript
// Notas de la boveda que mencionan a un cliente, para darle al agente de donde
// deducir cuando el apunte del cronometro es corto.
//
// Van COMPLETAS a proposito. La version anterior las cortaba a 1200 caracteres
// y el corte caia justo donde suele estar el detalle util.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const LARGO_MINIMO_CLIENTE = 4;   // "SII" acierta en cualquier parte y trae basura

export function buscarNotas(clientes, { carpeta, max = 5 } = {}) {
  const utiles = clientes.filter((c) => c && c.length >= LARGO_MINIMO_CLIENTE);
  if (!utiles.length) return [];

  let archivos;
  try {
    archivos = readdirSync(carpeta)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({ f, t: statSync(join(carpeta, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)     // las mas recientes primero
      .map(({ f }) => f);
  } catch { return []; }             // sin boveda accesible se sigue sin contexto

  const encontradas = [];
  for (const f of archivos) {
    if (encontradas.length >= max) break;
    let texto;
    try { texto = readFileSync(join(carpeta, f), "utf8"); } catch { continue; }
    const bajo = texto.toLowerCase();
    const menciona = utiles.filter((c) => bajo.includes(c.toLowerCase()));
    if (menciona.length) encontradas.push({ nota: f, menciona, texto });
  }
  return encontradas;
}
```

- [ ] **Step 1d: Correr la prueba y verificar que pasa**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/contexto.test.mjs`

Expected: PASS, 6 pruebas.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `puente/pruebas/escribir.test.mjs`:

```javascript
// LA prueba que protege todo el diseno: si TimeBilling guardo algo distinto a
// lo que se envio, "escribir" tiene que decir que NO, y no marcar la hora como
// procesada. Se prueba con una pagina simulada, sin navegador.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verificarGuardado } from "../tb.mjs";
import { leerRegistro } from "../lib/registro.mjs";

// Una "pagina" falsa que devuelve lo que digamos que quedo guardado.
const paginaQueGuardo = (texto) => ({
  __filas: [{ id_trabajo: 623309, descripcion: texto, editable: true, duracion: "3:35", cliente_asunto: "BSVV / Academicas" }],
});

const conCarpeta = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "glosas-"));
  try { return fn(join(dir, "procesadas.json")); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};

test("confirma cuando el texto guardado coincide", async () => {
  await conCarpeta(async (archivo) => {
    const enviado = "Elaboración del informe de brechas.";
    const r = await verificarGuardado(paginaQueGuardo(enviado), {
      id: 623309, textoEnviado: enviado, archivoRegistro: archivo, dia: "2026-09-22",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, true);
    assert.equal(leerRegistro(archivo)["623309"].glosa, enviado);
  });
});

test("NO confirma si TimeBilling guardo otra cosa, y no marca procesada", async () => {
  await conCarpeta(async (archivo) => {
    const r = await verificarGuardado(paginaQueGuardo("otra cosa completamente"), {
      id: 623309, textoEnviado: "Elaboración del informe de brechas.", archivoRegistro: archivo, dia: "2026-09-22",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, false);
    assert.deepEqual(leerRegistro(archivo), {}, "una glosa no verificada NUNCA se marca como procesada");
  });
});

test("NO confirma si la hora desaparecio del listado", async () => {
  await conCarpeta(async (archivo) => {
    const r = await verificarGuardado({ __filas: [] }, {
      id: 623309, textoEnviado: "x", archivoRegistro: archivo, dia: "2026-09-22",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, false);
    assert.deepEqual(leerRegistro(archivo), {});
  });
});

test("los espacios de los bordes no cuentan como diferencia", async () => {
  await conCarpeta(async (archivo) => {
    const r = await verificarGuardado(paginaQueGuardo("  Elaboración del informe.  "), {
      id: 623309, textoEnviado: "Elaboración del informe.", archivoRegistro: archivo, dia: "2026-09-22",
      leerFilas: async (p) => p.__filas,
    });
    assert.equal(r.confirmada, true);
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/escribir.test.mjs`

Expected: FAIL — `verificarGuardado is not exported` o el `tb.mjs` viejo revienta al importarse.

- [ ] **Step 3: Reescribir `tb.mjs` como CLI**

Reemplazar **todo** `puente/tb.mjs` por:

```javascript
#!/usr/bin/env node
// CLI de TimeBilling. Cada subcomando imprime SOLO JSON por stdout; lo que es
// para leer con ojos humanos va a stderr.
//
// Lo llama el agente (ver glosas-agente.md). El agente puede equivocarse
// redactando, pero no puede mentir sobre lo que quedo guardado: eso lo decide
// "escribir", releyendo la glosa desde TimeBilling.
//
// Salidas: 0 bien · 1 fallo tecnico · 2 sesion caducada.

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { conSesion, buscarDia, leerTrabajos, traerRango, aDDMMYYYY, SesionCaida } from "./lib/sesion.mjs";
import { leerRegistro, marcarProcesada } from "./lib/registro.mjs";
import { renderNota } from "./lib/nota.mjs";
import { buscarNotas } from "./lib/contexto.mjs";

const { TB_URL, TB_ID_USUARIO } = process.env;
const ZONA = "America/Santiago";
const BOVEDA = process.env.BOVEDA_GLOSAS ?? "C:/Users/dalamos/Obsidian/Segundo Cerebro/Notas Claude/Glosas";
const BOVEDA_NOTAS = process.env.BOVEDA_NOTAS ?? "C:/Users/dalamos/Obsidian/Segundo Cerebro/Notas Claude";
const DIAS_HISTORIAL = 90;
const EJEMPLOS_POR_ASUNTO = 10;

const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const salir = (datos) => { process.stdout.write(JSON.stringify(datos, null, 2) + "\n"); process.exit(0); };
const aviso = (t) => process.stderr.write(t + "\n");

// Comparar glosas: lo unico que se ignora son los espacios de los bordes. El
// modelo a veces devuelve un espacio inicial, y ese espacio se factura tal cual.
const igual = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();

// Exportada para poder probarla sin navegador: leerFilas se puede sustituir.
export async function verificarGuardado(pagina, { id, textoEnviado, dia, archivoRegistro, leerFilas = leerTrabajos }) {
  const filas = await leerFilas(pagina);
  const actual = filas.find((f) => String(f.id_trabajo) === String(id));
  if (!actual) return { confirmada: false, guardado: null, motivo: "la hora no aparece en el listado al releerla" };
  if (!igual(actual.descripcion, textoEnviado)) {
    return { confirmada: false, guardado: actual.descripcion, motivo: "TimeBilling guardó un texto distinto al enviado" };
  }
  // Solo lo verificado entra al registro.
  marcarProcesada(id, { dia, glosa: String(textoEnviado).trim() }, archivoRegistro);
  return { confirmada: true, guardado: actual.descripcion, motivo: null };
}

async function comandoDia(fecha) {
  const f = aDDMMYYYY(fecha);
  const todos = await conSesion(async (pagina) => {
    await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });
    return leerTrabajos(pagina);
  });
  const procesadas = leerRegistro();
  const cobradas = todos.filter((t) => !t.editable).length;
  const yaHechas = todos.filter((t) => t.editable && procesadas[String(t.id_trabajo)]).length;
  const trabajos = todos
    .filter((t) => t.editable && !procesadas[String(t.id_trabajo)])
    .map((t) => ({
      id_trabajo: t.id_trabajo, duracion: t.duracion,
      cliente_asunto: t.cliente_asunto, apunte: t.descripcion,
    }));
  salir({ dia: fecha, trabajos, cobradas, ya_procesadas: yaHechas });
}

async function comandoEjemplos(asunto, fecha) {
  const hasta = new Date(fecha);
  const desde = new Date(fecha);
  desde.setDate(desde.getDate() - DIAS_HISTORIAL);
  const historial = await conSesion((pagina) => traerRango(pagina, {
    url: TB_URL, idUsuario: TB_ID_USUARIO,
    desde: aDDMMYYYY(desde.toISOString()), hasta: aDDMMYYYY(hasta.toISOString()),
  }));
  // OJO: h.fecha sale de la celda del listado y se compara contra DD-MM-AAAA.
  // Si el fixture de la Task 1 muestra otro formato (por ejemplo con hora
  // pegada), ajusta esta comparacion: si no calza, el dia que se esta
  // redactando se cuela entre sus propios ejemplos.
  const ejemplos = historial
    .filter((h) => h.cliente_asunto === asunto && h.descripcion && h.fecha !== aDDMMYYYY(fecha))
    // Las mas largas muestran mejor el nivel de detalle que ella busca.
    .sort((a, b) => b.descripcion.length - a.descripcion.length)
    .slice(0, EJEMPLOS_POR_ASUNTO)
    // La duracion va al lado a proposito: sin ella el modelo calibra el largo a ojo.
    .map((h) => ({ duracion: h.duracion, glosa: h.descripcion }));
  salir({ asunto, ejemplos });
}

function comandoContexto(cliente) {
  const notas = buscarNotas([cliente], { carpeta: BOVEDA_NOTAS })
    .map(({ nota, texto }) => ({ nota, texto }));
  salir({ cliente, notas });
}

async function comandoEscribir(id, texto, fecha) {
  const f = aDDMMYYYY(fecha);
  const r = await conSesion(async (pagina) => {
    await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });

    const boton = pagina.locator(`[data-edit-job="${id}"]`).first();
    if (!(await boton.count())) {
      return { confirmada: false, guardado: null, motivo: "no hay botón de editar (la hora puede estar cobrada)" };
    }
    await boton.click();
    const caja = pagina.locator('textarea[name="descripcion"]').first();
    await caja.waitFor({ state: "visible", timeout: 15000 });
    // fill() dispara los eventos que el formulario escucha; asignar .value no.
    await caja.fill(texto);
    await pagina.locator('button.btn-primary:has-text("Guardar")').first().click();
    await pagina.waitForLoadState("networkidle").catch(() => {});
    await pagina.waitForTimeout(2500);

    // Al guardar, el listado se recarga: hay que rehacer la busqueda.
    await buscarDia(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde: f, hasta: f });
    return verificarGuardado(pagina, { id, textoEnviado: texto, dia: fecha });
  });
  salir({ id_trabajo: Number(id), ...r });
}

function comandoNota(argumentos) {
  let datos;
  if (argumentos[0] === "--fallo") {
    datos = { dia: hoy(), glosas: [], pendientes: [], cobradas: 0,
      fallos: [argumentos[1] ?? "la corrida falló sin dejar motivo", "Detalle en puente/registro/" + hoy() + ".txt"] };
  } else {
    datos = JSON.parse(readFileSync(argumentos[0], "utf8"));
  }
  mkdirSync(BOVEDA, { recursive: true });
  const archivo = join(BOVEDA, `${datos.dia}.md`);
  writeFileSync(archivo, renderNota(datos));
  salir({ archivo });
}

const [comando, ...resto] = process.argv.slice(2);

// El import desde las pruebas no debe ejecutar el CLI.
if (comando) {
  try {
    if (!TB_URL || !TB_ID_USUARIO) throw new Error("Faltan TB_URL o TB_ID_USUARIO en puente/.env");
    switch (comando) {
      case "dia":      await comandoDia(resto[0] ?? hoy()); break;
      case "ejemplos": await comandoEjemplos(resto[0], resto[1] ?? hoy()); break;
      case "contexto": comandoContexto(resto[0]); break;
      case "escribir": await comandoEscribir(resto[0], resto[1], resto[2] ?? hoy()); break;
      case "nota":     comandoNota(resto); break;
      default:
        aviso(`Subcomando desconocido: ${comando}`);
        aviso("Uso: tb.mjs dia <AAAA-MM-DD> | ejemplos <asunto> [fecha] | contexto <cliente> | escribir <id> <texto> [fecha] | nota <datos.json>|--fallo <motivo>");
        process.exit(1);
    }
  } catch (e) {
    aviso(e.message);
    process.exit(e instanceof SesionCaida ? 2 : 1);
  }
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node --test pruebas/escribir.test.mjs`

Expected: PASS, 4 pruebas. En especial la segunda: una glosa no verificada nunca entra a `procesadas.json`.

- [ ] **Step 5: Correr toda la batería**

Run: `cd C:/Users/dalamos/gestor-personal/puente; npm.cmd test`

Expected: PASS, 33 pruebas en 6 archivos.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/dalamos/gestor-personal
git add puente/tb.mjs puente/lib/contexto.mjs puente/pruebas/escribir.test.mjs puente/pruebas/contexto.test.mjs
git commit -m "tb.mjs como CLI; escribir solo confirma releyendo desde TimeBilling"
```

---

### Task 7: `glosas-agente.md` — el prompt

**Files:**
- Create: `puente/glosas-agente.md`

**Interfaces:**
- Consumes: el CLI de la Task 6.
- Produces: el prompt que `glosas-dia.cmd` (Task 8) le pasa a `claude -p` por stdin.

- [ ] **Step 1: Escribir el prompt**

Crear `puente/glosas-agente.md`:

```markdown
Eres el asistente de Dominga Álamos, abogada chilena del área Mercantil en el
estudio Barros, Silva, Varela & Vigil. Tu trabajo es convertir los apuntes
rápidos de su cronómetro en glosas facturables dentro de TimeBilling.

Estás corriendo solo, sin nadie mirando. Nadie va a contestarte preguntas.

## Herramientas

Corre siempre desde `C:/Users/dalamos/gestor-personal/puente`. Solo puedes usar
estos comandos, y devuelven JSON:

- `node tb.mjs dia AAAA-MM-DD` — horas de ese día que puedes editar. Las ya
  cobradas y las ya procesadas no aparecen: no existen para ti.
- `node tb.mjs ejemplos "<cliente / asunto>" AAAA-MM-DD` — hasta 10 glosas
  anteriores de ella en ese mismo asunto, con su duración al lado.
- `node tb.mjs contexto "<cliente>"` — hasta 5 notas completas de su bóveda que
  mencionen a ese cliente. Son contexto de lo que estuvo haciendo, **no son
  actuaciones facturables por sí solas**.
- `node tb.mjs escribir <id> "<texto>" AAAA-MM-DD` — guarda la glosa y la
  **relee desde TimeBilling**. Devuelve `confirmada: true` solo si el texto
  guardado coincide.
- `node tb.mjs nota <archivo.json>` — escribe la nota del día en la bóveda.

Código de salida 2 significa que la sesión de TimeBilling caducó. Eso no se
arregla reintentando: anótalo como fallo del día y sigue.

## Qué hacer

Procesa **primero el día de ayer, después el de hoy**. El repaso de ayer existe
porque ella a veces trabaja después de las 19:00.

Para cada uno de los dos días:

1. `node tb.mjs dia <fecha>`. Si no hay trabajos, anótalo y pasa al siguiente.
2. Para cada `cliente_asunto` distinto del día, pide sus `ejemplos` una vez. Si
   el apunte es corto y la hora larga, pide además `contexto` con el nombre del
   cliente (la parte anterior a la “/”).
3. Redacta **todas las glosas del día juntas**, no una por una. Si varias horas
   son del mismo asunto, reparte las actuaciones entre ellas en vez de escribir
   textos que se pisan.
4. Guarda una por una con `escribir`. Lee la respuesta.
   - `confirmada: true` → lista.
   - `confirmada: false` → reintenta **esa hora una sola vez**. Si vuelve a
     fallar, va a `pendientes` con su motivo y sigues con las demás. Una hora
     rota no se lleva el día.
5. Nunca digas que una glosa quedó guardada si `escribir` no te dijo
   `confirmada: true`.

Al terminar los dos días, escribe un solo archivo JSON temporal y pásaselo a
`node tb.mjs nota`. Su forma:

{
  "dia": "AAAA-MM-DD",
  "glosas":     [{"cliente_asunto": "", "duracion": "", "apunte": "", "glosa": ""}],
  "pendientes": [{"cliente_asunto": "", "duracion": "", "apunte": "", "glosa": "", "motivo": ""}],
  "cobradas": 0,
  "fallos": ["Repaso del AAAA-MM-DD: falló al leer (sesión caducada)."]
}

El `dia` de la nota es **hoy**. Lo que haya pasado con el repaso de ayer va en
`fallos` si falló, y sus glosas van en `glosas` si salieron bien.

## Cómo redactar

Lo más importante son las `glosas anteriores de este asunto`: las escribió ella.
Imita ese estilo, ese largo y ese nivel de detalle. Las reglas de abajo solo
describen lo que ya se ve en ellas.

- Español de Chile, registro profesional de estudio jurídico.
- Empieza con una **frase nominal**, nunca con un verbo conjugado:
  “Revisión de…”, “Preparación de…”, “Coordinación de…”, “Elaboración de…”.
  Nunca “Se revisa…” como apertura.
- Detallada: nombra el entregable concreto, el documento, la contraparte y las
  personas involucradas.
- Si hubo varias actuaciones, encadénalas: “Asimismo, se…”, “Por último, se…”.
- **El largo va con la duración.** Por eso los ejemplos vienen con la suya:
  mira cuánto escribe ella para 0:15 y cuánto para 3:00, y calibra con ese dato.
- Corrige ortografía, tildes, mayúsculas y nombres propios. El apellido correcto
  es “Chadwick”.
- Comillas tipográficas “ ”, nunca « ».
- Nunca dejes una glosa vacía.

**Sobre completar lo que el apunte no dice:** Dominga eligió explícitamente que
deduzcas libremente. Si el apunte es corto y la hora larga, usa el historial del
asunto para escribir una glosa completa y facturable. No te limites a repetir el
apunte.

El riesgo de esto es nombrar una sociedad o una actuación del asunto que no
corresponde a *ese* día. No lo evites escribiendo menos: la nota diaria deja el
apunte y la glosa lado a lado justamente para que ella lo revise.
```

- [ ] **Step 2: Verificar que el prompt no contradiga al CLI**

Run: `cd C:/Users/dalamos/gestor-personal/puente; grep -o "node tb.mjs [a-z]*" glosas-agente.md | sort -u`

Expected: exactamente `contexto`, `dia`, `ejemplos`, `escribir`, `nota`. Si aparece cualquier otro subcomando, el prompt está inventando herramientas que no existen.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/dalamos/gestor-personal
git add puente/glosas-agente.md
git commit -m "Prompt del agente de glosas"
```

---

### Task 8: `glosas-dia.cmd` — lanzar el agente y garantizar la nota

La garantía de “la nota se escribe siempre” vive acá, no en el agente: si el agente muere, el `.cmd` escribe la nota de fallo.

**Files:**
- Modify: `puente/glosas-dia.cmd` (se reescribe entero)

**Interfaces:**
- Consumes: `glosas-agente.md` (Task 7), `tb.mjs nota --fallo` (Task 6).
- Produces: el punto de entrada de la tarea de Windows.

- [ ] **Step 1: Reescribir el `.cmd`**

Reemplazar **todo** `puente/glosas-dia.cmd` por:

```bat
@echo off
REM Lanza el agente de glosas. La tarea de Windows "Glosas TimeBilling" lo corre
REM todos los dias a las 19:00, reintentando cada 30 min por 4 horas, mas una
REM pasada al iniciar sesion.
REM
REM El agente repasa AYER y despues HOY, y escribe el mismo la nota del dia.
REM Si el agente MUERE, la nota la escribe este archivo: esa es la garantia de
REM que una corrida rota igual deje rastro en la boveda.
REM
REM CUIDADO: el prompt va a claude por stdin (<), nunca como argumento. Como
REM argumento, cmd.exe destroza las comillas y los saltos de linea.

cd /d "%~dp0"
if not exist registro mkdir registro

for /f %%d in ('powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd')"') do set "HOY=%%d"
set "LOG=registro\%HOY%.txt"

echo ================================================== >> "%LOG%"
echo Corrida %DATE% %TIME% >> "%LOG%"
echo ================================================== >> "%LOG%"

call claude.cmd -p --allowed-tools "Bash(node tb.mjs *)" "Read" < glosas-agente.md >> "%LOG%" 2>&1

if errorlevel 1 goto fallo

echo. >> "%LOG%"
echo LISTO. >> "%LOG%"
exit /b 0

:fallo
echo. >> "%LOG%"
echo *** EL AGENTE TERMINO CON ERROR *** >> "%LOG%"
call node tb.mjs nota --fallo "El agente terminó con error y no alcanzó a escribir la nota" >> "%LOG%" 2>&1
exit /b 1
```

- [ ] **Step 2: Verificar que el `.cmd` detecta el fallo del agente**

Esta es la trampa que ya costó dos días de glosas en agosto de 2026: el `set "FALLO=1"` sin comillas dejaba el valor como `"1 "` y el bloque de fallo quedaba muerto. La versión de arriba usa `goto`, que no tiene ese problema, pero hay que comprobarlo:

Run: `cd C:/Users/dalamos/gestor-personal/puente; cmd /c "exit /b 1" ; if ($LASTEXITCODE -ne 1) { echo "MAL" } else { echo "bien" }`

Expected: `bien`. Confirma que `errorlevel` de un subproceso se propaga en este shell.

- [ ] **Step 3: Probar el camino de fallo de verdad**

Renombrar temporalmente el prompt para forzar el error, correr, y confirmar que la nota de fallo aparece:

```bash
cd C:/Users/dalamos/gestor-personal/puente
mv glosas-agente.md glosas-agente.md.bak
cmd /c glosas-dia.cmd
echo "salida: $?"
mv glosas-agente.md.bak glosas-agente.md
```

Expected: salida distinta de 0, y existe `Notas Claude/Glosas/<hoy>.md` con el ⚠️ y el motivo. **Después de comprobarlo, borra esa nota de fallo** para no dejar un día marcado como roto sin serlo.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/dalamos/gestor-personal
git add puente/glosas-dia.cmd
git commit -m "glosas-dia.cmd lanza el agente y garantiza la nota si el agente muere"
```

---

### Task 9: Limpieza — borrar lo que quedó sin uso

**Files:**
- Delete: `puente/glosas-leer.mjs`, `puente/redactar.mjs`, `puente/glosas-escribir.mjs`, `puente/ejemplos.mjs`, `puente/resumen.mjs`, `puente/registro-glosas.mjs`, `puente/avisar.mjs`
- Modify: `puente/package.json`
- Modify: `puente/README-glosas.md`
- Modify: `puente/instalar-tarea.ps1`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada nuevo.

- [ ] **Step 1: Comprobar que nadie los importa**

Run: `cd C:/Users/dalamos/gestor-personal/puente; grep -rn "glosas-leer\|redactar\|glosas-escribir\|ejemplos\.mjs\|resumen\|registro-glosas\|avisar" --include=*.mjs --include=*.cmd --include=*.json --include=*.ps1 . | grep -v node_modules`

Expected: sin resultados, o solo dentro de los archivos que se van a borrar. Si `cargar.mjs`, `descubrir.mjs` o `sincronizar-asuntos.mjs` importan alguno, **para y avisa**: esos scripts son del flujo viejo de carga de horas y no están en el alcance de este plan.

- [ ] **Step 2: Borrarlos**

```bash
cd C:/Users/dalamos/gestor-personal/puente
git rm glosas-leer.mjs redactar.mjs glosas-escribir.mjs ejemplos.mjs resumen.mjs registro-glosas.mjs avisar.mjs
```

- [ ] **Step 3: Limpiar `package.json`**

Quitar de `"scripts"` las entradas `"glosas"` y `"glosas-subir"`, que apuntan a archivos borrados. Dejar `configurar`, `configurar-auto`, `sincronizar`, `descubrir`, `cargar` y `test`.

- [ ] **Step 4: Correr la batería completa**

Run: `cd C:/Users/dalamos/gestor-personal/puente; npm.cmd test`

Expected: PASS, 33 pruebas. Si algo se rompe, es que un módulo importaba uno de los borrados.

- [ ] **Step 5: Actualizar el README**

En `puente/README-glosas.md`, reemplazar la tabla “Piezas” entera por esta:

```markdown
| Archivo | Que hace |
|---|---|
| `lib/listado.mjs` | Parseo del listado. Funcion pura que se inyecta en el navegador. |
| `lib/sesion.mjs` | Sesion, busqueda y paginacion. Reintenta el arranque en frio. |
| `lib/registro.mjs` | Registro de horas ya procesadas y verificadas. |
| `lib/contexto.mjs` | Notas de la boveda que mencionan al cliente. |
| `lib/nota.mjs` | Render de la nota diaria. |
| `tb.mjs` | CLI: `dia`, `ejemplos`, `contexto`, `escribir`, `nota`. |
| `glosas-agente.md` | El prompt del agente. |
| `glosas-dia.cmd` | Lanza el agente; si muere, escribe la nota de fallo. |
| `pruebas/` | `node --test`. El fixture es una pagina real guardada. |
| `configurar-auto.mjs` | Abre la ventana de login sin pedir Enter. |
| `instalar-tarea.ps1` | Tarea de Windows: diaria 19:00 con reintentos, y al iniciar sesion. |
```

Y en la sección “Uso” reemplazar los comandos viejos por:

```
npm.cmd run configurar-auto        # una vez, y cuando caduque la sesion
npm.cmd test                       # la bateria de pruebas
.\glosas-dia.cmd                   # la corrida completa: ayer y hoy
node tb.mjs dia 2026-09-22         # un dia puntual, sin modificar nada
```

Agregar una sección corta explicando que `avisar.mjs` se eliminó y que el canal
de aviso ahora es la nota diaria. Conservar tal cual las secciones “El fallo
mudo”, “Cómo funciona de verdad” y “Windows, dos trampas”: son conocimiento
ganado a costa de errores y siguen vigentes.

- [ ] **Step 6: Actualizar `instalar-tarea.ps1`**

Hoy el script registra la tarea L-V, pero el 22-09-2026 se cambió a diaria a las
19:00. Si alguien lo vuelve a correr, revierte el cambio. Además tiene un límite
de ejecución de 30 minutos que un agente puede superar con facilidad —los
scripts encadenados tardaban poco; el agente razona entre llamadas—.

Reemplazar el disparador de la tarde:

```powershell
$tarde = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At 19:00
```

por:

```powershell
$tarde = New-ScheduledTaskTrigger -Daily -At 19:00
```

Subir el límite de ejecución de 30 minutos a 2 horas:

```powershell
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)
```

Y corregir los tres textos que dicen “Lunes a viernes” o “L-V” (el comentario de
cabecera y las dos líneas de `Write-Host` del final) para que digan “todos los
días”.

**No correr el script todavía:** la tarea ya está bien configurada en el
sistema. Esto es para que reinstalarla reproduzca el estado actual.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/dalamos/gestor-personal
git add -A puente/
git commit -m "Borra los scripts del flujo viejo y actualiza README e instalador"
```

---

### Task 10: Prueba de humo end-to-end

Nada de lo anterior prueba que el agente funcione de verdad contra TimeBilling.

**Files:** ninguno.

**Interfaces:** consume todo.

- [ ] **Step 1: Verificar que el día de hoy ya está procesado**

Run: `cd C:/Users/dalamos/gestor-personal/puente; node -e "const r=require('./registro/procesadas.json'); console.log(Object.keys(r).length+' horas en el registro')"`

Expected: un número mayor que cero. El trabajo #623309 del 22-09-2026 ya está ahí.

- [ ] **Step 2: Corrida real**

Run: `cd C:/Users/dalamos/gestor-personal/puente; cmd /c glosas-dia.cmd`

Expected: salida 0. En `registro/<hoy>.txt` debe verse al agente llamando a `tb.mjs dia`, y las horas ya procesadas **no** deben aparecer para redactar.

- [ ] **Step 3: Comprobar que no reescribió lo ya pulido**

Run: `cd C:/Users/dalamos/gestor-personal/puente; git diff --stat; node -e "const r=require('./registro/procesadas.json'); console.log(r['623309'] ? r['623309'].glosa : 'NO ESTA')"`

Expected: la glosa de #623309 sigue siendo la del 22-09-2026, palabra por palabra. Si cambió, el filtro de `procesadas.json` no está funcionando y **hay que parar**: eso significa que la rutina reescribe glosas ya revisadas cada noche.

- [ ] **Step 4: Comprobar la nota**

Abrir `C:/Users/dalamos/Obsidian/Segundo Cerebro/Notas Claude/Glosas/<hoy>.md`.

Expected: existe, tiene el frontmatter, y su contenido concuerda con lo que dice el log. Si hay ⚠️, leer el motivo antes de dar por buena la corrida.

- [ ] **Step 5: Commit del estado final**

```bash
cd C:/Users/dalamos/gestor-personal
git add -A puente/
git commit -m "Agente de glosas verificado de punta a punta"
git push origin main
```

---

## Qué queda fuera de este plan

- **Servidor de navegador persistente.** Cada subcomando relanza Chromium. Con el reintento eso es correcto, solo lento. Si molesta, es otro cambio.
- **Reponer el aviso al gestor.** Requiere arreglar `SUPABASE_SERVICE_ROLE_KEY` en `gestor-personal/.env.local`, que hoy tiene la clave anon. Vale la pena revisar la misma variable en Vercel: si allá está igual, el buzón de correo y los crons fallan del mismo modo.
- **Confirmar si TimeBillingX pisa la glosa al re-sincronizar.** Pendiente desde agosto de 2026. Si resulta que sí, la rutina debe correr con la app de escritorio cerrada.
