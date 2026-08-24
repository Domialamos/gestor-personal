-- Bitácora de trabajo: to-do diario cuyas tareas quedan guardadas por cliente
create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  titulo text not null,
  tipo text not null default 'encargo' check (tipo in ('correo','documento','encargo','llamada','reunion','otro')),
  proyecto_id integer,
  cliente text,
  detalle text,
  documento text,
  fecha date not null default (now() at time zone 'America/Santiago')::date,
  estado text not null default 'pendiente' check (estado in ('pendiente','hecha')),
  completada_en timestamptz,
  creado_en timestamptz not null default now()
);

create index if not exists tareas_usuario_fecha on public.tareas (user_id, fecha desc);
create index if not exists tareas_usuario_cliente on public.tareas (user_id, cliente);

alter table public.tareas enable row level security;
drop policy if exists "propietaria_tareas" on public.tareas;
create policy "propietaria_tareas" on public.tareas
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
