# Puente TimeBilling — diseño

Fecha: 2026-08-24
Estado: aprobado para plan de implementación

## Contexto

TimeBilling (Lemontech / LemonSuite) tiene una API REST documentada en
`https://developers.thetimebilling.com/docs/`, con el endpoint que necesitamos:

```
POST /users/{id}/time_entries      → "Agregar un nuevo trabajo"
Campos obligatorios: string_date, created_at, duration (minutos), description, project_id
```

La autenticación (`POST /login` con `user`, `password`, `app_key`) exige un `app_key` que
Lemontech entrega solo a pedido. **Hoy no lo tenemos.** Por eso este diseño usa un puente
local que opera sobre la sesión web autenticada, en vez de la API.

El puente es explícitamente un reemplazo temporal. Si Lemontech entrega el `app_key`, la
pieza 4 se sustituye por un cliente HTTP contra la API oficial y el resto del sistema no
cambia — ese es el motivo de aislar el transporte detrás de una interfaz.

## Alcance

Dentro:

- Cronómetro en `gestor-personal` para registrar trabajo durante el día.
- Descripción redactada de forma híbrida: plantilla como base, pulido con IA a pedido.
- Revisión y aprobación humana de cada registro antes de cargarlo.
- Puente local que carga los registros aprobados en TimeBilling y marca el resultado.

Fuera:

- Sincronización desde el calendario (`eventos_cache`). Posible después; no ahora.
- Lectura de horas ya existentes en TimeBilling.
- Facturación, liquidación, cargos, o cualquier otro módulo de TimeBilling.
- Despliegue del puente. Corre solo en la máquina de la usuaria.

## Arquitectura

Cuatro piezas. Las tres primeras viven en la app desplegada; la cuarta solo en local.

```
[Cronómetro]  →  [tabla horas en Supabase]  ←  [Puente local]  →  [TimeBilling web]
  app/horas         estado: corriendo →              puente/
                    borrador → aprobada →
                    cargada
```

El puente **lee y escribe Supabase directamente**, autenticándose con la misma cuenta que
usa la app. Las RLS existentes filtran por `user_id`, así que no hace falta ningún endpoint
nuevo ni una service key en disco. El gestor no necesita saber que el puente existe.

## 1. Datos

Migración nueva `supabase/migrations/<ts>_horas.sql`, siguiendo el estilo del esquema
inicial (español, `user_id` con default `auth.uid()`, RLS por propietaria).

```sql
create table if not exists public.tb_proyectos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  proyecto_id integer not null,          -- id en TimeBilling
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
  inicio timestamptz not null,
  fin timestamptz,
  duracion_min integer check (duracion_min > 0),
  proyecto_id integer,                   -- id de TimeBilling; null mientras es borrador
  tipo_trabajo text not null default 'general',
  descripcion text not null default '',
  facturable boolean not null default true,
  estado text not null default 'corriendo'
    check (estado in ('corriendo','borrador','aprobada','cargada','error')),
  tb_time_entry_id integer,              -- id devuelto por TimeBilling
  cargada_en timestamptz,
  error_carga text,
  creado_en timestamptz not null default now()
);

create unique index if not exists horas_una_corriendo
  on public.horas (user_id) where estado = 'corriendo';
```

El índice parcial garantiza a nivel de base de datos que no haya dos cronómetros corriendo
a la vez. No confiar en la UI para eso.

`tb_proyectos` se llena a mano la primera vez (o el puente la puebla leyendo el selector de
proyectos de TimeBilling). Es caché: si está vacía, el módulo de horas sigue funcionando,
solo que hay que escribir el `proyecto_id` a mano.

### Máquina de estados

| Estado | Significa | Quién lo pone |
|---|---|---|
| `corriendo` | cronómetro andando, `fin` en null | cronómetro |
| `borrador` | detenido, con duración y descripción base | cronómetro al parar |
| `aprobada` | revisada; lista para cargar | la usuaria |
| `cargada` | escrita en TimeBilling, con `tb_time_entry_id` | el puente |
| `error` | el puente falló; `error_carga` explica | el puente |

Transiciones válidas: `corriendo→borrador`, `borrador↔aprobada`, `aprobada→cargada`,
`aprobada→error`, `error→aprobada` (reintento). Nada sale de `cargada`: una hora ya escrita
en el sistema de facturación de la firma no se edita desde acá.

## 2. Cronómetro — `app/horas`

Sigue el patrón de los módulos existentes: `page.tsx` (Server Component), `acciones.ts`
(Server Actions con `clienteServidor()` y `revalidatePath`), y un componente cliente para
lo interactivo.

