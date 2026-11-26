-- Mirror copy of LINE consolidation migration for gass repo reference
-- Execute on official LINE Supabase (shenglonggas@gmail.com / xyfglvwvirqopbkqirew)
-- See canonical file in shenglong-line-liff/supabase/migrations/20261126235000_consolidate_line_ai_logs_and_pending_orders.sql

create table if not exists public.line_ai_logs (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null default 'unknown',
  user_name text,
  user_message text not null default '',
  ai_reply text not null default '',
  account_id text,
  account_name text,
  provider text,
  model text,
  tokens integer default 0,
  latency_ms integer default 0,
  failover_count integer default 0,
  is_order_intent boolean default false,
  status text default 'success',
  error_message text,
  raw_event jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_line_ai_logs_created_at
  on public.line_ai_logs (created_at desc);
create index if not exists idx_line_ai_logs_user_id
  on public.line_ai_logs (line_user_id);
create index if not exists idx_line_ai_logs_order_intent
  on public.line_ai_logs (is_order_intent)
  where is_order_intent = true;

alter table public.line_ai_logs enable row level security;

drop policy if exists "Allow service_role full access to line_ai_logs" on public.line_ai_logs;
create policy "Allow service_role full access to line_ai_logs"
  on public.line_ai_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

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
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.line_ai_logs (
    line_user_id, user_message, ai_reply, account_id, account_name,
    provider, model, tokens, latency_ms, failover_count,
    is_order_intent, status, error_message, raw_event
  )
  values (
    coalesce(nullif(trim(p_line_user_id), ''), 'unknown'),
    coalesce(p_user_message, ''),
    coalesce(p_ai_reply, ''),
    p_account_id, p_account_name, p_provider, p_model,
    coalesce(p_tokens, 0), coalesce(p_latency_ms, 0), coalesce(p_failover_count, 0),
    coalesce(p_is_order_intent, false),
    coalesce(nullif(trim(p_status), ''), 'success'),
    p_error_message, p_raw_event
  )
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.erp_record_line_ai_log(
  text, text, text, text, text, text, text, integer, integer, integer, boolean, text, text, jsonb
) to service_role;

create table if not exists public.sl_line_pending_orders (
  id text primary key,
  phone text not null default '',
  address text not null default '',
  floor text not null default '',
  spec text not null default '20kg',
  quantity integer not null default 1,
  raw_text text not null default '',
  customer_name text not null default 'LINE 叫氣客戶',
  line_user_id text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  assigned_driver text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_sl_line_pending_orders_status_created
  on public.sl_line_pending_orders (status, created_at desc);

alter table public.sl_line_pending_orders enable row level security;

drop policy if exists "Allow service_role full access to sl_line_pending_orders" on public.sl_line_pending_orders;
create policy "Allow service_role full access to sl_line_pending_orders"
  on public.sl_line_pending_orders for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
