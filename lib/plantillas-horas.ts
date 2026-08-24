// Plantillas base para la descripción de un trabajo. Los {marcadores} quedan
// visibles en el borrador: rellenarlos es el trabajo manual mínimo.

export type TipoTrabajo =
  | "reunion" | "revision" | "redaccion" | "estudio"
  | "gestion" | "llamada" | "correo" | "general";

export const TIPOS_TRABAJO: { codigo: TipoTrabajo; etiqueta: string; plantilla: string }[] = [
  { codigo: "reunion",   etiqueta: "Reunión",   plantilla: "Reunión con {contraparte} para tratar {materia}." },
  { codigo: "revision",  etiqueta: "Revisión",  plantilla: "Revisión de {documento} y preparación de observaciones." },
  { codigo: "redaccion", etiqueta: "Redacción", plantilla: "Redacción de {documento}." },
  { codigo: "estudio",   etiqueta: "Estudio",   plantilla: "Estudio de antecedentes sobre {materia}." },
  { codigo: "gestion",   etiqueta: "Gestión",   plantilla: "Gestión de {tramite} ante {organismo}." },
  { codigo: "llamada",   etiqueta: "Llamada",   plantilla: "Llamada telefónica con {contraparte} sobre {materia}." },
  { codigo: "correo",    etiqueta: "Correos",   plantilla: "Análisis y respuesta de correos sobre {materia}." },
  { codigo: "general",   etiqueta: "General",   plantilla: "" },
];

export function plantillaDe(codigo: string): string {
  return TIPOS_TRABAJO.find((t) => t.codigo === codigo)?.plantilla ?? "";
}

// Un marcador es {palabra}. Sirve para no dejar aprobar una descripción a medias.
export function tieneMarcadores(texto: string): boolean {
  return /\{[^}]+\}/.test(texto);
}
