# Agente de glosas de TimeBilling

**Fecha:** 2026-09-22
**Estado:** diseño aprobado, pendiente de implementar

## Problema

La rutina diaria de glosas (`puente/glosas-dia.cmd`) redacta y sube las glosas
de las horas de Dominga en TimeBilling. Funciona, pero tiene tres defectos que
ella quiere corregir:

1. **Se cae.** El 22-09-2026 falló dos de dos veces al repasar el día anterior:
   una con `Page crashed`, otra con `Timeout 15000ms` esperando `fecha_ini`. En
   ambas corridas la *segunda* apertura del navegador funcionó sin problemas. No
   es TimeBilling ni la sesión: es arranque en frío de Chromium. Como el `.cmd`
   encadena cuatro procesos, el fallo de un eslabón se lleva el día entero.
2. **Redacta con poco contexto.** Ve 6 glosas anteriores sin su duración,
   extractos de notas cortados a 1.200 caracteres, y redacta cada hora por
   separado aunque varias sean del mismo asunto.
3. **No es un agente.** Es una cadena rígida que no puede recuperarse de nada.

## Decisiones de Dominga

Tomadas en la conversación del 22-09-2026:

- **Deducción libre.** Cuando el apunte es corto y la hora larga, el agente
  completa con el historial del asunto sin marcar qué dedujo. *Esto revierte el
  criterio del 29-08-2026*, que era ceñirse al apunte; el cambio es deliberado y
  ella lo confirmó tras verlo planteado.
- **Canal único: la nota diaria en la bóveda.** No avisos al gestor, no
  aprobación previa antes de subir.
- **Corre desatendido a las 19:00**, aunque normalmente ella esté frente al PC.
  Por eso se descartó usar su Chrome real vía la extensión: necesita una sesión
  interactiva de Claude Code y dejaría de ser automático.

## Arquitectura

La inversión central: **las herramientas se vuelven deterministas y tontas; el
agente decide.**

```
glosas-dia.cmd  →  claude -p con glosas-agente.md
                       │
                       ├─ node tb.mjs dia <fecha>            → JSON
                       ├─ node tb.mjs ejemplos "<asunto>"    → JSON
                       ├─ node tb.mjs escribir <id> <texto>  → JSON {confirmada}
                       └─ Write  Notas Claude/Glosas/<fecha>.md
```

### Piezas

| Archivo | Cambio |
|---|---|
| `tb.mjs` | Pasa a ser el CLI único, con subcomandos y salida JSON. Gana reintento de arranque en frío. |
| `glosas-agente.md` | Nuevo. El prompt del agente, versionado. |
| `glosas-dia.cmd` | Se reduce a lanzar el agente. |
| `registro-glosas.mjs` | Sin cambios. Solo lo escribe `tb.mjs escribir`. |
| `resumen.mjs` | Pasa a ser `tb.mjs nota <datos.json>`: el agente aporta el contenido, la herramienta garantiza el formato y que el archivo exista. |
| `glosas-leer.mjs`, `redactar.mjs`, `glosas-escribir.mjs` | Se eliminan: su lógica queda en `tb.mjs` y en el agente. |
| `avisar.mjs` | **Se elimina.** Ver "Fallos". |
| `ejemplos.mjs` | Su `traerRango` se mueve a `tb.mjs`. |

### El agente redacta él mismo

Hoy `redactar.mjs` lanza *otro* `claude -p` como subproceso, le pasa el prompt
por stdin peleando con `cmd.exe`, y parsea a mano el array JSON que vuelve. Es
un Claude llamando a un Claude. Con el agente esa capa desaparece entera, y con
ella tres fuentes de fallo documentadas: el stdin de `cmd.exe`, el parseo del
array, y el `trim()` del espacio inicial que se facturaba tal cual al cliente.

### `escribir` es atómico y honesto

`tb.mjs escribir <id> <texto>` edita vía el formulario de la aplicación, recarga
el listado, relee la glosa desde TimeBilling y **solo devuelve
`{"confirmada": true}` si el texto guardado coincide con el enviado**. Anota en
`procesadas.json` ahí adentro, nunca desde el agente.

Esta es la protección central del diseño: el agente no puede declarar éxito. Lo
declara la herramienta, contra la página. Puede equivocarse redactando; no puede
equivocarse mintiendo sobre lo que quedó guardado.

### Arranque en frío con reintento

`abrirSesion()` reintenta hasta tres veces con espera creciente: si la primera
carga revienta o da timeout, cierra el contexto, relanza Chromium y vuelve a
intentar. Ataca la causa del 100% de los fallos registrados.

### No se hace: servidor de navegador persistente

Sería más elegante tener un proceso de fondo con el contexto de Playwright vivo,
en vez de relanzar Chromium en cada subcomando. Se descarta por YAGNI: agrega un
proceso, un puerto y un modo de fallo nuevo, y con el reintento relanzar es
barato. Si la lentitud molesta más adelante, se agrega entonces.

## El bucle del agente

Permisos: exactamente `Bash(node tb.mjs *)` y `Read`. No necesita `Write`: la
nota la escribe `tb.mjs nota`. No navega libre ni toca el resto del repo.

Para ayer y después hoy:

1. `node tb.mjs dia <fecha>` — trabajos ya filtrados: sin cobradas, sin las que
   están en `procesadas.json`.
2. Si no queda nada editable, cierra el día y sigue.
3. `node tb.mjs ejemplos "<asunto>"` por cada asunto distinto del día.
4. Redacta todas las glosas del día **viéndolas juntas**.
5. `node tb.mjs escribir <id> "<texto>"`, una por una, leyendo la respuesta.
6. Si vuelve `confirmada: false`, reintenta esa hora **una vez**. Si vuelve a
   fallar, la anota como pendiente y sigue con las demás. Una hora rota no se
   lleva el día.
