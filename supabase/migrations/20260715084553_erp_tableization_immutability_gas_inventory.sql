-- ERP tableization, database-level immutable audit chain, and gas cylinder inventory.
-- app_state remains the rollback source while relational tables are kept as a queryable mirror.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.erp_to_numeric(p_value text, p_default numeric default 0)
returns numeric
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case
    when p_value is null or btrim(p_value) = '' then p_default
    when btrim(p_value) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p_value)::numeric
    else p_default
  end;
$$;

create or replace function public.erp_to_date(p_value text)
returns date
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case
    when p_value is null or btrim(p_value) = '' then null::date
    when btrim(p_value) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then btrim(p_value)::date
    else null::date
  end;
$$;

create or replace function public.erp_to_timestamptz(p_value text)
returns timestamptz
language sql
stable
set search_path = public, pg_catalog
as $$
  select case
    when p_value is null or btrim(p_value) = '' then null::timestamptz
    else btrim(p_value)::timestamptz
  end;
$$;

create or replace function public.erp_to_boolean(p_value text, p_default boolean default false)
returns boolean
language sql
immutable
set search_path = public, pg_catalog
as $$
  select case
    when p_value is null or btrim(p_value) = '' then p_default
    when lower(btrim(p_value)) in ('true', 't', 'yes', 'y', '1') then true
    when lower(btrim(p_value)) in ('false', 'f', 'no', 'n', '0') then false
    else p_default
  end;
$$;

