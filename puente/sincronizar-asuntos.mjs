// Trae los asuntos de TimeBilling (/app/Matters/listAll) usando la sesión del
// perfil persistente y los deja en tb_proyectos del gestor, para que el
// selector de proyectos de /horas muestre los asuntos reales.
//
// proyecto_id es el código sin guion como número ("000784-0001" -> 7840001):
// estable, único por asunto y cabe en integer.

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const { TB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, GESTOR_EMAIL, GESTOR_PASSWORD } = process.env;
for (const [nombre, valor] of Object.entries({ TB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, GESTOR_EMAIL, GESTOR_PASSWORD })) {
  if (!valor) { console.error(`Falta ${nombre} en puente/.env`); process.exit(1); }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const { error: errorLogin } = await supabase.auth.signInWithPassword({
  email: GESTOR_EMAIL, password: GESTOR_PASSWORD,
});
if (errorLogin) { console.error(`No pude entrar al gestor: ${errorLogin.message}`); process.exit(1); }

const contexto = await chromium.launchPersistentContext("./perfil", { headless: true });
const pagina = contexto.pages()[0] ?? (await contexto.newPage());
await pagina.goto(TB_URL);

if (pagina.url().toLowerCase().includes("login")) {
  await contexto.close();
  console.error("\nLa sesión de TimeBilling caducó. Corre `npm run configurar` y vuelve a intentar.");
  process.exit(1);
}

const respuesta = await pagina.evaluate(async () => {
  const r = await fetch("/time_tracking/app/Matters/listAll", { credentials: "include" });
  return { estado: r.status, texto: await r.text() };
});
await contexto.close();

if (respuesta.estado !== 200) {
  console.error(`TimeBilling respondió ${respuesta.estado} al listar asuntos.`);
  process.exit(1);
}

const { data: clientes } = JSON.parse(respuesta.texto);
const filas = [];
for (const c of clientes) {
  for (const m of c.matters ?? []) {
    filas.push({
      proyecto_id: Number(m.codigo_asunto.replace("-", "")),
      codigo: m.codigo_asunto,
      nombre: m.glosa_asunto,
      cliente: c.glosa_cliente,
      activo: true,
      sincronizado_en: new Date().toISOString(),
    });
  }
}

console.log(`${filas.length} asunto(s) en TimeBilling.`);

const { error } = await supabase
  .from("tb_proyectos")
  .upsert(filas, { onConflict: "user_id,proyecto_id" });
if (error) { console.error(error.message); process.exit(1); }

console.log("tb_proyectos quedó sincronizada. El selector de /horas ya muestra los asuntos.");