7. `node tb.mjs nota <datos.json>` con lo redactado, lo confirmado y lo
   pendiente.

**Límites de su autonomía:** no elige qué días mirar, no puede saltarse la
verificación, no puede marcar algo como procesado, y no ve las horas cobradas
—`tb.mjs` ni se las muestra—.

**Si `tb.mjs` falla entero** (sesión caducada, sin red), el agente lo distingue
por el código de salida, no reintenta en bucle, y marca el día como fallido en
la nota.

**Si el que falla es el agente** (se cuelga, se queda sin cuota, sale distinto
de cero), nadie escribiría la nota. Por eso `glosas-dia.cmd` no termina al
lanzarlo: si el agente sale con error, el `.cmd` llama él mismo a
`tb.mjs nota --fallo "<motivo>"`, que deja la nota mínima con el ⚠️ y el
puntero al `registro/*.txt` de esa corrida. La garantía de "la nota se escribe
siempre" vive en el `.cmd`, no en el agente.

## Redacción

Dado que deduce libre, el trabajo no es ponerle frenos sino darle más de dónde
deducir:

- 10 glosas anteriores del mismo asunto en vez de 6, **cada una con su duración
  al lado**, para que calibre el largo con un dato en vez de a ojo.
- Notas de la bóveda completas cuando mencionan al cliente, en vez de cortadas a
  1.200 caracteres. Hoy el corte cae justo donde suele estar el detalle.
- Ve todas las horas del día juntas antes de redactar. Si tres horas son del
  mismo asunto, puede repartir las actuaciones en vez de escribir tres glosas
  que se pisan.

Se conserva del prompt actual: frase nominal de apertura, nunca "Se revisa…"
al abrir, apellido "Chadwick", corregir erratas, nunca dejar la glosa vacía.

## Fallos y nota diaria

`avisar.mjs` **se elimina** (168 líneas). Intenta crear una tarea en
gestor-personal, no puede porque `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`
contiene la clave anon y RLS rechaza la inserción, y por eso cae al respaldo en
la bóveda — que es justamente el canal que Dominga eligió como principal.
Mantener una pieza rota cuyo plan B es el plan A no tiene sentido. Si algún día
se arregla la clave y quiere el aviso en el teléfono, se repone.

`Notas Claude/Glosas/AAAA-MM-DD.md` se escribe **siempre**, salga bien o mal:

```markdown
# Glosas del 2026-09-22
3 glosa(s) · 5h 20m          ⚠️ 1 hora quedó pendiente

## BSVV / Actividades Académicas — 3:35
**Apunte:** Informe de brechas
Elaboración del informe de brechas, con revisión de…

## Maxagro / Due diligence — 1:45   ⚠️ NO SE PUDO GUARDAR
**Apunte:** revisión títulos
(texto redactado, para pegarlo a mano)
> Falló al verificar dos veces. La hora sigue sin glosa en TimeBilling.

---
> Repaso del 2026-09-21: falló al leer (sesión caducada).
```

Lo que falló aparece **arriba y con el texto listo**, no enterrado en
`registro/`. Si la nota no tiene ⚠️, no pasó nada. Los `registro/*.txt` siguen
existiendo para depurar, pero dejan de ser donde ella se entera.

## Pruebas

Esto toca horas que se facturan a clientes. TDD, y ninguna prueba toca
TimeBilling de verdad.

1. **Parseo del listado** contra un HTML fijo guardado de una página real: id,
   duración, asunto, glosa, y editable por presencia de `[data-edit-job]`. Es
   donde más duele una regresión silenciosa.
2. **Reintento de arranque en frío:** con un `abrirSesion` que falla las dos
   primeras veces, la tercera sale bien; si fallan las tres, el código de salida
   es el correcto.
3. **`escribir` es honesto:** simulando que TimeBilling guardó un texto distinto
   al enviado, devuelve `confirmada: false` y **no** anota en
   `procesadas.json`. Esta prueba protege todo el diseño.
4. **`tb.mjs nota` con horas pendientes** produce el ⚠️ en el encabezado y deja
   el texto redactado visible para pegarlo a mano.
5. **`tb.mjs nota --fallo`** escribe el archivo aunque no haya ningún dato del
   día: es la garantía de que una corrida muerta igual deja rastro.
6. **Humo end-to-end:** una corrida real contra un día ya procesado, que no debe
   cambiar nada porque `procesadas.json` lo salta.

## Riesgos conocidos

- **La deducción libre puede errar de sociedad.** El 25-08-2026 el modelo nombró
  "Laboratorio Boston S.A." en Food Group porque las glosas previas del asunto
  los nombran. Bien fundado, pero equivocado si ese día trabajó con otra. La
  nota diaria es el único control; por eso lleva apunte y glosa lado a lado.
- **`puente/` está sin versionar.** Todos los `.mjs` figuran como `??` en git.
  Hay que commitear el estado actual **antes** de reescribir, para tener a dónde
  volver.
- **Pendiente de agosto, sigue abierto:** confirmar si TimeBillingX pisa la
  glosa al re-sincronizar. Si pasa, la rutina debe correr con la app cerrada.

## Estado actual de la tarea de Windows

Cambiada el 22-09-2026: "Glosas TimeBilling" corre **todos los días a las
19:00** (antes L-V 20:00), reintentando cada 30 minutos por 4 horas, más una
pasada al iniciar sesión.