create table if not exists public.erp_banks (
  id text primary key,
  company_id text,
  name text,
  account_no text,
  initial_balance numeric not null default 0,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_chart_of_accounts (
  code text primary key,
  name text,
  account_type text,
  description text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_shareholder_ledger (
  id text primary key,
  company_id text,
  shareholder_id text,
  ledger_date date,
  movement_type text,
  amount numeric not null default 0,
  remarks text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_loans (
  id text primary key,
  company_id text,
  bank_id text,
  name text,
  principal numeric not null default 0,
  interest_rate numeric not null default 0,
  months integer not null default 0,
  start_date date,
  monthly_payment numeric not null default 0,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_bank_transactions (
  id text primary key,
  company_id text,
  bank_id text,
  transaction_date date,
  direction text,
  amount numeric not null default 0,
  counterparty_name text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_bank_reconciliations (
  id text primary key,
  company_id text,
  bank_id text,
  statement_date date,
  statement_balance numeric not null default 0,
  system_balance numeric not null default 0,
  difference numeric not null default 0,
  status text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_fixed_assets (
  id text primary key,
  company_id text,
  asset_name text,
  asset_type text,
  acquisition_date date,
  acquisition_cost numeric not null default 0,
  accumulated_depreciation numeric not null default 0,
  status text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_customers (
  id text primary key,
  company_id text,
  name text,
  phone text,
  tax_id text,
  address text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_suppliers (
  id text primary key,
  company_id text,
  name text,
  phone text,
  tax_id text,
  address text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_operation_logs (
  id text primary key,
  event_time text,
  operator text,
  action text,
  details text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_audit_archive (
  id text primary key,
  collection text,
  record_id text,
  action text,
  actor text,
  reason text,
  archived_at timestamptz,
  purge_after timestamptz,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_journal_entries (
  id text primary key,
  company_id text,
  entry_date date,
  source_type text,
  source_id text,
  status text,
  memo text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_journal_lines (
  id text primary key,
  entry_id text,
  line_no integer not null default 1,
  side text not null check (side in ('debit', 'credit')),
  account_code text,
  amount numeric not null default 0,
  memo text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_gas_inventory_periods (
  id text primary key,
  company_id text,
  year_month text,
  opening_kg numeric not null default 0,
  opening_cost numeric not null default 0,
  purchase_kg numeric not null default 0,
  purchase_amount numeric not null default 0,
  shrinkage_kg numeric not null default 0,
  physical_ending_kg numeric not null default 0,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_delivery_vehicles (
  id text primary key,
  company_id text,
  plate_no text,
  vehicle_name text,
  driver_name text,
  capacity_cylinders integer not null default 0,
  capacity_kg numeric not null default 0,
  active boolean not null default true,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_gas_cylinders (
  id text primary key,
  company_id text,
  cylinder_no text,
  barcode text,
  qr_code text,
  spec_kg numeric not null default 0,
  ownership_status text not null default 'owned',
  cylinder_status text not null default 'empty',
  location_type text not null default 'warehouse',
  location_id text,
  customer_id text,
  vehicle_id text,
  deposit_amount numeric not null default 0,
  last_inspection_date date,
  next_inspection_date date,
  inspection_due_date date,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  constraint erp_gas_cylinders_location_type_chk check (location_type in ('warehouse', 'vehicle', 'customer', 'supplier', 'maintenance', 'lost', 'retired')),
  constraint erp_gas_cylinders_status_chk check (cylinder_status in ('empty', 'full', 'in_use', 'maintenance', 'lost', 'retired'))
);

create table if not exists public.erp_gas_cylinder_movements (
  id text primary key,
  company_id text,
  cylinder_id text,
  movement_date date,
  movement_type text,
  from_location_type text,
  from_location_id text,
  to_location_type text,
  to_location_id text,
  customer_id text,
  vehicle_id text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_vehicle_inventory (
  id text primary key,
  company_id text,
  vehicle_id text,
  cylinder_id text,
  loaded_at timestamptz,
  unloaded_at timestamptz,
  status text not null default 'on_vehicle',
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_customer_cylinder_deposits (
  id text primary key,
  company_id text,
  customer_id text,
  customer_name text,
  cylinder_id text,
  cylinder_spec_kg numeric not null default 0,
  deposit_amount numeric not null default 0,
  deposit_status text not null default 'active',
  started_at date,
  returned_at date,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists public.erp_immutable_ledger_events (
  id bigserial primary key,
  event_time timestamptz not null default now(),
  event_type text not null,
  source_table text,
  source_id text,
  actor text not null default '系統',
  request_ip text,
  previous_event_hash text,
  event_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  purge_after timestamptz not null default now() + interval '1 year'
);

create index if not exists erp_transactions_company_date_idx on public.erp_transactions (company_id, transaction_date);
create index if not exists erp_shareholder_ledger_company_date_idx on public.erp_shareholder_ledger (company_id, ledger_date);
create index if not exists erp_gas_cylinders_company_location_idx on public.erp_gas_cylinders (company_id, location_type, location_id);
create index if not exists erp_gas_cylinders_barcode_idx on public.erp_gas_cylinders (barcode);
create index if not exists erp_gas_cylinders_qr_code_idx on public.erp_gas_cylinders (qr_code);
create index if not exists erp_gas_cylinder_movements_cylinder_date_idx on public.erp_gas_cylinder_movements (cylinder_id, movement_date);
create index if not exists erp_customer_cylinder_deposits_customer_idx on public.erp_customer_cylinder_deposits (company_id, customer_id, deposit_status);
create index if not exists erp_immutable_ledger_events_source_idx on public.erp_immutable_ledger_events (source_table, source_id, event_time);
create index if not exists erp_immutable_ledger_events_hash_idx on public.erp_immutable_ledger_events (event_hash);

alter table public.erp_banks enable row level security;
alter table public.erp_chart_of_accounts enable row level security;
alter table public.erp_shareholder_ledger enable row level security;
alter table public.erp_loans enable row level security;
alter table public.erp_bank_transactions enable row level security;
alter table public.erp_bank_reconciliations enable row level security;
alter table public.erp_fixed_assets enable row level security;
alter table public.erp_customers enable row level security;
alter table public.erp_suppliers enable row level security;
alter table public.erp_operation_logs enable row level security;
alter table public.erp_audit_archive enable row level security;
alter table public.erp_journal_entries enable row level security;
alter table public.erp_journal_lines enable row level security;
alter table public.erp_gas_inventory_periods enable row level security;
alter table public.erp_delivery_vehicles enable row level security;
alter table public.erp_gas_cylinders enable row level security;
alter table public.erp_gas_cylinder_movements enable row level security;
alter table public.erp_vehicle_inventory enable row level security;
alter table public.erp_customer_cylinder_deposits enable row level security;
alter table public.erp_immutable_ledger_events enable row level security;

drop policy if exists app_state_deny_all on public.app_state;
create policy app_state_deny_all on public.app_state
for all to anon, authenticated
using (false)
with check (false);

drop policy if exists erp_private_settings_deny_all on public.erp_private_settings;
create policy erp_private_settings_deny_all on public.erp_private_settings
for all to anon, authenticated
using (false)
with check (false);

do $$
declare
  r record;
begin
  for r in
    select unnest(array[
      'erp_banks',
      'erp_chart_of_accounts',
      'erp_shareholder_ledger',
      'erp_loans',
      'erp_bank_transactions',
      'erp_bank_reconciliations',
      'erp_fixed_assets',
      'erp_customers',
      'erp_suppliers',
      'erp_operation_logs',
      'erp_audit_archive',
      'erp_journal_entries',
      'erp_journal_lines',
      'erp_gas_inventory_periods',
      'erp_delivery_vehicles',
      'erp_gas_cylinders',
      'erp_gas_cylinder_movements',
      'erp_vehicle_inventory',
      'erp_customer_cylinder_deposits',
      'erp_immutable_ledger_events'
    ]) as table_name
  loop
    execute format('drop policy if exists deny_public_%I on public.%I', r.table_name, r.table_name);
    execute format('create policy deny_public_%I on public.%I for all to anon, authenticated using (false) with check (false)', r.table_name, r.table_name);
  end loop;
end $$;

create or replace function public.erp_reject_immutable_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'immutable ERP audit records cannot be updated' using errcode = '55000';
  end if;

  if old.purge_after is null or old.purge_after > now() then
    raise exception 'immutable ERP audit records are retained until %', old.purge_after using errcode = '55000';
  end if;

  return old;
end;
$$;

drop trigger if exists erp_immutable_ledger_events_guard on public.erp_immutable_ledger_events;
create trigger erp_immutable_ledger_events_guard
before update or delete on public.erp_immutable_ledger_events
for each row execute function public.erp_reject_immutable_change();

drop trigger if exists erp_security_events_guard on public.erp_security_events;
create trigger erp_security_events_guard
before update or delete on public.erp_security_events
for each row execute function public.erp_reject_immutable_change();

create or replace function public.erp_append_immutable_event(
  p_event_type text,
  p_source_table text,
  p_source_id text,
  p_actor text,
  p_request_ip text,
  p_payload jsonb,
  p_purge_after timestamptz default now() + interval '1 year'
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_previous_hash text;
  v_event_hash text;
  v_id bigint;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  select event_hash
    into v_previous_hash
  from public.erp_immutable_ledger_events
  order by id desc
  limit 1;

  v_event_hash := encode(
    digest(
      convert_to(
        concat_ws('|',
          coalesce(v_previous_hash, ''),
          coalesce(p_event_type, ''),
          coalesce(p_source_table, ''),
          coalesce(p_source_id, ''),
          coalesce(p_actor, ''),
          coalesce(p_request_ip, ''),
          v_payload::text,
          coalesce(p_purge_after::text, '')
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.erp_immutable_ledger_events (
    event_type,
    source_table,
    source_id,
    actor,
    request_ip,
    previous_event_hash,
    event_hash,
    payload,
    purge_after
  )
  values (
    left(coalesce(nullif(p_event_type, ''), 'UNKNOWN'), 80),
    left(coalesce(p_source_table, ''), 80),
    left(coalesce(p_source_id, ''), 120),
    left(coalesce(nullif(p_actor, ''), '系統'), 80),
    nullif(p_request_ip, ''),
    v_previous_hash,
    v_event_hash,
    v_payload,
    coalesce(p_purge_after, now() + interval '1 year')
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.erp_refresh_relational_mirror(p_state jsonb, p_synced_at timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
begin
  delete from public.erp_companies;
  delete from public.erp_shareholders;
  delete from public.erp_transactions;
  delete from public.erp_banks;
  delete from public.erp_chart_of_accounts;
  delete from public.erp_shareholder_ledger;
  delete from public.erp_loans;
  delete from public.erp_bank_transactions;
  delete from public.erp_bank_reconciliations;
  delete from public.erp_fixed_assets;
  delete from public.erp_customers;
  delete from public.erp_suppliers;
  delete from public.erp_operation_logs;
  delete from public.erp_audit_archive;
  delete from public.erp_journal_entries;
  delete from public.erp_journal_lines;
  delete from public.erp_gas_inventory_periods;
  delete from public.erp_delivery_vehicles;
  delete from public.erp_gas_cylinders;
  delete from public.erp_gas_cylinder_movements;
  delete from public.erp_vehicle_inventory;
  delete from public.erp_customer_cylinder_deposits;

  for item in select value from jsonb_array_elements(coalesce(p_state->'companies', '[]'::jsonb)) loop
    insert into public.erp_companies (id, name, description, raw, synced_at)
    values (item->>'id', item->>'name', coalesce(item->>'desc', item->>'description'), item, p_synced_at)
    on conflict (id) do update set name = excluded.name, description = excluded.description, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'shareholders', '[]'::jsonb)) loop
    insert into public.erp_shareholders (id, name, email, role, disabled, raw, synced_at)
    values (item->>'id', item->>'name', item->>'email', item->>'role', public.erp_to_boolean(item->>'disabled', false), item - 'password' - 'passwordHash' - 'passwordSalt' - 'passwordAlgo', p_synced_at)
    on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role, disabled = excluded.disabled, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'banks', '[]'::jsonb)) loop
    insert into public.erp_banks (id, company_id, name, account_no, initial_balance, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'name', item->>'accountNo', public.erp_to_numeric(item->>'initialBalance'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, name = excluded.name, account_no = excluded.account_no, initial_balance = excluded.initial_balance, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'chartOfAccounts', '[]'::jsonb)) loop
    insert into public.erp_chart_of_accounts (code, name, account_type, description, raw, synced_at)
    values (item->>'code', item->>'name', item->>'type', item->>'desc', item, p_synced_at)
    on conflict (code) do update set name = excluded.name, account_type = excluded.account_type, description = excluded.description, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'incomes', '[]'::jsonb)) loop
    insert into public.erp_transactions (id, kind, company_id, transaction_date, account_code, amount, status, created_by, raw, synced_at)
    values (item->>'id', 'income', item->>'companyId', public.erp_to_date(item->>'date'), item->>'accountCode', public.erp_to_numeric(item->>'amount'), item->>'status', coalesce(item->>'createdByName', item->>'createdBy'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, transaction_date = excluded.transaction_date, account_code = excluded.account_code, amount = excluded.amount, status = excluded.status, created_by = excluded.created_by, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'expenses', '[]'::jsonb)) loop
    insert into public.erp_transactions (id, kind, company_id, transaction_date, account_code, amount, status, created_by, raw, synced_at)
    values (item->>'id', 'expense', item->>'companyId', public.erp_to_date(item->>'date'), item->>'accountCode', public.erp_to_numeric(item->>'amount'), item->>'status', coalesce(item->>'createdByName', item->>'createdBy'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, transaction_date = excluded.transaction_date, account_code = excluded.account_code, amount = excluded.amount, status = excluded.status, created_by = excluded.created_by, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'shareholderLedger', '[]'::jsonb)) loop
    insert into public.erp_shareholder_ledger (id, company_id, shareholder_id, ledger_date, movement_type, amount, remarks, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'shareholderId', public.erp_to_date(item->>'date'), item->>'type', public.erp_to_numeric(item->>'amount'), item->>'remarks', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, shareholder_id = excluded.shareholder_id, ledger_date = excluded.ledger_date, movement_type = excluded.movement_type, amount = excluded.amount, remarks = excluded.remarks, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'loans', '[]'::jsonb)) loop
    insert into public.erp_loans (id, company_id, bank_id, name, principal, interest_rate, months, start_date, monthly_payment, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'bankId', item->>'name', public.erp_to_numeric(item->>'principal'), public.erp_to_numeric(item->>'interestRate'), public.erp_to_numeric(item->>'months')::integer, public.erp_to_date(item->>'startDate'), public.erp_to_numeric(item->>'monthlyPayment'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, bank_id = excluded.bank_id, name = excluded.name, principal = excluded.principal, interest_rate = excluded.interest_rate, months = excluded.months, start_date = excluded.start_date, monthly_payment = excluded.monthly_payment, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'bankTransactions', '[]'::jsonb)) loop
    insert into public.erp_bank_transactions (id, company_id, bank_id, transaction_date, direction, amount, counterparty_name, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'bankId', public.erp_to_date(item->>'date'), item->>'direction', public.erp_to_numeric(item->>'amount'), item->>'counterpartyName', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, bank_id = excluded.bank_id, transaction_date = excluded.transaction_date, direction = excluded.direction, amount = excluded.amount, counterparty_name = excluded.counterparty_name, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'bankReconciliations', '[]'::jsonb)) loop
    insert into public.erp_bank_reconciliations (id, company_id, bank_id, statement_date, statement_balance, system_balance, difference, status, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'bankId', public.erp_to_date(item->>'statementDate'), public.erp_to_numeric(item->>'statementBalance'), public.erp_to_numeric(item->>'systemBalance'), public.erp_to_numeric(item->>'difference'), item->>'status', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, bank_id = excluded.bank_id, statement_date = excluded.statement_date, statement_balance = excluded.statement_balance, system_balance = excluded.system_balance, difference = excluded.difference, status = excluded.status, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'fixedAssets', '[]'::jsonb)) loop
    insert into public.erp_fixed_assets (id, company_id, asset_name, asset_type, acquisition_date, acquisition_cost, accumulated_depreciation, status, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'name', item->>'type', public.erp_to_date(item->>'acquisitionDate'), public.erp_to_numeric(item->>'acquisitionCost'), public.erp_to_numeric(item->>'accumulatedDepreciation'), item->>'status', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, asset_name = excluded.asset_name, asset_type = excluded.asset_type, acquisition_date = excluded.acquisition_date, acquisition_cost = excluded.acquisition_cost, accumulated_depreciation = excluded.accumulated_depreciation, status = excluded.status, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'customers', '[]'::jsonb)) loop
    insert into public.erp_customers (id, company_id, name, phone, tax_id, address, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'name', item->>'phone', item->>'taxId', item->>'address', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, name = excluded.name, phone = excluded.phone, tax_id = excluded.tax_id, address = excluded.address, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'suppliers', '[]'::jsonb)) loop
    insert into public.erp_suppliers (id, company_id, name, phone, tax_id, address, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'name', item->>'phone', item->>'taxId', item->>'address', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, name = excluded.name, phone = excluded.phone, tax_id = excluded.tax_id, address = excluded.address, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'logs', '[]'::jsonb)) loop
    insert into public.erp_operation_logs (id, event_time, operator, action, details, raw, synced_at)
    values (item->>'id', item->>'timestamp', item->>'operator', item->>'action', item->>'details', item, p_synced_at)
    on conflict (id) do update set event_time = excluded.event_time, operator = excluded.operator, action = excluded.action, details = excluded.details, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'auditArchive', '[]'::jsonb)) loop
    insert into public.erp_audit_archive (id, collection, record_id, action, actor, reason, archived_at, purge_after, raw, synced_at)
    values (item->>'id', item->>'collection', item->>'recordId', item->>'action', item->>'actor', item->>'reason', public.erp_to_timestamptz(item->>'archivedAt'), public.erp_to_timestamptz(item->>'purgeAfter'), item, p_synced_at)
    on conflict (id) do update set collection = excluded.collection, record_id = excluded.record_id, action = excluded.action, actor = excluded.actor, reason = excluded.reason, archived_at = excluded.archived_at, purge_after = excluded.purge_after, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'journalEntries', '[]'::jsonb)) loop
    insert into public.erp_journal_entries (id, company_id, entry_date, source_type, source_id, status, memo, raw, synced_at)
    values (item->>'id', item->>'companyId', public.erp_to_date(item->>'date'), item->>'sourceType', item->>'sourceId', item->>'status', item->>'memo', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, entry_date = excluded.entry_date, source_type = excluded.source_type, source_id = excluded.source_id, status = excluded.status, memo = excluded.memo, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'journalLines', '[]'::jsonb)) loop
    insert into public.erp_journal_lines (id, entry_id, line_no, side, account_code, amount, memo, raw, synced_at)
    values (item->>'id', item->>'entryId', public.erp_to_numeric(item->>'lineNo', 1)::integer, case when item->>'side' in ('debit', 'credit') then item->>'side' else 'debit' end, item->>'accountCode', public.erp_to_numeric(item->>'amount'), item->>'memo', item, p_synced_at)
    on conflict (id) do update set entry_id = excluded.entry_id, line_no = excluded.line_no, side = excluded.side, account_code = excluded.account_code, amount = excluded.amount, memo = excluded.memo, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasInventoryPeriods', '[]'::jsonb)) loop
    insert into public.erp_gas_inventory_periods (id, company_id, year_month, opening_kg, opening_cost, purchase_kg, purchase_amount, shrinkage_kg, physical_ending_kg, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'yearMonth', public.erp_to_numeric(item->>'openingKg'), public.erp_to_numeric(item->>'openingCost'), public.erp_to_numeric(item->>'purchaseKg'), public.erp_to_numeric(item->>'purchaseAmount'), public.erp_to_numeric(item->>'shrinkageKg'), public.erp_to_numeric(item->>'physicalEndingKg'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, year_month = excluded.year_month, opening_kg = excluded.opening_kg, opening_cost = excluded.opening_cost, purchase_kg = excluded.purchase_kg, purchase_amount = excluded.purchase_amount, shrinkage_kg = excluded.shrinkage_kg, physical_ending_kg = excluded.physical_ending_kg, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasDeliveryVehicles', '[]'::jsonb)) loop
    insert into public.erp_delivery_vehicles (id, company_id, plate_no, vehicle_name, driver_name, capacity_cylinders, capacity_kg, active, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'plateNo', item->>'name', item->>'driverName', public.erp_to_numeric(item->>'capacityCylinders')::integer, public.erp_to_numeric(item->>'capacityKg'), public.erp_to_boolean(item->>'active', true), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, plate_no = excluded.plate_no, vehicle_name = excluded.vehicle_name, driver_name = excluded.driver_name, capacity_cylinders = excluded.capacity_cylinders, capacity_kg = excluded.capacity_kg, active = excluded.active, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasCylinders', '[]'::jsonb)) loop
    insert into public.erp_gas_cylinders (id, company_id, cylinder_no, barcode, qr_code, spec_kg, ownership_status, cylinder_status, location_type, location_id, customer_id, vehicle_id, deposit_amount, last_inspection_date, next_inspection_date, inspection_due_date, raw, synced_at)
    values (
      item->>'id',
      item->>'companyId',
      item->>'cylinderNo',
      item->>'barcode',
      item->>'qrCode',
      public.erp_to_numeric(item->>'specKg'),
      coalesce(nullif(item->>'ownershipStatus', ''), 'owned'),
      case when item->>'status' in ('empty', 'full', 'in_use', 'maintenance', 'lost', 'retired') then item->>'status' else 'empty' end,
      case when item->>'locationType' in ('warehouse', 'vehicle', 'customer', 'supplier', 'maintenance', 'lost', 'retired') then item->>'locationType' else 'warehouse' end,
      item->>'locationId',
      item->>'customerId',
      item->>'vehicleId',
      public.erp_to_numeric(item->>'depositAmount'),
      public.erp_to_date(item->>'lastInspectionDate'),
      public.erp_to_date(item->>'nextInspectionDate'),
      public.erp_to_date(item->>'inspectionDueDate'),
      item,
      p_synced_at
    )
    on conflict (id) do update set company_id = excluded.company_id, cylinder_no = excluded.cylinder_no, barcode = excluded.barcode, qr_code = excluded.qr_code, spec_kg = excluded.spec_kg, ownership_status = excluded.ownership_status, cylinder_status = excluded.cylinder_status, location_type = excluded.location_type, location_id = excluded.location_id, customer_id = excluded.customer_id, vehicle_id = excluded.vehicle_id, deposit_amount = excluded.deposit_amount, last_inspection_date = excluded.last_inspection_date, next_inspection_date = excluded.next_inspection_date, inspection_due_date = excluded.inspection_due_date, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasCylinderMovements', '[]'::jsonb)) loop
    insert into public.erp_gas_cylinder_movements (id, company_id, cylinder_id, movement_date, movement_type, from_location_type, from_location_id, to_location_type, to_location_id, customer_id, vehicle_id, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'cylinderId', public.erp_to_date(item->>'movementDate'), item->>'movementType', item->>'fromLocationType', item->>'fromLocationId', item->>'toLocationType', item->>'toLocationId', item->>'customerId', item->>'vehicleId', item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, cylinder_id = excluded.cylinder_id, movement_date = excluded.movement_date, movement_type = excluded.movement_type, from_location_type = excluded.from_location_type, from_location_id = excluded.from_location_id, to_location_type = excluded.to_location_type, to_location_id = excluded.to_location_id, customer_id = excluded.customer_id, vehicle_id = excluded.vehicle_id, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'gasVehicleInventory', '[]'::jsonb)) loop
    insert into public.erp_vehicle_inventory (id, company_id, vehicle_id, cylinder_id, loaded_at, unloaded_at, status, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'vehicleId', item->>'cylinderId', public.erp_to_timestamptz(item->>'loadedAt'), public.erp_to_timestamptz(item->>'unloadedAt'), coalesce(nullif(item->>'status', ''), 'on_vehicle'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, vehicle_id = excluded.vehicle_id, cylinder_id = excluded.cylinder_id, loaded_at = excluded.loaded_at, unloaded_at = excluded.unloaded_at, status = excluded.status, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_state->'customerCylinderDeposits', '[]'::jsonb)) loop
    insert into public.erp_customer_cylinder_deposits (id, company_id, customer_id, customer_name, cylinder_id, cylinder_spec_kg, deposit_amount, deposit_status, started_at, returned_at, raw, synced_at)
    values (item->>'id', item->>'companyId', item->>'customerId', item->>'customerName', item->>'cylinderId', public.erp_to_numeric(item->>'cylinderSpecKg'), public.erp_to_numeric(item->>'depositAmount'), coalesce(nullif(item->>'depositStatus', ''), 'active'), public.erp_to_date(item->>'startedAt'), public.erp_to_date(item->>'returnedAt'), item, p_synced_at)
    on conflict (id) do update set company_id = excluded.company_id, customer_id = excluded.customer_id, customer_name = excluded.customer_name, cylinder_id = excluded.cylinder_id, cylinder_spec_kg = excluded.cylinder_spec_kg, deposit_amount = excluded.deposit_amount, deposit_status = excluded.deposit_status, started_at = excluded.started_at, returned_at = excluded.returned_at, raw = excluded.raw, synced_at = excluded.synced_at;
  end loop;
end;
$$;

create or replace function public.erp_set_app_state(
  p_secret text,
  p_state jsonb,
  p_updated_by text default '系統',
  p_request_ip text default null
)
returns table(ok boolean, updated_at timestamptz, updated_by text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_actor text := left(coalesce(nullif(p_updated_by, ''), '系統'), 80);
  v_previous_state jsonb;
  v_previous_hash text;
  v_new_hash text;
begin
  if not exists (select 1 from public.erp_private_settings where key = 'sync_secret' and value = p_secret) then
    raise exception 'invalid sync secret' using errcode = '28000';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid app state payload' using errcode = '22023';
  end if;

  select state into v_previous_state from public.app_state where id = 'main';

  v_previous_hash := case when v_previous_state is null then null else encode(digest(convert_to(v_previous_state::text, 'UTF8'), 'sha256'), 'hex') end;
  v_new_hash := encode(digest(convert_to(p_state::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.app_state (id, state, updated_at, updated_by)
  values ('main', p_state, v_now, v_actor)
  on conflict (id) do update set state = excluded.state, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  perform public.erp_refresh_relational_mirror(p_state, v_now);

  insert into public.erp_security_events (event_type, actor, request_ip, previous_state_hash, new_state_hash, payload, purge_after)
  values ('APP_STATE_SAVE', v_actor, nullif(p_request_ip, ''), v_previous_hash, v_new_hash, jsonb_build_object('app_state_id', 'main'), v_now + interval '1 year');

  perform public.erp_append_immutable_event(
    'APP_STATE_SAVE',
    'app_state',
    'main',
    v_actor,
    p_request_ip,
    jsonb_build_object(
      'previous_state_hash', v_previous_hash,
      'new_state_hash', v_new_hash,
      'updated_by', v_actor
    ),
    v_now + interval '1 year'
  );

  return query select true, v_now, v_actor;
end;
$$;

revoke execute on function public.erp_to_numeric(text, numeric) from public, anon, authenticated;
revoke execute on function public.erp_to_date(text) from public, anon, authenticated;
revoke execute on function public.erp_to_timestamptz(text) from public, anon, authenticated;
revoke execute on function public.erp_to_boolean(text, boolean) from public, anon, authenticated;
revoke execute on function public.erp_refresh_relational_mirror(jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.erp_append_immutable_event(text, text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke execute on function public.erp_reject_immutable_change() from public, anon, authenticated;

do $$
declare
  v_state jsonb;
  v_updated_at timestamptz;
begin
  select state, updated_at into v_state, v_updated_at
  from public.app_state
  where id = 'main';

  if v_state is not null then
    perform public.erp_refresh_relational_mirror(v_state, coalesce(v_updated_at, now()));
  end if;
end $$;
