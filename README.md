# Gestor personal

App privada de Dominga Álamos: noticias de actualidad, radar legal chileno, calendario, cuentas por pagar, gastos y reembolsos de salud (isapre → seguro complementario).

- Next.js (App Router) + Supabase (auth por magic link + RLS) + Vercel (crons de ingesta).
- Todo en español de Chile: fechas DD-MM-AAAA, miles con punto, UF.
- Variables de entorno en `.env.local` (ver `vercel.json` para los crons).
