import { buscarLey } from "@/lib/bcn";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = { ley: "Ley", dl: "D.L.", dfl: "D.F.L.", decreto: "Decreto", res: "Resolución" };
const fecha = (iso?: string) => (iso ? iso.split("-").reverse().join("-") : "—");
const miles = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const leychile = (id: string) => `https://www.bcn.cl/leychile/navegar?idNorma=${id}`;

export default async function Bcn({ searchParams }: { searchParams: Promise<{ ley?: string }> }) {
  const numero = ((await searchParams).ley ?? "").replace(/\D/g, "");
  let resultado: Awaited<ReturnType<typeof buscarLey>> = null;
  let error = "";
  if (numero) {
    try {
      resultado = await buscarLey(numero);
    } catch (e) {
      error = e instanceof Error ? e.message : "No se pudo consultar la BCN";
    }
  }

  return (
    <main>
      <h1 className="titulo">
        Leyes <em>BCN</em>
      </h1>
      <p className="bajada">
        Ficha y modificaciones de una ley, consultadas en vivo al endpoint SPARQL de la Biblioteca del Congreso.
      </p>

      <form className="bcn-busqueda">
        <label className="campo">
          Número de ley
          <input name="ley" defaultValue={numero ? miles(numero) : ""} placeholder="20.393" inputMode="numeric" autoFocus />
        </label>
        <button className="pill">Buscar</button>
      </form>

      {error && <p className="bcn-aviso">{error}</p>}
      {numero && !error && !resultado && <p className="bcn-aviso">No hay una ley N°{miles(numero)} en el grafo de la BCN.</p>}

      {resultado && (
        <>
          <section className="bcn-ficha">
            <p className="bcn-numero">Ley N°{miles(resultado.ley.numero)}</p>
            <h2>{resultado.ley.titulo}</h2>
            <dl>
              <dt>Publicación</dt><dd>{fecha(resultado.ley.publicacion)}</dd>
              <dt>Promulgación</dt><dd>{fecha(resultado.ley.promulgacion)}</dd>
              {resultado.ley.organismo && (<><dt>Organismo</dt><dd>{resultado.ley.organismo}</dd></>)}
            </dl>
            <a href={leychile(resultado.ley.leychile)} target="_blank" rel="noreferrer">Ver en LeyChile ↗</a>
          </section>

          <h3 className="bcn-subtitulo">Normas que la modifican ({resultado.modificaciones.length})</h3>
          {resultado.modificaciones.length ? (
            <table className="tabla">
              <thead>
                <tr><th>Publicación</th><th>Norma</th><th>Título</th></tr>
              </thead>
              <tbody>
                {resultado.modificaciones.map((m) => (
                  <tr key={m.tipo + m.numero}>
                    <td className="num">{fecha(m.publicacion)}</td>
                    <td>
                      {m.leychile ? (
                        <a href={leychile(m.leychile)} target="_blank" rel="noreferrer">{TIPOS[m.tipo] ?? m.tipo} N°{miles(m.numero)}</a>
                      ) : (
                        `${TIPOS[m.tipo] ?? m.tipo} N°${miles(m.numero)}`
                      )}
                    </td>
                    <td>{m.titulo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="bcn-aviso">El grafo no registra modificaciones.</p>
          )}
          <p className="bcn-nota">
            Los vínculos de modificación vienen del grafo de la BCN y pueden estar incompletos; confirma el historial en LeyChile.
          </p>
        </>
      )}
    </main>
  );
}
