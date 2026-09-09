-- The server-only credential resolver remains SECURITY INVOKER so the
-- service_role caller is the authorization boundary. Modern Supabase
-- sb_secret_... requests execute as service_role, which must be able to use
-- the canonical deployment-company helper without exposing the private
-- schema or helper to browser roles.
grant usage on schema private to service_role;
grant execute on function private.deployment_company_id() to service_role;
