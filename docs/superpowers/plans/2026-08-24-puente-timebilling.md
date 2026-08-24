# Puente TimeBilling — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar horas de trabajo con un cronómetro en `gestor-personal` y cargarlas en TimeBilling mediante un puente local que opera sobre la sesión web autenticada.

**Architecture:** Tres piezas en la app desplegada (tabla `horas` en Supabase, cronómetro con Server Actions en `app/horas`, redacción por plantilla con pulido opcional vía API de Claude) y una cuarta solo local (`puente/`, Node + Playwright) que lee las horas aprobadas desde Supabase y las escribe en TimeBilling. El puente lee y escribe Supabase directamente con la cuenta de la usuaria; las RLS existentes filtran por `user_id`, así que no hay endpoints nuevos ni service keys en disco.

**Tech Stack:** Next.js 16 (App Router), React 19, Supabase (`@supabase/ssr`), TypeScript 5, Tailwind 4, `node:test` + `tsx` para pruebas, Playwright y `@supabase/supabase-js` para el puente, `@anthropic-ai/sdk` para el pulido.

**Spec:** `docs/superpowers/specs/2026-08-24-puente-timebilling-design.md`

## Global Constraints

- Todo el código y la UI en español de Chile. Nombres de archivos, funciones, columnas y rutas en español, siguiendo los módulos existentes (`acciones.ts`, `tabla.tsx`, `page.tsx`).
- Zona horaria `America/Santiago` para toda fecha que se muestre o se envíe a TimeBilling. Las columnas son `timestamptz`; la conversión a fecha local se hace con `Intl.DateTimeFormat` con `timeZone`, nunca con `.toISOString().slice(0,10)`.
- Formatos chilenos vía `lib/formato.ts`: fechas DD-MM-AAAA, miles con punto.
- Unidad de facturación: la décima de hora (6 minutos). Toda duración se redondea **hacia arriba** al múltiplo de 6.
- Modelo de IA: `claude-opus-5`. No sustituir por otro modelo.
- El módulo de horas debe funcionar completo sin `ANTHROPIC_API_KEY`. La ausencia de la key oculta el botón de pulido; no rompe nada más.
- `puente/` nunca se despliega: excluido del build y con su propio `package.json`.
- Ningún archivo del repo contiene la contraseña de TimeBilling. La escribe la usuaria en la ventana del navegador.
- Nada sale del estado `cargada`.

**Qué no se prueba automáticamente, y por qué:** las Server Actions y la migración tocan Supabase, y el proyecto no tiene base de pruebas ni contenedor local configurado. Montar eso es un proyecto en sí. En su lugar, toda la lógica de decisión (redondeo, transiciones de estado, fecha local, plantillas, construcción del payload) vive en funciones puras en `lib/` que sí se prueban, y las Server Actions quedan como envoltorios delgados que solo hacen I/O. La restricción de un solo cronómetro corriendo se verifica a mano con el comando documentado en la Tarea 3.

---

### Task 1: Arnés de pruebas y lógica pura de horas

Primera tarea porque todo lo demás se apoya en estas funciones y en poder correr `npm test`.

**Files:**
- Modify: `package.json`
- Create: `lib/horas.ts`
- Test: `lib/horas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `DECIMA_MIN: number` (= 6)
  - `redondearDecima(minutos: number): number`
  - `type EstadoHora = "corriendo" | "borrador" | "aprobada" | "cargada" | "error"`
  - `transicionValida(desde: EstadoHora, hasta: EstadoHora): boolean`
  - `fechaLocalChile(instante: string | Date): string` — devuelve `AAAA-MM-DD`
  - `minutosEntre(inicio: string | Date, fin: string | Date): number`

- [ ] **Step 1: Instalar el arnés de pruebas**

```bash
npm install --save-dev tsx
```

- [ ] **Step 2: Agregar el script de pruebas**

En `package.json`, dentro de `"scripts"`, agregar la línea `test`:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --import tsx --test \"lib/*.test.ts\""
  },
```

- [ ] **Step 3: Escribir las pruebas que fallan**

Crear `lib/horas.test.ts`:

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { redondearDecima, transicionValida, fechaLocalChile, minutosEntre } from "./horas";

test("redondearDecima sube al múltiplo de 6 más cercano hacia arriba", () => {
  assert.equal(redondearDecima(1), 6);
  assert.equal(redondearDecima(6), 6);
  assert.equal(redondearDecima(7), 12);
  assert.equal(redondearDecima(60), 60);
  assert.equal(redondearDecima(61), 66);
});

test("redondearDecima nunca devuelve cero para trabajo real", () => {
  assert.equal(redondearDecima(0.1), 6);
});

test("redondearDecima devuelve 0 solo para 0", () => {
  assert.equal(redondearDecima(0), 0);
});

test("transicionValida acepta el camino feliz", () => {
  assert.ok(transicionValida("corriendo", "borrador"));
  assert.ok(transicionValida("borrador", "aprobada"));
  assert.ok(transicionValida("aprobada", "cargada"));
});

test("transicionValida acepta las vueltas atrás permitidas", () => {
  assert.ok(transicionValida("aprobada", "borrador"));
  assert.ok(transicionValida("aprobada", "error"));
  assert.ok(transicionValida("error", "aprobada"));
});

test("transicionValida cierra el estado cargada", () => {
  assert.equal(transicionValida("cargada", "borrador"), false);
  assert.equal(transicionValida("cargada", "aprobada"), false);
  assert.equal(transicionValida("cargada", "error"), false);
});

test("transicionValida rechaza saltarse la revisión", () => {
  assert.equal(transicionValida("corriendo", "aprobada"), false);
  assert.equal(transicionValida("borrador", "cargada"), false);
});

test("fechaLocalChile usa el día chileno, no el UTC", () => {
  // 2026-08-25T01:30:00Z son las 21:30 del 24 en Chile (UTC-4)
  assert.equal(fechaLocalChile("2026-08-25T01:30:00Z"), "2026-08-24");
});

test("fechaLocalChile no adelanta el día dentro de la jornada", () => {
  assert.equal(fechaLocalChile("2026-08-24T13:00:00Z"), "2026-08-24");
});

test("minutosEntre cuenta los minutos transcurridos", () => {
  assert.equal(minutosEntre("2026-08-24T10:00:00Z", "2026-08-24T11:30:00Z"), 90);
});

test("minutosEntre nunca devuelve negativo", () => {
  assert.equal(minutosEntre("2026-08-24T11:00:00Z", "2026-08-24T10:00:00Z"), 0);
});
```

- [ ] **Step 4: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL — `Cannot find module './horas'`

- [ ] **Step 5: Escribir la implementación mínima**

Crear `lib/horas.ts`:

```typescript
// Lógica pura del módulo de horas: redondeo a décimas, transiciones de estado
// y fechas en hora de Chile. Sin I/O, para poder probarlo directo.

