# Rutina de glosas

Redacta y sube las glosas del dia en TimeBilling. Corre **solo en local**.

## De donde salen las horas

Del **cronometro de la app de escritorio** (TimeBillingX). Ella sincroniza sola
con la web; esta rutina **nunca crea horas**, solo reemplaza el texto de la
glosa de horas que ya existen.

## Piezas

| Archivo | Que hace |
|---|---|
| `tb.mjs` | Sesion y lectura del listado. Compartido. |
| `ejemplos.mjs` | Trae glosas pasadas (pagina de a 20 via el campo `desde`). |
| `glosas-leer.mjs` | Busca el dia + ejemplos del mismo asunto -> `dia.json`. |
| `redactar.mjs` | Llama a `claude -p` por stdin -> `glosas.json`. |
| `glosas-escribir.mjs` | Edita via el formulario de TimeBilling y comprueba. |
| `registro-glosas.mjs` | Registro de horas ya procesadas. |
| `resumen.mjs` | Nota del dia en `Notas Claude/Glosas/`. |
| `glosas-dia.cmd` | Repasa AYER y HOY; registro en `registro/`. |
| `configurar-auto.mjs` | Abre la ventana de login sin pedir Enter. |
| `avisar.mjs` | Avisa en el gestor cuando la rutina falla de verdad. |
| `instalar-tarea.ps1` | Tarea de Windows: L-V 19:00 con reintentos, y al iniciar sesion. |

## Por que repasa ayer

Hay dias en que Dominga termina despues de las 19:00. La corrida siguiente
recoge lo que quedo suelto. Para que eso no reescriba glosas ya pulidas cada
noche, `registro/procesadas.json` anota las horas ya subidas **y solo las
verificadas en TimeBilling**, no las meramente enviadas.

## Como funciona de verdad (verificado el 26-08-2026)

**El listado NO es `semana.php`.** Es `app/interfaces/trabajos.php`, un
formulario PHP clasico:

- `GET trabajos.php?popup=1&id_usuario=165&motivo=horas`
- Se rellenan `fecha_ini` y `fecha_fin` en **DD-MM-YYYY**, `opc=buscar`, submit.
- Pagina de a 20 mediante el campo oculto `desde` (0, 20, 40...). Subir `x_pag`
  no funciona: el reenvio lo resetea.
- Cada trabajo es un `<tr id="tNNNNNN">`. La glosa vive en el `<footer>` de
  `.cliente-asunto`, precedida por `#<id_trabajo> `.
- **Una hora cobrada no trae boton `[data-edit-job]`.** Ese es el filtro fiable
  de editable, mejor que adivinar un campo `cobrado`.

**Para guardar se usa el formulario de la aplicacion**, no una peticion armada a
mano: click en `[data-edit-job="ID"]`, `fill()` sobre
`textarea[name=descripcion]`, click en `button.btn-primary:has-text("Guardar")`.
Hay que usar `fill()` y no asignar `.value`: el formulario escucha los eventos.
Despues de guardar el listado se recarga: **rehacer la busqueda antes de cada
edicion**.

## El estilo lo dictan sus propias glosas

`glosas-leer.mjs` trae hasta 6 glosas suyas de los ultimos 90 dias del mismo
asunto y se las pasa al modelo como referencia. Eso importa mas que cualquier
regla escrita: en "BSVV / Actividades Academicas" todas sus glosas abren con
"Financiamiento Vinedos Familia Chadwick:", y el modelo recoge esa convencion
solo.

Rasgos de su estilo, observados el 26-08-2026:
- Frase **nominal** de apertura ("Revision de...", "Preparacion de..."), nunca
  "Se revisa..." al principio.
- Detallada: nombra entregables, documentos y personas.
- Varias actuaciones encadenadas con "Asimismo, se...", "Por ultimo, se...".
- El largo va con la duracion.

Tambien se le pasan extractos de las notas de `Notas Claude/` que mencionen al
cliente, como contexto adicional.

## El fallo mudo (corregido el 29-08-2026)

El 27 y el 28 de agosto la rutina fallo entera —el notebook estaba sin red a las
19:00— y termino escribiendo **LISTO.** con salida 0. Nadie se entero y se
perdieron dos dias de glosas.

La causa estaba en `glosas-dia.cmd`:

    if errorlevel 1 (echo ... & set FALLO=1 & exit /b 0)

En batch el espacio que precede al `&` **entra en el valor**: `FALLO` quedaba
como `"1 "`, el `if "%FALLO%"=="1"` de mas abajo nunca calzaba, y el bloque
`:fallo` —que ya existia— era codigo muerto. Se escribe `set "FALLO=1"`, con
comillas.

Tres cambios, no uno:

1. **La falla es falla.** Corregido el `set`; la rutina sale con codigo 1.
2. **Reintentos.** Un solo disparo a las 19:00 es fragil: el notebook puede
   estar apagado o fuera de la red del estudio. Ahora reintenta cada 30 minutos
   hasta las 23:00 y hace una pasada al iniciar sesion. Reintentar no cuesta:
   `procesadas.json` deja intactas las glosas ya pulidas, y de paso recoge las
   horas cargadas despues de las 19:00.
3. **El aviso llega.** `avisar.mjs` crea una tarea en el gestor con fecha de hoy
   —sale en "No olvidar" del hub y en el telefono— al **tercer** fallo seguido,
   para que un corte de red pasajero no moleste. Si el gestor no esta
   alcanzable, el aviso queda encolado en `registro/aviso-pendiente.json` y se
   despacha en el reintento siguiente; ademas deja `AAAA-MM-DD — FALLO.md` en la
   boveda como respaldo. Cuando una corrida sale bien, `avisar.mjs --ok` cierra
   la tarea y retira la nota.

De paso salieron dos defectos que el fallo mudo tapaba:

- `buscarDia` escribia en `fecha_ini` sin esperar a que el formulario existiera:
  fallaba de forma intermitente con *Cannot set properties of null*. Ahora hay un
  `waitForSelector`. La paginacion de `ejemplos.mjs` tampoco comprobaba `opc`;
  ahora corta la paginacion en vez de reventar la corrida entera.
- `redactar.mjs` guardaba la glosa con el espacio inicial que a veces devuelve el
  modelo. Ese espacio se facturaba tal cual: ahora se hace `trim()`.

### Pendiente

`avisar.mjs` todavia no puede crear la tarea: la variable
`SUPABASE_SERVICE_ROLE_KEY` de `../.env.local` contiene **la clave anon**, no la
service role (se ve decodificando el JWT: `role: anon`), y RLS rechaza la
insercion. Mientras no se corrija, el aviso cae en la boveda por el respaldo.
Vale la pena revisar la misma variable en Vercel: si alla esta igual, el buzon de
correo (`/api/correo`) y los crons fallan del mismo modo.

## Windows, dos trampas

1. PowerShell del estudio no ejecuta `.ps1`: usar `npm.cmd`, `claude.cmd`.
2. `&&` no existe en PowerShell 5.1: separar con `;`.

El prompt a `claude` va **por stdin**, no como argumento: lleva comillas y saltos
de linea que `cmd.exe` destroza.

## Uso

```
npm.cmd run configurar-auto        # una vez, y cuando caduque la sesion
.\glosas-dia.cmd                   # el ciclo completo: ayer y hoy
node glosas-leer.mjs 2026-08-25    # un dia puntual, sin modificar nada
node ejemplos.mjs 01-07-2026 31-07-2026 "Maxagro"   # ver glosas pasadas
```
