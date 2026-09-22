const ENDPOINT = "https://datos.bcn.cl/sparql";

const PREFIJOS = `PREFIX n: <http://datos.bcn.cl/ontologies/bcn-norms#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

type Fila = Record<string, { value: string }>;

async function consultar(sparql: string): Promise<Fila[]> {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(`${PREFIJOS}\n${sparql}`)}`;
  let r: Response;
  for (let intento = 0; ; intento++) {
    r = await fetch(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": "gestor-personal (datos abiertos BCN)" },
      signal: AbortSignal.timeout(20000),
      next: { revalidate: 86400 },
    });
    if (r.status !== 429 || intento === 3) break;
    const espera = Number(r.headers.get("retry-after")) || 2 ** intento;
    await new Promise((listo) => setTimeout(listo, Math.min(espera, 5) * 1000));
  }
  if (r.status === 429) throw new Error("La BCN está limitando consultas; prueba de nuevo en un minuto.");
  if (!r.ok) throw new Error(`La BCN respondió ${r.status}`);
  const json = await r.json();
  return json.results.bindings;
}

export type Ley = {
  uri: string;
  numero: string;
  titulo: string;
  publicacion: string;
  promulgacion?: string;
  organismo?: string;
  leychile: string;
};

export type Modificacion = { tipo: string; numero: string; titulo: string; publicacion: string; leychile?: string };

const organismo = (uri?: string) =>
  uri?.split("/").pop()?.replace(/_/g, " · ").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export async function buscarLey(numero: string): Promise<{ ley: Ley; modificaciones: Modificacion[] } | null> {
  // El número es xsd:string: con el literal tipado Virtuoso usa el índice; un FILTER(STR()) da timeout
  const filas = await consultar(`SELECT ?norma ?tit ?pub ?prom ?lc ?org WHERE {
    ?norma n:hasNumber "${numero}"^^xsd:string ; a n:RootNorm ;
      n:type <http://datos.bcn.cl/recurso/cl/norma/tipo#ley> ;
      dc:title ?tit ; n:publishDate ?pub ; n:leychileCode ?lc .
    OPTIONAL { ?norma n:promulgationDate ?prom } OPTIONAL { ?norma n:createdBy ?org }
  } LIMIT 1`);
  if (!filas.length) return null;
  const f = filas[0];
  const ley: Ley = {
    uri: f.norma.value,
    numero,
    titulo: f.tit.value,
    publicacion: f.pub.value,
    promulgacion: f.prom?.value,
    organismo: organismo(f.org?.value),
    leychile: f.lc.value,
  };

  const mods = await consultar(`SELECT DISTINCT ?m ?tit ?num ?pub ?tipo ?lc WHERE {
    <${ley.uri}> n:hasVersion ?v . ?m n:modifiesTo ?v ;
      dc:title ?tit ; n:hasNumber ?num ; n:publishDate ?pub ; n:type ?tipo .
    OPTIONAL { ?m n:leychileCode ?lc }
  } ORDER BY DESC(?pub)`);
  const vistas = new Set<string>();
  const modificaciones = mods
    .filter((m) => !vistas.has(m.m.value) && vistas.add(m.m.value))
    .map((m) => ({
      tipo: m.tipo.value.split("#").pop() ?? "",
      numero: m.num.value,
      titulo: m.tit.value,
      publicacion: m.pub.value,
      leychile: m.lc?.value,
    }));
  return { ley, modificaciones };
}
