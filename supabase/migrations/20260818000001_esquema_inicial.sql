-- Esquema inicial del gestor personal
-- Todas las tablas son privadas: RLS activo y política por user_id.

create table if not exists public.noticias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  tipo text not null check (tipo in ('actualidad','legal')),
  fuente text not null,
  titulo text not null,
  resumen text,
  url text not null unique,
  publicado_en timestamptz,
  temas text[] not null default '{}',
  leida boolean not null default false,
  destacada boolean not null default false,
  creado_en timestamptz not null default now()
);
create index if not exists noticias_tipo_fecha on public.noticias (tipo, publicado_en desc);

create table if not exists public.eventos_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  origen text not null check (origen in ('google','microsoft','manual')),
  uid_externo text not null default '',
  titulo text not null,
  inicio timestamptz not null,
  fin timestamptz,
  todo_el_dia boolean not null default false,
  ubicacion text,
  creado_en timestamptz not null default now(),
  unique (origen, uid_externo, inicio)
);

create table if not exists public.cuentas_por_pagar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  nombre text not null,
  categoria text not null default 'general',
  monto numeric not null check (monto >= 0),
  moneda text not null default 'CLP' check (moneda in ('CLP','UF')),
  fecha_vencimiento date,
  recurrente boolean not null default false,
  dia_vencimiento smallint check (dia_vencimiento between 1 and 31),
  estado text not null default 'pendiente' check (estado in ('pendiente','pagada','vencida')),
  pagada_en date,
  notas text,
  creado_en timestamptz not null default now()
);

create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  fecha date not null default current_date,
  descripcion text not null,
  categoria text not null default 'general',
  monto numeric not null check (monto >= 0),
  moneda text not null default 'CLP' check (moneda in ('CLP','UF')),
  medio_pago text,
  origen text not null default 'manual',
  referencia_externa text,
  creado_en timestamptz not null default now()
);

create table if not exists public.reembolsos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  descripcion text not null,
  prestador text,
  fecha_prestacion date,
  monto_total numeric not null check (monto_total >= 0),
  monto_isapre numeric check (monto_isapre >= 0),
  fecha_isapre date,
  monto_seguro numeric check (monto_seguro >= 0),
  fecha_seguro date,
  estado text not null default 'pendiente_isapre' check (estado in
    ('pendiente_isapre','bonificado_isapre','enviado_seguro','reembolsado_seguro','cerrado','rechazado')),
  saldo_pendiente numeric generated always as
    (monto_total - coalesce(monto_isapre,0) - coalesce(monto_seguro,0)) stored,
  notas text,
  creado_en timestamptz not null default now()
);

-- RLS: solo la dueña ve y toca sus filas
do $$
declare t text;
begin
  foreach t in array array['noticias','eventos_cache','cuentas_por_pagar','gastos','reembolsos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy "propietaria_%1$s" on public.%1$I
        for all using (user_id = auth.uid()) with check (user_id = auth.uid())
    $f$, t);
  end loop;
end $$;