- `iniciarCronometro(tipo_trabajo, proyecto_id?)` — inserta con `estado='corriendo'`.
  Si el índice parcial rebota por duplicado, el error se traduce a "ya tienes un cronómetro
  corriendo" en vez de propagar el mensaje de Postgres.
- `detenerCronometro()` — pone `fin = now()`, calcula `duracion_min` redondeando **hacia
  arriba al múltiplo de 6 minutos** (la décima de hora, unidad de facturación habitual en
  estudios), aplica la plantilla y pasa a `borrador`.
- `actualizarHora(id, campos)` — edición manual de duración, proyecto, tipo y descripción.
- `aprobarHora(id)` / `desaprobarHora(id)` — mueve entre `borrador` y `aprobada`.
  `aprobarHora` rechaza si falta `proyecto_id` o la descripción está vacía.
- `eliminarHora(id)` — solo en `borrador` o `error`.

El tiempo transcurrido se muestra en el cliente calculándolo desde `inicio`; no hay estado
de cronómetro en el navegador que se pueda perder al recargar. La fuente de verdad es la
fila en Supabase.

Fechas y duraciones se muestran con `lib/formato.ts` (zona `America/Santiago`, DD-MM-AAAA).

## 3. Redacción híbrida

**Base: plantillas.** `lib/plantillas-horas.ts` mapea `tipo_trabajo` a una frase inicial:

| tipo_trabajo | plantilla |
|---|---|
| `reunion` | "Reunión con {contraparte} para tratar {materia}." |
| `revision` | "Revisión de {documento} y preparación de observaciones." |
| `redaccion` | "Redacción de {documento}." |
| `estudio` | "Estudio de antecedentes sobre {materia}." |
| `gestion` | "Gestión de {tramite} ante {organismo}." |
| `llamada` | "Llamada telefónica con {contraparte} sobre {materia}." |
| `correo` | "Análisis y respuesta de correos sobre {materia}." |
| `general` | "" (texto libre) |

Los `{campos}` quedan como marcadores visibles en el borrador. Rellenarlos es el trabajo
manual mínimo; sin IA el sistema es plenamente usable.

**Pulido opcional: `pulirDescripcion(id)`.** Server Action que llama a la API de Claude con
el texto actual y devuelve una versión redactada en registro profesional. Nunca se dispara
sola: es un botón por fila.

- SDK `@anthropic-ai/sdk`, modelo `claude-opus-5` ($5 / $25 por millón de tokens).
- La llamada es diminuta — entrada y salida de unos cientos de tokens — del orden de
  décimas de centavo de dólar por hora registrada.
- `max_tokens: 1000`, sin streaming (respuesta corta, no hay riesgo de timeout).
- Prompt de sistema: redactar en español de Chile, tercera persona impersonal, sin inventar
  hechos que no estén en el texto de entrada, sin nombres de clientes que no aparezcan ya,
  una a dos oraciones.
- `ANTHROPIC_API_KEY` como variable de entorno en Vercel. Si falta, el botón no se muestra
  y el resto del módulo funciona igual.

La restricción de "no inventar" es la que importa: esto termina en una factura a un cliente
del estudio. El modelo reescribe lo que ya está, no rellena lo que falta.

## 4. Puente local — `puente/`

Carpeta en el mismo repo, excluida del build (`.vercelignore` y `next.config.ts`), con su
propio `package.json`. Node + Playwright. **Nunca se despliega.**

```
puente/
  package.json
  configurar.mjs      # abre Chromium, la usuaria entra a TimeBilling a mano
  descubrir.mjs       # registra qué hace la app al cargar una hora
  cargar.mjs          # lee horas aprobadas, las carga, marca el resultado
  transporte/
    ui.mjs            # rellena el formulario
    xhr.mjs           # llama al endpoint interno, si existe
  perfil/             # perfil persistente de Chromium (en .gitignore)
```

### Sesión

`configurar.mjs` abre Chromium con `launchPersistentContext("./perfil")` en la página de
login de TimeBilling y espera. **La usuaria escribe su usuario y contraseña ella misma, en
esa ventana.** Las credenciales no pasan por el código, no se guardan en variables de
entorno y no aparecen en ningún archivo del repo. Lo que persiste es la cookie de sesión
dentro de `perfil/`, que está en `.gitignore`.

Cuando la sesión caduca, `cargar.mjs` lo detecta (la navegación termina en el login), aborta
sin cargar nada y pide correr `configurar.mjs` de nuevo.

### Descubrimiento

`descubrir.mjs` abre la sesión ya autenticada, escucha `page.on("request")` y le pide a la
usuaria que cargue **una** hora a mano. Registra el `POST`/`PUT` resultante — URL, headers,
forma del cuerpo — en `puente/descubierto.json`.