const ZONA = "America/Santiago";

export const DECIMA_MIN = 6;

export type EstadoHora = "corriendo" | "borrador" | "aprobada" | "cargada" | "error";

// Los estudios facturan en décimas de hora; siempre hacia arriba.
export function redondearDecima(minutos: number): number {
  if (minutos <= 0) return 0;
  return Math.ceil(minutos / DECIMA_MIN) * DECIMA_MIN;
}

const TRANSICIONES: Record<EstadoHora, EstadoHora[]> = {
  corriendo: ["borrador"],
  borrador: ["aprobada"],
  aprobada: ["borrador", "cargada", "error"],
  cargada: [], // una hora ya escrita en facturación no se toca desde acá
  error: ["aprobada"],
};

export function transicionValida(desde: EstadoHora, hasta: EstadoHora): boolean {
  return TRANSICIONES[desde].includes(hasta);
}

// AAAA-MM-DD del día chileno. Nunca usar toISOString(): a las 21:00 de Chile
// el UTC ya está en el día siguiente y la hora se cargaría con fecha errada.
export function fechaLocalChile(instante: string | Date): string {
  const d = typeof instante === "string" ? new Date(instante) : instante;
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d);
}

export function minutosEntre(inicio: string | Date, fin: string | Date): number {
  const a = typeof inicio === "string" ? new Date(inicio) : inicio;
  const b = typeof fin === "string" ? new Date(fin) : fin;
  const min = Math.round((b.getTime() - a.getTime()) / 60000);
  return min > 0 ? min : 0;
}
```

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS, 11 pruebas.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/horas.ts lib/horas.test.ts
git commit -m "Arnes de pruebas y logica pura de horas"
```

---

### Task 2: Plantillas de descripción

**Files:**
- Create: `lib/plantillas-horas.ts`
- Test: `lib/plantillas-horas.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type TipoTrabajo` — unión de los códigos
  - `TIPOS_TRABAJO: { codigo: TipoTrabajo; etiqueta: string; plantilla: string }[]`
  - `plantillaDe(codigo: string): string`
  - `tieneMarcadores(texto: string): boolean`

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `lib/plantillas-horas.test.ts`:

```typescript
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
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npm test`
Expected: FAIL — `Cannot find module './plantillas-horas'`

- [ ] **Step 3: Escribir la implementación**

Crear `lib/plantillas-horas.ts`:

```typescript
// Plantillas base para la descripción de un trabajo. Los {marcadores} quedan
// visibles en el borrador: rellenarlos es el trabajo manual mínimo.

export type TipoTrabajo =
  | "reunion" | "revision" | "redaccion" | "estudio"
  | "gestion" | "llamada" | "correo" | "general";

export const TIPOS_TRABAJO: { codigo: TipoTrabajo; etiqueta: string; plantilla: string }[] = [
  { codigo: "reunion",   etiqueta: "Reunión",   plantilla: "Reunión con {contraparte} para tratar {materia}." },
  { codigo: "revision",  etiqueta: "Revisión",  plantilla: "Revisión de {documento} y preparación de observaciones." },
  { codigo: "redaccion", etiqueta: "Redacción", plantilla: "Redacción de {documento}." },
  { codigo: "estudio",   etiqueta: "Estudio",   plantilla: "Estudio de antecedentes sobre {materia}." },
  { codigo: "gestion",   etiqueta: "Gestión",   plantilla: "Gestión de {tramite} ante {organismo}." },
  { codigo: "llamada",   etiqueta: "Llamada",   plantilla: "Llamada telefónica con {contraparte} sobre {materia}." },
  { codigo: "correo",    etiqueta: "Correos",   plantilla: "Análisis y respuesta de correos sobre {materia}." },
  { codigo: "general",   etiqueta: "General",   plantilla: "" },
];

export function plantillaDe(codigo: string): string {
  return TIPOS_TRABAJO.find((t) => t.codigo === codigo)?.plantilla ?? "";
}

// Un marcador es {palabra}. Sirve para no dejar aprobar una descripción a medias.
export function tieneMarcadores(texto: string): boolean {
  return /\{[^}]+\}/.test(texto);
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npm test`
Expected: PASS, 18 pruebas en total.

- [ ] **Step 5: Commit**

```bash
git add lib/plantillas-horas.ts lib/plantillas-horas.test.ts
git commit -m "Plantillas de descripcion por tipo de trabajo"
```

---

### Task 3: Migración de base de datos

**Files:**
- Create: `supabase/migrations/20260824000001_horas.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tablas `public.horas` y `public.tb_proyectos` con RLS por propietaria y el índice parcial `horas_una_corriendo`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260824000001_horas.sql`:

```sql
-- Registro de horas y caché de proyectos de TimeBilling.

create table if not exists public.tb_proyectos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  proyecto_id integer not null,
  codigo text,
  nombre text not null,
  cliente text,
  activo boolean not null default true,
  sincronizado_en timestamptz not null default now(),
  unique (user_id, proyecto_id)
);

create table if not exists public.horas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  inicio timestamptz not null default now(),
  fin timestamptz,
  duracion_min integer check (duracion_min > 0),
  proyecto_id integer,
  tipo_trabajo text not null default 'general',
  descripcion text not null default '',
  facturable boolean not null default true,
  estado text not null default 'corriendo'
    check (estado in ('corriendo','borrador','aprobada','cargada','error')),
  tb_time_entry_id integer,
  cargada_en timestamptz,
  error_carga text,
  creado_en timestamptz not null default now()
);

-- Un solo cronómetro corriendo por persona, garantizado por la base de datos.
create unique index if not exists horas_una_corriendo
  on public.horas (user_id) where estado = 'corriendo';

create index if not exists horas_estado_inicio
  on public.horas (user_id, estado, inicio desc);

-- RLS: solo la dueña ve y toca sus filas (mismo patrón que el esquema inicial)
do $$
declare t text;
begin
  foreach t in array array['horas','tb_proyectos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy "propietaria_%1$s" on public.%1$I
        for all using (user_id = auth.uid()) with check (user_id = auth.uid())
    $f$, t);
  end loop;
end $$;
```

- [ ] **Step 2: Aplicar la migración**

Run: `npx supabase db push`
Expected: aplica `20260824000001_horas.sql` sin error.

- [ ] **Step 3: Verificar a mano la restricción de un solo cronómetro**

Esta es la única verificación manual del plan, porque no hay base de pruebas.
En el editor SQL de Supabase, con la sesión de la usuaria:

```sql
insert into public.horas (tipo_trabajo) values ('general');
insert into public.horas (tipo_trabajo) values ('reunion');  -- debe fallar
```

