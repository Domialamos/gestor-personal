-- Delegación y seguimiento.
--
-- Lo que se le encarga a otra persona deja de ser un pendiente propio: pasa al
-- estado 'esperando' y sale del to-do del día. Pero no se olvida, porque queda
-- registrado a quién y desde cuándo, y cada vez que se insiste se anota.

alter table public.tareas
  add column if not exists delegada_a text,
  add column if not exists delegada_en date;

-- Tercer estado. El check original se llama tareas_estado_check (nombre que
-- genera Postgres para un check inline de columna).
alter table public.tareas drop constraint if exists tareas_estado_check;
alter table public.tareas drop constraint if exists tareas_estado_valido;
alter table public.tareas
  add constraint tareas_estado_valido
  check (estado in ('pendiente','esperando','hecha'));

-- Una tarea delegada tiene que decir a quién; una que no lo está, no puede
-- tener fecha de delegación suelta
alter table public.tareas drop constraint if exists tareas_delegacion_coherente;
alter table public.tareas
  add constraint tareas_delegacion_coherente
  check (
    (estado = 'esperando' and delegada_a is not null and delegada_en is not null)
    or (estado <> 'esperando')
  );

-- Historial: una fila por cada vez que se insiste. Tabla aparte y no un campo
-- de texto porque el bloque "Esperando" cuenta y ordena por esto.
create table if not exists public.seguimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  tarea_id uuid not null references public.tareas(id) on delete cascade,
  fecha date not null default (now() at time zone 'America/Santiago')::date,
  nota text,
  creado_en timestamptz not null default now()
);

create index if not exists seguimientos_tarea on public.seguimientos (tarea_id, fecha desc);

-- El bloque "Esperando" pide las delegadas ordenadas por antiguedad
create index if not exists tareas_esperando
  on public.tareas (user_id, delegada_en)
  where estado = 'esperando';

alter table public.seguimientos enable row level security;
drop policy if exists "propietaria_seguimientos" on public.seguimientos;
create policy "propietaria_seguimientos" on public.seguimientos
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