De ahí sale la decisión de transporte:

- **Hay un endpoint interno JSON** → `transporte/xhr.mjs`. Preferido: rápido, sin selectores
  que se rompan con un rediseño, y con respuesta parseable de la que sacar el id.
- **No lo hay** → `transporte/ui.mjs`, rellenando el formulario con Playwright.

Este paso no se puede hacer sin una sesión real de TimeBilling abierta. Es el único punto
del diseño que requiere una sesión en vivo con la usuaria.

### Carga

`cargar.mjs`:

1. Inicia sesión en Supabase con las credenciales del gestor (`.env` local del puente) y
   trae `horas` con `estado='aprobada'`.
2. Imprime la tabla de lo que va a cargar — fecha, duración, proyecto, descripción — y
   **espera confirmación explícita en la terminal.** `--si` la salta, para cuando ya se
   revisó en la UI.
3. Por cada hora: llama al transporte. Si vuelve con id, marca `cargada` con
   `tb_time_entry_id` y `cargada_en`. Si falla, marca `error` con el mensaje y **sigue con
   la siguiente** — un fallo no debe frenar la tanda.
4. Resumen final: cargadas, con error, y qué hacer con las de error.

**Idempotencia.** El filtro por `estado='aprobada'` más el marcado inmediato a `cargada`
evita el doble envío en la operación normal. Si el proceso muere entre el envío y el marcado,
esa hora queda en `aprobada` y se reenviaría. Para cubrirlo, el puente escribe un archivo
`puente/en-vuelo.json` con el id antes de enviar y lo borra después; al arrancar, si hay algo
ahí, avisa y pide verificar esa hora en TimeBilling antes de continuar. Cargar dos veces la
misma hora en el sistema de facturación es el peor error posible de este sistema, y vale un
paso manual evitarlo.

## Seguridad

- La contraseña de TimeBilling la escribe la usuaria en la ventana del navegador. No está en
  el código, ni en variables de entorno, ni en el repo.
- `puente/perfil/` (cookies de sesión), `puente/.env` y `puente/en-vuelo.json` van a
  `.gitignore`.
- `ANTHROPIC_API_KEY` solo en Vercel, nunca en el repo.
- Las RLS existentes ya aíslan las filas por `user_id`; las tablas nuevas reusan la misma
  política.
- El puente automatiza la sesión propia de la usuaria sobre sus propias horas. Aun así, los
  términos de Lemontech pueden restringir el acceso automatizado: pedir el `app_key` por el
  canal formal sigue siendo lo correcto y va en paralelo.

## Pruebas

- **Formato y plantillas** (`lib/`): puras, prueba unitaria directa — redondeo a décimas de
  hora, sustitución de marcadores.
- **Máquina de estados**: cada transición válida e inválida contra una base de pruebas.
  Incluye el índice parcial: dos `iniciarCronometro` seguidos deben fallar el segundo.
- **Server Actions**: `aprobarHora` sin `proyecto_id` rechaza; `detenerCronometro` sin
  cronómetro corriendo rechaza.
- **Puente**: los transportes se prueban contra un servidor local que imita las respuestas
  de TimeBilling registradas en `descubierto.json`. No se prueba contra TimeBilling real.
- **Pulido con IA**: se prueba que el Server Action maneje ausencia de `ANTHROPIC_API_KEY`,
  error de red y respuesta vacía sin romper la fila. La calidad del texto no se prueba
  automáticamente.

El proyecto hoy no tiene arnés de pruebas. Instalarlo (`node:test` con `tsx`, que no agrega
dependencias de peso) es parte del primer paso del plan de implementación.

## Riesgos abiertos

1. **El transporte del puente no está decidido.** Depende de `descubrir.mjs` contra una
   sesión real. Las piezas 1 a 3 se pueden construir y probar por completo sin resolverlo.
2. **Fragilidad.** Si TimeBilling rediseña su formulario, el transporte por UI se rompe. El
   transporte por XHR aguanta más pero tampoco tiene garantías. Es la naturaleza de un
   puente sin API; el `app_key` es la salida real.
3. **`tb_proyectos` puede quedar desactualizada.** Un proyecto nuevo en TimeBilling no
   aparece hasta resincronizar. Mitigación: permitir escribir el `proyecto_id` a mano.
4. **Zona horaria.** Todo se guarda en `timestamptz` y se muestra en `America/Santiago`; el
   `string_date` que espera TimeBilling debe salir de la fecha *local* chilena, no de UTC.
   Una hora registrada a las 21:00 de un martes no puede terminar cargada como miércoles.