Expected: el segundo `insert` falla con
`duplicate key value violates unique constraint "horas_una_corriendo"`.
Después, limpiar: `delete from public.horas where estado = 'corriendo';`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260824000001_horas.sql
git commit -m "Migracion: tablas horas y tb_proyectos con RLS"
```

---

### Task 4: Server Actions del cronómetro

**Files:**
- Create: `app/horas/acciones.ts`

**Interfaces:**
- Consumes: `redondearDecima`, `minutosEntre`, `EstadoHora`, `transicionValida` de `lib/horas`; `plantillaDe`, `tieneMarcadores` de `lib/plantillas-horas`; `clienteServidor` de `lib/supabase/servidor`.
- Produces (todas Server Actions, todas lanzan `Error` con mensaje en español al fallar):
  - `iniciarCronometro(datos: FormData): Promise<void>` — lee `tipo_trabajo`, `proyecto_id`
  - `detenerCronometro(): Promise<void>`
  - `actualizarHora(id: string, datos: FormData): Promise<void>`
  - `aprobarHora(id: string): Promise<void>`
  - `desaprobarHora(id: string): Promise<void>`
  - `eliminarHora(id: string): Promise<void>`

- [ ] **Step 1: Escribir las acciones**

Crear `app/horas/acciones.ts`:

```typescript
"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";
import { redondearDecima, minutosEntre, transicionValida, type EstadoHora } from "@/lib/horas";
import { plantillaDe, tieneMarcadores } from "@/lib/plantillas-horas";

