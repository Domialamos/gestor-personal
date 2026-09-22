-- Extraer: datos estructurados de contratos, expedientes e informes, cada uno
-- con la posición exacta de donde salió en el documento (la idea de LangExtract).
--
-- Una extracción guarda el texto completo del documento: las posiciones de los
-- ítems apuntan a ese texto, y así se puede volver a subrayar sin releer el archivo.

create table if not exists public.extracciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  titulo text not null,
  plantilla text not null default 'contrato',
  -- Las clases con que se corrió, copiadas: si mañana cambia la plantilla,
  -- esta extracción se sigue leyendo igual
  clases jsonb not null default '[]'::jsonb,
  instrucciones text,
  proyecto_id integer,
  cliente text,
  archivo_nombre text,
  archivo_ruta text,
  texto text not null default '',
  -- true si el PDF era escaneado y el texto lo transcribió Claude
  transcrito boolean not null default false,
  tramos_total integer not null default 0,
  tramos_hechos integer not null default 0,
  estado text not null default 'procesando' check (estado in ('procesando','lista','error')),
  error text,
  modelo text,
  creado_en timestamptz not null default now()
);

create index if not exists extracciones_usuario_fecha on public.extracciones (user_id, creado_en desc);

create table if not exists public.extraccion_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  extraccion_id uuid not null references public.extracciones(id) on delete cascade,
  tramo integer not null,
  orden integer not null,
  clase text not null,
  texto text not null,
  atributos jsonb not null default '{}'::jsonb,
  fecha date,
  -- Posición en extracciones.texto; null cuando la cita no aparece en el documento
  inicio integer,
  fin integer,
  alineacion text not null check (alineacion in ('exacta','aproximada','sin_respaldo')),
  tarea_id uuid references public.tareas(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists extraccion_items_extraccion on public.extraccion_items (extraccion_id, tramo, orden);

alter table public.extracciones enable row level security;
drop policy if exists "propietaria_extracciones" on public.extracciones;
create policy "propietaria_extracciones" on public.extracciones
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.extraccion_items enable row level security;
drop policy if exists "propietaria_extraccion_items" on public.extraccion_items;
create policy "propietaria_extraccion_items" on public.extraccion_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Los archivos originales: bucket privado, cada usuaria en su carpeta <uid>/…
-- El navegador sube directo aquí, sin pasar por la función de Vercel (que corta a 4,5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos', 'documentos', false, 52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/markdown'
  ]
)
on conflict (id) do nothing;

drop policy if exists "documentos_propios_leer" on storage.objects;
create policy "documentos_propios_leer" on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documentos_propios_subir" on storage.objects;
create policy "documentos_propios_subir" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "documentos_propios_borrar" on storage.objects;
create policy "documentos_propios_borrar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos' and (storage.foldername(name))[1] = auth.uid()::text);
