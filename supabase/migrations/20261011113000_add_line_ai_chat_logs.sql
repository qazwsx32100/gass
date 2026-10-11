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