// Cambia el estado de una hora validando la transición contra la máquina de
// estados. Devuelve la fila anterior por si hace falta.
async function moverEstado(id: string, hasta: EstadoHora, campos: Record<string, unknown> = {}) {
  const supabase = await clienteServidor();
  const { data: fila, error: errorLectura } = await supabase
    .from("horas").select("estado").eq("id", id).single();
  if (errorLectura) throw new Error(errorLectura.message);

  const desde = fila.estado as EstadoHora;
  if (!transicionValida(desde, hasta)) {
    throw new Error(`No se puede pasar de ${desde} a ${hasta}.`);
  }

  const { error } = await supabase.from("horas").update({ estado: hasta, ...campos }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/horas");
}

export async function iniciarCronometro(datos: FormData) {
  const supabase = await clienteServidor();
  const proyecto = datos.get("proyecto_id");
  const { error } = await supabase.from("horas").insert({
    tipo_trabajo: String(datos.get("tipo_trabajo") || "general"),
    proyecto_id: proyecto ? Number(proyecto) : null,
    estado: "corriendo",
  });
  if (error) {
    // El índice parcial horas_una_corriendo es la garantía real; traducimos su
    // error de Postgres a algo legible en vez de mostrarlo crudo.
    if (error.code === "23505") throw new Error("Ya tienes un cronómetro corriendo.");
    throw new Error(error.message);
  }
  revalidatePath("/horas");
}

export async function detenerCronometro() {
  const supabase = await clienteServidor();
  const { data: fila, error: errorLectura } = await supabase
    .from("horas").select("id, inicio, tipo_trabajo, descripcion")
    .eq("estado", "corriendo").maybeSingle();
  if (errorLectura) throw new Error(errorLectura.message);
  if (!fila) throw new Error("No hay ningún cronómetro corriendo.");

  const fin = new Date();
  const duracion = redondearDecima(minutosEntre(fila.inicio, fin));
  const descripcion = fila.descripcion || plantillaDe(fila.tipo_trabajo);

  const { error } = await supabase.from("horas").update({
    fin: fin.toISOString(),
    duracion_min: duracion,
    descripcion,
    estado: "borrador",
  }).eq("id", fila.id);
  if (error) throw new Error(error.message);
  revalidatePath("/horas");
}

export async function actualizarHora(id: string, datos: FormData) {
  const supabase = await clienteServidor();
  const proyecto = datos.get("proyecto_id");
  const duracion = datos.get("duracion_min");
  const { error } = await supabase.from("horas").update({
    proyecto_id: proyecto ? Number(proyecto) : null,
    duracion_min: duracion ? redondearDecima(Number(duracion)) : null,
    tipo_trabajo: String(datos.get("tipo_trabajo") || "general"),
    descripcion: String(datos.get("descripcion") || ""),
    facturable: datos.get("facturable") === "on",
  }).eq("id", id).in("estado", ["borrador", "aprobada", "error"]);
  if (error) throw new Error(error.message);
  revalidatePath("/horas");
}

export async function aprobarHora(id: string) {
  const supabase = await clienteServidor();
  const { data: fila, error } = await supabase
    .from("horas").select("proyecto_id, duracion_min, descripcion").eq("id", id).single();
  if (error) throw new Error(error.message);

  if (!fila.proyecto_id) throw new Error("Falta el proyecto de TimeBilling.");
  if (!fila.duracion_min) throw new Error("Falta la duración.");
  if (!fila.descripcion.trim()) throw new Error("Falta la descripción.");
  if (tieneMarcadores(fila.descripcion)) {
    throw new Error("La descripción todavía tiene campos sin rellenar.");
  }

  await moverEstado(id, "aprobada", { error_carga: null });
}

export async function desaprobarHora(id: string) {
  await moverEstado(id, "borrador");
}

export async function eliminarHora(id: string) {
  const supabase = await clienteServidor();
  const { error } = await supabase
    .from("horas").delete().eq("id", id).in("estado", ["borrador", "error"]);
  if (error) throw new Error(error.message);
  revalidatePath("/horas");
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/horas/acciones.ts
git commit -m "Server Actions del cronometro de horas"
```

---

### Task 5: Pantalla de horas

**Files:**
- Create: `app/horas/page.tsx`
- Create: `app/horas/cronometro.tsx`
- Create: `app/horas/tabla.tsx`
- Create: `app/horas/pulir.tsx` (stub; la Tarea 6 lo reemplaza)
- Modify: `componentes/navegacion.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: todas las acciones de la Tarea 4; `TIPOS_TRABAJO` de `lib/plantillas-horas`; `fecha`, `fechaHora` de `lib/formato`.
- Produces:
  - `type Hora` exportado desde `app/horas/tabla.tsx`
  - `<Cronometro corriendo={...} proyectos={...} />`
  - `<TablaHoras filas={...} proyectos={...} />`

- [ ] **Step 1: Agregar la sección a la navegación**

En `componentes/navegacion.tsx`, agregar `/horas` a `SECCIONES` justo después de `/calendario`:

```typescript
  { ruta: "/calendario", nombre: "Calendario" },
  { ruta: "/horas", nombre: "Horas" },
  { ruta: "/cuentas", nombre: "Cuentas" },
```

y a `FONDOS`, en la misma posición:

```typescript
  "/calendario": "fondo--celeste",
  "/horas": "fondo--amarillo",
  "/cuentas": "fondo--rosa",
```

- [ ] **Step 2: Agregar el fondo amarillo**

En `app/globals.css`, junto a las otras clases `.fondo--`:

```css
.fondo--amarillo { --fondo: var(--amarillo); }
```

- [ ] **Step 3: Escribir el cronómetro**

Crear `app/horas/cronometro.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { TIPOS_TRABAJO } from "@/lib/plantillas-horas";
import { iniciarCronometro, detenerCronometro } from "./acciones";

type Corriendo = { id: string; inicio: string; tipo_trabajo: string } | null;
type Proyecto = { proyecto_id: number; nombre: string; cliente: string | null };

// El transcurrido se calcula desde `inicio`, que vive en la base de datos.
// Recargar la página no pierde nada: no hay estado de cronómetro en el cliente.
function transcurrido(inicio: string): string {
  const seg = Math.max(0, Math.floor((Date.now() - new Date(inicio).getTime()) / 1000));
  const h = String(Math.floor(seg / 3600)).padStart(2, "0");
  const m = String(Math.floor((seg % 3600) / 60)).padStart(2, "0");
  const s = String(seg % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function Cronometro({ corriendo, proyectos }: { corriendo: Corriendo; proyectos: Proyecto[] }) {
  const [reloj, setReloj] = useState(corriendo ? transcurrido(corriendo.inicio) : "00:00:00");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!corriendo) return;
    const t = setInterval(() => setReloj(transcurrido(corriendo.inicio)), 1000);
    return () => clearInterval(t);
  }, [corriendo]);

  async function detener() {
    setError(null);
    try {
      await detenerCronometro();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo detener.");
    }
  }

  if (corriendo) {
    return (
      <div className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
        <p style={{ fontSize: "2.5rem", fontVariantNumeric: "tabular-nums", margin: 0 }}>{reloj}</p>
        <p className="bajada" style={{ marginTop: 0 }}>
          {TIPOS_TRABAJO.find((t) => t.codigo === corriendo.tipo_trabajo)?.etiqueta ?? "General"} en curso
        </p>
        <button className="pill pill--primaria" onClick={detener}>Detener</button>
        {error && <p className="vacio">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card card--destacada revelar" style={{ marginBottom: "2rem" }}>
      <form action={iniciarCronometro} className="formulario">
        <label className="campo">
          Tipo de trabajo
          <select name="tipo_trabajo" defaultValue="general">
            {TIPOS_TRABAJO.map((t) => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
          </select>
        </label>
        <label className="campo">
          Proyecto
          <select name="proyecto_id" defaultValue="">
            <option value="">— elegir después —</option>
            {proyectos.map((p) => (
              <option key={p.proyecto_id} value={p.proyecto_id}>
                {p.nombre}{p.cliente ? ` · ${p.cliente}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button className="pill pill--primaria">Empezar</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Escribir la tabla**

Crear `app/horas/tabla.tsx`:

```typescript
"use client";

import { useState } from "react";
import { fecha } from "@/lib/formato";
import { TIPOS_TRABAJO } from "@/lib/plantillas-horas";
import { actualizarHora, aprobarHora, desaprobarHora, eliminarHora } from "./acciones";
import { PulirDescripcion } from "./pulir";

export type Hora = {
  id: string; inicio: string; fin: string | null; duracion_min: number | null;
  proyecto_id: number | null; tipo_trabajo: string; descripcion: string;
  facturable: boolean; estado: string; tb_time_entry_id: number | null;
  cargada_en: string | null; error_carga: string | null;
};
type Proyecto = { proyecto_id: number; nombre: string; cliente: string | null };

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: "Borrador", aprobada: "Aprobada", cargada: "Cargada", error: "Error",
};

function horasYMinutos(min: number | null): string {
  if (!min) return "—";
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

export function TablaHoras({ filas, proyectos, pulidoDisponible }: {
  filas: Hora[]; proyectos: Proyecto[]; pulidoDisponible: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  async function intentar(accion: () => Promise<void>) {
    setError(null);
    try { await accion(); } catch (e) {
      setError(e instanceof Error ? e.message : "Algo salió mal.");
    }
  }

  const porCargar = filas.filter((f) => f.estado === "aprobada").length;
  const totalMin = filas.filter((f) => f.estado !== "cargada")
    .reduce((s, f) => s + (f.duracion_min ?? 0), 0);

  if (filas.length === 0) {
    return <p className="vacio">Ninguna hora registrada todavía. <em>Parte el cronómetro.</em></p>;
  }

  return (
    <>
      <div className="kpis">
        <div className="card kpi revelar"><b>{horasYMinutos(totalMin)}</b><span>Sin cargar</span></div>
        <div className="card kpi revelar"><b>{porCargar}</b><span>Listas para el puente</span></div>
        <div className="card kpi revelar"><b>{filas.filter((f) => f.estado === "cargada").length}</b><span>Ya en TimeBilling</span></div>
      </div>

      {error && <p className="vacio">{error}</p>}

      <table className="tabla">
        <thead>
          <tr><th>Fecha</th><th>Tipo</th><th>Proyecto</th><th>Descripción</th>
              <th className="num">Duración</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.id}>
              <td>{fecha(f.inicio)}</td>
              <td>{TIPOS_TRABAJO.find((t) => t.codigo === f.tipo_trabajo)?.etiqueta ?? f.tipo_trabajo}</td>
              <td>{proyectos.find((p) => p.proyecto_id === f.proyecto_id)?.nombre ?? (f.proyecto_id ?? "—")}</td>
              <td>
                {f.descripcion || <em>sin descripción</em>}
                {f.error_carga && <><br /><small>{f.error_carga}</small></>}
              </td>
              <td className="num">{horasYMinutos(f.duracion_min)}</td>
              <td>{ETIQUETA_ESTADO[f.estado] ?? f.estado}</td>
              <td>
                {f.estado === "cargada" ? (
                  <small>#{f.tb_time_entry_id}</small>
                ) : (
                  <>
                    <button className="pill pill--mini" onClick={() => setAbierta(abierta === f.id ? null : f.id)}>
                      Editar
                    </button>
                    {f.estado === "aprobada" ? (
                      <button className="pill pill--mini" onClick={() => intentar(() => desaprobarHora(f.id))}>
                        Desaprobar
                      </button>
                    ) : (
                      <button className="pill pill--mini" onClick={() => intentar(() => aprobarHora(f.id))}>
                        Aprobar
                      </button>
                    )}
                    <button className="pill pill--mini" onClick={() => intentar(() => eliminarHora(f.id))}>
                      Borrar
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {abierta && (() => {
        const f = filas.find((x) => x.id === abierta)!;
        return (
          <div className="card revelar" style={{ marginTop: "1.5rem" }}>
            <form action={actualizarHora.bind(null, f.id)} className="formulario">
              <label className="campo">
                Tipo
                <select name="tipo_trabajo" defaultValue={f.tipo_trabajo}>
                  {TIPOS_TRABAJO.map((t) => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}
                </select>
              </label>
              <label className="campo">
                Proyecto
                <select name="proyecto_id" defaultValue={f.proyecto_id ?? ""}>
                  <option value="">— sin proyecto —</option>
                  {proyectos.map((p) => (
                    <option key={p.proyecto_id} value={p.proyecto_id}>{p.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="campo">
                Minutos
                <input name="duracion_min" type="number" min="6" step="6" defaultValue={f.duracion_min ?? 6} />
              </label>
              <label className="campo" style={{ gridColumn: "1 / -1" }}>
                Descripción
                <textarea name="descripcion" rows={3} defaultValue={f.descripcion} />
              </label>
              <label className="campo">
                Facturable
                <input name="facturable" type="checkbox" defaultChecked={f.facturable} />
              </label>
              <button className="pill pill--primaria">Guardar</button>
            </form>
            {pulidoDisponible && <PulirDescripcion id={f.id} />}
          </div>
        );
      })()}
    </>
  );
}
```

- [ ] **Step 5: Escribir la página**

Crear `app/horas/page.tsx`:

```typescript
import { clienteServidor } from "@/lib/supabase/servidor";
import { Cronometro } from "./cronometro";
import { TablaHoras, type Hora } from "./tabla";

export const dynamic = "force-dynamic";

export default async function Horas() {
  const supabase = await clienteServidor();
  const { data: filas } = await supabase
    .from("horas").select("*").order("inicio", { ascending: false }).limit(500);
  const { data: proyectos } = await supabase
    .from("tb_proyectos").select("proyecto_id, nombre, cliente").eq("activo", true).order("nombre");

  const todas = (filas ?? []) as Hora[];
  const corriendo = todas.find((f) => f.estado === "corriendo") ?? null;
  const resto = todas.filter((f) => f.estado !== "corriendo");

  return (
    <main>
      <h1 className="titulo">Mis <em>horas</em></h1>
      <p className="bajada">Cronómetro, revisión y carga a TimeBilling. Nada se envía sin que lo apruebes.</p>

      <Cronometro
        corriendo={corriendo ? { id: corriendo.id, inicio: corriendo.inicio, tipo_trabajo: corriendo.tipo_trabajo } : null}
        proyectos={proyectos ?? []}
      />

      <TablaHoras
        filas={resto}
        proyectos={proyectos ?? []}
        pulidoDisponible={Boolean(process.env.ANTHROPIC_API_KEY)}
      />
    </main>
  );
}
```

- [ ] **Step 6: Verificar que compila y se ve**

Run: `npx tsc --noEmit`
Expected: un error — `Cannot find module './pulir'`. Es esperado: `pulir.tsx` llega en la Tarea 6.
Para cerrar esta tarea, crear el stub mínimo `app/horas/pulir.tsx`:

```typescript
"use client";

export function PulirDescripcion({ id }: { id: string }) {
  return <input type="hidden" data-hora={id} />;
}
```

Volver a correr `npx tsc --noEmit`.
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add app/horas componentes/navegacion.tsx app/globals.css
git commit -m "Pantalla de horas: cronometro, tabla y edicion"
```

---

### Task 6: Pulido de la descripción con IA

Reemplaza el stub de `pulir.tsx` por el componente real y agrega la Server Action.

**Files:**
- Modify: `package.json`
- Create: `app/horas/pulir-accion.ts`
- Modify: `app/horas/pulir.tsx` (reemplazo completo del stub)

**Interfaces:**
- Consumes: `clienteServidor`; la fila `horas` por `id`.
- Produces: `pulirDescripcion(id: string): Promise<string>` — devuelve el texto pulido y ya lo guardó en la fila.

- [ ] **Step 1: Instalar el SDK**

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Escribir la Server Action**

Crear `app/horas/pulir-accion.ts`:

```typescript
"use server";

import Anthropic from "@anthropic-ai/sdk";
import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";

const SISTEMA = `Reescribes descripciones de trabajo para el registro de horas de un
estudio de abogados chileno.

Reglas:
- Español de Chile, registro profesional, tercera persona impersonal.
- Una o dos oraciones. Sin viñetas, sin encabezados, sin comillas.
- No inventes NADA que no esté en el texto de entrada: ni nombres, ni fechas,
  ni materias, ni partes, ni montos. Si el texto es vago, entrega una versión
  vaga pero bien redactada.
- Si quedan marcadores entre llaves, déjalos tal cual.
- Responde solo con la descripción. Nada más.`;

export async function pulirDescripcion(id: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta ANTHROPIC_API_KEY; el pulido no está disponible.");
  }

  const supabase = await clienteServidor();
  const { data: fila, error: errorLectura } = await supabase
    .from("horas").select("descripcion, estado").eq("id", id).single();
  if (errorLectura) throw new Error(errorLectura.message);
  if (fila.estado === "cargada") throw new Error("Esta hora ya se cargó; no se edita.");
  if (!fila.descripcion.trim()) throw new Error("Escribe algo antes de pulir.");

  const cliente = new Anthropic();
  const respuesta = await cliente.messages.create({
    model: "claude-opus-5",
    max_tokens: 1000,
    system: SISTEMA,
    messages: [{ role: "user", content: fila.descripcion }],
  });

  const texto = respuesta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  if (!texto) throw new Error("El modelo no devolvió texto; se mantiene la descripción original.");

  const { error } = await supabase.from("horas").update({ descripcion: texto }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/horas");
  return texto;
}
```

- [ ] **Step 3: Reemplazar el stub por el componente real**

Sobrescribir `app/horas/pulir.tsx`:

```typescript
"use client";

import { useState, useTransition } from "react";
import { pulirDescripcion } from "./pulir-accion";

export function PulirDescripcion({ id }: { id: string }) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  function pulir() {
    setMensaje(null);
    iniciar(async () => {
      try {
        await pulirDescripcion(id);
        setMensaje("Descripción pulida.");
      } catch (e) {
        setMensaje(e instanceof Error ? e.message : "No se pudo pulir.");
      }
    });
  }

  return (
    <p style={{ marginTop: "1rem" }}>
      <button className="pill pill--mini" onClick={pulir} disabled={pendiente}>
        {pendiente ? "Puliendo…" : "Pulir con IA"}
      </button>
      {mensaje && <small style={{ marginLeft: "0.75rem" }}>{mensaje}</small>}
    </p>
  );
}
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Verificar que la ausencia de la key no rompe nada**

Run: `npm run build`
Expected: build exitoso. Sin `ANTHROPIC_API_KEY` en el entorno, `page.tsx` pasa
`pulidoDisponible={false}` y el botón no se renderiza.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/horas/pulir.tsx app/horas/pulir-accion.ts
git commit -m "Pulido opcional de la descripcion con la API de Claude"
```

---

### Task 7: Andamiaje del puente y sesión de TimeBilling

**Files:**
- Create: `puente/package.json`
- Create: `puente/README.md`
- Create: `puente/configurar.mjs`
- Modify: `.gitignore`
- Create: `.vercelignore`

**Interfaces:**
- Consumes: nada del resto del repo. El puente es autónomo.
- Produces: `puente/perfil/` con la sesión de TimeBilling; `TB_URL` como variable de entorno del puente.

- [ ] **Step 1: Excluir el puente del despliegue y sus secretos del repo**

Agregar al final de `.gitignore`:

```
# puente local a TimeBilling: sesión, secretos y estado en vuelo
/puente/node_modules
/puente/perfil
/puente/.env
/puente/en-vuelo.json
/puente/descubierto.json
```

Crear `.vercelignore`:

```
puente
docs
```

- [ ] **Step 2: Crear el paquete del puente**

Crear `puente/package.json`:

```json
{
  "name": "puente-timebilling",
  "private": true,
  "type": "module",
  "scripts": {
    "configurar": "node configurar.mjs",
    "descubrir": "node descubrir.mjs",
    "cargar": "node cargar.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.112.3",
    "dotenv": "^17.0.0",
    "playwright": "^1.50.0"
  }
}
```

- [ ] **Step 3: Instalar dependencias y el navegador**

```bash
cd puente && npm install && npx playwright install chromium
```

- [ ] **Step 4: Escribir el README del puente**

Crear `puente/README.md`:

```markdown
# Puente a TimeBilling

Carga en TimeBilling las horas aprobadas en el gestor. Corre **solo en local**.
Nunca se despliega.

## Por qué existe

La API de TimeBilling necesita un `app_key` que Lemontech entrega solo a pedido.
Mientras no lo tengamos, este puente opera sobre la sesión web autenticada.
Si el `app_key` llega, se reemplaza `transporte/` por un cliente HTTP y el resto
del sistema no cambia.

## Configuración

Crear `puente/.env`:

```
TB_URL=https://<tenant>.thetimebilling.com
SUPABASE_URL=<el mismo NEXT_PUBLIC_SUPABASE_URL del gestor>
SUPABASE_ANON_KEY=<el mismo NEXT_PUBLIC_SUPABASE_ANON_KEY>
GESTOR_EMAIL=<tu correo en el gestor>
GESTOR_PASSWORD=<tu contraseña del gestor>
```

`.env` está en `.gitignore`. **La contraseña de TimeBilling no va acá** — esa la
escribes tú en la ventana del navegador.

## Uso

```bash
npm run configurar   # una vez, y cada vez que caduque la sesión
npm run descubrir    # una vez, para ver cómo carga horas TimeBilling
npm run cargar       # cada vez que quieras subir las horas aprobadas
```
```

- [ ] **Step 5: Escribir el script de sesión**

Crear `puente/configurar.mjs`:

```javascript
// Abre Chromium con perfil persistente en el login de TimeBilling y espera a que
// la usuaria entre a mano. Las credenciales de TimeBilling NO pasan por acá:
// se escriben en la ventana. Lo que queda guardado es la cookie de sesión.

import { chromium } from "playwright";
import "dotenv/config";
import readline from "node:readline/promises";

const TB_URL = process.env.TB_URL;
if (!TB_URL) {
  console.error("Falta TB_URL en puente/.env");
  process.exit(1);
}

const contexto = await chromium.launchPersistentContext("./perfil", {
  headless: false,
  viewport: { width: 1400, height: 900 },
});
const pagina = contexto.pages()[0] ?? (await contexto.newPage());
await pagina.goto(TB_URL);

console.log("\nEntra a TimeBilling en la ventana que se abrió.");
console.log("Escribe tú misma tu usuario y contraseña: no pasan por este programa.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question("Cuando ya estés dentro, apreta Enter acá… ");
rl.close();

const url = pagina.url();
await contexto.close();

if (url.toLowerCase().includes("login") || url.toLowerCase().includes("sign_in")) {
  console.error("\nParece que la sesión no quedó iniciada. Corre `npm run configurar` de nuevo.");
  process.exit(1);
}
console.log("\nSesión guardada en puente/perfil/. Ahora corre `npm run descubrir`.");
```

- [ ] **Step 6: Probarlo**

Run: `cd puente && npm run configurar`
Expected: se abre Chromium en TimeBilling; tras iniciar sesión y apretar Enter,
imprime "Sesión guardada" y `puente/perfil/` existe con contenido.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .vercelignore puente/package.json puente/package-lock.json puente/README.md puente/configurar.mjs
git commit -m "Andamiaje del puente y sesion persistente de TimeBilling"
```

---

### Task 8: Descubrimiento del transporte

**Files:**
- Create: `puente/descubrir.mjs`

**Interfaces:**
- Consumes: `puente/perfil/` de la Tarea 7.
- Produces: `puente/descubierto.json` con la forma
  `{ metodo, url, tipoContenido, cuerpo, cabeceras, respuesta }`.

Esta tarea requiere una sesión real de TimeBilling. Su salida decide qué transporte
implementa la Tarea 9.

- [ ] **Step 1: Escribir el script**

Crear `puente/descubrir.mjs`:

```javascript
// Escucha lo que hace TimeBilling cuando la usuaria carga UNA hora a mano, y
// guarda la petición resultante. De acá sale la decisión de transporte:
// endpoint interno JSON (preferido) o relleno de formulario.

import { chromium } from "playwright";
import "dotenv/config";
import readline from "node:readline/promises";
import { writeFileSync } from "node:fs";

const TB_URL = process.env.TB_URL;
if (!TB_URL) {
  console.error("Falta TB_URL en puente/.env");
  process.exit(1);
}

const contexto = await chromium.launchPersistentContext("./perfil", {
  headless: false,
  viewport: { width: 1400, height: 900 },
});
const pagina = contexto.pages()[0] ?? (await contexto.newPage());

const candidatas = [];
pagina.on("request", (peticion) => {
  const metodo = peticion.method();
  if (metodo !== "POST" && metodo !== "PUT") return;
  const url = peticion.url();
  if (!url.startsWith(TB_URL)) return;
  candidatas.push({
    metodo,
    url,
    cabeceras: peticion.headers(),
    cuerpo: peticion.postData(),
    momento: candidatas.length,
  });
  console.log(`  ${metodo} ${url}`);
});

pagina.on("response", async (respuesta) => {
  const peticion = respuesta.request();
  const metodo = peticion.method();
  if (metodo !== "POST" && metodo !== "PUT") return;
  if (!peticion.url().startsWith(TB_URL)) return;
  const registro = candidatas.find((c) => c.url === peticion.url() && !c.respuesta);
  if (!registro) return;
  registro.estado = respuesta.status();
  try {
    registro.respuesta = (await respuesta.text()).slice(0, 4000);
  } catch {
    registro.respuesta = null;
  }
});

await pagina.goto(TB_URL);
console.log("\nCarga UNA hora a mano en TimeBilling. Voy anotando lo que pasa:\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question("\nCuando la hora ya esté guardada, apreta Enter acá… ");
rl.close();
await contexto.close();

if (candidatas.length === 0) {
  console.error("\nNo vi ninguna petición POST/PUT. ¿Se guardó la hora? Intenta de nuevo.");
  process.exit(1);
}

writeFileSync("descubierto.json", JSON.stringify(candidatas, null, 2));
console.log(`\nGuardé ${candidatas.length} petición(es) en puente/descubierto.json.`);

const conJson = candidatas.filter(
  (c) => (c.cabeceras["content-type"] ?? "").includes("json") ||
         (c.cuerpo ?? "").trim().startsWith("{")
);
if (conJson.length > 0) {
  console.log("\nHay un endpoint JSON. Se puede usar el transporte XHR:");
  for (const c of conJson) console.log(`  ${c.metodo} ${c.url}`);
} else {
  console.log("\nNo vi JSON. Habrá que usar el transporte por formulario (UI).");
}
```

- [ ] **Step 2: Correrlo con TimeBilling abierto**

Run: `cd puente && npm run descubrir`
Expected: `puente/descubierto.json` existe, y la consola dice si hay endpoint JSON
o si toca el transporte por formulario.

- [ ] **Step 3: Anotar el resultado en el README**

Agregar al final de `puente/README.md` una sección "Transporte" con la conclusión:
la URL y el método del endpoint interno si lo hay, o la nota de que se usa el
formulario. Es la referencia de la Tarea 9.

- [ ] **Step 4: Commit**

```bash
git add puente/descubrir.mjs puente/README.md
git commit -m "Script de descubrimiento del transporte de TimeBilling"
```

`descubierto.json` no se commitea: está en `.gitignore` porque contiene cabeceras
de sesión.

---

### Task 9: Transporte y carga

**Files:**
- Create: `puente/transporte/xhr.mjs`
- Create: `puente/transporte/ui.mjs`
- Create: `puente/cargar.mjs`

**Interfaces:**
- Consumes: `puente/descubierto.json`, `puente/perfil/`, la tabla `horas`.
- Produces: ambos transportes exponen la misma firma:
  `async function enviar(pagina, hora): Promise<{ id: number | null }>`
  donde `hora` es `{ id, inicio, duracion_min, proyecto_id, descripcion, facturable }`.
  Lanza `Error` si no logra guardar.

- [ ] **Step 1: Escribir el transporte XHR**

Crear `puente/transporte/xhr.mjs`:

```javascript
// Transporte preferido: reusa el endpoint interno que la propia app de
// TimeBilling llama al guardar una hora. La URL y la forma del cuerpo salen de
// descubierto.json; ajustar NOMBRES si los campos se llaman distinto.

import { readFileSync } from "node:fs";

// Mapeo de nuestros campos a los que espera TimeBilling. Revisar contra
// descubierto.json antes del primer uso real.
const NOMBRES = {
  fecha: "string_date",
  duracion: "duration",
  descripcion: "description",
  proyecto: "project_id",
  facturable: "billable",
};

function endpoint() {
  const registros = JSON.parse(readFileSync(new URL("../descubierto.json", import.meta.url)));
  const json = registros.find(
    (r) => (r.cabeceras["content-type"] ?? "").includes("json") ||
           (r.cuerpo ?? "").trim().startsWith("{")
  );
  if (!json) throw new Error("descubierto.json no tiene un endpoint JSON; usa el transporte ui.");
  return json;
}

export async function enviar(pagina, hora) {
  const modelo = endpoint();

  const cuerpo = {
    [NOMBRES.fecha]: hora.fecha_local,
    [NOMBRES.duracion]: hora.duracion_min,
    [NOMBRES.descripcion]: hora.descripcion,
    [NOMBRES.proyecto]: hora.proyecto_id,
    [NOMBRES.facturable]: hora.facturable ? 1 : 0,
  };

  // La petición sale desde la página, así que lleva las cookies de sesión.
  const resultado = await pagina.evaluate(
    async ({ url, metodo, cuerpo }) => {
      const r = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(cuerpo),
      });
      const texto = await r.text();
      return { estado: r.status, texto };
    },
    { url: modelo.url, metodo: modelo.metodo, cuerpo }
  );

  if (resultado.estado < 200 || resultado.estado >= 300) {
    throw new Error(`TimeBilling respondió ${resultado.estado}: ${resultado.texto.slice(0, 200)}`);
  }

  let id = null;
  try {
    const datos = JSON.parse(resultado.texto);
    id = datos.id ?? datos.time_entry?.id ?? null;
  } catch {
    // Respuesta no-JSON: se guardó, pero no sabemos el id.
  }
  return { id };
}
```

- [ ] **Step 2: Escribir el transporte por formulario**

Crear `puente/transporte/ui.mjs`:

```javascript
// Transporte de respaldo: rellena el formulario de carga de horas. Más frágil
// que el XHR — cualquier rediseño de TimeBilling rompe los selectores.
// Ajustar SELECTORES contra la página real antes del primer uso.

const SELECTORES = {
  abrirFormulario: 'text="Nuevo trabajo"',
  fecha: 'input[name="string_date"]',
  proyecto: 'select[name="project_id"]',
  duracion: 'input[name="duration"]',
  descripcion: 'textarea[name="description"]',
  guardar: 'button[type="submit"]',
  confirmacion: 'text="Trabajo guardado"',
};

export async function enviar(pagina, hora) {
  await pagina.click(SELECTORES.abrirFormulario);
  await pagina.fill(SELECTORES.fecha, hora.fecha_local);
  await pagina.selectOption(SELECTORES.proyecto, String(hora.proyecto_id));
  await pagina.fill(SELECTORES.duracion, String(hora.duracion_min));
  await pagina.fill(SELECTORES.descripcion, hora.descripcion);
  await pagina.click(SELECTORES.guardar);

  try {
    await pagina.waitForSelector(SELECTORES.confirmacion, { timeout: 15000 });
  } catch {
    throw new Error("No apareció la confirmación de guardado; revisar en TimeBilling.");
  }

  // El formulario no devuelve el id; queda null y la hora se marca cargada igual.
  return { id: null };
}
```

- [ ] **Step 3: Escribir el cargador**

Crear `puente/cargar.mjs`:

```javascript
// Lee las horas aprobadas desde Supabase, las muestra, pide confirmación y las
// carga en TimeBilling una por una.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";
import readline from "node:readline/promises";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const { TB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, GESTOR_EMAIL, GESTOR_PASSWORD } = process.env;
for (const [nombre, valor] of Object.entries({ TB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, GESTOR_EMAIL, GESTOR_PASSWORD })) {
  if (!valor) { console.error(`Falta ${nombre} en puente/.env`); process.exit(1); }
}

const ZONA = "America/Santiago";
const fechaLocalChile = (iso) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));

// Centinela contra el doble envío: si el proceso muere entre el envío y el
// marcado, este archivo queda y obliga a verificar antes de seguir.
const EN_VUELO = "en-vuelo.json";
if (existsSync(EN_VUELO)) {
  const pendiente = JSON.parse(readFileSync(EN_VUELO, "utf8"));
  console.error(`\nLa carga anterior se cortó mientras enviaba la hora ${pendiente.id}:`);
  console.error(`  ${pendiente.fecha_local} · ${pendiente.duracion_min} min · ${pendiente.descripcion}`);
  console.error("\nRevisa en TimeBilling si esa hora quedó cargada.");
  console.error("Si quedó, márcala a mano en el gestor. Si no, borra puente/en-vuelo.json y vuelve a correr.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { error: errorLogin } = await supabase.auth.signInWithPassword({
  email: GESTOR_EMAIL, password: GESTOR_PASSWORD,
});
if (errorLogin) { console.error(`No pude entrar al gestor: ${errorLogin.message}`); process.exit(1); }

const { data: filas, error } = await supabase
  .from("horas")
  .select("id, inicio, duracion_min, proyecto_id, descripcion, facturable")
  .eq("estado", "aprobada")
  .order("inicio");
if (error) { console.error(error.message); process.exit(1); }
if (!filas.length) { console.log("No hay horas aprobadas por cargar."); process.exit(0); }

const horas = filas.map((f) => ({ ...f, fecha_local: fechaLocalChile(f.inicio) }));

console.log(`\n${horas.length} hora(s) por cargar:\n`);
for (const h of horas) {
  console.log(`  ${h.fecha_local}  ${String(h.duracion_min).padStart(3)} min  proyecto ${h.proyecto_id}`);
  console.log(`      ${h.descripcion}`);
}

if (!process.argv.includes("--si")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question("\n¿Las cargo? (escribe: si) ");
  rl.close();
  if (respuesta.trim().toLowerCase() !== "si") { console.log("Cancelado."); process.exit(0); }
}

// El transporte lo decide descubrimiento; ver puente/README.md sección Transporte.
const { enviar } = existsSync("descubierto.json") &&
  JSON.parse(readFileSync("descubierto.json", "utf8")).some(
    (r) => (r.cabeceras["content-type"] ?? "").includes("json") || (r.cuerpo ?? "").trim().startsWith("{"))
  ? await import("./transporte/xhr.mjs")
  : await import("./transporte/ui.mjs");

const contexto = await chromium.launchPersistentContext("./perfil", { headless: false });
const pagina = contexto.pages()[0] ?? (await contexto.newPage());
await pagina.goto(TB_URL);

if (pagina.url().toLowerCase().includes("login")) {
  await contexto.close();
  console.error("\nLa sesión de TimeBilling caducó. Corre `npm run configurar` y vuelve a intentar.");
  process.exit(1);
}

let cargadas = 0, fallidas = 0;
for (const hora of horas) {
  writeFileSync(EN_VUELO, JSON.stringify(hora, null, 2));
  try {
    const { id } = await enviar(pagina, hora);
    await supabase.from("horas").update({
      estado: "cargada",
      tb_time_entry_id: id,
      cargada_en: new Date().toISOString(),
      error_carga: null,
    }).eq("id", hora.id);
    unlinkSync(EN_VUELO);
    cargadas++;
    console.log(`  ✓ ${hora.fecha_local} ${hora.duracion_min} min`);
  } catch (e) {
    unlinkSync(EN_VUELO);
    await supabase.from("horas").update({
      estado: "error", error_carga: String(e.message).slice(0, 500),
    }).eq("id", hora.id);
    fallidas++;
    console.log(`  ✗ ${hora.fecha_local} ${hora.duracion_min} min — ${e.message}`);
  }
}

await contexto.close();
console.log(`\nCargadas: ${cargadas}. Con error: ${fallidas}.`);
if (fallidas) console.log("Las que fallaron quedaron en estado 'error' en el gestor, con el motivo.");
```

- [ ] **Step 4: Probar en seco con una sola hora**

En el gestor: registrar una hora de prueba, ponerle un proyecto real, aprobarla.

Run: `cd puente && npm run cargar`
Expected: muestra la hora, pide confirmación, la carga, imprime `✓`, y en el gestor
la fila queda en estado "Cargada".

Verificar en TimeBilling que la hora aparece **una sola vez** y con la fecha correcta.

- [ ] **Step 5: Probar el camino de error**

Aprobar una hora con un `proyecto_id` inexistente (por ejemplo `999999`) y correr
`npm run cargar`.
Expected: imprime `✗` con el mensaje, la fila queda en estado "Error" con el motivo
visible en la tabla del gestor, y el proceso termina sin caerse.

- [ ] **Step 6: Commit**

```bash
git add puente/transporte puente/cargar.mjs
git commit -m "Transportes y cargador de horas a TimeBilling"
```

---

### Task 10: Documentación

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Actualizar el README raíz**

En `README.md`, agregar el módulo a la descripción y una sección al final:

```markdown
# Gestor personal

App privada de Dominga Álamos: noticias de actualidad, radar legal chileno, calendario, horas de trabajo, cuentas por pagar, gastos y reembolsos de salud (isapre → seguro complementario).

- Next.js (App Router) + Supabase (auth por magic link + RLS) + Vercel (crons de ingesta).
- Todo en español de Chile: fechas DD-MM-AAAA, miles con punto, UF.
- Variables de entorno en `.env.local` (ver `vercel.json` para los crons).
- Pruebas: `npm test` (lógica pura en `lib/`).

## Horas y TimeBilling

El módulo `/horas` tiene un cronómetro; al detenerlo queda un borrador con una
descripción de plantilla que se revisa y se aprueba. Las horas aprobadas se cargan
en TimeBilling con el puente local de `puente/` (ver `puente/README.md`).

`ANTHROPIC_API_KEY` es opcional: habilita el botón de pulir la descripción con IA.
Sin ella el módulo funciona igual.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Documentar el modulo de horas y el puente"
```

---

## Cobertura del spec

| Sección del spec | Tareas |
|---|---|
| Datos: `horas`, `tb_proyectos`, índice parcial, RLS | 3 |
| Máquina de estados | 1 (pura, probada), 4 (aplicada) |
| Cronómetro y Server Actions | 4, 5 |
| Redondeo a décimas de hora | 1 |
| Plantillas por tipo de trabajo | 2, 5 |
| Pulido híbrido con IA, degradación sin key | 6 |
| Puente: sesión, descubrimiento, transportes, carga | 7, 8, 9 |
| Idempotencia y centinela `en-vuelo.json` | 9 |
| Zona horaria chilena en el `string_date` | 1 (`fechaLocalChile`), 9 (uso) |
| Secretos fuera del repo | 7 |
| Pruebas | 1, 2; verificación manual en 3, 9 |
