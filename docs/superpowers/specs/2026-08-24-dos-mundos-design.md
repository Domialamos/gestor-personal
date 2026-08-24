# Gestor dividido en dos mundos — diseño (2026-08-24)

## Qué cambia

El gestor se divide en dos secciones con identidad propia:

- **Trabajo** (familia fría, acento azul `#2b5aa0`): hub `/trabajo` + Calendario (Outlook/Teams vía ICS), Horas y Radar legal.
- **Personal** (familia cálida, acento terracota `#c25a32`): hub `/personal` + Actualidad, Cuentas, Gastos y Reembolsos.

La portada `/` saluda y muestra dos tarjetas-mundo con lo esencial de cada ámbito.
La navegación agrupa los módulos bajo etiquetas Trabajo / Personal (las etiquetas enlazan a los hubs).

## Sistema de diseño «dos mundos»

Tokens en `app/globals.css`. Fondos por módulo:

| Ámbito | Token | Hex | Módulo |
|---|---|---|---|
| Trabajo | `--bruma` | `#e8edf3` | hub |
| Trabajo | `--hielo` | `#d9e5ef` | calendario |
| Trabajo | `--arena` | `#ece3cf` | horas |
| Trabajo | `--piedra` | `#e5e1d6` | legal |
| Personal | `--marfil` | `#f5eee1` | hub / ingresar |
| Personal | `--durazno` | `#f6dcc4` | actualidad |
| Personal | `--barro` | `#f0cfc2` | cuentas |
| Personal | `--salvia` | `#d8e5d0` | gastos |
| Personal | `--glicina` | `#e2d8ee` | reembolsos |

Cada clase `fondo--*` fija además `--acento` (azul o terracota); los botones primarios lo usan en hover. Los tokens antiguos (`--crema`, `--rosa`, `--menta`, …) quedan como alias de los nuevos, así los `estado--*` y cualquier uso previo siguen funcionando.

Tipografía sin cambios: Satoshi + Instrument Serif itálica.

## Calendario Outlook/Teams

Se mantiene la vía ICS existente (`ICS_URL_MICROSOFT`, cron diario). El ICS publicado de Outlook incluye las reuniones de Teams. Una integración Microsoft Graph (calendario/Teams en vivo) requeriría app en Azure AD; queda fuera de este cambio.

## Verificación

`tsc --noEmit` limpio, 19/19 tests, `next build` exitoso con las rutas nuevas `/trabajo` y `/personal`.
