-- ============================================
-- 001_hardening.sql - idempotent upgrade for an EXISTING TecRec database.
--
-- Run once in the Neon SQL Editor (https://console.neon.tech -> SQL Editor)
-- BEFORE deploying the hardened application code. Safe to re-run.
--
-- Fresh database? Use neon-schema.sql instead.
-- ============================================

-- 1. Persist the AI-provided year instead of re-deriving it from the release
--    window on every read.
ALTER TABLE products ADD COLUMN IF NOT EXISTS year TEXT;

-- Backfill year from release_window where the AI stored one.
UPDATE products
SET year = substring(release_window from '(19|20)[0-9]{2}')
WHERE year IS NULL
  AND release_window ~ '(19|20)[0-9]{2}';

-- 2. Quota is now reserved atomically before each paid AI call. It used to be
--    derived from search_history, which only recorded SUCCESSFUL decodes, so a
--    failing decode was an unlimited free-retry channel.
CREATE TABLE IF NOT EXISTS ai_quota (
    ip_hash TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
    PRIMARY KEY (ip_hash, window_start)
);

-- 3. search_history becomes an audit log rather than the quota source.
ALTER TABLE search_history ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'ok';

-- 4. Index matching the sitemap's ORDER BY.
CREATE INDEX IF NOT EXISTS idx_products_search_count ON products (search_count DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_quota_window ON ai_quota (window_start);

-- 5. Drop indexes that only duplicate the UNIQUE constraints on
--    products(model_number) and products(slug). Re-run safe: IF EXISTS.
DROP INDEX IF EXISTS idx_products_model;
DROP INDEX IF EXISTS idx_products_slug;

-- Notes:
-- * No data backfill is needed for slugs: existing rows keep their URL (slugs are
--   never rewritten on conflict) so already-indexed pages stay valid.
-- * Rows whose JSONB payload was written before output validation existed are
--   re-validated on read; unusable rows behave as missing (404) rather than
--   crashing the renderer. Delete them with the admin endpoint if needed.
