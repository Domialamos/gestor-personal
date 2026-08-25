-- Recordatorios: una tarea puede tener fecha en que debe hacerse/recordarse
alter table public.tareas add column if not exists fecha_limite date;
create index if not exists tareas_usuario_limite on public.tareas (user_id, fecha_limite) where fecha_limite is not null;
