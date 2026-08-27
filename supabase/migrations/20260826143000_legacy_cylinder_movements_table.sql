create table if not exists public.erp_legacy_cylinder_movements(
 source_system text not null default 'shenglong',legacy_id bigint not null,company_id text not null,
 occurred_on date,status_code text not null,payload jsonb not null,synced_at timestamptz not null default now(),
 primary key(source_system,legacy_id),check(jsonb_typeof(payload)='object')
);
