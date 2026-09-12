-- Prioridad de las tareas: desempata dentro de un mismo día en el to-do.
-- El orden grueso lo sigue mandando fecha_limite (ver lib/tareas.ts); esto solo
-- decide qué va antes entre cosas del mismo día.

alter table public.tareas
  add column if not exists prioridad text not null default 'media';

do $$
begin
  alter table public.tareas
    add constraint tareas_prioridad_valida check (prioridad in ('alta','media','baja'));
exception
  when duplicate_object then null;
end $$;

-- El to-do del día pide las pendientes ordenadas por fecha límite y prioridad
create index if not exists tareas_pendientes_prioridad
  on public.tareas (user_id, fecha_limite, prioridad)
  where estado = 'pendiente';
