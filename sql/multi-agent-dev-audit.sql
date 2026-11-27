-- ============================================================================
-- 盛隆瓦斯 多代理 AI 協同開發審計與狀態追蹤表 (Phase 3 Supabase Migration)
-- ----------------------------------------------------------------------------
-- 安全聲明：
--  1. 本腳本僅在雲端 Supabase PostgreSQL 建立獨立開發審計表，
--     100% 遵守最高執行指令 #4（舊 ERP 絕對零更動黑盒子鐵律），不觸碰任何舊門市資料表。
--  2. 全表啟用 Row Level Security (RLS)，僅允許後端 Service Role 透過 PostgREST 存取，
--     禁止任何匿名瀏覽器直連讀寫。
-- ============================================================================

-- 1. 多代理開發任務主表
CREATE TABLE IF NOT EXISTS public.ai_dev_tasks (
  task_id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  target_repo TEXT NOT NULL,
  feature_branch TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('L1', 'L2', 'L3')),
  status TEXT NOT NULL,
  objective_title TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  pr_number INTEGER,
  pr_url TEXT,
  preview_url TEXT,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_dev_tasks_status_updated
  ON public.ai_dev_tasks (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_dev_tasks_repo_created
  ON public.ai_dev_tasks (target_repo, created_at DESC);

-- 2. 沙盒執行與測試驗證紀錄表
CREATE TABLE IF NOT EXISTS public.ai_dev_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL REFERENCES public.ai_dev_tasks(task_id) ON DELETE CASCADE,
  executor_type TEXT NOT NULL CHECK (executor_type IN ('github_actions', 'codespaces_mcp', 'local_ide', 'hub_orchestrator')),
  test_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  token_cost_usd NUMERIC(10, 4) NOT NULL DEFAULT 0,
  exit_code INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_dev_runs_task_started
  ON public.ai_dev_runs (task_id, started_at DESC);

-- 3. 不可變安全稽核與老闆簽核事件流 (Append-Only Audit Trail)
CREATE TABLE IF NOT EXISTS public.ai_dev_audit_logs (
  log_id BIGSERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_dev_audit_logs_task_created
  ON public.ai_dev_audit_logs (task_id, created_at DESC);

-- 4. 強制啟用 RLS（鎖死公開匿名存取，僅 Service Role 可操作）
ALTER TABLE public.ai_dev_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_dev_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_dev_audit_logs ENABLE ROW LEVEL SECURITY;
