"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { SelectorClienteAsunto } from "@/componentes/selector-cliente-asunto";
import { PLANTILLAS } from "@/lib/plantillas-extraccion";
import { crearExtraccion } from "./acciones";

type Proyecto = { proyecto_id: number; cliente: string | null; nombre: string };

const TIPOS: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
};

export function FormularioExtraccion({ proyectos }: { proyectos: Proyecto[] }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState("contrato");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [paso, setPaso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const elegida = PLANTILLAS.find((p) => p.codigo === codigo)!;

  async function enviar(form: FormData) {
    setError(null);
    const textoPegado = String(form.get("texto") || "");
    if (!archivo && !textoPegado.trim()) {
      setError("Sube un archivo o pega el texto.");
      return;
    }

    let archivoRuta: string | null = null;
    if (archivo) {
      const extension = archivo.name.toLowerCase().split(".").pop() ?? "";
      if (!TIPOS[extension]) {
        setError("Formato no soportado. Sube un PDF, un Word (.docx) o un .txt.");
        return;
      }
      // El archivo va directo del navegador a Supabase: así no lo frena el
      // límite de 4,5 MB de las funciones de Vercel
      setPaso("Subiendo el archivo…");
      const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPaso(null);
        setError("La sesión expiró. Vuelve a ingresar.");
        return;
      }
      const limpio = archivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
      archivoRuta = `${user.id}/${crypto.randomUUID()}-${limpio}`;
      const { error: errorSubida } = await supabase.storage
        .from("documentos")
        .upload(archivoRuta, archivo, { contentType: TIPOS[extension], upsert: false });
      if (errorSubida) {
        setPaso(null);
        setError(`No se pudo subir: ${errorSubida.message}`);
        return;
      }
    }

    setPaso(archivo ? "Leyendo el documento…" : "Preparando el texto…");
    const r = await crearExtraccion({
      titulo,
      plantilla: codigo,
      clasesLibres: String(form.get("clases") || ""),
      instrucciones: String(form.get("instrucciones") || ""),
      asuntoTexto: String(form.get("asunto_texto") || ""),
      cliente: String(form.get("cliente") || ""),
      archivoRuta,
      archivoNombre: archivo?.name ?? null,
      textoPegado,
    });
    if (!r.ok) {
      setPaso(null);
      setError(r.error);
      return;
    }
    router.push(`/extraer/${r.valor}`);
  }

  return (
    <form action={enviar} className="formulario" style={{ marginTop: "1rem" }}>
      <label className="campo" style={{ gridColumn: "1 / -1" }}>
        Documento (PDF, Word o .txt; los PDF escaneados también sirven)
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setArchivo(f);
            if (f && !titulo) setTitulo(f.name.replace(/\.[^.]+$/, ""));
          }}
          style={{ paddingTop: "0.6rem" }}
        />
      </label>
      <label className="campo" style={{ gridColumn: "1 / -1" }}>
        O pega el texto
        <textarea name="texto" rows={4} placeholder="Cláusulas, una resolución, un correo…" disabled={!!archivo} />
      </label>

      <label className="campo">Título<input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Contrato de arriendo Los Aromos" /></label>
      <label className="campo">Tipo de documento
        <select value={codigo} onChange={(e) => setCodigo(e.target.value)}>
          {PLANTILLAS.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
        </select>
      </label>
      <SelectorClienteAsunto proyectos={proyectos} />
      <label className="campo">Cliente (si no está en la lista)<input name="cliente" placeholder="Se completa solo desde el asunto" /></label>

      <p className="meta" style={{ gridColumn: "1 / -1", margin: 0 }}>{elegida.descripcion}</p>
      {codigo === "libre" && (
        <label className="campo" style={{ gridColumn: "1 / -1" }}>
          ¿Qué buscar? (separado por coma)
          <input name="clases" required placeholder="Sociedades, aumentos de capital, directores, quórums" />
        </label>
      )}
      <label className="campo" style={{ gridColumn: "1 / -1" }}>
        Indicaciones adicionales (opcional)
        <textarea name="instrucciones" rows={2} placeholder="Fíjate especialmente en los plazos de aviso; ignora los anexos…" />
      </label>

      <div style={{ gridColumn: "1 / -1", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button className="pill pill--primaria" disabled={!!paso}>{paso ?? "Extraer"}</button>
        {error && <span className="estado estado--riesgo">{error}</span>}
      </div>
    </form>
  );
}
