import { createClient } from "@supabase/supabase-js";

// Cliente con service role: solo para crons y tareas de servidor. Nunca en el cliente.
export function clienteAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
