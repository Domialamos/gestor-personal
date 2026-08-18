import { clienteServidor } from "@/lib/supabase/servidor";
import { ListaNoticias } from "@/componentes/lista-noticias";

export const dynamic = "force-dynamic";

export default async function Noticias() {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("noticias")
    .select("*")
    .eq("tipo", "actualidad")
    .order("publicado_en", { ascending: false })
    .limit(300);

  return (
    <main>
      <h1 className="titulo">
        Qué pasa <em>hoy</em>
      </h1>
      <p className="bajada">Los titulares de Emol, La Tercera, Diario Financiero y Cooperativa, tres veces al día.</p>
      <ListaNoticias filas={data ?? []} tipo="noticias" />
    </main>
  );
}
