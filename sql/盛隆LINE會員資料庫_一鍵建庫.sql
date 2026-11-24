-- 盛隆瓦斯營運資料庫（Supabase / PostgreSQL 17）
-- 所有資料只允許伺服器端 service_role 存取；LINE 前端不直接連資料表。

create extension if not exists pgcrypto;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

create or replace function public.sl_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.sl_touch_updated_at() from public, anon, authenticated;
grant execute on function public.sl_touch_updated_at() to service_role;

create table if not exists public.sl_customers (
  id uuid primary key default gen_random_uuid(),
  legacy_customer_id text unique,
  display_name text not null default '',
  contact_name text not null default '',
  primary_phone text not null default '',
  customer_type text not null default '',
  status text not null default 'active' check (status in ('active','inactive','merged')),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sl_customers_phone_idx on public.sl_customers (primary_phone) where primary_phone <> '';
create index if not exists sl_customers_type_idx on public.sl_customers (customer_type) where status = 'active';

create table if not exists public.sl_customer_phones (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.sl_customers(id) on delete cascade,
  phone text not null,
  source text not null default 'primary' check (source in ('primary','remark','member','manual')),
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (customer_id, phone, source)
);
alter table public.sl_customer_phones
  add column if not exists phone_normalized text generated always as (regexp_replace(phone, '[^0-9]', '', 'g')) stored;
create index if not exists sl_customer_phones_lookup_idx on public.sl_customer_phones (phone, source);
create index if not exists sl_customer_phones_normalized_idx on public.sl_customer_phones (phone_normalized) where phone_normalized <> '';

create table if not exists public.sl_line_members (
  line_user_id text primary key,
  customer_id uuid not null references public.sl_customers(id),
  line_display_name text not null default '',
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  last_verified_at timestamptz not null default now(),
  session_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sl_line_members_customer_idx on public.sl_line_members (customer_id);
create unique index if not exists sl_line_members_one_active_customer_idx on public.sl_line_members (customer_id) where status = 'active';

create table if not exists public.sl_binding_requests (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  line_display_name text not null default '',
  requested_name text not null default '',
  requested_phone text not null default '',
  requested_customer_id uuid references public.sl_customers(id),
  requested_address text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by text not null default '',
  review_note text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sl_binding_requests_one_pending_line_idx on public.sl_binding_requests (line_user_id) where status='pending';
create index if not exists sl_binding_requests_status_idx on public.sl_binding_requests (status, created_at);
create index if not exists sl_binding_requests_customer_idx on public.sl_binding_requests (requested_customer_id) where requested_customer_id is not null;

create table if not exists public.sl_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.sl_customers(id) on delete cascade,
  label text not null default '預設地址',
  address text not null,
  city text not null default '',
  district text not null default '',
  road text not null default '',
  lane text not null default '',
  alley text not null default '',
  number_text text not null default '',
  floor_text text not null default '',
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive')),
  latitude numeric(10,7),
  longitude numeric(10,7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sl_addresses_one_default_idx on public.sl_addresses (customer_id) where is_default and status = 'active';
create index if not exists sl_addresses_route_idx on public.sl_addresses (city, district, road) where status = 'active';

create table if not exists public.sl_address_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.sl_customers(id) on delete cascade,
  line_user_id text not null references public.sl_line_members(line_user_id),
  request_type text not null default 'add' check (request_type in ('add','move','handover')),
  requested_label text not null default '其他地址',
  requested_address text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by text not null default '',
  review_note text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sl_address_requests_one_pending_line_idx on public.sl_address_requests (line_user_id) where status='pending';
create index if not exists sl_address_requests_status_idx on public.sl_address_requests (status, created_at);
create index if not exists sl_address_requests_customer_idx on public.sl_address_requests (customer_id, created_at desc);

create table if not exists public.sl_products (
  code text primary key,
  name text not null,
  specification text not null default '',
  gas_weight_kg numeric(8,2),
  is_gas boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 既有 ERP 的各規格歷史單價與使用次數。history_key 與前端規格辨識一致，
-- 不把歷史價誤當成全體售價，也不以電話自動建立 LINE 綁定。
create table if not exists public.sl_customer_product_history (
  customer_id uuid not null references public.sl_customers(id) on delete cascade,
  history_key text not null check (history_key in ('50kg','20kg','18kg','16kg','10kg','new4kg','4kg')),
  last_unit_price numeric(12,2),
  use_count integer not null default 0 check (use_count >= 0),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_id, history_key)
);
create index if not exists sl_customer_product_history_key_idx
  on public.sl_customer_product_history (history_key, customer_id) where use_count > 0;

create table if not exists public.sl_price_rules (
  id uuid primary key default gen_random_uuid(),
  source_version_id text not null default '',
  product_code text not null references public.sl_products(code),
  scope text not null check (scope in ('all','business','customer')),
  customer_id uuid references public.sl_customers(id),
  price numeric(12,2) not null check (price > 0),
  effective_at timestamptz not null,
  expires_at timestamptz,
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  check ((scope = 'customer' and customer_id is not null) or (scope <> 'customer' and customer_id is null)),
  check (expires_at is null or expires_at > effective_at)
);
create index if not exists sl_price_rules_effective_idx on public.sl_price_rules (product_code, scope, effective_at desc);
create index if not exists sl_price_rules_customer_idx on public.sl_price_rules (customer_id, product_code, effective_at desc) where customer_id is not null;
create unique index if not exists sl_price_rules_source_version_idx on public.sl_price_rules (source_version_id, product_code, scope) where source_version_id <> '';

create table if not exists public.sl_orders (
  id text primary key,
  request_id text not null unique,
  customer_id uuid not null references public.sl_customers(id),
  line_user_id text references public.sl_line_members(line_user_id),
  address_id uuid references public.sl_addresses(id),
  delivery_address text not null,
  status text not null default 'pending' check (status in ('creating','pending','accepted','assigned','delivering','completed','cancelled','failed')),
  source text not null default 'line',
  note text not null default '',
  gas_amount numeric(12,2),
  non_gas_amount numeric(12,2) not null default 0,
  reward_discount numeric(12,2) not null default 0,
  total_amount numeric(12,2),
  notification_status text not null default 'pending' check (notification_status in ('pending','sent','failed','skipped')),
  notification_error text not null default '',
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sl_orders_customer_created_idx on public.sl_orders (customer_id, created_at desc);
create index if not exists sl_orders_dispatch_idx on public.sl_orders (status, created_at) where status in ('pending','accepted','assigned','delivering');
create index if not exists sl_orders_notification_idx on public.sl_orders (notification_status, created_at) where notification_status in ('pending','failed');
create index if not exists sl_orders_address_idx on public.sl_orders (address_id) where address_id is not null;
create index if not exists sl_orders_line_user_idx on public.sl_orders (line_user_id) where line_user_id is not null;

create table if not exists public.sl_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.sl_orders(id) on delete cascade,
  product_code text not null references public.sl_products(code),
  product_name text not null,
  quantity integer not null check (quantity > 0 and quantity <= 100),
  unit_price numeric(12,2),
  subtotal numeric(12,2),
  price_rule_id uuid references public.sl_price_rules(id),
  created_at timestamptz not null default now(),
  unique (order_id, product_code)
);
create index if not exists sl_order_items_product_idx on public.sl_order_items (product_code, created_at desc);
create index if not exists sl_order_items_price_rule_idx on public.sl_order_items (price_rule_id) where price_rule_id is not null;

create table if not exists public.sl_order_status_events (
  id bigint generated always as identity primary key,
  order_id text not null references public.sl_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_type text not null default 'admin',
  actor_id text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists sl_order_status_events_order_idx on public.sl_order_status_events (order_id, created_at);

create table if not exists public.sl_drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null default '',
  line_user_id text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sl_delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id text not null unique references public.sl_orders(id) on delete cascade,
  driver_id uuid not null references public.sl_drivers(id),
  route_date date not null default current_date,
  route_sequence integer,
  status text not null default 'assigned' check (status in ('assigned','accepted','delivering','completed','cancelled')),
  assigned_by text not null default '',
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists sl_delivery_route_idx on public.sl_delivery_assignments (route_date, driver_id, route_sequence);
create index if not exists sl_delivery_assignments_driver_idx on public.sl_delivery_assignments (driver_id);

create table if not exists public.sl_route_plans (
  id uuid primary key default gen_random_uuid(),
  route_date date not null,
  driver_id uuid references public.sl_drivers(id),
  status text not null default 'draft' check (status in ('draft','published','completed','cancelled')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sl_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_plan_id uuid not null references public.sl_route_plans(id) on delete cascade,
  order_id text not null references public.sl_orders(id),
  stop_sequence integer not null,
  district text not null default '',
  road text not null default '',
  status text not null default 'pending' check (status in ('pending','arrived','completed','skipped')),
  unique (route_plan_id, order_id),
  unique (route_plan_id, stop_sequence)
);
create index if not exists sl_route_plans_driver_idx on public.sl_route_plans (driver_id) where driver_id is not null;
create index if not exists sl_route_stops_order_idx on public.sl_route_stops (order_id);

create table if not exists public.sl_cylinders (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null unique,
  specification_kg numeric(8,2) not null check (specification_kg > 0),
  ownership text not null default 'company' check (ownership in ('company','customer','other_company')),
  inspection_due_date date,
  status text not null default 'warehouse_full' check (status in ('warehouse_full','warehouse_empty','with_customer','inspection','retired','lost')),
  current_customer_id uuid references public.sl_customers(id),
  deposit_amount numeric(12,2) not null default 0,
  acquired_at date,
  retired_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sl_cylinders_customer_idx on public.sl_cylinders (current_customer_id) where current_customer_id is not null;
create index if not exists sl_cylinders_inspection_idx on public.sl_cylinders (inspection_due_date) where status <> 'retired';

create table if not exists public.sl_cylinder_movements (
  id bigint generated always as identity primary key,
  cylinder_id uuid not null references public.sl_cylinders(id),
  order_id text references public.sl_orders(id),
  customer_id uuid references public.sl_customers(id),
  movement_type text not null check (movement_type in ('deliver_full','collect_empty','deposit','return_deposit','send_inspection','return_inspection','adjustment','retire')),
  amount numeric(12,2) not null default 0,
  actor_id text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists sl_cylinder_movements_cylinder_idx on public.sl_cylinder_movements (cylinder_id, created_at desc);
create index if not exists sl_cylinder_movements_customer_idx on public.sl_cylinder_movements (customer_id, created_at desc) where customer_id is not null;
create index if not exists sl_cylinder_movements_order_idx on public.sl_cylinder_movements (order_id) where order_id is not null;

create table if not exists public.sl_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text not null default '',
  phone text not null default '',
  address text not null default '',
  qr_public_id uuid not null default gen_random_uuid() unique,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sl_partner_staff (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.sl_partners(id) on delete cascade,
  line_user_id text not null,
  display_name text not null default '',
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (partner_id, line_user_id)
);

create table if not exists public.sl_reward_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.sl_partners(id),
  customer_id uuid not null references public.sl_customers(id),
  line_user_id text references public.sl_line_members(line_user_id),
  purchase_amount numeric(12,2) not null check (purchase_amount >= 0),
  reward_amount numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','expired','cancelled')),
  confirmed_by text,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sl_reward_qr_pending_idx on public.sl_reward_qr_sessions (partner_id, status, expires_at) where status = 'pending';
create index if not exists sl_reward_qr_customer_idx on public.sl_reward_qr_sessions (customer_id);
create index if not exists sl_reward_qr_line_user_idx on public.sl_reward_qr_sessions (line_user_id) where line_user_id is not null;

create table if not exists public.sl_reward_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.sl_customers(id),
  transaction_type text not null check (transaction_type in ('earn','redeem','expire','reversal','adjustment')),
  amount numeric(12,2) not null check (amount <> 0),
  available_amount numeric(12,2) not null default 0 check (available_amount >= 0),
  partner_id uuid references public.sl_partners(id),
  qr_session_id uuid unique references public.sl_reward_qr_sessions(id),
  order_id text references public.sl_orders(id),
  related_transaction_id uuid references public.sl_reward_transactions(id),
  expires_at timestamptz,
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  check ((transaction_type = 'earn' and amount > 0 and available_amount <= amount) or transaction_type <> 'earn')
);
create index if not exists sl_reward_fifo_idx on public.sl_reward_transactions (customer_id, expires_at, created_at) where transaction_type = 'earn' and available_amount > 0;
create index if not exists sl_reward_customer_history_idx on public.sl_reward_transactions (customer_id, created_at desc);
create index if not exists sl_reward_partner_idx on public.sl_reward_transactions (partner_id) where partner_id is not null;
create index if not exists sl_reward_order_idx on public.sl_reward_transactions (order_id) where order_id is not null;
create index if not exists sl_reward_related_idx on public.sl_reward_transactions (related_transaction_id) where related_transaction_id is not null;

create table if not exists public.sl_reward_allocations (
  id bigint generated always as identity primary key,
  redemption_transaction_id uuid not null references public.sl_reward_transactions(id) on delete cascade,
  earning_transaction_id uuid not null references public.sl_reward_transactions(id),
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (redemption_transaction_id, earning_transaction_id)
);
create index if not exists sl_reward_allocations_earning_idx on public.sl_reward_allocations (earning_transaction_id);

create table if not exists public.sl_reminder_preferences (
  customer_id uuid primary key references public.sl_customers(id) on delete cascade,
  enabled boolean not null default true,
  channel text not null default 'line' check (channel in ('line','phone','none')),
  quiet_start time not null default '21:00',
  quiet_end time not null default '09:00',
  updated_at timestamptz not null default now()
);

create table if not exists public.sl_usage_predictions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.sl_customers(id) on delete cascade,
  product_code text not null references public.sl_products(code),
  average_interval_days numeric(8,2),
  predicted_order_date date,
  confidence numeric(5,4) check (confidence between 0 and 1),
  last_order_at timestamptz,
  calculated_at timestamptz not null default now(),
  unique (customer_id, product_code)
);
create index if not exists sl_usage_predictions_due_idx on public.sl_usage_predictions (predicted_order_date) where predicted_order_date is not null;
create index if not exists sl_usage_predictions_product_idx on public.sl_usage_predictions (product_code);

create table if not exists public.sl_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.sl_customers(id),
  line_user_id text,
  notification_type text not null,
  reference_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sl_notifications_queue_idx on public.sl_notifications (status, scheduled_at) where status in ('pending','failed');
create index if not exists sl_notifications_customer_idx on public.sl_notifications (customer_id) where customer_id is not null;
create unique index if not exists sl_notifications_event_key_idx on public.sl_notifications (notification_type, reference_id) where reference_id <> '';
create index if not exists sl_notifications_processing_lease_idx on public.sl_notifications (scheduled_at, id) where status = 'processing';

create table if not exists public.sl_backup_outbox (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  operation text not null check (operation in ('insert','update','delete')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','synced','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text not null default '',
  created_at timestamptz not null default now(),
  synced_at timestamptz
);
create index if not exists sl_backup_outbox_queue_idx on public.sl_backup_outbox (status, next_attempt_at, id) where status in ('pending','failed');
create index if not exists sl_backup_outbox_processing_lease_idx on public.sl_backup_outbox (next_attempt_at, id) where status = 'processing';

create table if not exists public.sl_audit_log (
  id bigint generated always as identity primary key,
  actor_type text not null,
  actor_id text not null default '',
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  before_data jsonb,
  after_data jsonb,
  request_id text not null default '',
  ip_hash text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists sl_audit_entity_idx on public.sl_audit_log (entity_type, entity_id, created_at desc);
create index if not exists sl_audit_actor_idx on public.sl_audit_log (actor_id, created_at desc) where actor_id <> '';

create table if not exists public.sl_rate_limits (
  bucket text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.sl_admin_credentials (
  credential_id text primary key,
  salt text not null,
  code_hash text not null,
  algorithm text not null default 'scrypt-n16384-r8-p1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sl_admin_credentials enable row level security;
revoke all on table public.sl_admin_credentials from public, anon, authenticated;
grant select, insert, update, delete on table public.sl_admin_credentials to service_role;

create or replace function public.sl_consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  result_row public.sl_rate_limits%rowtype;
  v_now timestamptz := now();
begin
  insert into public.sl_rate_limits(bucket, window_started_at, request_count, updated_at)
  values (p_bucket, v_now, 1, v_now)
  on conflict (bucket) do update set
    window_started_at = case when public.sl_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now else public.sl_rate_limits.window_started_at end,
    request_count = case when public.sl_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1 else public.sl_rate_limits.request_count + 1 end,
    updated_at = v_now
  returning * into result_row;
  return jsonb_build_object(
    'allowed', result_row.request_count <= p_limit,
    'retry_after', greatest(1, ceil(extract(epoch from result_row.window_started_at + make_interval(secs => p_window_seconds) - v_now))::integer)
  );
end;
$$;
revoke all on function public.sl_consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.sl_consume_rate_limit(text, integer, integer) to service_role;

create table if not exists public.sl_integration_checks (
  service text primary key check (service in ('supabase','line','google_sheets')),
  is_healthy boolean not null default false,
  checked_at timestamptz not null default now(),
  last_success_at timestamptz,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  error_code text not null default ''
);
alter table public.sl_integration_checks enable row level security;
revoke all on table public.sl_integration_checks from public, anon, authenticated;
grant select, insert, update on table public.sl_integration_checks to service_role;

create or replace function public.sl_record_integration_check(
  p_service text, p_healthy boolean, p_latency_ms integer, p_error_code text default ''
) returns public.sl_integration_checks
language plpgsql security invoker set search_path = ''
as $$
declare result public.sl_integration_checks;
begin
  if p_service not in ('supabase','line','google_sheets') then
    raise exception 'unsupported integration service' using errcode = '22023';
  end if;
  insert into public.sl_integration_checks(service,is_healthy,checked_at,last_success_at,latency_ms,error_code)
  values (p_service,p_healthy,now(),case when p_healthy then now() else null end,greatest(0,least(coalesce(p_latency_ms,0),60000)),left(coalesce(p_error_code,''),80))
  on conflict (service) do update set
    is_healthy = excluded.is_healthy,
    checked_at = excluded.checked_at,
    last_success_at = case when excluded.is_healthy then excluded.checked_at else public.sl_integration_checks.last_success_at end,
    latency_ms = excluded.latency_ms,
    error_code = excluded.error_code
  returning * into result;
  return result;
end;
$$;
revoke all on function public.sl_record_integration_check(text,boolean,integer,text) from public, anon, authenticated;
grant execute on function public.sl_record_integration_check(text,boolean,integer,text) to service_role;

create or replace function public.sl_create_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_id text;
begin
  insert into public.sl_orders (
    id, request_id, customer_id, line_user_id, address_id, delivery_address,
    status, source, note, gas_amount, total_amount, notification_status, created_at
  ) values (
    p_order->>'id', p_order->>'requestId', (p_order->>'customerId')::uuid,
    nullif(p_order->>'lineUserId',''), nullif(p_order->>'addressId','')::uuid,
    p_order->>'address', 'pending', 'line', coalesce(p_order->>'note',''),
    nullif(p_order->>'total','')::numeric, nullif(p_order->>'total','')::numeric,
    'pending', (p_order->>'createdAt')::timestamptz
  ) on conflict (request_id) do nothing returning id into inserted_id;
  if inserted_id is null then
    return jsonb_build_object('duplicate', true);
  end if;
  insert into public.sl_order_items (order_id, product_code, product_name, quantity, unit_price, subtotal, price_rule_id)
  select inserted_id, item->>'code', item->>'name', (item->>'quantity')::integer,
    nullif(item->>'price','')::numeric, nullif(item->>'subtotal','')::numeric,
    nullif(item->>'priceRuleId','')::uuid
  from jsonb_array_elements(p_items) as item;
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('order', inserted_id, 'insert', p_order || jsonb_build_object('items', p_items));
  return jsonb_build_object('duplicate', false);
end;
$$;
revoke all on function public.sl_create_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sl_create_order(jsonb, jsonb) to service_role;

-- 瀏覽器角色完全不可直接操作營運資料；只有伺服器端 service_role 可用。
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sl_customers','sl_customer_phones','sl_line_members','sl_binding_requests','sl_addresses','sl_address_requests','sl_products','sl_customer_product_history','sl_price_rules',
    'sl_orders','sl_order_items','sl_order_status_events','sl_drivers','sl_delivery_assignments',
    'sl_route_plans','sl_route_stops','sl_cylinders','sl_cylinder_movements','sl_partners','sl_partner_staff',
    'sl_reward_qr_sessions','sl_reward_transactions','sl_reward_allocations','sl_reminder_preferences',
    'sl_usage_predictions','sl_notifications','sl_backup_outbox','sl_audit_log','sl_rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end;
$$;
grant usage, select on all sequences in schema public to service_role;

-- 更新時間戳記。
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'sl_customers','sl_line_members','sl_binding_requests','sl_addresses','sl_address_requests','sl_products','sl_customer_product_history','sl_orders','sl_drivers',
    'sl_delivery_assignments','sl_route_plans','sl_cylinders','sl_partners','sl_reward_qr_sessions','sl_notifications'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.sl_touch_updated_at()',
      table_name || '_touch_updated_at', table_name
    );
  end loop;
end;
$$;

create or replace view public.sl_reward_balances
with (security_invoker = true)
as
select
  customer_id,
  coalesce(sum(available_amount) filter (
    where transaction_type = 'earn' and available_amount > 0 and (expires_at is null or expires_at > now())
  ), 0)::numeric(12,2) as available_balance,
  min(expires_at) filter (
    where transaction_type = 'earn' and available_amount > 0 and expires_at > now()
  ) as next_expiry_at
from public.sl_reward_transactions
group by customer_id;
revoke all on public.sl_reward_balances from public, anon, authenticated;
grant select on public.sl_reward_balances to service_role;

create or replace view public.sl_daily_operations
with (security_invoker = true)
as
select
  date_trunc('day', created_at)::date as operation_date,
  count(*) as order_count,
  count(*) filter (where status = 'completed') as completed_count,
  count(*) filter (where status = 'cancelled') as cancelled_count,
  coalesce(sum(total_amount) filter (where status <> 'cancelled'), 0)::numeric(14,2) as order_amount,
  coalesce(sum(reward_discount) filter (where status <> 'cancelled'), 0)::numeric(14,2) as reward_discount
from public.sl_orders
group by date_trunc('day', created_at)::date;
revoke all on public.sl_daily_operations from public, anon, authenticated;
grant select on public.sl_daily_operations to service_role;

create or replace function public.sl_confirm_reward_session(
  p_session_id uuid,
  p_staff_line_user_id text,
  p_purchase_amount numeric
)
returns table (transaction_id uuid, reward_amount numeric, expires_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  session_row public.sl_reward_qr_sessions%rowtype;
  reward numeric(12,2);
  reward_id uuid;
  expiry timestamptz := now() + interval '1 year';
begin
  select * into session_row
  from public.sl_reward_qr_sessions
  where id = p_session_id
  for update;

  if session_row.id is null or session_row.status <> 'pending' or session_row.expires_at <= now() then
    raise exception 'QR session is not available';
  end if;
  if not exists (
    select 1 from public.sl_partner_staff
    where partner_id = session_row.partner_id and line_user_id = p_staff_line_user_id and status = 'active'
  ) then
    raise exception 'Partner staff is not authorized';
  end if;
  if p_purchase_amount < 100 or p_purchase_amount <> session_row.purchase_amount then
    raise exception 'Purchase amount does not match';
  end if;

  reward := floor(p_purchase_amount / 100) * 2;
  insert into public.sl_reward_transactions (
    customer_id, transaction_type, amount, available_amount, partner_id, qr_session_id, expires_at, created_by
  ) values (
    session_row.customer_id, 'earn', reward, reward, session_row.partner_id, session_row.id, expiry, p_staff_line_user_id
  ) returning id into reward_id;

  update public.sl_reward_qr_sessions
  set status = 'confirmed', reward_amount = reward, confirmed_by = p_staff_line_user_id, confirmed_at = now()
  where id = session_row.id;

  insert into public.sl_audit_log (actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('partner', p_staff_line_user_id, 'confirm_reward', 'reward_session', session_row.id::text,
    jsonb_build_object('purchase_amount', p_purchase_amount, 'reward_amount', reward));

  return query select reward_id, reward, expiry;
end;
$$;
revoke all on function public.sl_confirm_reward_session(uuid,text,numeric) from public, anon, authenticated;
grant execute on function public.sl_confirm_reward_session(uuid,text,numeric) to service_role;

comment on table public.sl_backup_outbox is 'PostgreSQL 為正式來源；此佇列將異動非同步備份到 Google 試算表。';
comment on table public.sl_reward_transactions is '瓦斯金每筆取得、折抵、到期、沖銷及調整的不可省略流水。';
-- Exact-address discovery and atomic review for new-resident handovers.
-- This migration never changes orders or moves an address row between customers.

alter table public.sl_address_requests
  drop constraint if exists sl_address_requests_request_type_check;
alter table public.sl_address_requests
  add constraint sl_address_requests_request_type_check
  check (request_type in ('add', 'move', 'handover'));

create or replace function public.sl_normalize_address(p_address text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = public
as $$
declare
  result text := lower(replace(replace(p_address, '臺', '台'), '台北縣', '新北市'));
  old_name text;
  new_name text;
begin
  for old_name, new_name in
    select d.old_name, d.new_name from (values
      ('板橋市','板橋區'), ('三重市','三重區'), ('中和市','中和區'), ('永和市','永和區'),
      ('新莊市','新莊區'), ('新店市','新店區'), ('土城市','土城區'), ('蘆洲市','蘆洲區'),
      ('汐止市','汐止區'), ('樹林市','樹林區'), ('鶯歌鎮','鶯歌區'), ('三峽鎮','三峽區'),
      ('淡水鎮','淡水區'), ('瑞芳鎮','瑞芳區'), ('五股鄉','五股區'), ('泰山鄉','泰山區'),
      ('林口鄉','林口區'), ('深坑鄉','深坑區'), ('石碇鄉','石碇區'), ('坪林鄉','坪林區'),
      ('三芝鄉','三芝區'), ('石門鄉','石門區'), ('八里鄉','八里區'), ('平溪鄉','平溪區'),
      ('雙溪鄉','雙溪區'), ('貢寮鄉','貢寮區'), ('金山鄉','金山區'), ('萬里鄉','萬里區'),
      ('烏來鄉','烏來區')
    ) as d(old_name, new_name)
  loop
    result := replace(result, old_name, new_name);
  end loop;
  return regexp_replace(result, '[-[:space:]　,，、.。．－_]+', '', 'g');
end;
$$;
revoke all on function public.sl_normalize_address(text) from public, anon, authenticated;
grant execute on function public.sl_normalize_address(text) to service_role;

create or replace function public.sl_get_address_handover_candidates()
returns table (
  request_id uuid,
  address_id uuid,
  customer_id uuid,
  address_label text,
  address text,
  is_default boolean,
  legacy_customer_id text,
  contact_name text,
  primary_phone text
)
language sql
stable
security invoker
set search_path = public
as $$
  select r.id, a.id, a.customer_id, a.label, a.address, a.is_default,
         c.legacy_customer_id, c.contact_name, c.primary_phone
  from public.sl_address_requests r
  join public.sl_addresses a
    on a.status = 'active'
   and a.customer_id <> r.customer_id
   and public.sl_normalize_address(a.address) = public.sl_normalize_address(r.requested_address)
  join public.sl_customers c on c.id = a.customer_id
  where r.status = 'pending' and r.request_type = 'handover'
  order by r.created_at, a.created_at, a.id;
$$;
revoke all on function public.sl_get_address_handover_candidates() from public, anon, authenticated;
grant execute on function public.sl_get_address_handover_candidates() to service_role;

create or replace function public.sl_review_address_request(
  p_request_id uuid,
  p_actor text,
  p_decision text,
  p_note text default '',
  p_old_address_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  request_row public.sl_address_requests%rowtype;
  old_address public.sl_addresses%rowtype;
  new_address public.sl_addresses%rowtype;
  old_customer_id uuid;
  replacement_address_id uuid;
  candidate_count integer := 0;
  created_address boolean := false;
  final_status text;
begin
  if p_decision not in ('approve', 'reject', 'handover') then
    raise exception 'Invalid address review decision';
  end if;
  select * into request_row
  from public.sl_address_requests
  where id = p_request_id and status = 'pending'
  for update;
  if not found then raise exception 'Address request is already reviewed or missing'; end if;
  if p_decision = 'handover' and request_row.request_type <> 'handover' then
    raise exception 'Only a handover request can deactivate a previous resident address';
  end if;
  if p_decision <> 'handover' and p_old_address_id is not null then
    raise exception 'A previous resident address can only be selected for a handover';
  end if;

  if p_decision = 'reject' then
    update public.sl_address_requests set status = 'rejected', reviewed_by = p_actor,
      review_note = coalesce(p_note, ''), reviewed_at = now() where id = request_row.id;
    insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
    values ('admin', p_actor, 'address_rejected', 'address_request', request_row.id::text,
      jsonb_build_object('status','rejected','customer_id',request_row.customer_id));
    insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
    values ('address_request', request_row.id::text, 'update',
      jsonb_build_object('status','rejected','reviewed_by',p_actor,'review_note',coalesce(p_note,'')));
    return jsonb_build_object('status','rejected','lineUserId',request_row.line_user_id,'addressId',null,'oldAddressId',null);
  end if;

  if p_decision = 'handover' then
    select count(*) into candidate_count
    from public.sl_addresses a
    where a.status = 'active' and a.customer_id <> request_row.customer_id
      and public.sl_normalize_address(a.address) = public.sl_normalize_address(request_row.requested_address);
    if candidate_count > 0 and p_old_address_id is null then
      raise exception 'Select the exact previous-resident address to deactivate';
    end if;
    if p_old_address_id is not null then
      select customer_id into old_customer_id from public.sl_addresses where id = p_old_address_id;
      if old_customer_id is null or old_customer_id = request_row.customer_id then
        raise exception 'Selected address does not belong to another customer';
      end if;
      perform c.id from public.sl_customers c
      where c.id = any(array[request_row.customer_id, old_customer_id]::uuid[])
      order by c.id for update;
      select * into old_address from public.sl_addresses
      where id = p_old_address_id and status = 'active' for update;
      if not found or old_address.customer_id <> old_customer_id
        or public.sl_normalize_address(old_address.address) <> public.sl_normalize_address(request_row.requested_address) then
        raise exception 'Selected previous-resident address is no longer an exact active match';
      end if;
      if not exists (
        select 1 from public.sl_address_requests r
        where r.id = request_row.id and r.status = 'pending' and r.request_type = 'handover'
          and public.sl_normalize_address(r.requested_address) = public.sl_normalize_address(old_address.address)
      ) then raise exception 'Handover request no longer matches the selected address'; end if;
      update public.sl_addresses set status = 'inactive', is_default = false where id = old_address.id;
      if old_address.is_default then
        select id into replacement_address_id from public.sl_addresses
        where customer_id = old_customer_id and status = 'active'
        order by created_at, id limit 1 for update;
        if replacement_address_id is not null then
          update public.sl_addresses set is_default = true where id = replacement_address_id;
        end if;
      end if;
      insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, before_data, after_data)
      values ('admin', p_actor, 'address_handover_out', 'address', old_address.id::text,
        jsonb_build_object('customer_id',old_customer_id,'address',old_address.address,'status',old_address.status,'is_default',old_address.is_default),
        jsonb_build_object('customer_id',old_customer_id,'address',old_address.address,'status','inactive','is_default',false,'request_id',request_row.id));
      insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
      values ('sl_addresses', old_address.id::text, 'update',
        jsonb_build_object('id',old_address.id,'customer_id',old_customer_id,'label',old_address.label,'address',old_address.address,'status','inactive','is_default',false,'updated_at',now()));
      if replacement_address_id is not null then
        insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
        select 'sl_addresses', a.id::text, 'update', to_jsonb(a) from public.sl_addresses a where a.id = replacement_address_id;
      end if;
    end if;
  else
    perform c.id from public.sl_customers c where c.id = request_row.customer_id for update;
  end if;

  select * into new_address from public.sl_addresses
  where customer_id = request_row.customer_id and status = 'active'
    and public.sl_normalize_address(address) = public.sl_normalize_address(request_row.requested_address)
  order by created_at, id limit 1 for update;
  if not found then
    insert into public.sl_addresses(customer_id, label, address, is_default, status)
    values (request_row.customer_id, coalesce(nullif(request_row.requested_label,''),'其他地址'), request_row.requested_address,
      not exists (select 1 from public.sl_addresses where customer_id=request_row.customer_id and status='active'), 'active')
    returning * into new_address;
    created_address := true;
  end if;
  if request_row.request_type = 'move' then
    update public.sl_addresses set is_default = false
    where customer_id = request_row.customer_id and status = 'active' and is_default and id <> new_address.id;
    update public.sl_addresses set is_default = true where id = new_address.id;
  end if;

  final_status := 'approved';
  update public.sl_address_requests set status = final_status, reviewed_by = p_actor,
    review_note = coalesce(p_note, ''), reviewed_at = now() where id = request_row.id;
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('admin', p_actor, case when p_decision = 'handover' then 'address_handover_in' else 'address_approved' end,
    'address_request', request_row.id::text,
    jsonb_build_object('status',final_status,'new_customer_id',request_row.customer_id,'new_address_id',new_address.id,
      'old_customer_id',old_customer_id,'old_address_id',old_address.id,'decision',p_decision));
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('address_request', request_row.id::text, 'update', jsonb_build_object('status',final_status,'addressId',new_address.id,
    'oldAddressId',old_address.id,'oldCustomerId',old_customer_id,'reviewedBy',p_actor,'reviewNote',coalesce(p_note,'')));
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('sl_addresses', new_address.id::text, case when created_address then 'insert' else 'update' end, to_jsonb(new_address));
  return jsonb_build_object('status',final_status,'lineUserId',request_row.line_user_id,'addressId',new_address.id,
    'oldAddressId',old_address.id,'oldCustomerId',old_customer_id,'decision',p_decision);
end;
$$;
revoke all on function public.sl_review_address_request(uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.sl_review_address_request(uuid,text,text,text,uuid) to service_role;

-- Fast, consistent LINE member bootstrap.

-- Return the complete LINE member bootstrap payload in one PostgREST request.
-- The function runs with the caller's service_role privileges and never exposes
-- another customer's private price rules.
create or replace function public.sl_get_line_bootstrap(p_line_user_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_as_of timestamptz := now();
  v_customer_id uuid;
  v_member_row jsonb;
  v_history jsonb := '[]'::jsonb;
  v_addresses jsonb := '[]'::jsonb;
  v_products jsonb := '[]'::jsonb;
  v_price_rules jsonb := '[]'::jsonb;
  v_pending_binding jsonb;
  v_pending_address jsonb;
begin
  if p_line_user_id is null or btrim(p_line_user_id) = '' or length(p_line_user_id) > 255 then
    raise exception 'Invalid LINE user ID';
  end if;

  select jsonb_build_object(
      'line_user_id', lm.line_user_id,
      'line_display_name', lm.line_display_name,
      'status', lm.status,
      'sl_customers', jsonb_build_object(
        'id', c.id,
        'legacy_customer_id', c.legacy_customer_id,
        'contact_name', c.contact_name,
        'primary_phone', c.primary_phone,
        'customer_type', c.customer_type,
        'status', c.status
      )
    ), c.id
    into v_member_row, v_customer_id
  from public.sl_line_members lm
  join public.sl_customers c on c.id = lm.customer_id
  where lm.line_user_id = p_line_user_id
  limit 1;

  if v_customer_id is not null then
    select coalesce(jsonb_agg(to_jsonb(h) order by h.history_key), '[]'::jsonb)
      into v_history
    from (
      select history_key, last_unit_price, use_count
      from public.sl_customer_product_history
      where customer_id = v_customer_id
    ) h;

    select coalesce(jsonb_agg(to_jsonb(a) order by a.is_default desc, a.created_at, a.id), '[]'::jsonb)
      into v_addresses
    from (
      select id, label, address, is_default, created_at
      from public.sl_addresses
      where customer_id = v_customer_id and status = 'active'
    ) a;

    select to_jsonb(r) into v_pending_address
    from (
      select id, status, requested_address, request_type, created_at
      from public.sl_address_requests
      where line_user_id = p_line_user_id and status = 'pending'
      order by created_at
      limit 1
    ) r;
  else
    select to_jsonb(r) into v_pending_binding
    from (
      select id, status, created_at
      from public.sl_binding_requests
      where line_user_id = p_line_user_id and status = 'pending'
      order by created_at
      limit 1
    ) r;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order, p.code), '[]'::jsonb)
    into v_products
  from (
    select code, name, specification, is_active, sort_order
    from public.sl_products
    where is_active = true
  ) p;

  select coalesce(jsonb_agg(to_jsonb(pr) order by pr.effective_at desc, pr.created_at desc), '[]'::jsonb)
    into v_price_rules
  from (
    select id, product_code, scope, customer_id, price, effective_at, expires_at, created_at
    from public.sl_price_rules
    where effective_at <= v_as_of
      and (expires_at is null or expires_at > v_as_of)
      and (scope <> 'customer' or customer_id = v_customer_id)
  ) pr;

  return jsonb_build_object(
    'as_of', v_as_of,
    'member_row', v_member_row,
    'history', v_history,
    'addresses', v_addresses,
    'products', v_products,
    'price_rules', v_price_rules,
    'pending_binding', v_pending_binding,
    'pending_address', v_pending_address
  );
end;
$$;

revoke all on function public.sl_get_line_bootstrap(text) from public, anon, authenticated;
grant execute on function public.sl_get_line_bootstrap(text) to service_role;

-- Atomically change an order status and enqueue one idempotent LINE notification.
create or replace function public.sl_update_order_status(
  p_order_id text,
  p_next_status text,
  p_actor text,
  p_note text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.sl_orders%rowtype;
  v_previous_status text;
  v_event_id bigint;
  v_notification_id uuid;
begin
  select * into v_order from public.sl_orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Order not found';
  end if;

  v_previous_status := v_order.status;
  if not (
    (v_previous_status = 'pending' and p_next_status in ('accepted', 'cancelled'))
    or (v_previous_status = 'accepted' and p_next_status in ('assigned', 'delivering', 'cancelled'))
    or (v_previous_status = 'assigned' and p_next_status in ('delivering', 'cancelled'))
    or (v_previous_status = 'delivering' and p_next_status in ('completed', 'cancelled'))
    or (v_previous_status = 'creating' and p_next_status in ('pending', 'failed'))
    or (v_previous_status = 'failed' and p_next_status = 'pending')
  ) then
    raise exception using errcode = '23514', message = 'Order status transition is not allowed';
  end if;

  update public.sl_orders
  set status = p_next_status,
      accepted_at = case when p_next_status = 'accepted' then now() else accepted_at end,
      completed_at = case when p_next_status = 'completed' then now() else completed_at end,
      cancelled_at = case when p_next_status = 'cancelled' then now() else cancelled_at end
  where id = p_order_id and status = v_previous_status
  returning * into v_order;
  if not found then
    raise exception using errcode = '40001', message = 'Order was updated concurrently';
  end if;

  insert into public.sl_order_status_events (order_id, from_status, to_status, actor_type, actor_id, note)
  values (p_order_id, v_previous_status, p_next_status, 'admin', left(coalesce(p_actor, ''), 100), left(coalesce(p_note, ''), 300))
  returning id into v_event_id;

  if coalesce(v_order.line_user_id, '') <> '' then
    insert into public.sl_notifications (customer_id, line_user_id, notification_type, reference_id, payload, status, scheduled_at)
    values (
      v_order.customer_id, v_order.line_user_id, 'order_status', p_order_id || ':' || v_event_id::text,
      jsonb_build_object('orderId', v_order.id, 'status', v_order.status, 'address', v_order.delivery_address),
      'pending', now()
    )
    on conflict (notification_type, reference_id) where reference_id <> '' do nothing
    returning id into v_notification_id;
  end if;

  insert into public.sl_backup_outbox (entity_type, entity_id, operation, payload)
  values ('order', p_order_id, 'update', to_jsonb(v_order));
  insert into public.sl_audit_log (actor_type, actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    'admin', left(coalesce(p_actor, ''), 100), 'update_order_status', 'order', p_order_id,
    jsonb_build_object('status', v_previous_status), to_jsonb(v_order)
  );

  return jsonb_build_object('order', to_jsonb(v_order), 'eventId', v_event_id, 'notificationId', v_notification_id);
end;
$$;

revoke all on function public.sl_update_order_status(text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_update_order_status(text,text,text,text) to service_role;

-- Revoke one member's signed sessions without rotating the global session secret.
create or replace function public.sl_revoke_member_sessions(p_phone text, p_actor text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_count integer;
  v_line_user_id text;
  v_version integer;
begin
  select count(distinct lm.line_user_id), min(lm.line_user_id)
    into v_count, v_line_user_id
  from public.sl_customer_phones cp
  join public.sl_line_members lm on lm.customer_id = cp.customer_id
  join public.sl_customers c on c.id = lm.customer_id
  where cp.phone_normalized = v_phone and lm.status <> 'deleted' and c.status <> 'merged';

  if v_count = 0 then
    raise exception using errcode = 'P0002', message = 'Member not found';
  end if;
  if v_count > 1 then
    raise exception using errcode = 'P0003', message = 'Phone matches multiple LINE members';
  end if;

  update public.sl_line_members
  set session_version = session_version + 1
  where line_user_id = v_line_user_id
  returning session_version into v_version;

  insert into public.sl_audit_log (actor_type, actor_id, action, entity_type, entity_id, after_data)
  values (
    'admin', left(coalesce(p_actor, ''), 100), 'revoke_member_sessions', 'line_member', v_line_user_id,
    jsonb_build_object('sessionVersion', v_version)
  );
  return jsonb_build_object('lineUserId', v_line_user_id, 'sessionVersion', v_version);
end;
$$;

revoke all on function public.sl_revoke_member_sessions(text,text) from public, anon, authenticated;
grant execute on function public.sl_revoke_member_sessions(text,text) to service_role;


-- Keep member binding and address writes atomic and expose only business-level inputs.

create or replace function public.sl_request_binding(
  p_line_user_id text,
  p_line_display_name text,
  p_requested_name text,
  p_requested_phone text,
  p_legacy_customer_id text,
  p_requested_address text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_request public.sl_binding_requests%rowtype;
begin
  if exists (
    select 1
    from public.sl_line_members lm
    join public.sl_customers c on c.id = lm.customer_id
    where lm.line_user_id = p_line_user_id
      and lm.status = 'active'
      and c.status = 'active'
  ) then
    return jsonb_build_object('status', 'member_exists');
  end if;

  select * into v_request
  from public.sl_binding_requests
  where line_user_id = p_line_user_id and status = 'pending'
  order by created_at
  limit 1;
  if found then
    return jsonb_build_object(
      'status', 'pending',
      'requestId', v_request.id,
      'createdAt', v_request.created_at
    );
  end if;

  if nullif(p_legacy_customer_id, '') is not null then
    select id into v_customer_id
    from public.sl_customers
    where legacy_customer_id = p_legacy_customer_id and status = 'active';
    if v_customer_id is null then
      return jsonb_build_object('error', 'customer_changed');
    end if;
  end if;

  insert into public.sl_binding_requests(
    line_user_id, line_display_name, requested_name, requested_phone,
    requested_customer_id, requested_address, status
  ) values (
    p_line_user_id, coalesce(p_line_display_name, ''), coalesce(p_requested_name, ''),
    coalesce(p_requested_phone, ''), v_customer_id, coalesce(p_requested_address, ''), 'pending'
  )
  on conflict do nothing
  returning * into v_request;

  if v_request.id is null then
    select * into v_request
    from public.sl_binding_requests
    where line_user_id = p_line_user_id and status = 'pending'
    order by created_at
    limit 1;
  end if;

  return jsonb_build_object(
    'status', 'pending',
    'requestId', v_request.id,
    'createdAt', v_request.created_at
  );
end;
$$;
revoke all on function public.sl_request_binding(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_request_binding(text,text,text,text,text,text) to service_role;

create or replace function public.sl_review_binding(
  p_request_id text,
  p_actor text,
  p_decision text,
  p_note text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.sl_binding_requests%rowtype;
  v_customer_id uuid;
  v_address public.sl_addresses%rowtype;
  v_has_addresses boolean;
begin
  select * into v_request
  from public.sl_binding_requests
  where id::text = p_request_id and status = 'pending'
  for update;
  if not found then
    return jsonb_build_object('error', 'not_pending');
  end if;

  if p_decision = 'reject' then
    update public.sl_binding_requests
    set status = 'rejected', reviewed_by = p_actor, review_note = coalesce(p_note, ''), reviewed_at = now()
    where id = v_request.id;
    insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
    values ('admin', p_actor, 'binding_rejected', 'binding_request', v_request.id::text, jsonb_build_object('status', 'rejected'));
    insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
    values ('binding_request', v_request.id::text, 'update', jsonb_build_object('status', 'rejected'));
    return jsonb_build_object('status', 'rejected', 'lineUserId', v_request.line_user_id);
  end if;

  if p_decision <> 'approve' then
    return jsonb_build_object('error', 'invalid_decision');
  end if;

  v_customer_id := v_request.requested_customer_id;
  if v_customer_id is null then
    insert into public.sl_customers(
      legacy_customer_id, display_name, contact_name, primary_phone, customer_type, status
    ) values (
      'LINE-' || gen_random_uuid()::text,
      v_request.requested_name, v_request.requested_name, v_request.requested_phone, '', 'active'
    ) returning id into v_customer_id;
  elsif not exists (
    select 1 from public.sl_customers where id = v_customer_id and status = 'active' for update
  ) then
    return jsonb_build_object('error', 'customer_inactive');
  end if;

  if exists (
    select 1 from public.sl_line_members
    where line_user_id = v_request.line_user_id and customer_id <> v_customer_id
  ) or exists (
    select 1 from public.sl_line_members
    where customer_id = v_customer_id and status = 'active' and line_user_id <> v_request.line_user_id
  ) then
    return jsonb_build_object('error', 'binding_conflict');
  end if;

  insert into public.sl_line_members(
    line_user_id, customer_id, line_display_name, status, last_verified_at
  ) values (
    v_request.line_user_id, v_customer_id, v_request.line_display_name, 'active', now()
  )
  on conflict (line_user_id) do update
  set customer_id = excluded.customer_id,
      line_display_name = excluded.line_display_name,
      status = 'active',
      last_verified_at = now();

  if nullif(v_request.requested_phone, '') is not null then
    insert into public.sl_customer_phones(customer_id, phone, source, is_verified)
    values (v_customer_id, v_request.requested_phone, 'member', false)
    on conflict (customer_id, phone, source) do nothing;
  end if;

  if nullif(v_request.requested_address, '') is not null then
    select * into v_address
    from public.sl_addresses
    where customer_id = v_customer_id
      and status = 'active'
      and regexp_replace(address, '[[:space:]]', '', 'g')
        = regexp_replace(v_request.requested_address, '[[:space:]]', '', 'g')
    order by created_at
    limit 1;
    if not found then
      select exists(
        select 1 from public.sl_addresses where customer_id = v_customer_id and status = 'active'
      ) into v_has_addresses;
      insert into public.sl_addresses(customer_id, label, address, is_default, status)
      values (v_customer_id, '預設地址', v_request.requested_address, not v_has_addresses, 'active')
      returning * into v_address;
      insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
      values ('sl_addresses', v_address.id::text, 'insert', to_jsonb(v_address));
    end if;
  end if;

  update public.sl_binding_requests
  set status = 'approved', reviewed_by = p_actor, review_note = coalesce(p_note, ''), reviewed_at = now()
  where id = v_request.id;
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('admin', p_actor, 'binding_approved', 'binding_request', v_request.id::text,
    jsonb_build_object('status', 'approved', 'customer_id', v_customer_id));
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('binding_request', v_request.id::text, 'update',
    jsonb_build_object('status', 'approved', 'customerId', v_customer_id));

  return jsonb_build_object('status', 'approved', 'lineUserId', v_request.line_user_id);
exception
  when unique_violation then
    return jsonb_build_object('error', 'binding_conflict');
end;
$$;
revoke all on function public.sl_review_binding(text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_review_binding(text,text,text,text) to service_role;

create or replace function public.sl_request_member_address(
  p_line_user_id text,
  p_request_type text,
  p_requested_label text,
  p_requested_address text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_request public.sl_address_requests%rowtype;
  v_type text;
begin
  if nullif(trim(coalesce(p_requested_address, '')), '') is null then
    return jsonb_build_object('error', 'address_required');
  end if;
  select lm.customer_id into v_customer_id
  from public.sl_line_members lm
  join public.sl_customers c on c.id = lm.customer_id
  where lm.line_user_id = p_line_user_id
    and lm.status = 'active'
    and c.status = 'active';
  if v_customer_id is null then
    return jsonb_build_object('error', 'member_required');
  end if;

  select * into v_request
  from public.sl_address_requests
  where line_user_id = p_line_user_id and status = 'pending'
  order by created_at
  limit 1;
  if found then
    return jsonb_build_object(
      'pending', true, 'requestId', v_request.id,
      'address', v_request.requested_address,
      'requestType', v_request.request_type,
      'createdAt', v_request.created_at
    );
  end if;

  v_type := case when p_request_type in ('move', 'handover') then p_request_type else 'add' end;
  insert into public.sl_address_requests(
    customer_id, line_user_id, request_type, requested_label, requested_address, status
  ) values (
    v_customer_id, p_line_user_id, v_type,
    coalesce(nullif(p_requested_label, ''), '其他地址'), p_requested_address, 'pending'
  )
  on conflict do nothing
  returning * into v_request;

  if v_request.id is null then
    select * into v_request
    from public.sl_address_requests
    where line_user_id = p_line_user_id and status = 'pending'
    order by created_at
    limit 1;
  end if;

  return jsonb_build_object(
    'pending', true, 'requestId', v_request.id,
    'address', v_request.requested_address,
    'requestType', v_request.request_type,
    'createdAt', v_request.created_at
  );
end;
$$;
revoke all on function public.sl_request_member_address(text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_request_member_address(text,text,text,text) to service_role;

create or replace function public.sl_manage_member_address(
  p_line_user_id text,
  p_address_id text,
  p_operation text,
  p_label text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_target public.sl_addresses%rowtype;
  v_replacement_id uuid;
  v_active_count integer;
  v_addresses jsonb;
begin
  select lm.customer_id into v_customer_id
  from public.sl_line_members lm
  join public.sl_customers c on c.id = lm.customer_id
  where lm.line_user_id = p_line_user_id
    and lm.status = 'active'
    and c.status = 'active';
  if v_customer_id is null then
    return jsonb_build_object('error', 'member_required');
  end if;

  perform id from public.sl_addresses
  where customer_id = v_customer_id and status = 'active'
  for update;
  select * into v_target
  from public.sl_addresses
  where id::text = p_address_id and customer_id = v_customer_id and status = 'active';
  if not found then
    return jsonb_build_object('error', 'address_not_found');
  end if;

  if p_operation = 'rename' then
    if nullif(trim(coalesce(p_label, '')), '') is null then
      return jsonb_build_object('error', 'label_required');
    end if;
    update public.sl_addresses set label = p_label where id = v_target.id;
  elsif p_operation = 'default' then
    update public.sl_addresses
    set is_default = false
    where customer_id = v_customer_id and status = 'active' and is_default;
    update public.sl_addresses set is_default = true where id = v_target.id;
  elsif p_operation = 'deactivate' then
    select count(*) into v_active_count
    from public.sl_addresses
    where customer_id = v_customer_id and status = 'active';
    if v_active_count <= 1 then
      return jsonb_build_object('error', 'last_address');
    end if;
    update public.sl_addresses set status = 'inactive', is_default = false where id = v_target.id;
    if v_target.is_default then
      select id into v_replacement_id
      from public.sl_addresses
      where customer_id = v_customer_id and status = 'active'
      order by created_at, id
      limit 1;
      update public.sl_addresses set is_default = true where id = v_replacement_id;
    end if;
  else
    return jsonb_build_object('error', 'invalid_operation');
  end if;

  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('member', p_line_user_id, 'address_' || p_operation, 'address', v_target.id::text,
    jsonb_build_object('operation', p_operation, 'label', coalesce(p_label, '')));
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('sl_addresses', v_target.id::text, 'update',
    jsonb_build_object('operation', p_operation, 'label', coalesce(p_label, '')));

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id, 'label', a.label, 'address', a.address,
      'is_default', a.is_default, 'status', a.status
    ) order by a.is_default desc, a.created_at, a.id
  ), '[]'::jsonb) into v_addresses
  from public.sl_addresses a
  where a.customer_id = v_customer_id and a.status = 'active';

  return jsonb_build_object('addresses', v_addresses);
end;
$$;
revoke all on function public.sl_manage_member_address(text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_manage_member_address(text,text,text,text) to service_role;


-- Atomic price writes and queue leases. Browser roles cannot execute these functions.

create or replace function public.sl_save_price_version(p_actor text, p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_version_id text := nullif(p_input->>'versionId', '');
  v_scope text;
  v_effective_at timestamptz;
  v_prices jsonb := p_input->'prices';
  v_inserted integer;
begin
  if p_input->>'scope' = '生意攤' then
    v_scope := 'business';
  elsif p_input->>'scope' = '全體客戶' then
    v_scope := 'all';
  else
    return jsonb_build_object('error', 'invalid_scope');
  end if;
  if v_version_id is null or jsonb_typeof(v_prices) <> 'array' or jsonb_array_length(v_prices) = 0 then
    return jsonb_build_object('error', 'invalid_input');
  end if;
  begin
    v_effective_at := (p_input->>'effectiveAt')::timestamptz;
  exception when others then
    return jsonb_build_object('error', 'invalid_effective_at');
  end;
  if exists (
    select 1
    from jsonb_array_elements(v_prices) item
    left join public.sl_products p on p.code = item->>'code' and p.is_active
    where p.code is null
      or jsonb_typeof(item->'price') is distinct from 'number'
      or (item->>'price')::numeric <= 0
      or (item->>'price')::numeric > 100000
  ) then
    return jsonb_build_object('error', 'invalid_price');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sl_price_version:' || v_version_id, 0));
  if exists (select 1 from public.sl_price_rules where source_version_id = v_version_id) then
    return jsonb_build_object('error', 'duplicate_version');
  end if;

  insert into public.sl_price_rules(
    source_version_id, product_code, scope, customer_id, price,
    effective_at, note, created_by
  )
  select v_version_id, item->>'code', v_scope, null,
    (item->>'price')::numeric, v_effective_at,
    coalesce(p_input->>'note', ''), p_actor
  from jsonb_array_elements(v_prices) item;
  get diagnostics v_inserted = row_count;

  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('price_version', v_version_id, 'insert', p_input);
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('admin', p_actor, 'price_version_saved', 'price_version', v_version_id,
    jsonb_build_object('scope', v_scope, 'effective_at', v_effective_at, 'item_count', v_inserted));

  return jsonb_build_object('saved', true, 'count', v_inserted);
end;
$$;
revoke all on function public.sl_save_price_version(text,jsonb) from public, anon, authenticated;
grant execute on function public.sl_save_price_version(text,jsonb) to service_role;

create or replace function public.sl_claim_notification_jobs(p_limit integer default 20)
returns table(
  id uuid,
  line_user_id text,
  notification_type text,
  reference_id text,
  payload jsonb,
  status text,
  attempts integer,
  scheduled_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  with candidates as (
    select n.id
    from public.sl_notifications n
    where n.notification_type = 'order_status'
      and n.scheduled_at <= now()
      and n.status in ('pending','failed','processing')
    order by n.scheduled_at, n.created_at, n.id
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  )
  update public.sl_notifications n
  set status = 'processing',
      attempts = n.attempts + 1,
      scheduled_at = now() + interval '60 seconds',
      last_error = ''
  from candidates c
  where n.id = c.id
  returning n.id, n.line_user_id, n.notification_type, n.reference_id,
    n.payload, n.status, n.attempts, n.scheduled_at;
$$;
revoke all on function public.sl_claim_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.sl_claim_notification_jobs(integer) to service_role;

create or replace function public.sl_finish_notification_job(
  p_job_id text,
  p_attempts integer,
  p_sent boolean,
  p_error text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job public.sl_notifications%rowtype;
  v_status text;
  v_delay_seconds integer;
begin
  select * into v_job
  from public.sl_notifications
  where id::text = p_job_id and status = 'processing' and attempts = p_attempts
  for update;
  if not found then
    return jsonb_build_object('error', 'not_processing');
  end if;

  if p_sent then
    update public.sl_notifications
    set status = 'sent', sent_at = now(), scheduled_at = now(), last_error = ''
    where id = v_job.id;
    v_status := 'sent';
  else
    v_status := case when v_job.attempts >= 8 then 'cancelled' else 'failed' end;
    v_delay_seconds := least(
      21600,
      (300 * power(2, least(greatest(v_job.attempts - 1, 0), 6)))::integer
    );
    update public.sl_notifications
    set status = v_status,
        scheduled_at = now() + make_interval(secs => v_delay_seconds),
        last_error = left(coalesce(nullif(p_error, ''), 'LINE push failed'), 300)
    where id = v_job.id;
  end if;
  return jsonb_build_object('status', v_status, 'attempts', v_job.attempts);
end;
$$;
revoke all on function public.sl_finish_notification_job(text,integer,boolean,text) from public, anon, authenticated;
grant execute on function public.sl_finish_notification_job(text,integer,boolean,text) to service_role;

create or replace function public.sl_get_pending_order_confirmations(p_limit integer default 20)
returns table(
  id text,
  request_id text,
  line_user_id text,
  address_id uuid,
  delivery_address text,
  status text,
  note text,
  total_amount numeric,
  created_at timestamptz,
  items jsonb
)
language sql
security invoker
set search_path = public
as $$
  select o.id, o.request_id, o.line_user_id, o.address_id, o.delivery_address,
    o.status, o.note, o.total_amount, o.created_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_code', i.product_code,
          'product_name', i.product_name,
          'quantity', i.quantity,
          'unit_price', i.unit_price,
          'subtotal', i.subtotal
        ) order by i.created_at, i.id
      ) filter (where i.id is not null),
      '[]'::jsonb
    ) as items
  from public.sl_orders o
  left join public.sl_order_items i on i.order_id = o.id
  where o.notification_status in ('pending','failed')
    and o.status <> 'creating'
    and nullif(o.line_user_id, '') is not null
  group by o.id
  order by o.created_at
  limit greatest(0, least(coalesce(p_limit, 20), 50));
$$;
revoke all on function public.sl_get_pending_order_confirmations(integer) from public, anon, authenticated;
grant execute on function public.sl_get_pending_order_confirmations(integer) to service_role;

create or replace function public.sl_finish_order_confirmation(
  p_order_id text,
  p_sent boolean,
  p_error text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text := case when p_sent then 'sent' else 'failed' end;
  v_updated integer;
begin
  update public.sl_orders
  set notification_status = v_status,
      notification_error = case when p_sent then '' else left(coalesce(p_error, ''), 300) end
  where id = p_order_id and status <> 'creating';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return jsonb_build_object('error', 'order_not_found');
  end if;
  return jsonb_build_object('status', v_status);
end;
$$;
revoke all on function public.sl_finish_order_confirmation(text,boolean,text) from public, anon, authenticated;
grant execute on function public.sl_finish_order_confirmation(text,boolean,text) to service_role;

create or replace function public.sl_claim_backup_jobs(p_limit integer default 100)
returns table(
  id bigint,
  entity_type text,
  entity_id text,
  operation text,
  payload jsonb,
  status text,
  attempts integer,
  created_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  with candidates as (
    select b.id
    from public.sl_backup_outbox b
    where b.next_attempt_at <= now()
      and b.status in ('pending','failed','processing')
    order by b.next_attempt_at, b.id
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  )
  update public.sl_backup_outbox b
  set status = 'processing',
      attempts = b.attempts + 1,
      next_attempt_at = now() + interval '10 minutes',
      last_error = ''
  from candidates c
  where b.id = c.id
  returning b.id, b.entity_type, b.entity_id, b.operation,
    b.payload, b.status, b.attempts, b.created_at;
$$;
revoke all on function public.sl_claim_backup_jobs(integer) from public, anon, authenticated;
grant execute on function public.sl_claim_backup_jobs(integer) to service_role;

create or replace function public.sl_finish_backup_jobs(
  p_job_ids bigint[],
  p_success boolean,
  p_error text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer;
begin
  if coalesce(array_length(p_job_ids, 1), 0) = 0 then
    return jsonb_build_object('updated', 0);
  end if;
  if p_success then
    update public.sl_backup_outbox
    set status = 'synced', synced_at = now(), next_attempt_at = now(), last_error = ''
    where id = any(p_job_ids) and status = 'processing';
  else
    update public.sl_backup_outbox
    set status = 'failed',
        next_attempt_at = now() + make_interval(secs => least(
          86400,
          (300 * power(2, least(greatest(attempts - 1, 0), 8)))::integer
        )),
        last_error = left(coalesce(nullif(p_error, ''), 'backup failed'), 500)
    where id = any(p_job_ids) and status = 'processing';
  end if;
  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated);
end;
$$;
revoke all on function public.sl_finish_backup_jobs(bigint[],boolean,text) from public, anon, authenticated;
grant execute on function public.sl_finish_backup_jobs(bigint[],boolean,text) to service_role;

create or replace function public.sl_get_admin_system_status()
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'checkedAt', now(),
    'backup', jsonb_build_object(
      'pending', (select count(*) from public.sl_backup_outbox where status = 'pending'),
      'failed', (select count(*) from public.sl_backup_outbox where status = 'failed'),
      'expiredLeases', (select count(*) from public.sl_backup_outbox where status = 'processing' and next_attempt_at <= now()),
      'lastSyncedAt', coalesce((select max(synced_at) from public.sl_backup_outbox where status = 'synced'), null)
    ),
    'notifications', jsonb_build_object(
      'pendingOrFailed', (select count(*) from public.sl_orders where status <> 'creating' and notification_status in ('pending','failed') and nullif(line_user_id, '') is not null)
    ),
    'approvals', jsonb_build_object(
      'bindings', (select count(*) from public.sl_binding_requests where status = 'pending'),
      'addresses', (select count(*) from public.sl_address_requests where status = 'pending')
    )
  );
$$;
revoke all on function public.sl_get_admin_system_status() from public, anon, authenticated;
grant execute on function public.sl_get_admin_system_status() to service_role;



-- Migration: 20261005005501_operations_rpcs.sql
-- Narrow, atomic RPCs for the operations admin. Browser roles cannot execute them.

create or replace function public.sl_admin_operations_bootstrap()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today_start timestamptz := date_trunc('day', now());
  v_inspection_limit date := current_date + 90;
  v_reminder_limit date := current_date + 14;
  v_orders jsonb;
  v_drivers jsonb;
  v_cylinders jsonb;
  v_partners jsonb;
  v_rewards jsonb;
  v_reminders jsonb;
  v_daily jsonb;
  v_open_orders integer;
  v_today_orders integer;
  v_active_drivers integer;
  v_cylinders_due integer;
  v_reward_liability numeric;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_orders from (
    select id,status,delivery_address,total_amount,notification_status,created_at,updated_at
    from public.sl_orders order by created_at desc limit 100
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]'::jsonb)
  into v_drivers from (
    select id,name,phone,status from public.sl_drivers order by name limit 100
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.inspection_due_date nulls last), '[]'::jsonb)
  into v_cylinders from (
    select id,serial_number,specification_kg,ownership,inspection_due_date,status,current_customer_id,deposit_amount
    from public.sl_cylinders order by inspection_due_date nulls last limit 300
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]'::jsonb)
  into v_partners from (
    select id,name,contact_name,phone,status,qr_public_id from public.sl_partners order by name limit 200
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_rewards from (
    select id,customer_id,transaction_type,amount,available_amount,expires_at,created_at,note
    from public.sl_reward_transactions order by created_at desc limit 100
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.predicted_order_date), '[]'::jsonb)
  into v_reminders from (
    select id,customer_id,product_code,predicted_order_date,confidence,last_order_at
    from public.sl_usage_predictions
    where predicted_order_date <= v_reminder_limit
    order by predicted_order_date limit 100
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.operation_date desc), '[]'::jsonb)
  into v_daily from (
    select * from public.sl_daily_operations order by operation_date desc limit 31
  ) x;

  select count(*) filter (where status in ('pending','accepted','assigned','delivering')),
         count(*) filter (where created_at >= v_today_start)
  into v_open_orders, v_today_orders from public.sl_orders;
  select count(*) into v_active_drivers from public.sl_drivers where status = 'active';
  select count(*) into v_cylinders_due from public.sl_cylinders
    where inspection_due_date <= v_inspection_limit and status <> 'retired';
  select coalesce(sum(available_balance), 0) into v_reward_liability from public.sl_reward_balances;

  return jsonb_build_object(
    'configured', true,
    'metrics', jsonb_build_object(
      'openOrders', v_open_orders, 'todayOrders', v_today_orders,
      'activeDrivers', v_active_drivers, 'cylindersDue', v_cylinders_due,
      'rewardLiability', v_reward_liability, 'remindersDue', jsonb_array_length(v_reminders)
    ),
    'orders', v_orders, 'drivers', v_drivers, 'cylinders', v_cylinders,
    'partners', v_partners, 'rewardTransactions', v_rewards,
    'reminders', v_reminders, 'dailyMetrics', v_daily
  );
end;
$$;

create or replace function public.sl_save_driver(
  p_id uuid, p_name text, p_phone text, p_status text, p_actor text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare v_before public.sl_drivers%rowtype; v_after public.sl_drivers%rowtype;
begin
  if nullif(btrim(p_name), '') is null or p_status not in ('active','inactive') then
    raise exception 'invalid driver' using errcode = '22023';
  end if;
  select * into v_before from public.sl_drivers where id = p_id for update;
  insert into public.sl_drivers(id,name,phone,status,updated_at)
  values (p_id,left(btrim(p_name),80),left(coalesce(p_phone,''),30),p_status,now())
  on conflict (id) do update set name=excluded.name,phone=excluded.phone,status=excluded.status,updated_at=now()
  returning * into v_after;
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,before_data,after_data)
  values ('admin',left(coalesce(p_actor,''),100),case when v_before.id is null then 'create_driver' else 'update_driver' end,
    'driver',p_id::text,case when v_before.id is null then null else to_jsonb(v_before) end,to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.sl_assign_driver(
  p_order_id text, p_driver_id uuid, p_route_date date, p_route_sequence integer, p_actor text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_order public.sl_orders%rowtype;
  v_assignment public.sl_delivery_assignments%rowtype;
  v_previous text;
  v_event_id bigint;
begin
  select * into v_order from public.sl_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order not found' using errcode = 'P0002'; end if;
  if v_order.status not in ('pending','accepted','assigned') then raise exception 'order state conflict' using errcode = '23514'; end if;
  if not exists (select 1 from public.sl_drivers where id=p_driver_id and status='active') then
    raise exception 'driver not found' using errcode = 'P0002';
  end if;
  insert into public.sl_delivery_assignments(order_id,driver_id,route_date,route_sequence,status,assigned_by,assigned_at,updated_at)
  values (p_order_id,p_driver_id,coalesce(p_route_date,current_date),p_route_sequence,'assigned',left(coalesce(p_actor,''),100),now(),now())
  on conflict (order_id) do update set driver_id=excluded.driver_id,route_date=excluded.route_date,
    route_sequence=excluded.route_sequence,status='assigned',assigned_by=excluded.assigned_by,assigned_at=now(),updated_at=now()
  returning * into v_assignment;
  if v_order.status <> 'assigned' then
    v_previous := v_order.status;
    update public.sl_orders set status='assigned',updated_at=now() where id=p_order_id returning * into v_order;
    insert into public.sl_order_status_events(order_id,from_status,to_status,actor_type,actor_id,note)
    values (p_order_id,v_previous,'assigned','admin',left(coalesce(p_actor,''),100),'指派配送人員') returning id into v_event_id;
    if nullif(v_order.line_user_id,'') is not null then
      insert into public.sl_notifications(customer_id,line_user_id,notification_type,reference_id,payload)
      values (v_order.customer_id,v_order.line_user_id,'order_status',p_order_id||':'||v_event_id::text,
        jsonb_build_object('orderId',p_order_id,'status','assigned')) on conflict do nothing;
    end if;
    insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
    values ('order',p_order_id,'update',to_jsonb(v_order));
  end if;
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,after_data)
  values ('admin',left(coalesce(p_actor,''),100),'assign_driver','order',p_order_id,to_jsonb(v_assignment));
  return to_jsonb(v_assignment);
end;
$$;

create or replace function public.sl_admin_route_preview(p_route_date date default current_date)
returns jsonb
language sql security invoker set search_path = ''
as $$
  select jsonb_build_object(
    'routeDate', coalesce(p_route_date,current_date),
    'stops', coalesce(jsonb_agg(jsonb_build_object(
      'sequence',x.seq,'id',x.id,'delivery_address',x.delivery_address,'status',x.status,
      'created_at',x.created_at,'district',x.district,'road',x.road
    ) order by x.seq), '[]'::jsonb)
  )
  from (
    select row_number() over(order by coalesce(a.district,''),coalesce(a.road,''),o.created_at)::integer seq,
      o.id,o.delivery_address,o.status,o.created_at,coalesce(a.district,'') district,coalesce(a.road,'') road
    from public.sl_orders o left join public.sl_addresses a on a.id=o.address_id
    where o.status in ('pending','accepted','assigned')
    order by coalesce(a.district,''),coalesce(a.road,''),o.created_at limit 300
  ) x;
$$;

create or replace function public.sl_save_cylinder(p_input jsonb, p_actor text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid := (p_input->>'id')::uuid; v_before public.sl_cylinders%rowtype; v_after public.sl_cylinders%rowtype;
begin
  if nullif(btrim(p_input->>'serialNumber'),'') is null then raise exception 'invalid cylinder' using errcode='22023'; end if;
  select * into v_before from public.sl_cylinders where id=v_id for update;
  insert into public.sl_cylinders(id,serial_number,specification_kg,ownership,inspection_due_date,status,deposit_amount,updated_at)
  values (v_id,left(btrim(p_input->>'serialNumber'),80),(p_input->>'specificationKg')::numeric,
    coalesce(nullif(p_input->>'ownership',''),'company'),nullif(p_input->>'inspectionDueDate','')::date,
    coalesce(nullif(p_input->>'status',''),'warehouse_full'),coalesce((p_input->>'depositAmount')::numeric,0),now())
  on conflict (id) do update set serial_number=excluded.serial_number,specification_kg=excluded.specification_kg,
    ownership=excluded.ownership,inspection_due_date=excluded.inspection_due_date,status=excluded.status,
    deposit_amount=excluded.deposit_amount,updated_at=now() returning * into v_after;
  insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
  values ('cylinder',v_id::text,case when v_before.id is null then 'insert' else 'update' end,to_jsonb(v_after));
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,before_data,after_data)
  values ('admin',left(coalesce(p_actor,''),100),case when v_before.id is null then 'create_cylinder' else 'update_cylinder' end,
    'cylinder',v_id::text,case when v_before.id is null then null else to_jsonb(v_before) end,to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.sl_move_cylinder(p_input jsonb, p_actor text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_cylinder_id uuid := (p_input->>'cylinderId')::uuid;
  v_customer_id uuid := nullif(p_input->>'customerId','')::uuid;
  v_type text := p_input->>'movementType';
  v_movement public.sl_cylinder_movements%rowtype;
  v_cylinder public.sl_cylinders%rowtype;
  v_status text;
begin
  if v_type not in ('deliver_full','collect_empty','deposit','return_deposit','send_inspection','return_inspection','adjustment','retire') then
    raise exception 'invalid movement' using errcode='22023';
  end if;
  select * into v_cylinder from public.sl_cylinders where id=v_cylinder_id for update;
  if v_cylinder.id is null then raise exception 'cylinder not found' using errcode='P0002'; end if;
  if v_type='deliver_full' and v_customer_id is null then raise exception 'customer required' using errcode='22023'; end if;
  insert into public.sl_cylinder_movements(cylinder_id,order_id,customer_id,movement_type,amount,actor_id,note)
  values (v_cylinder_id,nullif(p_input->>'orderId',''),v_customer_id,v_type,coalesce((p_input->>'amount')::numeric,0),
    left(coalesce(p_actor,''),100),left(coalesce(p_input->>'note',''),300)) returning * into v_movement;
  v_status := case v_type when 'deliver_full' then 'with_customer' when 'collect_empty' then 'warehouse_empty'
    when 'send_inspection' then 'inspection' when 'return_inspection' then 'warehouse_empty' when 'retire' then 'retired' else null end;
  if v_status is not null then
    update public.sl_cylinders set status=v_status,current_customer_id=case when v_type='deliver_full' then v_customer_id else null end,
      retired_at=case when v_type='retire' then current_date else retired_at end,updated_at=now() where id=v_cylinder_id returning * into v_cylinder;
    insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload) values ('cylinder',v_cylinder_id::text,'update',to_jsonb(v_cylinder));
  end if;
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,after_data)
  values ('admin',left(coalesce(p_actor,''),100),'move_cylinder','cylinder',v_cylinder_id::text,to_jsonb(v_movement));
  return to_jsonb(v_movement);
end;
$$;

create or replace function public.sl_save_partner(p_input jsonb, p_actor text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_id uuid := (p_input->>'id')::uuid; v_before public.sl_partners%rowtype; v_after public.sl_partners%rowtype;
begin
  if nullif(btrim(p_input->>'name'),'') is null then raise exception 'invalid partner' using errcode='22023'; end if;
  select * into v_before from public.sl_partners where id=v_id for update;
  insert into public.sl_partners(id,name,contact_name,phone,address,status,updated_at)
  values (v_id,left(btrim(p_input->>'name'),100),left(coalesce(p_input->>'contactName',''),80),left(coalesce(p_input->>'phone',''),30),
    left(coalesce(p_input->>'address',''),300),coalesce(nullif(p_input->>'status',''),'active'),now())
  on conflict (id) do update set name=excluded.name,contact_name=excluded.contact_name,phone=excluded.phone,
    address=excluded.address,status=excluded.status,updated_at=now() returning * into v_after;
  insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
  values ('partner',v_id::text,case when v_before.id is null then 'insert' else 'update' end,to_jsonb(v_after));
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,before_data,after_data)
  values ('admin',left(coalesce(p_actor,''),100),case when v_before.id is null then 'create_partner' else 'update_partner' end,
    'partner',v_id::text,case when v_before.id is null then null else to_jsonb(v_before) end,to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.sl_update_reminder(p_customer_id uuid,p_enabled boolean,p_channel text,p_actor text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_before public.sl_reminder_preferences%rowtype; v_after public.sl_reminder_preferences%rowtype;
begin
  if p_channel not in ('line','phone','none') then raise exception 'invalid channel' using errcode='22023'; end if;
  if not exists (select 1 from public.sl_customers where id=p_customer_id) then raise exception 'customer not found' using errcode='P0002'; end if;
  select * into v_before from public.sl_reminder_preferences where customer_id=p_customer_id for update;
  insert into public.sl_reminder_preferences(customer_id,enabled,channel,updated_at)
  values (p_customer_id,p_enabled,p_channel,now())
  on conflict (customer_id) do update set enabled=excluded.enabled,channel=excluded.channel,updated_at=now() returning * into v_after;
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,before_data,after_data)
  values ('admin',left(coalesce(p_actor,''),100),'update_reminder','customer',p_customer_id::text,
    case when v_before.customer_id is null then null else to_jsonb(v_before) end,to_jsonb(v_after));
  return to_jsonb(v_after);
end;
$$;

create or replace function public.sl_get_session_state(p_line_user_id text)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce((select jsonb_build_object('exists',true,'active',lm.status='active' and c.status='active','sessionVersion',lm.session_version)
    from public.sl_line_members lm join public.sl_customers c on c.id=lm.customer_id where lm.line_user_id=p_line_user_id),
    jsonb_build_object('exists',false,'active',false,'sessionVersion',0));
$$;

create or replace function public.sl_get_member_profile(p_line_user_id text)
returns jsonb language plpgsql security invoker set search_path = '' stable
as $$
declare v_member jsonb; v_customer_id uuid; v_history jsonb;
begin
  select jsonb_build_object(
    'line_user_id',lm.line_user_id,'line_display_name',lm.line_display_name,'status',lm.status,'session_version',lm.session_version,
    'sl_customers',jsonb_build_object('id',c.id,'legacy_customer_id',c.legacy_customer_id,'contact_name',c.contact_name,
      'primary_phone',c.primary_phone,'customer_type',c.customer_type,'status',c.status)
  ),c.id into v_member,v_customer_id
  from public.sl_line_members lm join public.sl_customers c on c.id=lm.customer_id where lm.line_user_id=p_line_user_id;
  if v_member is null then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) into v_history from (
    select history_key,last_unit_price,use_count from public.sl_customer_product_history where customer_id=v_customer_id
  ) h;
  return jsonb_build_object('member_row',v_member,'history',v_history);
end;
$$;

create or replace function public.sl_get_member_addresses(p_customer_id uuid)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.is_default desc,x.created_at),'[]'::jsonb) from (
    select id,label,address,is_default,status,created_at from public.sl_addresses
    where customer_id=p_customer_id and status='active' order by is_default desc,created_at
  ) x;
$$;

create or replace function public.sl_get_product_catalog()
returns jsonb language plpgsql security invoker set search_path = '' stable
as $$
declare v_products jsonb; v_rules jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) into v_products from (
    select code,name,specification,is_active,sort_order from public.sl_products where is_active=true order by sort_order
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.effective_at desc),'[]'::jsonb) into v_rules from (
    select id,product_code,scope,customer_id,price,effective_at,expires_at,created_at from public.sl_price_rules order by effective_at desc
  ) x;
  return jsonb_build_object('products',v_products,'rules',v_rules);
end;
$$;

create or replace function public.sl_find_order_by_request(p_customer_id uuid,p_request_id text)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select to_jsonb(x) from (
    select o.id,o.address_id,o.delivery_address,o.status,o.note,o.total_amount,o.notification_status,o.created_at,
      coalesce((select jsonb_agg(jsonb_build_object('product_code',i.product_code,'product_name',i.product_name,
        'quantity',i.quantity,'unit_price',i.unit_price,'subtotal',i.subtotal) order by i.created_at)
        from public.sl_order_items i where i.order_id=o.id),'[]'::jsonb) sl_order_items
    from public.sl_orders o where o.customer_id=p_customer_id and o.request_id=p_request_id limit 1
  ) x;
$$;

create or replace function public.sl_get_admin_address_requests()
returns jsonb language plpgsql security invoker set search_path = '' stable
as $$
declare v_requests jsonb; v_candidates jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb) into v_requests from (
    select ar.id,ar.line_user_id,ar.request_type,ar.requested_label,ar.requested_address,ar.status,ar.created_at,
      jsonb_build_object('legacy_customer_id',c.legacy_customer_id,'contact_name',c.contact_name,'primary_phone',c.primary_phone) customer
    from public.sl_address_requests ar join public.sl_customers c on c.id=ar.customer_id
    where ar.status='pending' order by ar.created_at limit 100
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_candidates from (
    select * from public.sl_get_address_handover_candidates()
  ) x;
  return jsonb_build_object('requests',v_requests,'candidates',v_candidates);
end;
$$;

create or replace function public.sl_get_member_orders(p_customer_id uuid,p_limit integer default 20)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
    select o.id,o.address_id,o.delivery_address,o.status,o.note,o.total_amount,o.created_at,o.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object('product_code',i.product_code,'product_name',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price,'subtotal',i.subtotal) order by i.created_at)
        from public.sl_order_items i where i.order_id=o.id),'[]'::jsonb) sl_order_items
    from public.sl_orders o where o.customer_id=p_customer_id and o.status<>'creating'
    order by o.created_at desc limit greatest(1,least(coalesce(p_limit,20),100))
  ) x;
$$;

create or replace function public.sl_get_road_options(p_city text,p_district text)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select road,address from public.sl_addresses where city=p_city and district=p_district and status='active' limit 1000
  ) x;
$$;

create or replace function public.sl_get_admin_bindings()
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at),'[]'::jsonb) from (
    select br.id,br.line_user_id,br.line_display_name,br.requested_name,br.requested_phone,br.requested_customer_id,
      br.requested_address,br.status,br.created_at,
      case when c.id is null then null else jsonb_build_object('id',c.id,'legacy_customer_id',c.legacy_customer_id,'display_name',c.display_name,
        'contact_name',c.contact_name,'primary_phone',c.primary_phone,'customer_type',c.customer_type) end customer
    from public.sl_binding_requests br left join public.sl_customers c on c.id=br.requested_customer_id
    where br.status='pending' order by br.created_at limit 100
  ) x;
$$;

create or replace function public.sl_get_admin_pricing_source()
returns jsonb language plpgsql security invoker set search_path = '' stable
as $$
declare v_products jsonb; v_rules jsonb; v_business_count integer;
begin
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_order),'[]'::jsonb) into v_products from (
    select code,name,specification,sort_order from public.sl_products where is_active=true order by sort_order
  ) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.effective_at desc),'[]'::jsonb) into v_rules from (
    select source_version_id,product_code,scope,price,effective_at,created_at,note from public.sl_price_rules
    where scope in ('all','business') order by effective_at desc
  ) x;
  select count(*) into v_business_count from public.sl_customers where status='active' and customer_type in ('生意攤','營業用','商業','餐飲','店家');
  return jsonb_build_object('products',v_products,'rules',v_rules,'businessCustomerCount',v_business_count);
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'sl_admin_operations_bootstrap','sl_save_driver','sl_assign_driver','sl_admin_route_preview','sl_save_cylinder',
      'sl_move_cylinder','sl_save_partner','sl_update_reminder','sl_get_session_state','sl_get_member_orders',
      'sl_get_member_profile','sl_get_member_addresses','sl_get_product_catalog','sl_find_order_by_request',
      'sl_get_admin_address_requests','sl_get_road_options','sl_get_admin_bindings','sl_get_admin_pricing_source'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.proc);
    execute format('grant execute on function %s to service_role',f.proc);
  end loop;
end $$;


-- Migration: 20261005005649_legacy_order_bridge.sql
-- Bidirectional LINE/Supabase <-> legacy SQL Server order bridge.
-- The bridge is disabled until a real business host is inspected and configured.

create table if not exists public.sl_legacy_sync_nonces (
  nonce text primary key,
  used_at timestamptz not null default now()
);
create index if not exists sl_legacy_sync_nonces_used_idx on public.sl_legacy_sync_nonces(used_at);

create table if not exists public.sl_legacy_order_links (
  id bigint generated always as identity primary key,
  order_id text not null unique references public.sl_orders(id) on delete cascade,
  legacy_order_id bigint not null unique,
  origin text not null check (origin in ('line','legacy')),
  source_fingerprint text not null default '',
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.sl_legacy_sync_jobs (
  id bigint generated always as identity primary key,
  direction text not null check (direction in ('to_legacy')),
  event_type text not null check (event_type in ('order_create','order_update','order_cancel')),
  order_id text not null references public.sl_orders(id) on delete cascade,
  idempotency_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','synced','failed','conflict','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text not null default '',
  created_at timestamptz not null default now(),
  synced_at timestamptz
);
create index if not exists sl_legacy_sync_jobs_queue_idx on public.sl_legacy_sync_jobs(status,next_attempt_at,id)
  where status in ('pending','failed');
create index if not exists sl_legacy_sync_jobs_lease_idx on public.sl_legacy_sync_jobs(next_attempt_at,id)
  where status='processing';

create table if not exists public.sl_legacy_sync_state (
  source_key text primary key,
  high_watermark bigint not null default 0,
  last_fingerprint_scan_at timestamptz,
  last_success_at timestamptz,
  last_error text not null default '',
  updated_at timestamptz not null default now()
);

grant usage, select on sequence public.sl_legacy_order_links_id_seq to service_role;
grant usage, select on sequence public.sl_legacy_sync_jobs_id_seq to service_role;

do $$
declare t text;
begin
  foreach t in array array['sl_legacy_sync_nonces','sl_legacy_order_links','sl_legacy_sync_jobs','sl_legacy_sync_state']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update, delete on table public.%I to service_role',t);
  end loop;
end $$;

create or replace function public.sl_consume_legacy_sync_nonce(p_nonce text,p_used_at timestamptz)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  if nullif(p_nonce,'') is null or p_used_at < now()-interval '5 minutes' or p_used_at > now()+interval '5 minutes' then return false; end if;
  delete from public.sl_legacy_sync_nonces where used_at < now()-interval '15 minutes';
  insert into public.sl_legacy_sync_nonces(nonce,used_at) values (left(p_nonce,120),p_used_at) on conflict do nothing;
  return found;
end;
$$;

create or replace function public.sl_peek_legacy_order_jobs(p_limit integer default 50)
returns setof public.sl_legacy_sync_jobs language sql security invoker set search_path = '' stable
as $$
  select * from public.sl_legacy_sync_jobs
  where status in ('pending','failed') and next_attempt_at<=now()
  order by id limit greatest(1,least(coalesce(p_limit,50),200));
$$;

create or replace function public.sl_claim_legacy_order_jobs(p_limit integer default 50)
returns setof public.sl_legacy_sync_jobs language plpgsql security invoker set search_path = ''
as $$
begin
  update public.sl_legacy_sync_jobs set status='failed',last_error='processing lease expired',next_attempt_at=now()
  where status='processing' and next_attempt_at<=now();
  return query
  with picked as (
    select id from public.sl_legacy_sync_jobs
    where status in ('pending','failed') and next_attempt_at<=now()
    order by id for update skip locked limit greatest(1,least(coalesce(p_limit,50),200))
  )
  update public.sl_legacy_sync_jobs j set status='processing',attempts=j.attempts+1,next_attempt_at=now()+interval '5 minutes'
  from picked where j.id=picked.id returning j.*;
end;
$$;

create or replace function public.sl_finish_legacy_order_job(
  p_job_id bigint,p_attempts integer,p_succeeded boolean,p_legacy_order_id bigint default null,p_error text default ''
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_job public.sl_legacy_sync_jobs%rowtype;
begin
  select * into v_job from public.sl_legacy_sync_jobs where id=p_job_id for update;
  if v_job.id is null then return jsonb_build_object('error','job_not_found'); end if;
  if v_job.status<>'processing' or v_job.attempts<>p_attempts then return jsonb_build_object('error','stale_attempt'); end if;
  if p_succeeded then
    if p_legacy_order_id is null then return jsonb_build_object('error','legacy_order_id_required'); end if;
    insert into public.sl_legacy_order_links(order_id,legacy_order_id,origin,source_fingerprint,last_synced_at)
    values (v_job.order_id,p_legacy_order_id,'line','',now())
    on conflict (order_id) do update set legacy_order_id=excluded.legacy_order_id,last_synced_at=now();
    update public.sl_legacy_sync_jobs set status='synced',synced_at=now(),next_attempt_at=now(),last_error='' where id=v_job.id;
    return jsonb_build_object('status','synced','orderId',v_job.order_id,'legacyOrderId',p_legacy_order_id);
  end if;
  update public.sl_legacy_sync_jobs set status=case when attempts>=10 then 'conflict' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>least(21600,greatest(60,(power(2,least(attempts,8))::integer)*60))),
    last_error=left(coalesce(p_error,'legacy write failed'),300) where id=v_job.id;
  return jsonb_build_object('status',case when v_job.attempts>=10 then 'conflict' else 'failed' end);
end;
$$;

create or replace function public.sl_finish_legacy_order_job_priced(
  p_job_id bigint,p_attempts integer,p_succeeded boolean,p_legacy_order_id bigint,
  p_error text,p_legacy_total numeric,p_legacy_address text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_job public.sl_legacy_sync_jobs%rowtype; v_order public.sl_orders%rowtype;
begin
  select * into v_job from public.sl_legacy_sync_jobs where id=p_job_id for update;
  if v_job.id is null then return jsonb_build_object('error','job_not_found'); end if;
  if v_job.status<>'processing' or v_job.attempts<>p_attempts then return jsonb_build_object('error','stale_attempt'); end if;
  if p_succeeded then
    if p_legacy_order_id is null then return jsonb_build_object('error','legacy_order_id_required'); end if;
    if v_job.event_type='order_create' then
      if p_legacy_total is null or p_legacy_total<=0 or nullif(btrim(p_legacy_address),'') is null then
        return jsonb_build_object('error','legacy_price_or_address_required');
      end if;
      select * into v_order from public.sl_orders where id=v_job.order_id for update;
      if v_order.id is null or v_order.source<>'line' then return jsonb_build_object('error','line_order_required'); end if;
      if v_order.total_amount is not null and v_order.total_amount<>p_legacy_total then
        return jsonb_build_object('error','displayed_price_mismatch');
      end if;
      update public.sl_orders set gas_amount=p_legacy_total,total_amount=p_legacy_total,
        delivery_address=left(p_legacy_address,300),updated_at=now() where id=v_job.order_id;
      insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
      values ('order',v_job.order_id,'update',jsonb_build_object('legacyOrderId',p_legacy_order_id,
        'total',p_legacy_total,'address',left(p_legacy_address,300)));
    end if;
    insert into public.sl_legacy_order_links(order_id,legacy_order_id,origin,source_fingerprint,last_synced_at)
    values (v_job.order_id,p_legacy_order_id,'line','',now())
    on conflict (order_id) do update set legacy_order_id=excluded.legacy_order_id,last_synced_at=now();
    update public.sl_legacy_sync_jobs set status='synced',synced_at=now(),next_attempt_at=now(),last_error='' where id=v_job.id;
    return jsonb_build_object('status','synced','orderId',v_job.order_id,'legacyOrderId',p_legacy_order_id);
  end if;
  update public.sl_legacy_sync_jobs set status=case when attempts>=10 then 'conflict' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>least(21600,greatest(60,(power(2,least(attempts,8))::integer)*60))),
    last_error=left(coalesce(p_error,'legacy write failed'),300) where id=v_job.id;
  return jsonb_build_object('status',case when v_job.attempts>=10 then 'conflict' else 'failed' end);
end;
$$;
revoke all on function public.sl_finish_legacy_order_job_priced(bigint,integer,boolean,bigint,text,numeric,text) from public,anon,authenticated;
grant execute on function public.sl_finish_legacy_order_job_priced(bigint,integer,boolean,bigint,text,numeric,text) to service_role;

create or replace function public.sl_get_legacy_order_states(p_legacy_order_ids bigint[])
returns table(legacy_order_id bigint,order_id text,source_fingerprint text,last_synced_at timestamptz)
language sql security invoker set search_path = '' stable
as $$
  select l.legacy_order_id,l.order_id,l.source_fingerprint,l.last_synced_at
  from public.sl_legacy_order_links l where l.legacy_order_id=any(coalesce(p_legacy_order_ids,array[]::bigint[]));
$$;

create or replace function public.sl_import_legacy_order(p_order jsonb,p_items jsonb,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_legacy_id bigint := (p_order->>'legacyOrderId')::bigint;
  v_customer public.sl_customers%rowtype;
  v_line_user_id text;
  v_order_id text := 'LEGACY-'||v_legacy_id::text;
  v_existing public.sl_legacy_order_links%rowtype;
  v_status text;
  v_created_at timestamptz;
begin
  if v_legacy_id is null or nullif(p_order->>'legacyCustomerId','') is null then return jsonb_build_object('error','invalid_order'); end if;
  select * into v_customer from public.sl_customers where legacy_customer_id=p_order->>'legacyCustomerId' and status='active';
  if v_customer.id is null then return jsonb_build_object('error','unlinked_customer','legacyCustomerId',p_order->>'legacyCustomerId'); end if;
  select * into v_existing from public.sl_legacy_order_links where legacy_order_id=v_legacy_id for update;
  if v_existing.id is not null and v_existing.source_fingerprint=coalesce(p_fingerprint,'') then
    return jsonb_build_object('status','unchanged','orderId',v_existing.order_id);
  end if;
  select line_user_id into v_line_user_id from public.sl_line_members where customer_id=v_customer.id and status='active' order by last_verified_at desc nulls last limit 1;
  v_status := case p_order->>'status' when 'completed' then 'completed' when 'cancelled' then 'cancelled'
    when 'delivering' then 'delivering' when 'assigned' then 'assigned' when 'accepted' then 'accepted' else 'pending' end;
  v_created_at := coalesce(nullif(p_order->>'createdAt','')::timestamptz,now());

  insert into public.sl_orders(id,request_id,customer_id,line_user_id,address_id,delivery_address,status,source,note,
    gas_amount,non_gas_amount,reward_discount,total_amount,notification_status,created_at,updated_at)
  values (v_order_id,'legacy:'||v_legacy_id::text,v_customer.id,v_line_user_id,null,
    left(coalesce(p_order->>'address','舊系統訂單'),300),v_status,'legacy',left(coalesce(p_order->>'note',''),300),
    null,0,0,nullif(p_order->>'total','')::numeric,'skipped',v_created_at,now())
  on conflict (id) do update set delivery_address=excluded.delivery_address,status=excluded.status,note=excluded.note,
    total_amount=excluded.total_amount,line_user_id=excluded.line_user_id,updated_at=now();

  delete from public.sl_order_items where order_id=v_order_id;
  insert into public.sl_order_items(order_id,product_code,product_name,quantity,unit_price,subtotal)
  select v_order_id,i->>'code',coalesce(nullif(i->>'name',''),p.name),(i->>'quantity')::integer,
    nullif(i->>'price','')::numeric,nullif(i->>'subtotal','')::numeric
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) i join public.sl_products p on p.code=i->>'code'
  where coalesce((i->>'quantity')::integer,0)>0;

  insert into public.sl_legacy_order_links(order_id,legacy_order_id,origin,source_fingerprint,last_synced_at)
  values (v_order_id,v_legacy_id,'legacy',coalesce(p_fingerprint,''),now())
  on conflict (legacy_order_id) do update set source_fingerprint=excluded.source_fingerprint,last_synced_at=now();
  insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
  values ('order',v_order_id,case when v_existing.id is null then 'insert' else 'update' end,p_order||jsonb_build_object('items',p_items));
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,after_data)
  values ('legacy_sync','business_host',case when v_existing.id is null then 'import_legacy_order' else 'update_legacy_order' end,
    'order',v_order_id,p_order);
  return jsonb_build_object('status',case when v_existing.id is null then 'inserted' else 'updated' end,'orderId',v_order_id);
end;
$$;

create or replace function public.sl_get_legacy_sync_status()
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select jsonb_build_object(
    'jobs',jsonb_build_object(
      'pending',(select count(*) from public.sl_legacy_sync_jobs where status='pending'),
      'failed',(select count(*) from public.sl_legacy_sync_jobs where status='failed'),
      'processing',(select count(*) from public.sl_legacy_sync_jobs where status='processing'),
      'conflict',(select count(*) from public.sl_legacy_sync_jobs where status='conflict'),
      'synced',(select count(*) from public.sl_legacy_sync_jobs where status='synced')
    ),
    'links',(select count(*) from public.sl_legacy_order_links),
    'lastSyncedAt',(select max(last_synced_at) from public.sl_legacy_order_links)
  );
$$;

create or replace function public.sl_get_legacy_sync_state(p_source_key text)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce((select to_jsonb(s) from public.sl_legacy_sync_state s where s.source_key=p_source_key),
    jsonb_build_object('source_key',p_source_key,'high_watermark',0,'last_fingerprint_scan_at',null,'last_success_at',null,'last_error',''));
$$;

create or replace function public.sl_set_legacy_sync_state(
  p_source_key text,p_high_watermark bigint,p_success boolean,p_error text default ''
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_state public.sl_legacy_sync_state%rowtype;
begin
  insert into public.sl_legacy_sync_state(source_key,high_watermark,last_fingerprint_scan_at,last_success_at,last_error,updated_at)
  values (left(p_source_key,120),greatest(coalesce(p_high_watermark,0),0),now(),case when p_success then now() else null end,
    case when p_success then '' else left(coalesce(p_error,''),300) end,now())
  on conflict (source_key) do update set
    high_watermark=greatest(public.sl_legacy_sync_state.high_watermark,excluded.high_watermark),
    last_fingerprint_scan_at=now(),last_success_at=case when p_success then now() else public.sl_legacy_sync_state.last_success_at end,
    last_error=case when p_success then '' else excluded.last_error end,updated_at=now()
  returning * into v_state;
  return to_jsonb(v_state);
end;
$$;

create or replace function public.sl_get_legacy_link(p_order_id text)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce((select to_jsonb(l) from public.sl_legacy_order_links l where l.order_id=p_order_id),'null'::jsonb);
$$;

create or replace function public.sl_queue_legacy_status_change()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_order public.sl_orders%rowtype;
begin
  if new.actor_type='legacy_sync' then return new; end if;
  select * into v_order from public.sl_orders where id=new.order_id;
  if v_order.source='line' then
    insert into public.sl_legacy_sync_jobs(direction,event_type,order_id,idempotency_key,payload)
    values ('to_legacy',case when new.to_status='cancelled' then 'order_cancel' else 'order_update' end,
      new.order_id,'line:status:'||new.order_id||':'||new.id::text,
      to_jsonb(v_order)||jsonb_build_object('statusEventId',new.id))
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sl_queue_legacy_status_change on public.sl_order_status_events;
create trigger sl_queue_legacy_status_change after insert on public.sl_order_status_events
for each row execute function public.sl_queue_legacy_status_change();
revoke all on function public.sl_queue_legacy_status_change() from public,anon,authenticated;
grant execute on function public.sl_queue_legacy_status_change() to service_role;

create or replace function public.sl_create_order(p_order jsonb,p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare inserted_id text; v_legacy_customer_id text; v_payload jsonb;
begin
  insert into public.sl_orders(id,request_id,customer_id,line_user_id,address_id,delivery_address,status,source,note,gas_amount,total_amount,notification_status,created_at)
  values (p_order->>'id',p_order->>'requestId',(p_order->>'customerId')::uuid,nullif(p_order->>'lineUserId',''),
    nullif(p_order->>'addressId','')::uuid,p_order->>'address','pending','line',coalesce(p_order->>'note',''),
    nullif(p_order->>'total','')::numeric,nullif(p_order->>'total','')::numeric,'pending',(p_order->>'createdAt')::timestamptz)
  on conflict (request_id) do nothing returning id into inserted_id;
  if inserted_id is null then return jsonb_build_object('duplicate',true); end if;
  insert into public.sl_order_items(order_id,product_code,product_name,quantity,unit_price,subtotal,price_rule_id)
  select inserted_id,item->>'code',item->>'name',(item->>'quantity')::integer,nullif(item->>'price','')::numeric,
    nullif(item->>'subtotal','')::numeric,nullif(item->>'priceRuleId','')::uuid from jsonb_array_elements(p_items) item;
  select legacy_customer_id into v_legacy_customer_id from public.sl_customers where id=(p_order->>'customerId')::uuid;
  v_payload := p_order||jsonb_build_object('items',p_items,'legacyCustomerId',coalesce(v_legacy_customer_id,''));
  insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload) values ('order',inserted_id,'insert',v_payload);
  insert into public.sl_legacy_sync_jobs(direction,event_type,order_id,idempotency_key,payload)
  values ('to_legacy','order_create',inserted_id,'line:create:'||inserted_id,v_payload) on conflict (idempotency_key) do nothing;
  return jsonb_build_object('duplicate',false);
end;
$$;

create or replace function public.sl_update_order_status(
  p_order_id text,p_next_status text,p_actor text,p_note text default ''
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_order public.sl_orders%rowtype;
  v_previous_status text;
  v_event_id bigint;
  v_notification_id uuid;
begin
  select * into v_order from public.sl_orders where id=p_order_id for update;
  if not found then raise exception using errcode='P0002',message='找不到訂單'; end if;
  v_previous_status:=v_order.status;
  if not ((v_previous_status='pending' and p_next_status in ('accepted','cancelled'))
    or (v_previous_status='accepted' and p_next_status in ('assigned','delivering','cancelled'))
    or (v_previous_status='assigned' and p_next_status in ('delivering','cancelled'))
    or (v_previous_status='delivering' and p_next_status in ('completed','cancelled'))
    or (v_previous_status='creating' and p_next_status in ('pending','failed'))
    or (v_previous_status='failed' and p_next_status='pending')) then
    raise exception using errcode='23514',message='Order status transition is not allowed';
  end if;
  update public.sl_orders set status=p_next_status,updated_at=now(),
    accepted_at=case when p_next_status='accepted' then now() else accepted_at end,
    completed_at=case when p_next_status='completed' then now() else completed_at end,
    cancelled_at=case when p_next_status='cancelled' then now() else cancelled_at end
  where id=p_order_id and status=v_previous_status returning * into v_order;
  if not found then raise exception using errcode='40001',message='訂單已被其他人更新，請重新整理'; end if;
  insert into public.sl_order_status_events(order_id,from_status,to_status,actor_type,actor_id,note)
  values (p_order_id,v_previous_status,p_next_status,'admin',left(coalesce(p_actor,''),100),left(coalesce(p_note,''),300))
  returning id into v_event_id;
  if coalesce(v_order.line_user_id,'')<>'' then
    insert into public.sl_notifications(customer_id,line_user_id,notification_type,reference_id,payload,status,scheduled_at)
    values (v_order.customer_id,v_order.line_user_id,'order_status',p_order_id||':'||v_event_id::text,
      jsonb_build_object('orderId',v_order.id,'status',v_order.status,'address',v_order.delivery_address),'pending',now())
    on conflict (notification_type,reference_id) where reference_id<>'' do nothing returning id into v_notification_id;
  end if;
  insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload) values ('order',p_order_id,'update',to_jsonb(v_order));
  if v_order.source='line' then
    insert into public.sl_legacy_sync_jobs(direction,event_type,order_id,idempotency_key,payload)
    values ('to_legacy',case when p_next_status='cancelled' then 'order_cancel' else 'order_update' end,p_order_id,
      'line:status:'||p_order_id||':'||v_event_id::text,to_jsonb(v_order)) on conflict (idempotency_key) do nothing;
  end if;
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,before_data,after_data)
  values ('admin',left(coalesce(p_actor,''),100),'update_order_status','order',p_order_id,
    jsonb_build_object('status',v_previous_status),to_jsonb(v_order));
  return jsonb_build_object('order',to_jsonb(v_order),'eventId',v_event_id,'notificationId',v_notification_id);
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure proc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'sl_consume_legacy_sync_nonce','sl_peek_legacy_order_jobs','sl_claim_legacy_order_jobs','sl_finish_legacy_order_job',
      'sl_get_legacy_order_states','sl_import_legacy_order','sl_get_legacy_sync_status','sl_get_legacy_sync_state',
      'sl_set_legacy_sync_state','sl_get_legacy_link','sl_create_order','sl_update_order_status'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated',f.proc);
    execute format('grant execute on function %s to service_role',f.proc);
  end loop;
end $$;


-- Migration: 20261005051849_legacy_product_mapping.sql
-- Keep legacy-only cylinder sizes referentially valid without showing them in the LINE catalog.
insert into public.sl_products(code,name,specification,gas_weight_kg,is_gas,is_active,sort_order)
values
  ('GAS50','桶裝瓦斯 50 公斤','50公斤',50,true,false,50),
  ('GAS18','桶裝瓦斯 18 公斤','18公斤',18,true,false,18),
  ('GASNEW04','桶裝瓦斯 新 4 公斤','新4公斤',4,true,false,5)
on conflict (code) do update set
  name=excluded.name,specification=excluded.specification,gas_weight_kg=excluded.gas_weight_kg,is_gas=true,updated_at=now();


-- Migration: 20261005075517_legacy_job_order_index.sql
create index if not exists sl_legacy_sync_jobs_order_idx
  on public.sl_legacy_sync_jobs(order_id);


-- Migration: 20261005191000_admin_alerts.sql
-- Persistent, server-only state for deduplicated administrator health alerts.
create table if not exists public.sl_admin_alert_state (
  state_key text primary key,
  last_condition text not null default 'healthy' check (last_condition in ('healthy','unhealthy')),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_fingerprint text not null default '',
  last_alert_at timestamptz,
  last_alert_type text not null default '',
  lease_token uuid,
  lease_until timestamptz,
  last_error text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.sl_admin_alert_state enable row level security;
revoke all on table public.sl_admin_alert_state from public, anon, authenticated;
grant select, insert, update on table public.sl_admin_alert_state to service_role;

create or replace function public.sl_evaluate_admin_alert(
  p_integrations jsonb,
  p_notification_pending integer,
  p_backup_failed integer,
  p_legacy_failed integer,
  p_legacy_conflict integer,
  p_required_failures integer default 2,
  p_cooldown_minutes integer default 360,
  p_notification_threshold integer default 5,
  p_force boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.sl_admin_alert_state%rowtype;
  v_issues text[] := array[]::text[];
  v_fingerprint text := '';
  v_unhealthy boolean := false;
  v_send boolean := false;
  v_alert_type text := '';
  v_token uuid;
  v_failures integer := 0;
  v_service text;
  v_health jsonb;
begin
  insert into public.sl_admin_alert_state(state_key) values ('system') on conflict (state_key) do nothing;
  select * into v_state from public.sl_admin_alert_state where state_key='system' for update;
  foreach v_service in array array['supabase','line','googleSheets'] loop
    v_health := coalesce(p_integrations->v_service,'{}'::jsonb);
    if coalesce((v_health->>'healthy')::boolean,false)=false then
      v_issues := array_append(v_issues,case v_service when 'googleSheets' then 'Google Sheets 連線異常' when 'line' then 'LINE 連線異常' else 'Supabase 連線異常' end);
    end if;
  end loop;
  if greatest(coalesce(p_notification_pending,0),0)>=greatest(coalesce(p_notification_threshold,5),1) then v_issues:=array_append(v_issues,'LINE 通知待處理 '||greatest(coalesce(p_notification_pending,0),0)::text||' 筆'); end if;
  if greatest(coalesce(p_backup_failed,0),0)>0 then v_issues:=array_append(v_issues,'Google Sheets 備份失敗 '||greatest(coalesce(p_backup_failed,0),0)::text||' 筆'); end if;
  if greatest(coalesce(p_legacy_failed,0),0)>0 then v_issues:=array_append(v_issues,'舊系統同步失敗 '||greatest(coalesce(p_legacy_failed,0),0)::text||' 筆'); end if;
  if greatest(coalesce(p_legacy_conflict,0),0)>0 then v_issues:=array_append(v_issues,'舊系統同步衝突 '||greatest(coalesce(p_legacy_conflict,0),0)::text||' 筆'); end if;
  v_unhealthy:=cardinality(v_issues)>0;
  v_fingerprint:=case when v_unhealthy then md5(array_to_string(v_issues,E'\n')) else '' end;
  if v_unhealthy then v_failures:=case when v_state.last_condition='unhealthy' and v_state.last_fingerprint=v_fingerprint then v_state.consecutive_failures+1 else 1 end; end if;
  if p_force then v_send:=true;v_alert_type:='test';
  elsif v_unhealthy and v_failures>=greatest(coalesce(p_required_failures,2),1) and (v_state.lease_until is null or v_state.lease_until<=now()) and (v_state.last_alert_type<>'incident' or v_state.last_fingerprint<>v_fingerprint or v_state.last_alert_at is null or v_state.last_alert_at<=now()-make_interval(mins=>greatest(coalesce(p_cooldown_minutes,360),10))) then v_send:=true;v_alert_type:='incident';
  elsif not v_unhealthy and v_state.last_condition='unhealthy' and v_state.last_alert_type='incident' and (v_state.lease_until is null or v_state.lease_until<=now()) then v_send:=true;v_alert_type:='recovery'; end if;
  if v_send then v_token:=gen_random_uuid(); end if;
  update public.sl_admin_alert_state set last_condition=case when v_unhealthy then 'unhealthy' else 'healthy' end,consecutive_failures=v_failures,last_fingerprint=v_fingerprint,lease_token=case when v_send then v_token else lease_token end,lease_until=case when v_send then now()+interval '2 minutes' else lease_until end,updated_at=now() where state_key='system';
  return jsonb_build_object('send',v_send,'alertType',v_alert_type,'eventId',coalesce(v_token::text,''),'issues',to_jsonb(v_issues),'consecutiveFailures',v_failures,'condition',case when v_unhealthy then 'unhealthy' else 'healthy' end);
end;
$$;

create or replace function public.sl_finish_admin_alert(p_event_id uuid,p_alert_type text,p_succeeded boolean,p_error text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_updated integer;
begin
  update public.sl_admin_alert_state set last_alert_at=case when p_succeeded then now() else last_alert_at end,last_alert_type=case when p_succeeded then left(coalesce(p_alert_type,''),20) else last_alert_type end,lease_token=null,lease_until=null,last_error=case when p_succeeded then '' else left(coalesce(p_error,'LINE alert failed'),300) end,updated_at=now() where state_key='system' and lease_token=p_event_id;
  get diagnostics v_updated=row_count;
  return jsonb_build_object('updated',v_updated);
end;
$$;

revoke all on function public.sl_evaluate_admin_alert(jsonb,integer,integer,integer,integer,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.sl_evaluate_admin_alert(jsonb,integer,integer,integer,integer,integer,integer,integer,boolean) to service_role;
revoke all on function public.sl_finish_admin_alert(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.sl_finish_admin_alert(uuid,text,boolean,text) to service_role;


-- ── 額外強化與 AI / 客服 / 雲端目錄遷移腳本 ──

-- File: 20261009081758_line_support_handoff.sql
create table if not exists public.sl_line_support_sessions (
  line_user_id text primary key,
  mode text not null default 'ai' check (mode in ('ai', 'human')),
  intro_sent boolean not null default false,
  human_requested_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.sl_line_support_sessions enable row level security;
revoke all on table public.sl_line_support_sessions from public, anon, authenticated;
grant select, insert, update on table public.sl_line_support_sessions to service_role;


-- File: 20261010_create_system_status.sql
-- 盛隆瓦斯 — 尖峰監控狀態資料表
-- 版本：LINE-AI-20261010-KB_PEAK_TELEGRAM_UPGRADE01
-- 執行環境：Supabase SQL Editor

-- 建立資料表（若未存在）
CREATE TABLE IF NOT EXISTS sl_system_status (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  meta        JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 初始化尖峰狀態
INSERT INTO sl_system_status (key, value, meta, updated_at)
VALUES ('peak_orders', 'false', '{"orderCount": 0, "threshold": 20}', NOW())
ON CONFLICT (key) DO NOTHING;

-- 授權（Supabase service role 已有全權，此為 anon/read-only 設定）
-- peak-monitor GET 端點使用 service key 讀取，不需額外授權

-- 確認建立
SELECT * FROM sl_system_status;


-- File: 20261012065641_line_ai_support_audit.sql
create table if not exists public.sl_line_ai_turns (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  line_user_id text not null,
  user_message text,
  assistant_message text,
  response_route text not null,
  provider text,
  latency_ms integer,
  created_at timestamptz not null default now(),
  constraint sl_line_ai_turns_route_length check (length(response_route) <= 40),
  constraint sl_line_ai_turns_provider_length check (provider is null or length(provider) <= 20)
);

create index if not exists sl_line_ai_turns_recent_idx
  on public.sl_line_ai_turns (created_at desc);

alter table public.sl_line_ai_turns enable row level security;
revoke all on table public.sl_line_ai_turns from public, anon, authenticated;
grant select, insert, update, delete on table public.sl_line_ai_turns to service_role;
grant usage, select on sequence public.sl_line_ai_turns_id_seq to service_role;

create or replace function public.sl_prune_line_ai_turns()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  redacted_count integer;
  deleted_count integer;
begin
  update public.sl_line_ai_turns
  set user_message = null, assistant_message = null
  where created_at < now() - interval '30 days'
    and (user_message is not null or assistant_message is not null);
  get diagnostics redacted_count = row_count;
  delete from public.sl_line_ai_turns where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('redacted', redacted_count, 'deleted', deleted_count);
end;
$$;

revoke all on function public.sl_prune_line_ai_turns() from public, anon, authenticated;
grant execute on function public.sl_prune_line_ai_turns() to service_role;

create table if not exists public.sl_line_menu_config (
  id integer primary key default 1 check (id = 1),
  ai_menu_id text not null,
  human_menu_id text not null,
  updated_at timestamptz not null default now()
);
alter table public.sl_line_menu_config enable row level security;
revoke all on table public.sl_line_menu_config from public, anon, authenticated;
grant select, insert, update on table public.sl_line_menu_config to service_role;


-- File: 20261013060857_line_ai_memory_retention_and_daily_review.sql
-- Full support text is retained for 90 days. Official order records are separate.
create or replace function public.sl_prune_line_ai_turns()
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare deleted_count integer;
begin
  delete from public.sl_line_ai_turns where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return jsonb_build_object('redacted', 0, 'deleted', deleted_count);
end;
$$;
revoke all on function public.sl_prune_line_ai_turns() from public, anon, authenticated;
grant execute on function public.sl_prune_line_ai_turns() to service_role;

-- A preferred form of address is a preference, not proof of member identity.
create table if not exists public.sl_line_customer_preferences (
  line_user_id text primary key,
  preferred_name text,
  updated_at timestamptz not null default now(),
  constraint sl_line_customer_preferred_name_length check (preferred_name is null or length(preferred_name) between 1 and 40)
);
alter table public.sl_line_customer_preferences enable row level security;
revoke all on table public.sl_line_customer_preferences from public, anon, authenticated;
grant select, insert, update, delete on table public.sl_line_customer_preferences to service_role;

-- Explicit change/cancellation requests survive the 90-day chat purge.
create table if not exists public.sl_line_order_requests (
  id bigint generated always as identity primary key,
  event_id text not null unique,
  line_user_id text not null,
  customer_id uuid not null references public.sl_customers(id),
  order_id text not null references public.sl_orders(id),
  request_type text not null check (request_type in ('change','cancel')),
  details text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decision_note text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sl_line_order_requests_customer_created_idx
  on public.sl_line_order_requests(customer_id, created_at desc);
create index if not exists sl_line_order_requests_pending_idx
  on public.sl_line_order_requests(created_at) where status='pending';
alter table public.sl_line_order_requests enable row level security;
revoke all on table public.sl_line_order_requests from public, anon, authenticated;
grant select, insert, update on table public.sl_line_order_requests to service_role;
grant usage, select on sequence public.sl_line_order_requests_id_seq to service_role;

create or replace function public.sl_review_line_order_request(
  p_request_id bigint, p_decision text, p_note text, p_actor text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_changed bigint;
begin
  if p_decision not in ('approved','rejected') or length(trim(coalesce(p_note,''))) < 4 then
    raise exception 'invalid order request review';
  end if;
  update public.sl_line_order_requests
  set status = p_decision, decision_note = left(trim(p_note),200), decided_by = p_actor, decided_at = now()
  where id = p_request_id and status = 'pending'
  returning id into v_changed;
  if v_changed is null then return false; end if;
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id)
  values ('admin',p_actor,case when p_decision='approved' then 'order_service_completed' else 'order_service_rejected' end,
    'line_order_request',p_request_id::text);
  return true;
end;
$$;
revoke all on function public.sl_review_line_order_request(bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_review_line_order_request(bigint,text,text,text) to service_role;

-- Daily reviews store aggregate findings and draft improvements, never raw chat.
create table if not exists public.sl_line_ai_daily_reviews (
  review_date date primary key,
  metrics jsonb not null default '{}'::jsonb,
  suggestions jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft','sent')),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sl_line_ai_daily_reviews enable row level security;
revoke all on table public.sl_line_ai_daily_reviews from public, anon, authenticated;
grant select, insert, update on table public.sl_line_ai_daily_reviews to service_role;


-- File: 20261018063500_member_self_verification.sql
-- One-time, address-based LINE enrollment. The LINE access token is verified by
-- the server; this RPC is service-role only and never returns the hidden address.
alter table public.sl_line_members
  add column if not exists binding_started_at timestamptz,
  add column if not exists binding_phone text not null default '';
update public.sl_line_members
set binding_started_at = created_at
where binding_started_at is null;
alter table public.sl_line_members
  alter column binding_started_at set default now(),
  alter column binding_started_at set not null;

create or replace function public.sl_set_binding_start()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.binding_started_at := coalesce(new.binding_started_at, now());
  elsif new.customer_id is distinct from old.customer_id
     or (old.status <> 'active' and new.status = 'active') then
    new.binding_started_at := now();
  else
    new.binding_started_at := old.binding_started_at;
  end if;
  return new;
end;
$$;
drop trigger if exists sl_line_members_binding_start on public.sl_line_members;
create trigger sl_line_members_binding_start
before insert or update on public.sl_line_members
for each row execute function public.sl_set_binding_start();
revoke all on function public.sl_set_binding_start() from public, anon, authenticated;

create table if not exists public.sl_member_bind_attempts (
  customer_id uuid primary key references public.sl_customers(id) on delete cascade,
  failed_count integer not null default 0 check (failed_count between 0 and 3),
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.sl_member_bind_attempts enable row level security;
revoke all on public.sl_member_bind_attempts from public, anon, authenticated;
grant select, insert, update on public.sl_member_bind_attempts to service_role;

create or replace function public.sl_verify_and_bind_member(
  p_line_user_id text,
  p_line_display_name text,
  p_phone text,
  p_legacy_customer_id text,
  p_door text,
  p_floor text
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_door text := replace(replace(regexp_replace(translate(coalesce(p_door, ''), '０１２３４５６７８９', '0123456789'), '[[:space:]]', '', 'g'), '-', '之'), '－', '之');
  v_floor text := replace(replace(regexp_replace(translate(coalesce(p_floor, ''), '０１２３４５６７８９', '0123456789'), '[[:space:]]', '', 'g'), '-', '之'), '－', '之');
  v_customer_id uuid;
  v_customer_count integer;
  v_address text;
  v_real_door text;
  v_real_floor text;
  v_failures integer;
  v_locked_at timestamptz;
  v_member public.sl_line_members%rowtype;
begin
  if nullif(trim(coalesce(p_line_user_id, '')), '') is null
     or length(p_line_user_id) > 255
     or length(v_phone) < 8 or length(v_phone) > 15
     or coalesce(p_legacy_customer_id, '') = ''
     or v_door !~ '^[0-9]{1,5}(之[0-9]{1,4})?$'
     or (v_floor <> '' and v_floor !~ '^[0-9]{1,3}(之[0-9]{1,3})?$') then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  select count(distinct matched.id), min(matched.id::text)::uuid
  into v_customer_count, v_customer_id
  from (
    select cp.customer_id as id
    from public.sl_customer_phones cp
    join public.sl_customers c on c.id = cp.customer_id
    where c.status = 'active'
      and (
        cp.phone_normalized = v_phone
        or (v_phone ~ '^[2378][0-9]{7}$' and cp.phone_normalized = '02' || v_phone)
        or (v_phone ~ '^02[2378][0-9]{7}$' and cp.phone_normalized = substr(v_phone, 3))
      )
    union
    select c.id
    from public.sl_customers c
    where c.status = 'active'
      and (
        regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = v_phone
        or (v_phone ~ '^[2378][0-9]{7}$' and regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = '02' || v_phone)
        or (v_phone ~ '^02[2378][0-9]{7}$' and regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = substr(v_phone, 3))
      )
  ) matched;
  if v_customer_count <> 1 then
    return jsonb_build_object('status', 'manual_review');
  end if;

  select id into v_customer_id
  from public.sl_customers
  where id = v_customer_id and legacy_customer_id = p_legacy_customer_id and status = 'active'
  for update;
  if v_customer_id is null then
    return jsonb_build_object('status', 'customer_changed');
  end if;
  if exists (select 1 from public.sl_line_members
             where customer_id = v_customer_id and status <> 'deleted'
               and line_user_id <> p_line_user_id)
     or exists (select 1 from public.sl_line_members
                where line_user_id = p_line_user_id and customer_id <> v_customer_id
                  and status <> 'deleted') then
    return jsonb_build_object('status', 'manual_review');
  end if;

  select address into v_address
  from public.sl_addresses
  where customer_id = v_customer_id and status = 'active'
  order by is_default desc, created_at, id
  limit 1;
  if v_address is null then
    return jsonb_build_object('status', 'manual_review');
  end if;
  v_address := replace(replace(translate(v_address, '０１２３４５６７８９', '0123456789'), '-', '之'), '－', '之');
  v_real_door := substring(v_address from '([0-9]+(之[0-9]+)?)號');
  v_real_floor := coalesce(substring(v_address from '([0-9]+(之[0-9]+)?)樓'), '');
  if v_real_door is null then
    return jsonb_build_object('status', 'manual_review');
  end if;

  insert into public.sl_member_bind_attempts(customer_id)
  values (v_customer_id) on conflict (customer_id) do nothing;
  select failed_count, locked_at into v_failures, v_locked_at
  from public.sl_member_bind_attempts
  where customer_id = v_customer_id for update;
  if v_locked_at is not null then
    return jsonb_build_object('status', 'locked');
  end if;

  if v_door <> v_real_door or v_floor <> v_real_floor then
    v_failures := least(3, v_failures + 1);
    update public.sl_member_bind_attempts
    set failed_count = v_failures,
        locked_at = case when v_failures >= 3 then now() else null end,
        updated_at = now()
    where customer_id = v_customer_id;
    insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
    values ('line_user', left(p_line_user_id, 100), 'member_address_check_failed',
      'customer', v_customer_id::text, jsonb_build_object('failures', v_failures));
    return jsonb_build_object('status', case when v_failures >= 3 then 'locked' else 'wrong_address' end,
                              'remaining', 3 - v_failures);
  end if;

  update public.sl_member_bind_attempts
  set failed_count = 0, updated_at = now() where customer_id = v_customer_id;
  insert into public.sl_line_members(
    line_user_id, customer_id, line_display_name, status, last_verified_at,
    binding_started_at, binding_phone
  ) values (
    p_line_user_id, v_customer_id, left(coalesce(p_line_display_name, ''), 60),
    'active', now(), now(), v_phone
  )
  on conflict (line_user_id) do update
  set customer_id = excluded.customer_id,
      line_display_name = excluded.line_display_name,
      status = 'active', last_verified_at = now(),
      binding_phone = excluded.binding_phone,
      session_version = public.sl_line_members.session_version + 1,
      updated_at = now()
  returning * into v_member;
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('line_user', left(p_line_user_id, 100), 'member_address_self_verified',
    'line_member', p_line_user_id, jsonb_build_object('customer_id', v_customer_id));
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('sl_line_members', p_line_user_id, 'insert', to_jsonb(v_member));
  return jsonb_build_object('status', 'bound');
exception
  when unique_violation then
    return jsonb_build_object('status', 'manual_review');
end;
$$;
revoke all on function public.sl_verify_and_bind_member(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_verify_and_bind_member(text,text,text,text,text,text) to service_role;

-- A member sees only orders created by the same LINE identity after the
-- current binding began. Legacy ERP orders stay invisible, including later
-- ERP edits to orders that did not originate in LINE.
create or replace function public.sl_get_line_member_orders(
  p_line_user_id text, p_limit integer default 20
) returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
  from (
    select o.id,o.address_id,o.delivery_address,o.status,o.note,o.total_amount,o.created_at,o.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'product_code',i.product_code,'product_name',i.product_name,
        'quantity',i.quantity,'unit_price',i.unit_price,'subtotal',i.subtotal
      ) order by i.created_at) from public.sl_order_items i where i.order_id=o.id), '[]'::jsonb) sl_order_items
    from public.sl_line_members lm
    join public.sl_customers c on c.id = lm.customer_id
    join public.sl_orders o on o.customer_id = lm.customer_id
    where lm.line_user_id = p_line_user_id
      and lm.status = 'active' and c.status = 'active'
      and o.line_user_id = lm.line_user_id and o.source = 'line'
      and o.created_at >= lm.binding_started_at and o.status <> 'creating'
    order by o.created_at desc, o.id desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) x;
$$;
revoke all on function public.sl_get_line_member_orders(text,integer) from public, anon, authenticated;
grant execute on function public.sl_get_line_member_orders(text,integer) to service_role;

create or replace function public.sl_get_line_member_orders_page(
  p_line_user_id text,
  p_before_created_at timestamptz default null,
  p_before_id text default null,
  p_limit integer default 21
) returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
  from (
    select o.id,o.address_id,o.delivery_address,o.status,o.note,o.total_amount,o.created_at,o.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object(
        'product_code',i.product_code,'product_name',i.product_name,
        'quantity',i.quantity,'unit_price',i.unit_price,'subtotal',i.subtotal
      ) order by i.created_at) from public.sl_order_items i where i.order_id=o.id), '[]'::jsonb) sl_order_items
    from public.sl_line_members lm
    join public.sl_customers c on c.id = lm.customer_id
    join public.sl_orders o on o.customer_id = lm.customer_id
    where lm.line_user_id = p_line_user_id
      and lm.status = 'active' and c.status = 'active'
      and o.line_user_id = lm.line_user_id and o.source = 'line'
      and o.created_at >= lm.binding_started_at and o.status <> 'creating'
      and (p_before_created_at is null or (o.created_at,o.id) < (p_before_created_at,p_before_id))
    order by o.created_at desc, o.id desc
    limit greatest(1, least(coalesce(p_limit, 21), 101))
  ) x;
$$;
revoke all on function public.sl_get_line_member_orders_page(text,timestamptz,text,integer) from public, anon, authenticated;
grant execute on function public.sl_get_line_member_orders_page(text,timestamptz,text,integer) to service_role;

-- Earlier deployments only provide customer_id to these RPCs, so they cannot
-- distinguish LINE identities. Fail closed rather than exposing old orders.
create or replace function public.sl_get_member_orders(
  p_customer_id uuid, p_limit integer default 20
) returns jsonb language sql stable security invoker set search_path = public as $$
  select '[]'::jsonb;
$$;
create or replace function public.sl_get_member_orders_page(
  p_customer_id uuid,
  p_before_created_at timestamptz default null,
  p_before_id text default null,
  p_limit integer default 21
) returns jsonb language sql stable security invoker set search_path = public as $$
  select '[]'::jsonb;
$$;
-- Obsolete exact-address auto binding does not enforce the new attempt ledger.
create or replace function public.sl_auto_bind_exact_member(
  p_line_user_id text, p_line_display_name text, p_phone text,
  p_legacy_customer_id text, p_address text
) returns jsonb language sql security invoker set search_path = public as $$
  select jsonb_build_object('status', 'verification_required', 'reason', 'new_verification_required');
$$;
revoke all on function public.sl_get_member_orders(uuid,integer) from public, anon, authenticated;
revoke all on function public.sl_get_member_orders_page(uuid,timestamptz,text,integer) from public, anon, authenticated;
revoke all on function public.sl_auto_bind_exact_member(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_get_member_orders(uuid,integer) to service_role;
grant execute on function public.sl_get_member_orders_page(uuid,timestamptz,text,integer) to service_role;
grant execute on function public.sl_auto_bind_exact_member(text,text,text,text,text) to service_role;

-- Keep the displayed contact phone aligned with the phone used at binding.
CREATE OR REPLACE FUNCTION public.sl_get_line_bootstrap(p_line_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_as_of timestamptz := now();
  v_customer_id uuid;
  v_member_row jsonb;
  v_history jsonb := '[]'::jsonb;
  v_addresses jsonb := '[]'::jsonb;
  v_products jsonb := '[]'::jsonb;
  v_price_rules jsonb := '[]'::jsonb;
  v_pending_binding jsonb;
  v_pending_address jsonb;
begin
  if p_line_user_id is null or btrim(p_line_user_id) = '' or length(p_line_user_id) > 255 then
    raise exception 'Invalid LINE user ID';
  end if;

  select jsonb_build_object(
      'line_user_id', lm.line_user_id,
      'binding_phone', lm.binding_phone,
      'line_display_name', lm.line_display_name,
      'status', lm.status,
      'sl_customers', jsonb_build_object(
        'id', c.id,
        'legacy_customer_id', c.legacy_customer_id,
        'contact_name', c.contact_name,
        'primary_phone', c.primary_phone,
        'customer_type', c.customer_type,
        'status', c.status
      )
    ), c.id
    into v_member_row, v_customer_id
  from public.sl_line_members lm
  join public.sl_customers c on c.id = lm.customer_id
  where lm.line_user_id = p_line_user_id
    and lm.status = 'active' and c.status = 'active'
  limit 1;

  if v_customer_id is not null then
    select coalesce(jsonb_agg(to_jsonb(h) order by h.history_key), '[]'::jsonb)
      into v_history
    from (
      select history_key, last_unit_price, use_count
      from public.sl_customer_product_history
      where customer_id = v_customer_id
    ) h;

    select coalesce(jsonb_agg(to_jsonb(a) order by a.is_default desc, a.created_at, a.id), '[]'::jsonb)
      into v_addresses
    from (
      select id, label, address, is_default, created_at
      from public.sl_addresses
      where customer_id = v_customer_id and status = 'active'
    ) a;

    select to_jsonb(r) into v_pending_address
    from (
      select id, status, requested_address, request_type, created_at
      from public.sl_address_requests
      where line_user_id = p_line_user_id and status = 'pending'
      order by created_at
      limit 1
    ) r;
  else
    select to_jsonb(r) into v_pending_binding
    from (
      select id, status, created_at
      from public.sl_binding_requests
      where line_user_id = p_line_user_id and status = 'pending'
      order by created_at
      limit 1
    ) r;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order, p.code), '[]'::jsonb)
    into v_products
  from (
    select code, name, specification, is_active, sort_order
    from public.sl_products
    where is_active = true
  ) p;

  select coalesce(jsonb_agg(to_jsonb(pr) order by pr.effective_at desc, pr.created_at desc), '[]'::jsonb)
    into v_price_rules
  from (
    select id, product_code, scope, customer_id, price, effective_at, expires_at, created_at
    from public.sl_price_rules
    where effective_at <= v_as_of
      and (expires_at is null or expires_at > v_as_of)
      and (scope <> 'customer' or customer_id = v_customer_id)
  ) pr;

  return jsonb_build_object(
    'as_of', v_as_of,
    'member_row', v_member_row,
    'history', v_history,
    'addresses', v_addresses,
    'products', v_products,
    'price_rules', v_price_rules,
    'pending_binding', v_pending_binding,
    'pending_address', v_pending_address
  );
end;
$function$
;

revoke all on function public.sl_get_line_bootstrap(text) from public, anon, authenticated;
grant execute on function public.sl_get_line_bootstrap(text) to service_role;

CREATE OR REPLACE FUNCTION public.sl_get_member_profile(p_line_user_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_member jsonb; v_customer_id uuid; v_history jsonb;
begin
  select jsonb_build_object(
    'line_user_id',lm.line_user_id,'binding_phone',lm.binding_phone,'line_display_name',lm.line_display_name,'status',lm.status,'session_version',lm.session_version,
    'sl_customers',jsonb_build_object('id',c.id,'legacy_customer_id',c.legacy_customer_id,'contact_name',c.contact_name,
      'primary_phone',c.primary_phone,'customer_type',c.customer_type,'status',c.status)
  ),c.id into v_member,v_customer_id
  from public.sl_line_members lm join public.sl_customers c on c.id=lm.customer_id
  where lm.line_user_id=p_line_user_id and lm.status='active' and c.status='active';
  if v_member is null then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) into v_history from (
    select history_key,last_unit_price,use_count from public.sl_customer_product_history where customer_id=v_customer_id
  ) h;
  return jsonb_build_object('member_row',v_member,'history',v_history);
end;
$function$
;

revoke all on function public.sl_get_member_profile(text) from public, anon, authenticated;
grant execute on function public.sl_get_member_profile(text) to service_role;


-- File: 20261018103100_admin_staff_roles.sql
-- Staff are explicitly enrolled by an owner. The legacy primary recipient and
-- ADMIN_LINE_USER_IDS remain owners; an empty roster never grants a new owner.
create table if not exists public.sl_admin_staff (
  line_user_id text primary key check (line_user_id ~ '^U[0-9a-fA-F]{32}$'),
  display_name text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sl_admin_staff enable row level security;
revoke all on table public.sl_admin_staff from public, anon, authenticated;
grant select, insert, update on table public.sl_admin_staff to service_role;

create or replace function public.sl_set_admin_staff(
  p_actor text, p_line_user_id text, p_display_name text, p_status text
) returns jsonb language plpgsql security invoker set search_path = public as $$
begin
  if p_actor is null or btrim(p_actor) = ''
     or p_line_user_id !~ '^U[0-9a-fA-F]{32}$'
     or p_status not in ('active', 'inactive') then
    return jsonb_build_object('error', 'invalid_input');
  end if;
  insert into public.sl_admin_staff(line_user_id, display_name, status, created_by, updated_at)
  values (p_line_user_id, left(coalesce(p_display_name, ''), 60), p_status, p_actor, now())
  on conflict (line_user_id) do update
  set display_name = excluded.display_name, status = excluded.status, updated_at = now();
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id)
  values ('admin', p_actor, 'admin_staff_' || p_status, 'admin_staff', p_line_user_id);
  return jsonb_build_object('status', p_status);
end;
$$;
revoke all on function public.sl_set_admin_staff(text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_set_admin_staff(text,text,text,text) to service_role;


-- File: 20261019083000_member_review_notifications.sql
create or replace function public.sl_claim_notification_jobs(p_limit integer default 20)
returns table(id uuid, line_user_id text, notification_type text, reference_id text,
  payload jsonb, status text, attempts integer, scheduled_at timestamptz)
language sql
set search_path to 'public'
as $function$
  with candidates as (
    select n.id
    from public.sl_notifications n
    where n.notification_type in ('order_status', 'member_review')
      and n.scheduled_at <= now()
      and n.status in ('pending','failed','processing')
    order by n.scheduled_at, n.created_at, n.id
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update skip locked
  )
  update public.sl_notifications n
  set status = 'processing',
      attempts = n.attempts + 1,
      scheduled_at = now() + interval '60 seconds',
      last_error = ''
  from candidates c
  where n.id = c.id
  returning n.id, n.line_user_id, n.notification_type, n.reference_id,
    n.payload, n.status, n.attempts, n.scheduled_at;
$function$;
revoke all on function public.sl_claim_notification_jobs(integer) from public, anon, authenticated;
grant execute on function public.sl_claim_notification_jobs(integer) to service_role;


-- File: 20261011113000_add_line_ai_chat_logs.sql
-- ============================================================================
-- Migration: Add LINE AI Chat History & Logging System for 盛隆瓦斯
-- Records every customer inquiry, AI response, model details & order intent
-- ============================================================================

-- 1. Create LINE AI Chat Logs Table
create table if not exists public.line_ai_logs (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null default 'unknown',
  user_name text,
  user_message text not null,
  ai_reply text not null,
  account_id text,
  account_name text,
  provider text,
  model text,
  tokens integer default 0,
  latency_ms integer default 0,
  failover_count integer default 0,
  is_order_intent boolean default false,
  status text not null default 'success', -- 'success' | 'error' | 'fallback'
  error_message text,
  raw_event jsonb,
  created_at timestamptz not null default now()
);

-- 2. Indexes for High-Performance Querying
create index if not exists idx_line_ai_logs_created_at on public.line_ai_logs (created_at desc);
create index if not exists idx_line_ai_logs_user_id on public.line_ai_logs (line_user_id);
create index if not exists idx_line_ai_logs_order_intent on public.line_ai_logs (is_order_intent) where is_order_intent = true;

-- 3. Row Level Security Policies
alter table public.line_ai_logs enable row level security;

-- Service Role Full Access
drop policy if exists "Allow service_role full access to line_ai_logs" on public.line_ai_logs;
create policy "Allow service_role full access to line_ai_logs"
  on public.line_ai_logs for all
  to service_role
  using (true)
  with check (true);

-- Authenticated & Anon Read Access
drop policy if exists "Allow read access to line_ai_logs" on public.line_ai_logs;
create policy "Allow read access to line_ai_logs"
  on public.line_ai_logs for select
  to anon, authenticated
  using (true);

-- Authenticated & Anon Insert Access
drop policy if exists "Allow insert access to line_ai_logs" on public.line_ai_logs;
create policy "Allow insert access to line_ai_logs"
  on public.line_ai_logs for insert
  to anon, authenticated
  with check (true);

-- 4. RPC Helper: Record LINE Chat Safely
create or replace function public.erp_record_line_ai_log(
  p_line_user_id text,
  p_user_message text,
  p_ai_reply text,
  p_account_id text default null,
  p_account_name text default null,
  p_provider text default null,
  p_model text default null,
  p_tokens integer default 0,
  p_latency_ms integer default 0,
  p_failover_count integer default 0,
  p_is_order_intent boolean default false,
  p_status text default 'success',
  p_error_message text default null,
  p_raw_event jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_id uuid;
begin
  insert into public.line_ai_logs (
    line_user_id,
    user_message,
    ai_reply,
    account_id,
    account_name,
    provider,
    model,
    tokens,
    latency_ms,
    failover_count,
    is_order_intent,
    status,
    error_message,
    raw_event,
    created_at
  ) values (
    coalesce(p_line_user_id, 'unknown'),
    p_user_message,
    p_ai_reply,
    p_account_id,
    p_account_name,
    p_provider,
    p_model,
    coalesce(p_tokens, 0),
    coalesce(p_latency_ms, 0),
    coalesce(p_failover_count, 0),
    coalesce(p_is_order_intent, false),
    coalesce(p_status, 'success'),
    p_error_message,
    p_raw_event,
    now()
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

grant execute on function public.erp_record_line_ai_log(text, text, text, text, text, text, text, integer, integer, integer, boolean, text, text, jsonb) to anon, authenticated, service_role;


-- File: 20261106153000_create_cloud_customers_and_orders.sql
-- ==============================================================================
-- 盛隆瓦斯 雲端唯一真理架構 (Unified Cloud Master Truth Architecture)
-- 建立 cloud_customers (客戶主檔) 與 cloud_orders (歷史訂單明細)
-- 版本: 20261106153000
-- ==============================================================================

-- 1. 客戶主檔資料表 (cloud_customers)
CREATE TABLE IF NOT EXISTS public.cloud_customers (
    id BIGINT PRIMARY KEY,                            -- 對齊舊 ERP customer_id
    code VARCHAR(50),                                 -- 門市經典代號 (例: 26.21.1)
    name VARCHAR(120) NOT NULL,                       -- 客戶名稱/店名 (例: 26.21.1(羊肉爐))
    tel VARCHAR(60),                                  -- 原始電話 (例: 0922-734-808)
    phone_clean VARCHAR(30),                          -- 純數字電話 (例: 0922734808)
    address VARCHAR(300) NOT NULL,                    -- 完整配送地址 (例: 新北市三重區文化北路26巷21號1樓)
    clean_address VARCHAR(300),                       -- 標準化門牌
    point_address VARCHAR(300),                       -- 建物大門地址 (過濾樓層)
    city VARCHAR(50) DEFAULT '新北市',
    district VARCHAR(50) DEFAULT '三重區',
    customer_type VARCHAR(60) DEFAULT '一般客戶',     -- 一般客戶 / 生意餐飲 / 大戶
    preferred_spec VARCHAR(120) DEFAULT '20kg x 1',   -- 慣用規格 (例: 10kg x 1)
    balance NUMERIC(12, 2) DEFAULT 0.00,              -- 帳面欠款 (owe_money)
    last_order_date VARCHAR(20),                      -- 最後叫氣日 (YYYY/MM/DD)
    days_diff INTEGER DEFAULT -1,                     -- 距離今日未叫氣天數
    category_key VARCHAR(50) DEFAULT 'RECENT',        -- 地圖顏色分類鍵 (RECENT / 6_TO_12_MONTHS / etc)
    category_label VARCHAR(60) DEFAULT '近一個月',
    color VARCHAR(20) DEFAULT 'blue',                 -- 地圖圖標顏色
    hex VARCHAR(20) DEFAULT '#2563eb',
    lat DOUBLE PRECISION,                             -- 緯度 (WGS84)
    lng DOUBLE PRECISION,                             -- 經度 (WGS84)
    is_custom_gps BOOLEAN DEFAULT FALSE,
    notes TEXT,                                       -- 客戶備註與特定需求
    p50 NUMERIC(10, 2) DEFAULT 0.00,
    p20 NUMERIC(10, 2) DEFAULT 0.00,
    p16 NUMERIC(10, 2) DEFAULT 0.00,
    p10 NUMERIC(10, 2) DEFAULT 0.00,
    p4 NUMERIC(10, 2) DEFAULT 0.00,
    active BOOLEAN DEFAULT TRUE,                      -- 是否有效中
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- B-Tree 索引建置 (保證查詢延遲 < 20 毫秒)
CREATE INDEX IF NOT EXISTS idx_cloud_customers_code ON public.cloud_customers (code);
CREATE INDEX IF NOT EXISTS idx_cloud_customers_name ON public.cloud_customers (name);
CREATE INDEX IF NOT EXISTS idx_cloud_customers_phone_clean ON public.cloud_customers (phone_clean);
CREATE INDEX IF NOT EXISTS idx_cloud_customers_address ON public.cloud_customers (address);
CREATE INDEX IF NOT EXISTS idx_cloud_customers_clean_addr ON public.cloud_customers (clean_address);
CREATE INDEX IF NOT EXISTS idx_cloud_customers_district ON public.cloud_customers (district);
CREATE INDEX IF NOT EXISTS idx_cloud_customers_active ON public.cloud_customers (active);

-- 2. 歷史與即時訂單明細表 (cloud_orders)
CREATE TABLE IF NOT EXISTS public.cloud_orders (
    order_id BIGINT PRIMARY KEY,                      -- 對齊舊 ERP oder_id
    customer_id BIGINT,                               -- 對齊 customer_id
    customer_name VARCHAR(120),
    customer_tel VARCHAR(60),
    customer_address VARCHAR(300),
    order_date VARCHAR(20) NOT NULL,                  -- YYYY/MM/DD
    order_time VARCHAR(20),                           -- HH:mm:ss
    driver VARCHAR(60),                               -- 配送司機 (例: 阿義 / 小龍 / 阿強)
    b50 INTEGER DEFAULT 0,
    b20 INTEGER DEFAULT 0,
    b18 INTEGER DEFAULT 0,
    b16 INTEGER DEFAULT 0,
    b10 INTEGER DEFAULT 0,
    b4 INTEGER DEFAULT 0,
    b_new4 INTEGER DEFAULT 0,
    total_bottles INTEGER DEFAULT 0,
    refond_kg NUMERIC(10, 2) DEFAULT 0.00,            -- 殘氣重量 (kg)
    price NUMERIC(12, 2) DEFAULT 0.00,                -- 實收金額
    payed VARCHAR(30) DEFAULT '已付款',               -- 已付款 / 未付款 / 欠款 / 月結
    remark TEXT,                                      -- 單據備註
    disable VARCHAR(5) DEFAULT 'N',                   -- N: 有效, Y: 已作廢
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- B-Tree 索引建置
CREATE INDEX IF NOT EXISTS idx_cloud_orders_cust_id ON public.cloud_orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_cloud_orders_date ON public.cloud_orders (order_date DESC, order_id DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_orders_driver ON public.cloud_orders (driver);
CREATE INDEX IF NOT EXISTS idx_cloud_orders_payed ON public.cloud_orders (payed);
CREATE INDEX IF NOT EXISTS idx_cloud_orders_disable ON public.cloud_orders (disable);

-- 啟用 RLS 與安全存取規則
ALTER TABLE public.cloud_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_orders ENABLE ROW LEVEL SECURITY;

-- 唯讀政策 (供前端與外勤授權查詢)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cloud_customers' AND policyname = 'allow_read_cloud_customers'
    ) THEN
        CREATE POLICY allow_read_cloud_customers ON public.cloud_customers FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cloud_orders' AND policyname = 'allow_read_cloud_orders'
    ) THEN
        CREATE POLICY allow_read_cloud_orders ON public.cloud_orders FOR SELECT USING (true);
    END IF;

    -- 服務角色完全控制權限 (Service Role / Sync Daemon)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cloud_customers' AND policyname = 'allow_service_write_customers'
    ) THEN
        CREATE POLICY allow_service_write_customers ON public.cloud_customers FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'cloud_orders' AND policyname = 'allow_service_write_orders'
    ) THEN
        CREATE POLICY allow_service_write_orders ON public.cloud_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;



-- ==============================================================================
-- 盛隆瓦斯 LINE 會員與調度中心全系統補齊串接 SQL (23 個進階 RPC 與雙向佇列)
-- ==============================================================================


-- ── Migration: 20261005192500_admin_alert_test_cooldown.sql ──
-- A successful test alert must not suppress the first real incident alert.
create or replace function public.sl_evaluate_admin_alert(
  p_integrations jsonb,
  p_notification_pending integer,
  p_backup_failed integer,
  p_legacy_failed integer,
  p_legacy_conflict integer,
  p_required_failures integer default 2,
  p_cooldown_minutes integer default 360,
  p_notification_threshold integer default 5,
  p_force boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.sl_admin_alert_state%rowtype;
  v_issues text[] := array[]::text[];
  v_fingerprint text := '';
  v_unhealthy boolean := false;
  v_send boolean := false;
  v_alert_type text := '';
  v_token uuid;
  v_failures integer := 0;
  v_service text;
  v_health jsonb;
begin
  insert into public.sl_admin_alert_state(state_key) values ('system') on conflict (state_key) do nothing;
  select * into v_state from public.sl_admin_alert_state where state_key='system' for update;

  foreach v_service in array array['supabase','line','googleSheets'] loop
    v_health := coalesce(p_integrations->v_service,'{}'::jsonb);
    if coalesce((v_health->>'healthy')::boolean,false)=false then
      v_issues := array_append(v_issues,
        case v_service when 'googleSheets' then 'Google Sheets 連線異常' when 'line' then 'LINE 連線異常' else 'Supabase 連線異常' end);
    end if;
  end loop;
  if greatest(coalesce(p_notification_pending,0),0) >= greatest(coalesce(p_notification_threshold,5),1) then
    v_issues := array_append(v_issues,'LINE 通知待處理 '||greatest(coalesce(p_notification_pending,0),0)::text||' 筆');
  end if;
  if greatest(coalesce(p_backup_failed,0),0)>0 then
    v_issues := array_append(v_issues,'Google Sheets 備份失敗 '||greatest(coalesce(p_backup_failed,0),0)::text||' 筆');
  end if;
  if greatest(coalesce(p_legacy_failed,0),0)>0 then
    v_issues := array_append(v_issues,'舊系統同步失敗 '||greatest(coalesce(p_legacy_failed,0),0)::text||' 筆');
  end if;
  if greatest(coalesce(p_legacy_conflict,0),0)>0 then
    v_issues := array_append(v_issues,'舊系統同步衝突 '||greatest(coalesce(p_legacy_conflict,0),0)::text||' 筆');
  end if;

  v_unhealthy := cardinality(v_issues)>0;
  v_fingerprint := case when v_unhealthy then md5(array_to_string(v_issues,E'\n')) else '' end;
  if v_unhealthy then
    v_failures := case when v_state.last_condition='unhealthy' and v_state.last_fingerprint=v_fingerprint
      then v_state.consecutive_failures+1 else 1 end;
  end if;

  if p_force then
    v_send := true;
    v_alert_type := 'test';
  elsif v_unhealthy and v_failures>=greatest(coalesce(p_required_failures,2),1)
    and (v_state.lease_until is null or v_state.lease_until<=now())
    and (v_state.last_alert_type<>'incident' or v_state.last_fingerprint<>v_fingerprint or v_state.last_alert_at is null
      or v_state.last_alert_at<=now()-make_interval(mins=>greatest(coalesce(p_cooldown_minutes,360),10))) then
    v_send := true;
    v_alert_type := 'incident';
  elsif not v_unhealthy and v_state.last_condition='unhealthy' and v_state.last_alert_type='incident'
    and (v_state.lease_until is null or v_state.lease_until<=now()) then
    v_send := true;
    v_alert_type := 'recovery';
  end if;

  if v_send then v_token := gen_random_uuid(); end if;
  update public.sl_admin_alert_state set
    last_condition=case when v_unhealthy then 'unhealthy' else 'healthy' end,
    consecutive_failures=v_failures,
    last_fingerprint=v_fingerprint,
    lease_token=case when v_send then v_token else lease_token end,
    lease_until=case when v_send then now()+interval '2 minutes' else lease_until end,
    updated_at=now()
  where state_key='system';

  return jsonb_build_object(
    'send',v_send,'alertType',v_alert_type,'eventId',coalesce(v_token::text,''),
    'issues',to_jsonb(v_issues),'consecutiveFailures',v_failures,
    'condition',case when v_unhealthy then 'unhealthy' else 'healthy' end
  );
end;
$$;

revoke all on function public.sl_evaluate_admin_alert(jsonb,integer,integer,integer,integer,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.sl_evaluate_admin_alert(jsonb,integer,integer,integer,integer,integer,integer,integer,boolean) to service_role;



-- ── Migration: 20261006192700_legacy_order_price_address.sql ──
create or replace function public.sl_finish_legacy_order_job_priced(
  p_job_id bigint,p_attempts integer,p_succeeded boolean,p_legacy_order_id bigint,
  p_error text,p_legacy_total numeric,p_legacy_address text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_job public.sl_legacy_sync_jobs%rowtype; v_order public.sl_orders%rowtype;
begin
  select * into v_job from public.sl_legacy_sync_jobs where id=p_job_id for update;
  if v_job.id is null then return jsonb_build_object('error','job_not_found'); end if;
  if v_job.status<>'processing' or v_job.attempts<>p_attempts then return jsonb_build_object('error','stale_attempt'); end if;
  if p_succeeded then
    if p_legacy_order_id is null then return jsonb_build_object('error','legacy_order_id_required'); end if;
    if v_job.event_type='order_create' then
      if p_legacy_total is null or p_legacy_total<=0 or nullif(btrim(p_legacy_address),'') is null then
        return jsonb_build_object('error','legacy_price_or_address_required');
      end if;
      select * into v_order from public.sl_orders where id=v_job.order_id for update;
      if v_order.id is null or v_order.source<>'line' then return jsonb_build_object('error','line_order_required'); end if;
      if v_order.total_amount is not null and v_order.total_amount<>p_legacy_total then
        return jsonb_build_object('error','displayed_price_mismatch');
      end if;
      update public.sl_orders set gas_amount=p_legacy_total,total_amount=p_legacy_total,
        delivery_address=left(p_legacy_address,300),updated_at=now() where id=v_job.order_id;
      insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
      values ('order',v_job.order_id,'update',jsonb_build_object('legacyOrderId',p_legacy_order_id,
        'total',p_legacy_total,'address',left(p_legacy_address,300)));
    end if;
    insert into public.sl_legacy_order_links(order_id,legacy_order_id,origin,source_fingerprint,last_synced_at)
    values (v_job.order_id,p_legacy_order_id,'line','',now())
    on conflict (order_id) do update set legacy_order_id=excluded.legacy_order_id,last_synced_at=now();
    update public.sl_legacy_sync_jobs set status='synced',synced_at=now(),next_attempt_at=now(),last_error='' where id=v_job.id;
    return jsonb_build_object('status','synced','orderId',v_job.order_id,'legacyOrderId',p_legacy_order_id);
  end if;
  update public.sl_legacy_sync_jobs set status=case when attempts>=10 then 'conflict' else 'failed' end,
    next_attempt_at=now()+make_interval(secs=>least(21600,greatest(60,(power(2,least(attempts,8))::integer)*60))),
    last_error=left(coalesce(p_error,'legacy write failed'),300) where id=v_job.id;
  return jsonb_build_object('status',case when v_job.attempts>=10 then 'conflict' else 'failed' end);
end;
$$;
revoke all on function public.sl_finish_legacy_order_job_priced(bigint,integer,boolean,bigint,text,numeric,text) from public,anon,authenticated;
grant execute on function public.sl_finish_legacy_order_job_priced(bigint,integer,boolean,bigint,text,numeric,text) to service_role;


-- ── Migration: 20261007103000_admin_recipients.sql ──
-- The first administrator can securely claim the single primary recipient slot
-- with the existing admin access code and a verified LINE Login identity.
create table if not exists public.sl_admin_recipients (
  recipient_key text primary key check (recipient_key = 'primary'),
  line_user_id text not null unique,
  display_name text not null default '',
  status text not null default 'active' check (status in ('active','inactive')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sl_admin_recipients enable row level security;
revoke all on table public.sl_admin_recipients from public, anon, authenticated;
grant select, insert, update on table public.sl_admin_recipients to service_role;


-- ── Migration: 20261007113000_sync_member_canonical_address.sql ──
create or replace function public.sl_sync_member_canonical_address(
  p_line_user_id text,
  p_address text,
  p_actor text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_address_id uuid;
  v_created boolean := false;
begin
  select customer_id into v_customer_id
  from public.sl_line_members
  where line_user_id = p_line_user_id and status = 'active'
  for update;
  if v_customer_id is null then return jsonb_build_object('error','member_required'); end if;
  if nullif(trim(coalesce(p_address,'')),'') is null then return jsonb_build_object('error','address_required'); end if;

  select id into v_address_id
  from public.sl_addresses
  where customer_id = v_customer_id and status = 'active'
    and regexp_replace(address,'[[:space:]]','','g') = regexp_replace(p_address,'[[:space:]]','','g')
  order by created_at, id limit 1 for update;

  if v_address_id is null then
    insert into public.sl_addresses(customer_id,label,address,is_default,status)
    values (v_customer_id,'舊系統地址',p_address,true,'active')
    returning id into v_address_id;
    v_created := true;
  end if;

  update public.sl_addresses set is_default = (id = v_address_id)
  where customer_id = v_customer_id and status = 'active';

  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,after_data)
  values ('admin',p_actor,'canonical_address_synced','address',v_address_id::text,
    jsonb_build_object('customer_id',v_customer_id,'created',v_created));
  insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
  select 'sl_addresses',a.id::text,case when v_created then 'insert' else 'update' end,to_jsonb(a)
  from public.sl_addresses a where a.id=v_address_id;

  return jsonb_build_object('addressId',v_address_id,'created',v_created);
end;
$$;

revoke all on function public.sl_sync_member_canonical_address(text,text,text) from public,anon,authenticated;
grant execute on function public.sl_sync_member_canonical_address(text,text,text) to service_role;


-- ── Migration: 20261007130000_member_address_lookup.sql ──
-- Exact address lookup for authenticated LINE member matching.
create or replace function public.sl_lookup_customers_by_address(p_address text)
returns table(customer_id uuid, legacy_customer_id text, display_name text, contact_name text, primary_phone text, customer_type text, address text, history jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.legacy_customer_id, c.display_name, c.contact_name, c.primary_phone, c.customer_type,
    matched.address,
    coalesce((select jsonb_object_agg(h.history_key, jsonb_build_object('price',h.last_unit_price,'useCount',h.use_count))
      from public.sl_customer_product_history h where h.customer_id=c.id), '{}'::jsonb)
  from public.sl_addresses matched
  join public.sl_customers c on c.id=matched.customer_id
  where matched.status='active' and c.status='active'
    and length(public.sl_normalize_address(p_address)) >= 8
    and public.sl_normalize_address(matched.address)=public.sl_normalize_address(p_address)
  order by matched.is_default desc, c.legacy_customer_id
  limit 5;
$$;
revoke all on function public.sl_lookup_customers_by_address(text) from public, anon, authenticated;
grant execute on function public.sl_lookup_customers_by_address(text) to service_role;


-- ── Migration: 20261007143000_auto_bind_exact_member.sql ──
-- Bind an existing customer automatically only when phone and full address are
-- still an exact, unique match at commit time. All ambiguous cases stay in the
-- administrator-review flow.

create or replace function public.sl_auto_bind_exact_member(
  p_line_user_id text,
  p_line_display_name text,
  p_phone text,
  p_legacy_customer_id text,
  p_address text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_address text := public.sl_normalize_address(coalesce(p_address, ''));
  v_customer_id uuid;
  v_legacy_customer_id text;
  v_match_count integer;
  v_member public.sl_line_members%rowtype;
  v_member_existed boolean;
begin
  if nullif(trim(coalesce(p_line_user_id, '')), '') is null
     or length(v_phone) < 8 or length(v_address) < 8 then
    return jsonb_build_object('status', 'verification_required');
  end if;

  select count(distinct c.id), min(c.id::text)::uuid, min(c.legacy_customer_id)
    into v_match_count, v_customer_id, v_legacy_customer_id
  from public.sl_customer_phones cp
  join public.sl_customers c on c.id = cp.customer_id
  where cp.phone_normalized = v_phone and c.status = 'active';

  if v_match_count <> 1 then
    return jsonb_build_object('status', 'verification_required', 'reason', 'phone_not_unique');
  end if;
  if coalesce(p_legacy_customer_id, '') <> coalesce(v_legacy_customer_id, '') then
    return jsonb_build_object('status', 'verification_required', 'reason', 'customer_changed');
  end if;

  perform 1 from public.sl_customers where id = v_customer_id and status = 'active' for update;
  if not found then
    return jsonb_build_object('status', 'verification_required', 'reason', 'customer_changed');
  end if;
  if not exists (
    select 1 from public.sl_addresses a
    where a.customer_id = v_customer_id and a.status = 'active'
      and public.sl_normalize_address(a.address) = v_address
  ) then
    return jsonb_build_object('status', 'verification_required', 'reason', 'address_mismatch');
  end if;
  if exists (
    select 1 from public.sl_line_members lm
    where lm.customer_id = v_customer_id and lm.status = 'active'
      and lm.line_user_id <> p_line_user_id
  ) then
    return jsonb_build_object('status', 'verification_required', 'reason', 'customer_already_bound');
  end if;
  if exists (
    select 1 from public.sl_line_members lm
    where lm.line_user_id = p_line_user_id and lm.customer_id <> v_customer_id
      and lm.status <> 'deleted'
  ) then
    return jsonb_build_object('status', 'verification_required', 'reason', 'line_conflict');
  end if;

  select exists(
    select 1 from public.sl_line_members where line_user_id = p_line_user_id
  ) into v_member_existed;

  insert into public.sl_line_members(
    line_user_id, customer_id, line_display_name, status, last_verified_at
  ) values (
    p_line_user_id, v_customer_id, left(coalesce(p_line_display_name, ''), 60), 'active', now()
  )
  on conflict (line_user_id) do update
  set customer_id = excluded.customer_id,
      line_display_name = excluded.line_display_name,
      status = 'active',
      last_verified_at = now(),
      session_version = public.sl_line_members.session_version + 1,
      updated_at = now()
  returning * into v_member;

  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('line_user', left(p_line_user_id, 100), 'auto_bind_exact_match', 'line_member', p_line_user_id,
    jsonb_build_object('customer_id', v_customer_id, 'legacy_customer_id', v_legacy_customer_id));
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('sl_line_members', p_line_user_id, case when v_member_existed then 'update' else 'insert' end, to_jsonb(v_member));

  return jsonb_build_object('status', 'bound', 'customerId', v_legacy_customer_id);
exception
  when unique_violation then
    return jsonb_build_object('status', 'verification_required', 'reason', 'binding_conflict');
end;
$$;

revoke all on function public.sl_auto_bind_exact_member(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_auto_bind_exact_member(text,text,text,text,text) to service_role;


-- ── Migration: 20261016180000_unverified_order_inquiries.sql ──
-- A request to call the shop is not a confirmed order or a member binding.
create table if not exists public.sl_unverified_order_inquiries (
  request_id uuid primary key,
  line_user_id text not null,
  binding_request_id uuid not null references public.sl_binding_requests(id),
  details text not null check (char_length(details) between 3 and 300),
  status text not null default 'pending' check (status in ('pending', 'handled', 'rejected')),
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  handled_by text,
  handled_at timestamptz,
  review_note text,
  constraint sl_unverified_inquiry_identity check (char_length(line_user_id) between 2 and 100)
);

create index if not exists sl_unverified_order_inquiries_status_created
  on public.sl_unverified_order_inquiries(status, created_at desc);
create index if not exists sl_unverified_order_inquiries_line_created
  on public.sl_unverified_order_inquiries(line_user_id, created_at desc);

alter table public.sl_unverified_order_inquiries enable row level security;
revoke all on public.sl_unverified_order_inquiries from public, anon, authenticated;
grant select, insert, update on public.sl_unverified_order_inquiries to service_role;


-- ── Migration: 20261018093000_lookup_customers_by_phone_with_remarks.sql ──
-- Comprehensive phone lookup matching primary_phone, sl_customer_phones (remarks, member, manual)
-- with dual-direction 02 landline support for Taipei/New Taipei.
create or replace function public.sl_lookup_customers_by_phone(p_phone text)
returns table(customer_id uuid, legacy_customer_id text, display_name text, contact_name text, primary_phone text, customer_type text, address text, history jsonb)
language sql
stable
security invoker
set search_path = public
as $$
  with phone_query as (
    select regexp_replace(p_phone, '[^0-9]', '', 'g') as raw_digits
  ),
  query_candidates as (
    select raw_digits as digits from phone_query where length(raw_digits) >= 8
    union
    select '02' || raw_digits from phone_query where length(raw_digits) = 8 and raw_digits ~ '^[2378]'
    union
    select substr(raw_digits, 3) from phone_query where length(raw_digits) = 10 and raw_digits ~ '^02[2378]'
  ),
  matched_customers as (
    -- 1. Match primary_phone in sl_customers
    select c.id as customer_id, 1 as priority
    from public.sl_customers c
    cross join query_candidates q
    where c.status = 'active'
      and regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = q.digits

    union

    -- 2. Match in sl_customer_phones (remarks, manual, member, primary)
    select cp.customer_id, 2 as priority
    from public.sl_customer_phones cp
    join public.sl_customers c on c.id = cp.customer_id
    cross join query_candidates q
    where c.status = 'active'
      and coalesce(cp.phone_normalized, regexp_replace(cp.phone, '[^0-9]', '', 'g')) = q.digits
  ),
  deduped_matches as (
    select customer_id, min(priority) as best_priority
    from matched_customers
    group by customer_id
  )
  select
    c.id as customer_id,
    c.legacy_customer_id,
    c.display_name,
    c.contact_name,
    c.primary_phone,
    c.customer_type,
    coalesce(
      (select a.address from public.sl_addresses a where a.customer_id = c.id and a.status = 'active' order by a.is_default desc, a.created_at asc limit 1),
      ''
    ) as address,
    coalesce(
      (select jsonb_object_agg(h.history_key, jsonb_build_object('price', h.last_unit_price, 'useCount', h.use_count))
       from public.sl_customer_product_history h where h.customer_id = c.id),
      '{}'::jsonb
    ) as history
  from deduped_matches dm
  join public.sl_customers c on c.id = dm.customer_id
  order by dm.best_priority asc, c.legacy_customer_id asc
  limit 10;
$$;

revoke all on function public.sl_lookup_customers_by_phone(text) from public, anon, authenticated;
grant execute on function public.sl_lookup_customers_by_phone(text) to service_role;


-- ── Migration: 20261018094000_hardened_active_member_gate.sql ──
-- Hardened database-level active member gate.
-- Prevents suspended, deleted, or inactive members and customers from receiving
-- private addresses, price history, customer-specific prices, or orders across
-- bootstrap, address, and order query RPCs.

create or replace function public.sl_get_line_bootstrap(p_line_user_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_as_of timestamptz := now();
  v_customer_id uuid;
  v_member_row jsonb;
  v_history jsonb := '[]'::jsonb;
  v_addresses jsonb := '[]'::jsonb;
  v_products jsonb := '[]'::jsonb;
  v_price_rules jsonb := '[]'::jsonb;
  v_pending_binding jsonb;
  v_pending_address jsonb;
begin
  if p_line_user_id is null or btrim(p_line_user_id) = '' or length(p_line_user_id) > 255 then
    raise exception 'Invalid LINE user ID';
  end if;

  select jsonb_build_object(
      'line_user_id', lm.line_user_id,
      'line_display_name', lm.line_display_name,
      'status', lm.status,
      'sl_customers', jsonb_build_object(
        'id', c.id,
        'legacy_customer_id', c.legacy_customer_id,
        'contact_name', c.contact_name,
        'primary_phone', c.primary_phone,
        'customer_type', c.customer_type,
        'status', c.status
      )
    ), c.id
    into v_member_row, v_customer_id
  from public.sl_line_members lm
  join public.sl_customers c on c.id = lm.customer_id
  where lm.line_user_id = p_line_user_id
    and lm.status = 'active'
    and c.status = 'active'
  limit 1;

  if v_customer_id is not null then
    select coalesce(jsonb_agg(to_jsonb(h) order by h.history_key), '[]'::jsonb)
      into v_history
    from (
      select history_key, last_unit_price, use_count
      from public.sl_customer_product_history
      where customer_id = v_customer_id
    ) h;

    select coalesce(jsonb_agg(to_jsonb(a) order by a.is_default desc, a.created_at, a.id), '[]'::jsonb)
      into v_addresses
    from (
      select id, label, address, is_default, created_at
      from public.sl_addresses
      where customer_id = v_customer_id and status = 'active'
    ) a;

    select to_jsonb(r) into v_pending_address
    from (
      select id, status, requested_address, request_type, created_at
      from public.sl_address_requests
      where line_user_id = p_line_user_id and status = 'pending'
      order by created_at
      limit 1
    ) r;
  else
    -- Only check pending binding if the LINE user is not an existing suspended or disabled member
    if not exists (select 1 from public.sl_line_members where line_user_id = p_line_user_id and status in ('suspended', 'deleted')) then
      select to_jsonb(r) into v_pending_binding
      from (
        select id, status, created_at
        from public.sl_binding_requests
        where line_user_id = p_line_user_id and status = 'pending'
        order by created_at
        limit 1
      ) r;
    end if;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order, p.code), '[]'::jsonb)
    into v_products
  from (
    select code, name, specification, is_active, sort_order
    from public.sl_products
    where is_active = true
  ) p;

  select coalesce(jsonb_agg(to_jsonb(pr) order by pr.effective_at desc, pr.created_at desc), '[]'::jsonb)
    into v_price_rules
  from (
    select id, product_code, scope, customer_id, price, effective_at, expires_at, created_at
    from public.sl_price_rules
    where effective_at <= v_as_of
      and (expires_at is null or expires_at > v_as_of)
      and (scope <> 'customer' or (v_customer_id is not null and customer_id = v_customer_id))
  ) pr;

  return jsonb_build_object(
    'as_of', v_as_of,
    'member_row', v_member_row,
    'history', v_history,
    'addresses', v_addresses,
    'products', v_products,
    'price_rules', v_price_rules,
    'pending_binding', v_pending_binding,
    'pending_address', v_pending_address
  );
end;
$$;

revoke all on function public.sl_get_line_bootstrap(text) from public, anon, authenticated;
grant execute on function public.sl_get_line_bootstrap(text) to service_role;

create or replace function public.sl_get_member_orders(p_customer_id uuid, p_limit integer default 20)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
    select o.id, o.address_id, o.delivery_address, o.status, o.note, o.total_amount, o.created_at, o.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object('product_code', i.product_code, 'product_name', i.product_name, 'quantity', i.quantity, 'unit_price', i.unit_price, 'subtotal', i.subtotal) order by i.created_at)
        from public.sl_order_items i where i.order_id = o.id), '[]'::jsonb) sl_order_items
    from public.sl_orders o
    join public.sl_customers c on c.id = o.customer_id
    where o.customer_id = p_customer_id and o.status <> 'creating' and c.status = 'active'
    order by o.created_at desc limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) x;
$$;

revoke all on function public.sl_get_member_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.sl_get_member_orders(uuid, integer) to service_role;

create or replace function public.sl_get_member_orders_page(
  p_customer_id uuid, p_before_created_at timestamptz default null,
  p_before_id text default null, p_limit integer default 21
) returns jsonb language sql stable set search_path to '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
  from (
    select o.id, o.address_id, o.delivery_address, o.status, o.note, o.total_amount, o.created_at, o.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object('product_code', i.product_code,
        'product_name', i.product_name, 'quantity', i.quantity, 'unit_price', i.unit_price,
        'subtotal', i.subtotal) order by i.created_at)
        from public.sl_order_items i where i.order_id = o.id), '[]'::jsonb) sl_order_items
    from public.sl_orders o
    join public.sl_customers c on c.id = o.customer_id
    where o.customer_id = p_customer_id and o.status <> 'creating' and c.status = 'active'
      and (p_before_created_at is null or (o.created_at, o.id) < (p_before_created_at, p_before_id))
    order by o.created_at desc, o.id desc
    limit greatest(1, least(coalesce(p_limit, 21), 101))
  ) x;
$$;

revoke all on function public.sl_get_member_orders_page(uuid, timestamptz, text, integer) from public, anon, authenticated;
grant execute on function public.sl_get_member_orders_page(uuid, timestamptz, text, integer) to service_role;

create or replace function public.sl_get_member_addresses(p_customer_id uuid)
returns jsonb language sql security invoker set search_path = '' stable
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.is_default desc, x.created_at), '[]'::jsonb) from (
    select a.id, a.label, a.address, a.is_default, a.status, a.created_at
    from public.sl_addresses a
    join public.sl_customers c on c.id = a.customer_id
    where a.customer_id = p_customer_id and a.status = 'active' and c.status = 'active'
    order by a.is_default desc, a.created_at
  ) x;
$$;

revoke all on function public.sl_get_member_addresses(uuid) from public, anon, authenticated;
grant execute on function public.sl_get_member_addresses(uuid) to service_role;


-- ── Migration: 20261013044355_rich_menu_order_history.sql ──
alter table public.sl_line_menu_config
  add column if not exists version integer not null default 1;


-- ── Migration: 20261013081912_reconcile_line_legacy_orders.sql ──
-- A business-host edit to a linked LINE order must update the original order.
-- The old import created a second LEGACY-* row while moving the link fingerprint.
create or replace function public.sl_import_legacy_order(p_order jsonb, p_items jsonb, p_fingerprint text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_legacy_id bigint := (p_order->>'legacyOrderId')::bigint;
  v_customer public.sl_customers%rowtype;
  v_line_user_id text;
  v_order_id text := 'LEGACY-'||v_legacy_id::text;
  v_existing public.sl_legacy_order_links%rowtype;
  v_original public.sl_orders%rowtype;
  v_status text;
  v_created_at timestamptz;
  v_linked_line boolean := false;
  v_total numeric;
begin
  if v_legacy_id is null or nullif(p_order->>'legacyCustomerId','') is null then
    return jsonb_build_object('error','invalid_order');
  end if;
  select * into v_customer from public.sl_customers
    where legacy_customer_id=p_order->>'legacyCustomerId' and status='active';
  if v_customer.id is null then
    return jsonb_build_object('error','unlinked_customer','legacyCustomerId',p_order->>'legacyCustomerId');
  end if;
  select * into v_existing from public.sl_legacy_order_links
    where legacy_order_id=v_legacy_id for update;
  if v_existing.id is not null and v_existing.source_fingerprint=coalesce(p_fingerprint,'') then
    return jsonb_build_object('status','unchanged','orderId',v_existing.order_id);
  end if;
  select line_user_id into v_line_user_id from public.sl_line_members
    where customer_id=v_customer.id and status='active'
    order by last_verified_at desc nulls last limit 1;
  v_status := case p_order->>'status'
    when 'completed' then 'completed' when 'cancelled' then 'cancelled'
    when 'delivering' then 'delivering' when 'assigned' then 'assigned'
    when 'accepted' then 'accepted' else 'pending' end;
  v_created_at := coalesce(nullif(p_order->>'createdAt','')::timestamptz,now());

  if v_existing.id is not null and v_existing.origin='line' then
    select * into v_original from public.sl_orders where id=v_existing.order_id for update;
    if v_original.id is null or v_original.customer_id<>v_customer.id or v_original.source<>'line' then
      return jsonb_build_object('error','linked_line_order_mismatch');
    end if;
    if (v_original.status='cancelled') <> (v_status='cancelled') then
      return jsonb_build_object('error','linked_line_cancellation_conflict');
    end if;
    v_total := nullif(p_order->>'total','')::numeric;
    if v_total is null or v_total<=0 or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
      return jsonb_build_object('error','linked_line_amount_or_items_missing');
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_items) i
      left join public.sl_products p on p.code=i->>'code'
      where p.code is null or coalesce((i->>'quantity')::integer,0)<=0
    ) then
      return jsonb_build_object('error','linked_line_unrecognized_product');
    end if;
    v_order_id := v_existing.order_id;
    v_linked_line := true;
  elsif v_existing.id is not null and v_existing.order_id<>v_order_id then
    return jsonb_build_object('error','legacy_link_conflict');
  end if;

  if v_linked_line then
    -- The customer/address, workflow status and LINE request id remain unchanged.
    update public.sl_orders set total_amount=v_total,gas_amount=null,
      updated_at=now() where id=v_order_id;
  else
    insert into public.sl_orders(id,request_id,customer_id,line_user_id,address_id,delivery_address,status,source,note,
      gas_amount,non_gas_amount,reward_discount,total_amount,notification_status,created_at,updated_at)
    values (v_order_id,'legacy:'||v_legacy_id::text,v_customer.id,v_line_user_id,null,
      left(coalesce(p_order->>'address','舊系統訂單'),300),v_status,'legacy',left(coalesce(p_order->>'note',''),300),
      null,0,0,nullif(p_order->>'total','')::numeric,'skipped',v_created_at,now())
    on conflict (id) do update set delivery_address=excluded.delivery_address,status=excluded.status,note=excluded.note,
      total_amount=excluded.total_amount,line_user_id=excluded.line_user_id,updated_at=now();
  end if;

  delete from public.sl_order_items where order_id=v_order_id;
  insert into public.sl_order_items(order_id,product_code,product_name,quantity,unit_price,subtotal)
  select v_order_id,i->>'code',case when v_linked_line then p.name else coalesce(nullif(i->>'name',''),p.name) end,
    (i->>'quantity')::integer,
    nullif(i->>'price','')::numeric,nullif(i->>'subtotal','')::numeric
  from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) i
  join public.sl_products p on p.code=i->>'code'
  where coalesce((i->>'quantity')::integer,0)>0;
  if v_linked_line and not exists (select 1 from public.sl_order_items where order_id=v_order_id) then
    raise exception 'linked LINE order has no recognized product items';
  end if;

  insert into public.sl_legacy_order_links(order_id,legacy_order_id,origin,source_fingerprint,last_synced_at)
  values (v_order_id,v_legacy_id,case when v_linked_line then 'line' else 'legacy' end,coalesce(p_fingerprint,''),now())
  on conflict (legacy_order_id) do update set source_fingerprint=excluded.source_fingerprint,last_synced_at=now();
  insert into public.sl_backup_outbox(entity_type,entity_id,operation,payload)
  values ('order',v_order_id,case when v_existing.id is null then 'insert' else 'update' end,
    p_order||jsonb_build_object('items',p_items));
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id,after_data)
  values ('legacy_sync','business_host',case when v_linked_line then 'reconcile_line_order'
    when v_existing.id is null then 'import_legacy_order' else 'update_legacy_order' end,
    'order',v_order_id,p_order);
  return jsonb_build_object('status',case when v_linked_line then 'reconciled'
    when v_existing.id is null then 'inserted' else 'updated' end,'orderId',v_order_id);
end;
$function$;

revoke all on function public.sl_import_legacy_order(jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.sl_import_legacy_order(jsonb,jsonb,text) to service_role;


-- ── Migration: 20261013082552_review_line_order_changes_after_sync.sql ──
-- Record the old-system version when a LINE member asks for a change.
-- Approval then requires a newer business-host sync of that same linked order.
alter table public.sl_line_order_requests
  add column if not exists legacy_order_id_at_request bigint,
  add column if not exists source_fingerprint_at_request text;

create or replace function public.sl_capture_order_request_baseline()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.request_type = 'change' then
    select legacy_order_id, source_fingerprint
      into new.legacy_order_id_at_request, new.source_fingerprint_at_request
    from public.sl_legacy_order_links
    where order_id = new.order_id and origin = 'line';
  end if;
  return new;
end;
$$;
revoke all on function public.sl_capture_order_request_baseline() from public, anon, authenticated;
grant execute on function public.sl_capture_order_request_baseline() to service_role;
drop trigger if exists sl_order_request_baseline on public.sl_line_order_requests;
create trigger sl_order_request_baseline before insert on public.sl_line_order_requests
  for each row execute function public.sl_capture_order_request_baseline();

create or replace function public.sl_review_line_order_request(
  p_request_id bigint, p_decision text, p_note text, p_actor text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.sl_line_order_requests%rowtype;
  v_link public.sl_legacy_order_links%rowtype;
  v_status text;
begin
  if p_decision not in ('approved','rejected') or length(trim(coalesce(p_note,''))) < 4 then
    raise exception 'invalid order request review';
  end if;
  select * into v_request from public.sl_line_order_requests
    where id = p_request_id and status = 'pending' for update;
  if v_request.id is null then return false; end if;

  if p_decision = 'approved' and v_request.request_type = 'change' then
    select * into v_link from public.sl_legacy_order_links
      where order_id = v_request.order_id and origin = 'line';
    if v_request.legacy_order_id_at_request is null
      or nullif(v_request.source_fingerprint_at_request,'') is null
      or v_link.id is null
      or v_link.legacy_order_id <> v_request.legacy_order_id_at_request
      or coalesce(v_link.source_fingerprint,'') = v_request.source_fingerprint_at_request
      or v_link.last_synced_at < v_request.created_at then
      raise exception 'linked order has not been reconciled since this request'
        using errcode = 'PZ001';
    end if;
  elsif p_decision = 'approved' and v_request.request_type = 'cancel' then
    select status into v_status from public.sl_orders where id = v_request.order_id;
    if v_status is distinct from 'cancelled' then
      raise exception 'order has not been cancelled' using errcode = 'PZ002';
    end if;
  end if;

  update public.sl_line_order_requests
  set status = p_decision, decision_note = left(trim(p_note),200), decided_by = p_actor, decided_at = now()
  where id = p_request_id;
  insert into public.sl_audit_log(actor_type,actor_id,action,entity_type,entity_id)
  values ('admin',p_actor,case when p_decision='approved' then 'order_service_completed' else 'order_service_rejected' end,
    'line_order_request',p_request_id::text);
  return true;
end;
$$;
revoke all on function public.sl_review_line_order_request(bigint,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_review_line_order_request(bigint,text,text,text) to service_role;


-- ── Migration: 20261013083713_paged_member_order_history.sql ──
-- Cursor pagination keeps older orders reachable without returning another member's rows.
create or replace function public.sl_get_member_orders_page(
  p_customer_id uuid, p_before_created_at timestamptz default null,
  p_before_id text default null, p_limit integer default 21
) returns jsonb language sql stable set search_path to '' as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id desc),'[]'::jsonb)
  from (
    select o.id,o.address_id,o.delivery_address,o.status,o.note,o.total_amount,o.created_at,o.updated_at,
      coalesce((select jsonb_agg(jsonb_build_object('product_code',i.product_code,
        'product_name',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price,
        'subtotal',i.subtotal) order by i.created_at)
        from public.sl_order_items i where i.order_id=o.id),'[]'::jsonb) sl_order_items
    from public.sl_orders o
    where o.customer_id=p_customer_id and o.status<>'creating'
      and (p_before_created_at is null or (o.created_at,o.id)<(p_before_created_at,p_before_id))
    order by o.created_at desc,o.id desc
    limit greatest(1,least(coalesce(p_limit,21),101))
  ) x;
$$;
revoke all on function public.sl_get_member_orders_page(uuid,timestamptz,text,integer) from public,anon,authenticated;
grant execute on function public.sl_get_member_orders_page(uuid,timestamptz,text,integer) to service_role;


-- ── Migration: 20261018093000_member_binding_conflict_guard.sql ──
-- Suspended prior bindings also require manual staff review.
create or replace function public.sl_verify_and_bind_member(
  p_line_user_id text,
  p_line_display_name text,
  p_phone text,
  p_legacy_customer_id text,
  p_door text,
  p_floor text
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_door text := replace(replace(regexp_replace(translate(coalesce(p_door, ''), '０１２３４５６７８９', '0123456789'), '[[:space:]]', '', 'g'), '-', '之'), '－', '之');
  v_floor text := replace(replace(regexp_replace(translate(coalesce(p_floor, ''), '０１２３４５６７８９', '0123456789'), '[[:space:]]', '', 'g'), '-', '之'), '－', '之');
  v_customer_id uuid;
  v_customer_count integer;
  v_address text;
  v_real_door text;
  v_real_floor text;
  v_failures integer;
  v_locked_at timestamptz;
  v_member public.sl_line_members%rowtype;
begin
  if nullif(trim(coalesce(p_line_user_id, '')), '') is null
     or length(p_line_user_id) > 255
     or length(v_phone) < 8 or length(v_phone) > 15
     or coalesce(p_legacy_customer_id, '') = ''
     or v_door !~ '^[0-9]{1,5}(之[0-9]{1,4})?$'
     or (v_floor <> '' and v_floor !~ '^[0-9]{1,3}(之[0-9]{1,3})?$') then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  select count(distinct matched.id), min(matched.id::text)::uuid
  into v_customer_count, v_customer_id
  from (
    select cp.customer_id as id
    from public.sl_customer_phones cp
    join public.sl_customers c on c.id = cp.customer_id
    where c.status = 'active'
      and (
        cp.phone_normalized = v_phone
        or (v_phone ~ '^[2378][0-9]{7}$' and cp.phone_normalized = '02' || v_phone)
        or (v_phone ~ '^02[2378][0-9]{7}$' and cp.phone_normalized = substr(v_phone, 3))
      )
    union
    select c.id
    from public.sl_customers c
    where c.status = 'active'
      and (
        regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = v_phone
        or (v_phone ~ '^[2378][0-9]{7}$' and regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = '02' || v_phone)
        or (v_phone ~ '^02[2378][0-9]{7}$' and regexp_replace(c.primary_phone, '[^0-9]', '', 'g') = substr(v_phone, 3))
      )
  ) matched;
  if v_customer_count <> 1 then
    return jsonb_build_object('status', 'manual_review');
  end if;

  select id into v_customer_id
  from public.sl_customers
  where id = v_customer_id and legacy_customer_id = p_legacy_customer_id and status = 'active'
  for update;
  if v_customer_id is null then
    return jsonb_build_object('status', 'customer_changed');
  end if;
  if exists (select 1 from public.sl_line_members
             where customer_id = v_customer_id and status <> 'deleted'
               and line_user_id <> p_line_user_id)
     or exists (select 1 from public.sl_line_members
                where line_user_id = p_line_user_id and customer_id <> v_customer_id
                  and status <> 'deleted') then
    return jsonb_build_object('status', 'manual_review');
  end if;

  select address into v_address
  from public.sl_addresses
  where customer_id = v_customer_id and status = 'active'
  order by is_default desc, created_at, id
  limit 1;
  if v_address is null then
    return jsonb_build_object('status', 'manual_review');
  end if;
  v_address := replace(replace(translate(v_address, '０１２３４５６７８９', '0123456789'), '-', '之'), '－', '之');
  v_real_door := substring(v_address from '([0-9]+(之[0-9]+)?)號');
  v_real_floor := coalesce(substring(v_address from '([0-9]+(之[0-9]+)?)樓'), '');
  if v_real_door is null then
    return jsonb_build_object('status', 'manual_review');
  end if;

  insert into public.sl_member_bind_attempts(customer_id)
  values (v_customer_id) on conflict (customer_id) do nothing;
  select failed_count, locked_at into v_failures, v_locked_at
  from public.sl_member_bind_attempts
  where customer_id = v_customer_id for update;
  if v_locked_at is not null then
    return jsonb_build_object('status', 'locked');
  end if;

  if v_door <> v_real_door or v_floor <> v_real_floor then
    v_failures := least(3, v_failures + 1);
    update public.sl_member_bind_attempts
    set failed_count = v_failures,
        locked_at = case when v_failures >= 3 then now() else null end,
        updated_at = now()
    where customer_id = v_customer_id;
    insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
    values ('line_user', left(p_line_user_id, 100), 'member_address_check_failed',
      'customer', v_customer_id::text, jsonb_build_object('failures', v_failures));
    return jsonb_build_object('status', case when v_failures >= 3 then 'locked' else 'wrong_address' end,
                              'remaining', 3 - v_failures);
  end if;

  update public.sl_member_bind_attempts
  set failed_count = 0, updated_at = now() where customer_id = v_customer_id;
  insert into public.sl_line_members(
    line_user_id, customer_id, line_display_name, status, last_verified_at,
    binding_started_at, binding_phone
  ) values (
    p_line_user_id, v_customer_id, left(coalesce(p_line_display_name, ''), 60),
    'active', now(), now(), v_phone
  )
  on conflict (line_user_id) do update
  set customer_id = excluded.customer_id,
      line_display_name = excluded.line_display_name,
      status = 'active', last_verified_at = now(),
      binding_phone = excluded.binding_phone,
      session_version = public.sl_line_members.session_version + 1,
      updated_at = now()
  returning * into v_member;
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, after_data)
  values ('line_user', left(p_line_user_id, 100), 'member_address_self_verified',
    'line_member', p_line_user_id, jsonb_build_object('customer_id', v_customer_id));
  insert into public.sl_backup_outbox(entity_type, entity_id, operation, payload)
  values ('sl_line_members', p_line_user_id, 'insert', to_jsonb(v_member));
  return jsonb_build_object('status', 'bound');
exception
  when unique_violation then
    return jsonb_build_object('status', 'manual_review');
end;
$$;
revoke all on function public.sl_verify_and_bind_member(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_verify_and_bind_member(text,text,text,text,text,text) to service_role;


-- ── Migration: 20261018104500_admin_staff_transaction.sql ──
-- Apply the staff grant and audit in one database transaction.
create or replace function public.sl_set_admin_staff(
  p_actor text, p_line_user_id text, p_display_name text, p_status text
) returns jsonb language plpgsql security invoker set search_path = public as $$
begin
  if p_actor is null or btrim(p_actor) = ''
     or p_line_user_id !~ '^U[0-9a-fA-F]{32}$'
     or p_status not in ('active', 'inactive') then
    return jsonb_build_object('error', 'invalid_input');
  end if;
  insert into public.sl_admin_staff(line_user_id, display_name, status, created_by, updated_at)
  values (p_line_user_id, left(coalesce(p_display_name, ''), 60), p_status, p_actor, now())
  on conflict (line_user_id) do update
  set display_name = excluded.display_name, status = excluded.status, updated_at = now();
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id)
  values ('admin', p_actor, 'admin_staff_' || p_status, 'admin_staff', p_line_user_id);
  return jsonb_build_object('status', p_status);
end;
$$;
revoke all on function public.sl_set_admin_staff(text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_set_admin_staff(text,text,text,text) to service_role;


-- ── Migration: 20261019193000_skip_legacy_status_echo.sql ──
-- ERP-originated status events are already reflected in the legacy order.
-- Do not queue them back to the ERP as a second outbound operation.
create or replace function public.sl_queue_legacy_status_change()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare v_order public.sl_orders%rowtype;
begin
  if new.actor_type='legacy_sync' then return new; end if;
  select * into v_order from public.sl_orders where id=new.order_id;
  if v_order.source='line' then
    insert into public.sl_legacy_sync_jobs(direction,event_type,order_id,idempotency_key,payload)
    values ('to_legacy',case when new.to_status='cancelled' then 'order_cancel' else 'order_update' end,
      new.order_id,'line:status:'||new.order_id||':'||new.id::text,
      to_jsonb(v_order)||jsonb_build_object('statusEventId',new.id))
    on conflict (idempotency_key) do nothing;
  end if;
  return new;
end;
$$;

-- Resolve only already-queued echoes whose source event is explicitly legacy_sync.
update public.sl_legacy_sync_jobs j
set status='synced', synced_at=now(), next_attempt_at=now(), last_error=''
from public.sl_order_status_events e
where j.direction='to_legacy'
  and j.event_type in ('order_update','order_cancel')
  and j.status in ('pending','failed')
  and j.payload->>'statusEventId' ~ '^[0-9]+$'
  and e.id=(j.payload->>'statusEventId')::bigint
  and e.order_id=j.order_id
  and e.actor_type='legacy_sync';


-- ── Migration: 20261020121000_line_order_change_once.sql ──
-- A member's change request is consumed by exactly one explicit ERP save.
alter table public.sl_line_order_requests
  add column if not exists erp_change_event_id bigint,
  add column if not exists erp_change_saved_at timestamptz;

alter table public.sl_line_order_requests
  drop constraint if exists sl_line_order_requests_status_check;
alter table public.sl_line_order_requests
  add constraint sl_line_order_requests_status_check
  check (status in ('pending','processing','approved','rejected'));

create unique index if not exists sl_line_order_requests_erp_change_event_uidx
  on public.sl_line_order_requests(erp_change_event_id)
  where erp_change_event_id is not null;

create or replace function public.sl_claim_line_order_change(
  p_order_id text, p_legacy_order_id bigint, p_event_id bigint, p_saved_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.sl_line_order_requests%rowtype;
begin
  if p_event_id is null or p_event_id <= 0 or p_saved_at is null then
    raise exception 'invalid ERP change event';
  end if;
  if not exists (
    select 1 from public.sl_legacy_order_links
    where order_id = p_order_id and legacy_order_id = p_legacy_order_id and origin = 'line'
  ) then
    raise exception 'ERP change event is not linked to a LINE order';
  end if;

  -- A retry of the same event resumes safely. Another event cannot steal it.
  select * into v_request from public.sl_line_order_requests
  where erp_change_event_id = p_event_id and order_id = p_order_id
  for update;
  if v_request.id is not null then
    return jsonb_build_object('request_id', v_request.id,
      'already_completed', v_request.status = 'approved');
  end if;

  select * into v_request from public.sl_line_order_requests
  where order_id = p_order_id and request_type = 'change' and status = 'pending'
    and legacy_order_id_at_request = p_legacy_order_id
    and created_at <= p_saved_at
  order by created_at, id limit 1 for update skip locked;
  if v_request.id is null then return jsonb_build_object('request_id', null); end if;

  update public.sl_line_order_requests
  set status = 'processing', erp_change_event_id = p_event_id,
    erp_change_saved_at = p_saved_at
  where id = v_request.id;
  return jsonb_build_object('request_id', v_request.id, 'already_completed', false);
end;
$$;

create or replace function public.sl_finish_line_order_change(
  p_request_id bigint, p_event_id bigint
) returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.sl_line_order_requests
  set status = 'approved', decided_by = 'erp_save', decided_at = now(),
    decision_note = '舊 ERP 第一次成功儲存改單，已自動回傳 LINE'
  where id = p_request_id and erp_change_event_id = p_event_id and status = 'processing';
  return found;
end;
$$;

revoke all on function public.sl_claim_line_order_change(text,bigint,bigint,timestamptz) from public, anon, authenticated;
revoke all on function public.sl_finish_line_order_change(bigint,bigint) from public, anon, authenticated;
grant execute on function public.sl_claim_line_order_change(text,bigint,bigint,timestamptz) to service_role;
grant execute on function public.sl_finish_line_order_change(bigint,bigint) to service_role;


-- ── Migration: 20261021214200_admin_audit_atomic.sql ──
-- Keep credential changes and their audit rows in one database transaction.
create or replace function public.sl_set_admin_credential(
  p_actor text, p_credential_id text, p_salt text, p_code_hash text, p_reason text
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_prior_exists boolean;
  v_action text;
begin
  if p_actor is null or p_actor !~ '^U[0-9A-Fa-f]{32}$'
     or p_salt is null or p_salt !~ '^[0-9a-f]{32}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_reason is null or p_reason not in ('reset', 'migration')
     or p_credential_id is null
     or (p_credential_id <> 'primary' and p_credential_id !~ '^staff:U[0-9A-Fa-f]{32}$')
     or (p_reason = 'migration' and p_credential_id <> 'primary') then
    raise exception 'invalid admin credential change' using errcode = '22023';
  end if;

  if p_credential_id like 'staff:%' then
    perform 1 from public.sl_admin_staff
      where line_user_id = substr(p_credential_id, 7) and status = 'active'
      for update;
    if not found then raise exception 'staff member is not active' using errcode = 'P0002'; end if;
    v_action := 'admin_staff_code_reset';
  elsif p_reason = 'migration' then
    v_action := 'admin_access_code_migrated';
  else
    v_action := 'admin_access_code_reset';
  end if;

  select exists(select 1 from public.sl_admin_credentials
    where credential_id = p_credential_id) into v_prior_exists;
  insert into public.sl_admin_credentials(credential_id, salt, code_hash, algorithm, updated_at)
    values (p_credential_id, p_salt, p_code_hash, 'scrypt-n16384-r8-p1', now())
    on conflict (credential_id) do update
    set salt = excluded.salt, code_hash = excluded.code_hash,
        algorithm = excluded.algorithm, updated_at = excluded.updated_at;

  -- Never store the new code, salt, or password hash in the audit log.
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, before_data, after_data)
    values ('admin', p_actor, v_action, 'admin_credential', p_credential_id,
      jsonb_build_object('existed', v_prior_exists),
      jsonb_build_object('algorithm', 'scrypt-n16384-r8-p1'));
end;
$$;
revoke all on function public.sl_set_admin_credential(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_set_admin_credential(text,text,text,text,text) to service_role;

-- An inquiry decision and its audit row must commit or roll back together.
create or replace function public.sl_review_unverified_order_inquiry(
  p_request_id uuid, p_decision text, p_actor text, p_note text
) returns boolean
language plpgsql security invoker set search_path = public as $$
declare
  v_inquiry public.sl_unverified_order_inquiries%rowtype;
begin
  if p_request_id is null or p_decision is null or p_decision not in ('handled', 'rejected')
     or p_actor is null or p_actor !~ '^U[0-9A-Fa-f]{32}$'
     or char_length(coalesce(p_note, '')) > 200 then
    raise exception 'invalid inquiry review' using errcode = '22023';
  end if;

  select * into v_inquiry from public.sl_unverified_order_inquiries
    where request_id = p_request_id and status = 'pending' for update;
  if not found then return false; end if;

  update public.sl_unverified_order_inquiries
    set status = p_decision, handled_by = p_actor,
        handled_at = now(), review_note = coalesce(p_note, '')
    where request_id = p_request_id;
  insert into public.sl_audit_log(actor_type, actor_id, action, entity_type, entity_id, before_data, after_data)
    values ('admin', p_actor, 'unverified_order_' || p_decision,
      'order_inquiry', p_request_id::text,
      jsonb_build_object('status', v_inquiry.status),
      jsonb_build_object('status', p_decision, 'review_note', coalesce(p_note, '')));
  return true;
end;
$$;
revoke all on function public.sl_review_unverified_order_inquiry(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.sl_review_unverified_order_inquiry(uuid,text,text,text) to service_role;


-- ── Migration: 20261023_create_operations_kv.sql ──
create table if not exists public.sl_operations_kv (
  key text primary key check (key ~ '^[a-z0-9_]{1,80}$'),
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.sl_operations_kv enable row level security;
revoke all on table public.sl_operations_kv from public, anon, authenticated;
grant select, insert, update, delete on table public.sl_operations_kv to service_role;

create table if not exists public.sl_operations_kv_auth (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.sl_operations_kv_auth enable row level security;
revoke all on table public.sl_operations_kv_auth from public, anon, authenticated;
grant select on table public.sl_operations_kv_auth to service_role;

-- Insert or rotate the SHA-256 hash of a random access token separately.
-- Never commit the token itself to the repository.


-- ── Migration: 20261023_allow_independent_operations_kv_tokens.sql ──
alter table public.sl_operations_kv_auth
  drop constraint if exists sl_operations_kv_auth_id_check;
alter table public.sl_operations_kv_auth
  add constraint sl_operations_kv_auth_id_check
  check (id ~ '^[a-z][a-z0-9_]{1,31}$');


-- ── Migration: 20261026053100_erp_cloud_order_foundation.sql ──
-- Isolated ERP cloud order ledger. Existing LINE sl_orders and legacy SQL tables are untouched.
-- This migration creates storage only; order acceptance must remain disabled until the
-- cloud price source, authentication, and idempotent local bridge are verified.
create table if not exists public.sl_erp_cloud_orders (
  id uuid primary key,
  cloud_order_no bigint generated always as identity unique,
  request_id uuid not null unique,
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  legacy_customer_id text not null check (length(legacy_customer_id) between 1 and 40),
  customer_snapshot jsonb not null check (jsonb_typeof(customer_snapshot) = 'object'),
  pricing_snapshot jsonb not null check (jsonb_typeof(pricing_snapshot) = 'object'),
  price_snapshot_at timestamptz not null,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  floor_fee numeric(12, 2) not null default 0 check (floor_fee >= 0),
  handling_fee numeric(12, 2) not null default 0 check (handling_fee >= 0),
  total_amount numeric(12, 2) not null check (total_amount >= 0),
  status text not null default 'accepted'
    check (status in ('accepted', 'syncing', 'linked', 'needs_review', 'conflict', 'cancelled')),
  legacy_order_id bigint unique check (legacy_order_id > 0),
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  linked_at timestamptz,
  check ((status = 'linked') = (legacy_order_id is not null))
);

create index if not exists sl_erp_cloud_orders_pending_idx
  on public.sl_erp_cloud_orders (accepted_at, id)
  where status in ('accepted', 'syncing', 'needs_review', 'conflict');
create index if not exists sl_erp_cloud_orders_customer_idx
  on public.sl_erp_cloud_orders (legacy_customer_id, accepted_at desc);

create table if not exists public.sl_erp_cloud_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.sl_erp_cloud_orders(id) on delete restrict,
  event_key uuid not null unique,
  event_type text not null check (event_type ~ '^[a-z_]{2,40}$'),
  actor text not null check (length(actor) between 1 and 100),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists sl_erp_cloud_order_events_order_idx
  on public.sl_erp_cloud_order_events (order_id, occurred_at, id);

alter table public.sl_erp_cloud_orders enable row level security;
alter table public.sl_erp_cloud_order_events enable row level security;
revoke all on public.sl_erp_cloud_orders from public, anon, authenticated;
revoke all on public.sl_erp_cloud_order_events from public, anon, authenticated;
revoke all on sequence public.sl_erp_cloud_orders_cloud_order_no_seq from public, anon, authenticated;
revoke all on sequence public.sl_erp_cloud_order_events_id_seq from public, anon, authenticated;
grant select, insert, update on public.sl_erp_cloud_orders to service_role;
grant select, insert on public.sl_erp_cloud_order_events to service_role;
grant usage, select on sequence public.sl_erp_cloud_orders_cloud_order_no_seq to service_role;
grant usage, select on sequence public.sl_erp_cloud_order_events_id_seq to service_role;


-- ── Migration: 20261026111555_erp_cloud_catalog_snapshot.sql ──
-- ERP-only catalog snapshots. Existing sl_customers, sl_price_rules and LINE orders
-- are deliberately untouched. No order API may use this until ingestion is tested.
create table if not exists public.sl_erp_catalog_batches (
  id uuid primary key,
  source_name text not null check (source_name = 'gas_station_ShengLong'),
  source_snapshot_at timestamptz not null,
  source_price_at timestamptz not null,
  source_customer_max_updated_at timestamptz,
  spec text not null check (spec in ('5', '7')),
  handling_fee_enabled boolean not null,
  expected_active_customers integer not null
    check (expected_active_customers between 1 and 100000),
  expected_sha256 text not null check (expected_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.sl_erp_catalog_customers (
  batch_id uuid not null references public.sl_erp_catalog_batches(id) on delete restrict,
  legacy_customer_id bigint not null check (legacy_customer_id > 0),
  display_name text not null check (length(display_name) between 1 and 200),
  phone text not null default '' check (length(phone) <= 80),
  address text not null default '' check (length(address) <= 500),
  customer_type text not null default '' check (length(customer_type) <= 80),
  source_updated_at timestamptz,
  pricing_lines jsonb not null
    check (jsonb_typeof(pricing_lines) = 'array'
      and jsonb_array_length(pricing_lines) between 5 and 7),
  row_sha256 text not null check (row_sha256 ~ '^[0-9a-f]{64}$'),
  primary key (batch_id, legacy_customer_id)
);

create index if not exists sl_erp_catalog_customers_phone_idx
  on public.sl_erp_catalog_customers (batch_id, phone);

create table if not exists public.sl_erp_catalog_current (
  singleton boolean primary key default true check (singleton),
  batch_id uuid not null references public.sl_erp_catalog_batches(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create index if not exists sl_erp_catalog_current_batch_idx
  on public.sl_erp_catalog_current (batch_id);

alter table public.sl_erp_catalog_batches enable row level security;
alter table public.sl_erp_catalog_customers enable row level security;
alter table public.sl_erp_catalog_current enable row level security;

revoke all on public.sl_erp_catalog_batches from public, anon, authenticated;
revoke all on public.sl_erp_catalog_customers from public, anon, authenticated;
revoke all on public.sl_erp_catalog_current from public, anon, authenticated;
grant select, insert, update on public.sl_erp_catalog_batches to service_role;
grant select, insert on public.sl_erp_catalog_customers to service_role;
grant select, insert, update on public.sl_erp_catalog_current to service_role;

-- FK key-share locking alone happens after a BEFORE trigger. Take it here so
-- publication cannot race with a last customer insert.
create function public.sl_erp_catalog_require_staging()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_published_at timestamptz;
begin
  select published_at into v_published_at
  from public.sl_erp_catalog_batches
  where id = new.batch_id
  for key share;
  if not found or v_published_at is not null then
    raise exception 'CATALOG_BATCH_NOT_STAGING';
  end if;
  return new;
end;
$$;

create trigger sl_erp_catalog_customers_staging_only
before insert on public.sl_erp_catalog_customers
for each row execute function public.sl_erp_catalog_require_staging();

revoke all on function public.sl_erp_catalog_require_staging()
  from public, anon, authenticated;
grant execute on function public.sl_erp_catalog_require_staging() to service_role;

-- A batch becomes visible through exactly one pointer update. The caller must
-- first upload all rows and supply the SHA-256 of the sorted row-hash string.
create function public.sl_erp_publish_catalog(p_batch_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch public.sl_erp_catalog_batches%rowtype;
  v_count bigint;
  v_sha256 text;
begin
  select * into v_batch
  from public.sl_erp_catalog_batches
  where id = p_batch_id
  for update;
  if not found then
    raise exception 'CATALOG_BATCH_NOT_FOUND';
  end if;

  select count(*),
         encode(extensions.digest(
           coalesce(string_agg(row_sha256, '' order by legacy_customer_id), ''),
           'sha256'), 'hex')
    into v_count, v_sha256
  from public.sl_erp_catalog_customers
  where batch_id = p_batch_id;

  if v_count <> v_batch.expected_active_customers
     or v_sha256 <> v_batch.expected_sha256 then
    raise exception 'CATALOG_COUNT_OR_CHECKSUM_MISMATCH';
  end if;

  if exists (
    select 1
    from public.sl_erp_catalog_customers c
    where c.batch_id = p_batch_id
      and (
        jsonb_array_length(c.pricing_lines) <> v_batch.spec::integer
        or (select count(distinct line->>'size')
            from jsonb_array_elements(c.pricing_lines) as item(line))
            <> v_batch.spec::integer
        or exists (
          select 1
          from jsonb_array_elements(c.pricing_lines) as item(line)
          where jsonb_typeof(line) is distinct from 'object'
            or jsonb_typeof(line->'size') is distinct from 'string'
            or not (
              (v_batch.spec = '5' and line->>'size' in
                ('50kg', '20kg', '16kg', '10kg', '4kg'))
              or (v_batch.spec = '7' and line->>'size' in
                ('50kg', '20kg', '18kg', '16kg', '10kg', '新4kg', '4kg'))
            )
            or jsonb_typeof(line->'basePrice') is distinct from 'number'
            or jsonb_typeof(line->'customerDiscount') is distinct from 'number'
            or jsonb_typeof(line->'unitPrice') is distinct from 'number'
            or jsonb_typeof(line->'handlingFee') is distinct from 'number'
            or case when jsonb_typeof(line->'basePrice') = 'number'
              then (line->>'basePrice')::numeric < 0 else true end
            or case when jsonb_typeof(line->'customerDiscount') = 'number'
              then (line->>'customerDiscount')::numeric < 0 else true end
            or case when jsonb_typeof(line->'unitPrice') = 'number'
              then (line->>'unitPrice')::numeric < 0 else true end
            or case when jsonb_typeof(line->'handlingFee') = 'number'
              then (line->>'handlingFee')::numeric < 0 else true end
        )
      )
  ) then
    raise exception 'CATALOG_PRICE_LINES_INCOMPLETE';
  end if;

  insert into public.sl_erp_catalog_current (singleton, batch_id, activated_at)
  values (true, p_batch_id, now())
  on conflict (singleton) do update
    set batch_id = excluded.batch_id,
        activated_at = excluded.activated_at;

  update public.sl_erp_catalog_batches
  set published_at = now()
  where id = p_batch_id;
end;
$$;

revoke all on function public.sl_erp_publish_catalog(uuid)
  from public, anon, authenticated;
grant execute on function public.sl_erp_publish_catalog(uuid) to service_role;


-- ── Migration: 20261107213000_create_live_snapshots_and_command_queue.sql ──
-- ==============================================================================
-- 盛隆瓦斯 Phase D：即時戰情快照中樞 (live_snapshots) 與雙向派單佇列 (command_queue)
-- 版本: 20261107213000
-- 嚴格遵守 Directive #4：雲端擴充結構完全獨立於門市舊 ERP SQL Server 黑盒子之外
-- ==============================================================================

-- 1. 即時戰情快照表 (live_snapshots)
CREATE TABLE IF NOT EXISTS public.live_snapshots (
    channel_key VARCHAR(80) PRIMARY KEY,              -- 例: ops_snapshot_main, stock_live, driver_fleet
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,       -- 聚合快照內容
    etag VARCHAR(80),                                 -- SHA-1 / SHA-256 快照指紋，供無變動比對
    source_host VARCHAR(120),                         -- 推送來源主機 (例: store-pc-sync-daemon)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_live_snapshots_updated_at
    ON public.live_snapshots (updated_at DESC);

-- 2. 雲端至門市雙向指令佇列 (command_queue)
CREATE TABLE IF NOT EXISTS public.command_queue (
    command_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    command_type VARCHAR(60) NOT NULL,                -- ASSIGN_DRIVER / MARK_DELIVERED / CANCEL_ORDER / PROMOTE_DRAFT
    order_id BIGINT,                                  -- 對應舊 ERP gas_oders.oder_id (無外鍵綁定，遵守 Directive #4)
    target_driver VARCHAR(60),                        -- 指派外勤同仁 (例: 小龍 / 稍後輸入；離職員工游柏林已除名)
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',    -- PENDING / PROCESSING / ACKED / FAILED
    issued_by VARCHAR(80) DEFAULT 'operations_web',
    ack_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_command_queue_status_created
    ON public.command_queue (status, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_command_queue_order_id
    ON public.command_queue (order_id);

-- 啟用 RLS
ALTER TABLE public.live_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.command_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'live_snapshots' AND policyname = 'allow_service_live_snapshots'
    ) THEN
        CREATE POLICY allow_service_live_snapshots
            ON public.live_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'command_queue' AND policyname = 'allow_service_command_queue'
    ) THEN
        CREATE POLICY allow_service_command_queue
            ON public.command_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 嘗試掛載至 Supabase Realtime Publication（若環境支援則自動啟用 WebSocket 推播）
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.live_snapshots;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.command_queue;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;


SELECT '✅ 23 個進階串接 RPC 與雙向調度資料表已 100% 補齊成功！' AS status;
