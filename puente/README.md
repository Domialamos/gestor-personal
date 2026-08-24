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
TB_URL=https://bsvv.thetimebilling.com
TB_ID_USUARIO=165
TB_ID_CATEGORIA=6
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
npm run sincronizar  # trae los asuntos de TimeBilling a tb_proyectos
npm run descubrir    # solo si TimeBilling cambia y hay que re-descubrir
npm run cargar       # cada vez que quieras subir las horas aprobadas
```

## Transporte

Descubierto el 24-08-2026 sobre la sesión real de `bsvv.thetimebilling.com`
(LemonSuite Enterprise). El transporte titular es el **XHR**:

- **Guardar**: `POST /time_tracking/app/react/trabajos/guardar.php` con JSON.
  Campos clave: `codigo_asunto` (texto, ej. `000022-0004` = cliente `000022`,
  asunto `0004`), `id_usuario` (`165`), `id_categoria_usuario` (`6`), `fecha`
  (`AAAA-MM-DD`), `duracion` y `duracion_cobrada` (`"HH:MM"`, solo múltiplos de
  5 minutos), `descripcion`, `cobrable` (bool). La respuesta devuelve el
  `id_trabajo` creado.
- **Eliminar**: `GET /time_tracking/app/react/trabajos/eliminar.php?id_trabajo=N`.
- **Asuntos**: `GET /time_tracking/app/Matters/listAll` lista los códigos; con
  eso se puebla `tb_proyectos` (el código va en la columna `codigo`).

El transporte por formulario (`transporte/ui.mjs`) queda de respaldo:
`TRANSPORTE=ui` en `.env` lo activa.
