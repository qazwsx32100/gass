create table if not exists public.erp_gas_purchases (
  id text primary key,
  company_id text,
  purchase_date date,
  qty_50kg integer not null default 0,
  qty_20kg integer not null default 0,
  qty_16kg integer not null default 0,
  qty_10kg integer not null default 0,
  qty_4kg integer not null default 0,
  empty_50kg integer not null default 0,
  empty_20kg integer not null default 0,
  empty_16kg integer not null default 0,
  empty_10kg integer not null default 0,
  empty_4kg integer not null default 0,
  test_50kg integer not null default 0,
  test_20kg integer not null default 0,
  test_16kg integer not null default 0,
  test_10kg integer not null default 0,
  test_4kg integer not null default 0,
  scrap_50kg integer not null default 0,
  scrap_20kg integer not null default 0,
  scrap_16kg integer not null default 0,
  scrap_10kg integer not null default 0,
  scrap_4kg integer not null default 0,
  gas_50kg numeric not null default 0,
  gas_20kg numeric not null default 0,
  gas_16kg numeric not null default 0,
  gas_10kg numeric not null default 0,
  gas_4kg numeric not null default 0,
  total_kg numeric not null default 0,
  monthly_gas_price numeric not null default 0,
  amount numeric not null default 0,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists erp_gas_purchases_company_date_idx
  on public.erp_gas_purchases (company_id, purchase_date);

alter table public.erp_gas_purchases enable row level security;
revoke all on table public.erp_gas_purchases from public, anon, authenticated;

create or replace function public.erp_refresh_gas_purchases_mirror(
  p_state jsonb,
  p_synced_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.erp_gas_purchases where true;

  insert into public.erp_gas_purchases (
    id, company_id, purchase_date,
    qty_50kg, qty_20kg, qty_16kg, qty_10kg, qty_4kg,
    empty_50kg, empty_20kg, empty_16kg, empty_10kg, empty_4kg,
    test_50kg, test_20kg, test_16kg, test_10kg, test_4kg,
    scrap_50kg, scrap_20kg, scrap_16kg, scrap_10kg, scrap_4kg,
    gas_50kg, gas_20kg, gas_16kg, gas_10kg, gas_4kg,
    total_kg, monthly_gas_price, amount, raw, synced_at
  )
  select
    item->>'id', item->>'companyId', public.erp_to_date(item->>'date'),
    coalesce(public.erp_to_numeric(item->>'qty50kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'qty20kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'qty16kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'qty10kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'qty4kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'empty50kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'empty20kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'empty16kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'empty10kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'empty4kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'test50kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'test20kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'test16kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'test10kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'test4kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'scrap50kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'scrap20kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'scrap16kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'scrap10kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'scrap4kg')::integer, 0),
    coalesce(public.erp_to_numeric(item->>'gas50kg'), 0),
    coalesce(public.erp_to_numeric(item->>'gas20kg'), 0),
    coalesce(public.erp_to_numeric(item->>'gas16kg'), 0),
    coalesce(public.erp_to_numeric(item->>'gas10kg'), 0),
    coalesce(public.erp_to_numeric(item->>'gas4kg'), 0),
    coalesce(public.erp_to_numeric(item->>'totalKg'), 0),
    coalesce(public.erp_to_numeric(item->>'monthlyGasPrice'), 0),
    coalesce(public.erp_to_numeric(item->>'amount'), 0),
    item, p_synced_at
  from jsonb_array_elements(
    case when jsonb_typeof(p_state->'gasPurchases') = 'array'
      then p_state->'gasPurchases' else '[]'::jsonb end
  ) as item
  where nullif(item->>'id', '') is not null;
end;
$$;

create or replace function public.erp_refresh_gas_purchases_on_app_state_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.id = 'main' then
    perform public.erp_refresh_gas_purchases_mirror(new.state, new.updated_at);
  end if;
  return new;
end;
$$;

drop trigger if exists erp_app_state_refresh_gas_purchases on public.app_state;
create trigger erp_app_state_refresh_gas_purchases
after insert or update of state on public.app_state
for each row when (new.id = 'main')
execute function public.erp_refresh_gas_purchases_on_app_state_change();

select public.erp_refresh_gas_purchases_mirror(state, updated_at)
from public.app_state
where id = 'main';

revoke all on function public.erp_refresh_gas_purchases_mirror(jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.erp_refresh_gas_purchases_on_app_state_change()
  from public, anon, authenticated;
