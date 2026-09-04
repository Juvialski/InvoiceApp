-- P3B/P3C Site Log crew cost-code referential integrity.
--
-- Crew cost-code assignment is historical field evidence. The scope trigger
-- validates the reference when a row is written; this FK keeps that reference
-- durable afterwards and prevents a cost code from being deleted while a Site
-- Log crew observation still points to it.

alter table public.engineering_daily_site_log_crew
  add constraint engineering_daily_site_log_crew_cost_code_fk
  foreign key (company_id, project_id, project_cost_code_id)
  references public.project_cost_codes(company_id, project_id, id)
  on delete restrict
  not valid;

alter table public.engineering_daily_site_log_crew
  validate constraint engineering_daily_site_log_crew_cost_code_fk;
