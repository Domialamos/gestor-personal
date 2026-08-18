"use client";

// Exportadores de la vista filtrada: CSV (; + BOM), XLS (SpreadsheetML), JSON, Markdown y portapapeles.

export type Columna = { clave: string; titulo: string };
export type Fila = Record<string, string | number | boolean | string[] | null | undefined>;

function celda(v: Fila[string]): string {
  return v == null ? "" : Array.isArray(v) ? v.join(", ") : String(v);
}

export function aCsv(columnas: Columna[], filas: Fila[]): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lineas = [columnas.map((c) => esc(c.titulo)).join(";")];
  for (const f of filas) lineas.push(columnas.map((c) => esc(celda(f[c.clave]))).join(";"));
  return "﻿" + lineas.join("\r\n");
}

export function aXls(columnas: Columna[], filas: Fila[], nombre: string): string {
  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const filaXml = (celdas: string[], tipo = "String") =>
    `<Row>${celdas.map((c) => `<Cell><Data ss:Type="${tipo}">${escXml(c)}</Data></Cell>`).join("")}</Row>`;
  const cuerpo = filas.map((f) => filaXml(columnas.map((c) => celda(f[c.clave])))).join("");
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${escXml(nombre).slice(0, 30)}"><Table>${filaXml(columnas.map((c) => c.titulo))}${cuerpo}</Table></Worksheet></Workbook>`;
}

export function aMarkdown(columnas: Columna[], filas: Fila[]): string {
  const lineas = [
    `| ${columnas.map((c) => c.titulo).join(" | ")} |`,
    `| ${columnas.map(() => "---").join(" | ")} |`,
  ];
  for (const f of filas) lineas.push(`| ${columnas.map((c) => celda(f[c.clave]).replace(/\|/g, "\\|")).join(" | ")} |`);
  return lineas.join("\n");
}

export function descargar(contenido: string, nombre: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
