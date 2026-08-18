"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { revalidatePath } from "next/cache";

export async function marcarLeida(id: string, leida: boolean) {
  const supabase = await clienteServidor();
  await supabase.from("noticias").update({ leida }).eq("id", id);
  revalidatePath("/noticias");
  revalidatePath("/noticias-legales");
}

export async function destacar(id: string, destacada: boolean) {
  const supabase = await clienteServidor();
  await supabase.from("noticias").update({ destacada }).eq("id", id);
  revalidatePath("/noticias");
  revalidatePath("/noticias-legales");
}

// Dispara el cron correspondiente a mano, con el secreto del servidor.
export async function actualizarAhora(tipo: "noticias" | "noticias-legales" | "calendario") {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  await fetch(`${base}/api/cron/${tipo}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    cache: "no-store",
  });
  revalidatePath("/noticias");
  revalidatePath("/noticias-legales");
  revalidatePath("/calendario");
}
