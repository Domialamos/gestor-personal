-- El linter de Supabase marca horas_cargada_es_terminal con search_path mutable
-- (function_search_path_mutable). Se fija vacío: la función solo usa NEW/OLD.
alter function public.horas_cargada_es_terminal() set search_path = '';
