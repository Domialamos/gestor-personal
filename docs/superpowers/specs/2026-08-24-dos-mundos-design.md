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
| Personal | `--marfil` | `#faeef3` | hub / ingresar |
| Personal | `--durazno` | `#f8dbe6` | actualidad |
| Personal | `--barro` | `#f4c8d9` | cuentas |
| Personal | `--salvia` | `#fce4dd` | gastos |
| Personal | `--glicina` | `#eed4e8` | reembolsos |

La familia Personal es rosada (pedido del 24-08-2026): acento `#d1477e`; `--menta` queda fijo en verde `#d8e5d0` para los estados ok.

Cada clase `fondo--*` fija además `--acento` (azul o terracota); los botones primarios lo usan en hover. Los tokens antiguos (`--crema`, `--rosa`, `--menta`, …) quedan como alias de los nuevos, así los `estado--*` y cualquier uso previo siguen funcionando.

Tipografía sin cambios: Satoshi + Instrument Serif itálica.

## Calendario Outlook/Teams

Se mantiene la vía ICS existente (`ICS_URL_MICROSOFT`, cron diario). El ICS publicado de Outlook incluye las reuniones de Teams. Una integración Microsoft Graph (calendario/Teams en vivo) requeriría app en Azure AD; queda fuera de este cambio.

## Verificación

`tsc --noEmit` limpio, 19/19 tests, `next build` exitoso con las rutas nuevas `/trabajo` y `/personal`.
