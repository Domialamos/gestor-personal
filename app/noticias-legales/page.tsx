import { clienteServidor } from "@/lib/supabase/servidor";
import { ListaNoticias } from "@/componentes/lista-noticias";
import { ETIQUETAS_TEMAS } from "@/lib/temas";

export const dynamic = "force-dynamic";

export default async function NoticiasLegales() {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("noticias")
    .select("*")
    .eq("tipo", "legal")
    .order("publicado_en", { ascending: false })
    .limit(300);

  return (
    <main>
      <h1 className="titulo">
        Radar <em>legal</em>
      </h1>
      <p className="bajada">
        CMF, Diario Constitucional y El Mercurio Legal, etiquetados con tus temas: fondos, sociedades anónimas, pagarés, servidumbres y delitos económicos.
      </p>
      <ListaNoticias filas={data ?? []} tipo="noticias-legales" etiquetas={ETIQUETAS_TEMAS} />
    </main>
  );
}
