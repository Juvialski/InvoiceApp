-- Defense-in-depth hardening for the single-company deployment resolver.
--
-- deployment_configuration is not a customer/business table. Browser roles
-- already have all direct table privileges revoked and the application resolves
-- the configured company through SECURITY DEFINER functions. Enabling RLS with
-- no browser policies removes the public-schema RLS gap without introducing a
-- second tenancy-selection path or weakening the existing resolver contract.

alter table public.deployment_configuration enable row level security;

-- Intentionally create no anon/authenticated policies. Provisioning/migrations
-- run through privileged roles and the existing SECURITY DEFINER resolver owns
-- access for authenticated application flows.
