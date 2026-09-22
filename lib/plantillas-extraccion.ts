// Qué se busca en cada tipo de documento. Cada clase lleva una guía corta que
// va al modelo, y la etiqueta con que se muestra en pantalla.

export type Clase = { codigo: string; etiqueta: string; guia: string };
export type Plantilla = { codigo: string; nombre: string; descripcion: string; clases: Clase[] };

const NORMA: Clase = {
  codigo: "norma",
  etiqueta: "Norma citada",
  guia: "Ley, decreto, artículo, reglamento o circular que el texto cita. Atributos: cuerpo legal, artículo.",
};

export const PLANTILLAS: Plantilla[] = [
  {
    codigo: "contrato",
    nombre: "Contrato",
    descripcion: "Partes, objeto, precio, plazos, obligaciones, garantías, multas y término.",
    clases: [
      { codigo: "parte", etiqueta: "Parte", guia: "Cada persona o sociedad que contrata. Atributos: rol (arrendador, comprador…), RUT, domicilio, representante si aparecen." },
      { codigo: "representante", etiqueta: "Representante", guia: "Quien firma por una parte. Atributos: representa a, personería (escritura, notaría, fecha)." },
      { codigo: "objeto", etiqueta: "Objeto", guia: "Qué se contrata: el bien, servicio u obra." },
      { codigo: "precio", etiqueta: "Precio o monto", guia: "Precio, renta, honorario o cualquier monto. Atributos: moneda (CLP, UF, USD), periodicidad, forma de pago, reajuste." },
      { codigo: "plazo", etiqueta: "Plazo o fecha", guia: "Vigencia, vencimientos, plazos de pago o de aviso, fechas de entrega. Atributos: duración, desde cuándo se cuenta, renovación." },
      { codigo: "obligacion", etiqueta: "Obligación", guia: "Lo que una parte debe hacer o no hacer. Atributos: obligado, condición." },
      { codigo: "garantia", etiqueta: "Garantía", guia: "Boleta, póliza, prenda, hipoteca, fianza, codeuda solidaria o mes de garantía. Atributos: monto, vigencia." },
      { codigo: "multa", etiqueta: "Multa o sanción", guia: "Cláusula penal, multas, intereses por mora, indemnizaciones pactadas. Atributos: monto, causal, tope." },
      { codigo: "termino", etiqueta: "Término", guia: "Causales de terminación anticipada, resciliación, aviso de no renovación. Atributos: causal, aviso previo." },
      { codigo: "confidencialidad", etiqueta: "Confidencialidad o exclusividad", guia: "Deberes de reserva, no competencia, exclusividad. Atributos: duración, alcance." },
      { codigo: "jurisdiccion", etiqueta: "Ley y jurisdicción", guia: "Ley aplicable, tribunal competente, arbitraje, domicilio convencional." },
      NORMA,
    ],
  },
  {
    codigo: "expediente",
    nombre: "Expediente judicial",
    descripcion: "Tribunal, rol, partes, resoluciones, plazos procesales, audiencias y montos.",
    clases: [
      { codigo: "tribunal", etiqueta: "Tribunal", guia: "Tribunal, sala o juez. Atributos: competencia." },
      { codigo: "rol", etiqueta: "Rol o RIT", guia: "Rol, RIT, RUC u otro identificador de la causa." },
      { codigo: "parte", etiqueta: "Parte", guia: "Demandante, demandado, querellante, tercero. Atributos: calidad procesal, RUT, apoderado." },
      { codigo: "abogado", etiqueta: "Abogado o apoderado", guia: "Abogados patrocinantes y apoderados. Atributos: representa a." },
      { codigo: "peticion", etiqueta: "Petición", guia: "Lo que se pide al tribunal. Atributos: quién lo pide." },
      { codigo: "resolucion", etiqueta: "Resolución", guia: "Lo que el tribunal resuelve o decreta. Atributos: tipo (sentencia, auto, decreto), fecha." },
      { codigo: "plazo", etiqueta: "Plazo procesal", guia: "Plazos para contestar, recurrir, cumplir u otros. Atributos: días, tipo (hábiles, corridos), desde cuándo se cuenta." },
      { codigo: "audiencia", etiqueta: "Audiencia", guia: "Audiencias o comparecencias fijadas. Atributos: tipo, hora, lugar o enlace." },
      { codigo: "notificacion", etiqueta: "Notificación", guia: "Notificaciones practicadas u ordenadas. Atributos: forma, a quién." },
      { codigo: "monto", etiqueta: "Monto", guia: "Montos demandados, condenas, costas. Atributos: moneda, concepto." },
      NORMA,
    ],
  },
  {
    codigo: "informe",
    nombre: "Informe o minuta",
    descripcion: "Conclusiones, hallazgos, riesgos, recomendaciones, cifras y responsables.",
    clases: [
      { codigo: "conclusion", etiqueta: "Conclusión", guia: "Conclusiones o respuestas a la pregunta del informe." },
      { codigo: "hallazgo", etiqueta: "Hallazgo", guia: "Hechos relevantes, brechas o incumplimientos detectados. Atributos: área, gravedad si se indica." },
      { codigo: "riesgo", etiqueta: "Riesgo", guia: "Riesgos o contingencias. Atributos: probabilidad, impacto, quién lo asume." },
      { codigo: "recomendacion", etiqueta: "Recomendación", guia: "Acciones sugeridas. Atributos: responsable, prioridad." },
      { codigo: "cifra", etiqueta: "Cifra", guia: "Montos, porcentajes y datos numéricos relevantes. Atributos: unidad, concepto." },
      { codigo: "responsable", etiqueta: "Responsable", guia: "Personas, cargos o áreas a cargo de algo. Atributos: de qué." },
      { codigo: "plazo", etiqueta: "Plazo o fecha", guia: "Fechas y plazos comprometidos o relevantes. Atributos: qué vence." },
      NORMA,
    ],
  },
  {
    codigo: "libre",
    nombre: "Libre",
    descripcion: "Tú defines qué buscar: escribe las categorías separadas por coma.",
    clases: [],
  },
];

export function plantilla(codigo: string | null | undefined): Plantilla {
  return PLANTILLAS.find((p) => p.codigo === codigo) ?? PLANTILLAS[0];
}

// "Plazos, multas; sociedades" → clases con código estable
export function clasesLibres(texto: string): Clase[] {
  const vistas = new Set<string>();
  const clases: Clase[] = [];
  for (const parte of texto.split(/[,;\n]/)) {
    const etiqueta = parte.trim();
    if (!etiqueta) continue;
    const codigo = etiqueta
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
      .slice(0, 40);
    if (!codigo || vistas.has(codigo)) continue;
    vistas.add(codigo);
    clases.push({ codigo, etiqueta: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1), guia: etiqueta });
  }
  return clases;
}

// Las clases con que se corre una extracción: las de la plantilla, o las que
// escribió Dominga si es libre
export function clasesDe(codigoPlantilla: string, libres: Clase[] | null | undefined): Clase[] {
  return codigoPlantilla === "libre" ? libres ?? [] : plantilla(codigoPlantilla).clases;
}

export function etiquetaClase(clases: Clase[], codigo: string): string {
  return clases.find((c) => c.codigo === codigo)?.etiqueta ?? codigo;
}
