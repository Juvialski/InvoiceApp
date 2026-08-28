-- Transition the legacy six-argument platform update RPC before the
-- single-company maintenance migration recreates it with its deployment-bound
-- contract. PostgreSQL identifies functions by argument types, not parameter
-- names, and CREATE OR REPLACE cannot rename input parameters in place.

drop function if exists public.platform_update_company(uuid, text, text, text, text, text);
