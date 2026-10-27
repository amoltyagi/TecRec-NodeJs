-- ============================================
-- TecRec Universal - full schema for a FRESH database.
-- Run in the Neon SQL Editor: https://console.neon.tech -> project -> SQL Editor
--
-- Upgrading an existing database instead? Run migrations/001_hardening.sql.
-- ============================================

-- Decoded products: the cache that makes repeat lookups free.
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_number TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    key_specs JSONB NOT NULL DEFAULT '[]',
    insight TEXT NOT NULL,
    price_indicator JSONB DEFAULT '{}',
    release_window TEXT,
    year TEXT,
    amazon_link TEXT,
    alternatives JSONB NOT NULL DEFAULT '[]',
    search_count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit/analytics log of successful decodes. NOT used for quota accounting:
-- quota lives in ai_quota so it can be reserved atomically before a paid call.
CREATE TABLE IF NOT EXISTS search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    source TEXT NOT NULL CHECK (source IN ('camera', 'text')),
    ip_hash TEXT NOT NULL,
    outcome TEXT NOT NULL DEFAULT 'ok' CHECK (outcome IN ('ok', 'error')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paid-AI-call budget. One row per (quota key, UTC day).
-- The reserved key '__global__' enforces the daily global circuit breaker.
CREATE TABLE IF NOT EXISTS ai_quota (
    ip_hash TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
    PRIMARY KEY (ip_hash, window_start)
);

-- Indexes
-- The UNIQUE constraints already index model_number and slug; do not duplicate them.
CREATE INDEX IF NOT EXISTS idx_products_search_count ON products (search_count DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history (created_at);
CREATE INDEX IF NOT EXISTS idx_search_history_ip ON search_history (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_quota_window ON ai_quota (window_start);
