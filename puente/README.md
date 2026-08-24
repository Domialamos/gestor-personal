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
