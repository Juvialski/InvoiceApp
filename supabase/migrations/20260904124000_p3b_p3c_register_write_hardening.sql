-- P3B/P3C register write hardening.
--
-- Materials and Equipment are current project registers, but their write RPCs
-- intentionally derive deployment-company context and actor attribution on the
-- server. Keep browser reads under RLS and force writes through those guarded
-- SECURITY DEFINER RPCs so raw table DML cannot spoof provenance.

update private.company_tenant_policy_catalog
set allow_insert = false,
    allow_update = false,
    allow_delete = false
where table_name in ('engineering_project_materials', 'engineering_project_equipment');

drop policy if exists engineering_project_materials_insert on public.engineering_project_materials;
drop policy if exists engineering_project_materials_update on public.engineering_project_materials;
drop policy if exists engineering_project_equipment_insert on public.engineering_project_equipment;
drop policy if exists engineering_project_equipment_update on public.engineering_project_equipment;

revoke insert, update, delete on table public.engineering_project_materials from public, anon, authenticated;
revoke insert, update, delete on table public.engineering_project_equipment from public, anon, authenticated;

grant select on table public.engineering_project_materials to authenticated;
grant select on table public.engineering_project_equipment to authenticated;
