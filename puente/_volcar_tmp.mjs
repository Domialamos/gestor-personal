import "dotenv/config";
import { writeFileSync } from "node:fs";
import { conSesion, traerRango } from "./lib/sesion.mjs";
const { TB_URL, TB_ID_USUARIO } = process.env;
const [desde, hasta, salida] = process.argv.slice(2);
const filas = await conSesion((pagina) =>
  traerRango(pagina, { url: TB_URL, idUsuario: TB_ID_USUARIO, desde, hasta, maxPaginas: 80 }));
writeFileSync(salida, JSON.stringify(filas, null, 2));
console.log(`${filas.length} filas entre ${desde} y ${hasta}`);
