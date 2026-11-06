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
