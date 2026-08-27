create index if not exists erp_legacy_cylinder_movements_company_date_idx on public.erp_legacy_cylinder_movements(company_id,occurred_on desc nulls last,legacy_id desc);
create index if not exists erp_legacy_cylinder_movements_company_status_date_idx on public.erp_legacy_cylinder_movements(company_id,status_code,occurred_on desc nulls last,legacy_id desc);
alter table public.erp_legacy_cylinder_movements enable row level security;
revoke all on table public.erp_legacy_cylinder_movements from public,anon,authenticated;
