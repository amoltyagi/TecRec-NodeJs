-- ============================================
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/_/sql/new
-- ============================================

-- Products table: persistent storage for every decoded product
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_number TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    brand TEXT NOT NULL,
    category TEXT NOT NULL,
    key_specs TEXT[] DEFAULT '{}',
    insight TEXT NOT NULL,
    price_indicator JSONB DEFAULT '{}',
    release_window TEXT,
    amazon_link TEXT,
    alternatives JSONB DEFAULT '[]',
    search_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Search history: rate limiting + analytics
CREATE TABLE IF NOT EXISTS search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    source TEXT CHECK (source IN ('camera', 'text')) NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_model ON products(model_number);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_search_history_created ON search_history(created_at);
CREATE INDEX IF NOT EXISTS idx_search_history_ip ON search_history(ip_hash, created_at);

-- RPC: increment search count without overwriting other fields
CREATE OR REPLACE FUNCTION increment_search(target_model TEXT)
RETURNS void AS $$
BEGIN
  UPDATE products SET search_count = search_count + 1, updated_at = now()
  WHERE model_number = target_model;
END;
$$ LANGUAGE plpgsql;