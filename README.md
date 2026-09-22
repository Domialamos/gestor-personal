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

## Extraer

El módulo `/extraer` saca datos estructurados de contratos, expedientes, informes
o lo que se defina a mano, con la idea de LangExtract (Google): cada dato es una
cita literal que se vuelve a buscar en el documento, y queda marcada como exacta,
aproximada o sin respaldo. El archivo va del navegador al bucket privado
`documentos` de Supabase; el servidor lo lee (PDF con `unpdf`, Word con `mammoth`,
PDF escaneado transcrito por Claude) y el navegador pide los tramos de a cuatro
para no chocar con el techo de tiempo de Vercel. Requiere `ANTHROPIC_API_KEY`.
Lógica pura y pruebas en `lib/extraer.ts`.
