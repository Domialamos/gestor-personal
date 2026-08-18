"use server";

import { clienteServidor } from "@/lib/supabase/servidor";
import { redirect } from "next/navigation";

export async function cerrarSesion() {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  redirect("/ingresar");
}
