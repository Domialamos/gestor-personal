# Calendario mensual unificado

**Fecha:** 2026-09-01
**Estado:** esperando aprobación

## El problema

El calendario de hoy (`app/calendario/vista.tsx`) es una lista de días, uno debajo
del otro. Sirve para ver "lo que viene" pero no para lo que Dominga necesita:
una vista del mes completo donde se distinga de un vistazo si algo es una
reunión, una entrega o una hora médica, y desde donde pueda agregar cosas.

Además las tareas entran al calendario **solo como lectura** y solo las
pendientes con fecha futura. No se pueden crear, mover ni completar desde ahí.

## Qué se construye

Una vista mensual como pantalla principal del calendario, con:

1. Rejilla del mes de lunes a domingo, con cada ítem como pastilla de color.
2. Colores por categoría, para distinguir reunión / tarea / entrega / etc.
3. Creación de tareas y eventos desde el propio calendario.
4. Panel de día y de semana al apretar.
5. Sincronización real con la lista de tareas: el mismo dato, dos vistas.

## Decisiones tomadas con la usuaria

| Pregunta | Decisión |
|---|---|
| ¿Qué tan a fondo la sincronización con tareas? | **Un solo dato, dos vistas.** Desde el calendario se crea, mueve, completa y se ve la prioridad. |
| ¿Por qué criterio los colores? | **Por categoría** (reunión, tarea, hora médica, entrega…), no por origen ni por cliente. |
| ¿Qué muestra al apretar un día o semana? | **La lista de ese día o semana** en un panel, no una rejilla horaria. |

## Arquitectura

### Enfoques evaluados

**A. Dos tablas, una vista unificada** — elegido.
`tareas` sigue siendo la tabla de tareas. Una tabla `eventos` nueva reemplaza el
uso manual de `eventos_cache`. Una función pura fusiona ambas en una sola lista
para pintar el mes.

- A favor: cada cosa conserva su semántica. Las tareas tienen prioridad, estado,
  delegación y seguimientos; los eventos tienen hora, duración y lugar. Sin
  migración destructiva.
- En contra: dos caminos de escritura.

**B. Una sola tabla `agenda`.** Todo junto con una columna de clase.
Descartado: obligaría a migrar 54 tareas y rehacer delegación, seguimientos,
prioridad y bitácora sobre el modelo nuevo. Mucho riesgo para lo que se gana.

**C. Todo como tarea.** Los eventos serían tareas con hora.
Descartado: lo que baja de Google y Outlook es ajeno y de solo lectura;
meterlo en `tareas` ensucia la bitácora del estudio.

### Las tres fuentes

| Fuente | Tabla | Escritura |
|---|---|---|
| Tareas | `tareas` | completa (crear, mover, completar) |
| Eventos propios | `eventos` (nueva) | completa |
| Google / Outlook | `eventos_cache` | solo lectura, la llena el cron |

## Modelo de datos

### Tabla `eventos` (nueva)

```sql
id           uuid primary key
user_id      uuid not null references auth.users(id) default auth.uid()
titulo       text not null
categoria    text not null default 'reunion'
inicio       timestamptz not null
fin          timestamptz
todo_el_dia  boolean not null default false
ubicacion    text
detalle      text
cliente      text
proyecto_id  integer
creado_en    timestamptz not null default now()
```

Con RLS `propietaria_eventos`, igual que el resto de las tablas.

### Columna `tareas.categoria`

Opcional (`null` por defecto). Cuando está vacía, la categoría se **deduce**
del `tipo` que la tarea ya tiene. Así las 54 tareas existentes no necesitan
migración, y aun así se puede sobreescribir cualquiera a mano sin tocar su
`tipo`, que es lo que usa la bitácora.

Reglas de deducción, en `lib/calendario.ts`:

- `tipo` es `reunion` o `llamada` → **Reunión**
- el título empieza con `HITO:` → **Entrega**
- cualquier otro caso → **Tarea**

## Categorías y colores

