-- Registro de horas y caché de proyectos de TimeBilling.

create table if not exists public.tb_proyectos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  proyecto_id integer not null,
  codigo text,
  nombre text not null,
  cliente text,
  activo boolean not null default true,
  sincronizado_en timestamptz not null default now(),
  unique (user_id, proyecto_id)
);

create table if not exists public.horas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  inicio timestamptz not null default now(),
  fin timestamptz,
  duracion_min integer check (duracion_min > 0),
  proyecto_id integer,
  tipo_trabajo text not null default 'general',
  descripcion text not null default '',
  facturable boolean not null default true,
  estado text not null default 'corriendo'
    check (estado in ('corriendo','borrador','aprobada','cargada','error')),
  tb_time_entry_id integer,
  cargada_en timestamptz,
  error_carga text,
  creado_en timestamptz not null default now()
);

-- Un solo cronómetro corriendo por persona, garantizado por la base de datos.
create unique index if not exists horas_una_corriendo
  on public.horas (user_id) where estado = 'corriendo';

create index if not exists horas_estado_inicio
  on public.horas (user_id, estado, inicio desc);

-- Una hora ya cargada en TimeBilling es terminal: la base de datos lo exige
-- porque el puente local escribe directo con supabase-js y no siempre pasa
-- por transicionValida() de lib/horas.ts.
create or replace function public.horas_cargada_es_terminal()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'cargada' and new.estado is distinct from old.estado then
    raise exception 'Una hora ya cargada en TimeBilling no cambia de estado.';
  end if;
  return new;
end;
$$;

drop trigger if exists horas_cargada_es_terminal on public.horas;

create trigger horas_cargada_es_terminal
  before update on public.horas
  for each row
  execute function public.horas_cargada_es_terminal();

-- RLS: solo la dueña ve y toca sus filas (mismo patrón que el esquema inicial)
do $$
declare t text;
begin
  foreach t in array array['horas','tb_proyectos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "propietaria_%1$s" on public.%1$I', t);
    execute format($f$
      create policy "propietaria_%1$s" on public.%1$I
        for all using (user_id = auth.uid()) with check (user_id = auth.uid())
    $f$, t);
  end loop;
end $$;