| Categoría | Clave | Para qué | Color |
|---|---|---|---|
| Tarea | `tarea` | pendientes propias | azul |
| Reunión | `reunion` | reuniones y llamadas | violeta |
| Entrega | `entrega` | hitos y entregas a cliente | verde |
| Plazo | `plazo` | vencimientos, plazos fatales | rojo |
| Hora médica | `medico` | salud | rosa |
| Personal | `personal` | lo personal | ámbar |
| Externo | `externo` | lo que baja de Google/Outlook | gris, solo lectura |

Se definen como variables CSS con versión clara y oscura en `app/globals.css`,
para que el mes se lea bien en ambos temas. El color nunca es el único indicador:
cada pastilla lleva también el nombre de la categoría en su `title`, para que
funcione sin distinguir colores.

## Interfaz

### El mes (principal)

Rejilla de lunes a domingo. Cada celda es un día con sus ítems como pastillas de
color, ordenados por hora (los de todo el día primero). El día de hoy va
marcado. Los días de los meses vecinos se ven en gris.

Cuando un día tiene más ítems de los que caben, se muestran los primeros y un
`+3 más` que abre el panel de ese día.

Arriba: navegación mes anterior / mes siguiente / hoy, y filtros por categoría.

### Panel de día y semana

Apretar un día abre un panel lateral con todo lo de ese día ordenado por hora,
y un botón para agregar ahí mismo. Apretar el número de semana abre la semana
completa en el mismo panel, agrupada por día.

### Crear desde el calendario

Un botón `+` en cada día. El formulario pide título, categoría, hora (vacío =
todo el día) y cliente. Si la categoría es **Tarea**, se guarda en `tareas` y
aparece en el to-do; cualquier otra categoría va a `eventos`.

### Mover de día

Arrastrar un ítem cambia su fecha: `fecha_limite` si es tarea, `inicio` si es
evento. Los ítems externos no se pueden arrastrar.

Se implementa al final. Si se complica, se reemplaza por un selector de fecha
en el panel del día, que logra lo mismo con dos clics más.

## Archivos

| Archivo | Qué |
|---|---|
| `supabase/migrations/2026…_calendario.sql` | tabla `eventos`, `tareas.categoria`, RLS |
| `lib/calendario.ts` | categorías, deducción, fusión, armado de la rejilla — puro |
| `lib/calendario.test.ts` | tests |
| `app/calendario/page.tsx` | consulta las tres fuentes |
| `app/calendario/mes.tsx` | rejilla, panel de día/semana (cliente) |
| `app/calendario/acciones.ts` | crear/editar/mover/eliminar, tareas y eventos |
| `app/globals.css` | colores de categoría |

`app/calendario/vista.tsx` se elimina. Su filtro por origen se reemplaza por el
filtro por categoría.

## Qué se prueba

La lógica pura de `lib/calendario.ts`, con `node --test` como el resto:

- La rejilla del mes empieza en lunes y cubre siempre semanas completas.
- Un mes que empieza domingo y uno que empieza lunes generan la grilla correcta.
- Febrero de un año bisiesto.
- Los días de meses vecinos quedan marcados como tales.
- La deducción de categoría desde `tipo`, incluido el caso `HITO:`.
- La fusión de las tres fuentes ordena por hora dentro de cada día.
- Los ítems de todo el día van antes que los que tienen hora.
- El filtro por categoría no pierde ítems.

La vista se verifica en el navegador contra los datos reales.

## Límites conocidos

- **`eventos_cache` está vacía.** El cron de calendario está registrado y corre a
  diario, pero no ha traído ni un evento. Al 2026-09-01 se está depurando si las
  URLs ICS son válidas. El mes funciona igual con tareas y eventos propios; los
  externos aparecerán cuando eso se resuelva.
- El parser ICS (`lib/ics.ts`) **no expande recurrencias** (`RRULE`). Una reunión
  semanal de Google aparecerá una sola vez. Queda fuera de este trabajo.
- La ventana del cron es de −7 a +90 días, así que el mes solo tendrá eventos
  externos dentro de ese rango.
