import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { cache } from 'react';
import { getDatabaseUrl } from '@/lib/env';
import { shortHash, toSlug } from '@/lib/slug';
import { displayModel, normalizeDecodeResult, normalizeModelCode } from '@/lib/validation';
import type { DecodeResult } from '@/types';

/** Products older than this are re-decoded on the next lookup. */
export const PRODUCT_TTL_DAYS = 90;
/** Analytics retention. Quota rows are pruned separately. */
const SEARCH_HISTORY_RETENTION_DAYS = 30;
const QUOTA_RETENTION_DAYS = 2;

const GLOBAL_QUOTA_KEY = '__global__';

let sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (sql) return sql;
  sql = neon(getDatabaseUrl());
  return sql;
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (record.code !== '23505') return false;
  if (typeof record.constraint === 'string' && record.constraint === constraint) return true;
  return typeof record.message === 'string' && record.message.includes(constraint);
}

interface ProductRow {
  id: string;
  model_number: string;
  slug: string;
  brand: string;
  category: string;
  key_specs: unknown;
  insight: string;
  price_indicator: unknown;
  release_window: string | null;
  year: string | null;
  amazon_link: string | null;
  alternatives: unknown;
  search_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Rebuild a DecodeResult from a database row.
 *
 * JSONB columns round-trip whatever was written, including data stored before
 * output validation existed, so the row is passed through the same normalizer as
 * a fresh AI response. A row that cannot be normalized is treated as missing
 * rather than being allowed to crash the renderer.
 */
function rowToDecodeResult(row: ProductRow): DecodeResult | null {
  const normalized = normalizeDecodeResult(
    {
      identity: {
        brand: row.brand,
        category: row.category,
        keySpecs: row.key_specs,
        insight: row.insight,
        releaseWindow: row.release_window,
        year: row.year,
        amazonLink: row.amazon_link,
        priceIndicator: row.price_indicator,
      },
      alternatives: row.alternatives,
    },
    { requireInsight: false },
  );

  if (!normalized?.identity) return null;
  return normalized;
}

export interface CachedProduct {
  result: DecodeResult;
  slug: string;
}

export async function getProductByModel(model: string): Promise<CachedProduct | null> {
  const rows = (await getSql()`
    SELECT * FROM products
    WHERE model_number = ${normalizeModelCode(model)}
      AND updated_at > now() - make_interval(days => ${PRODUCT_TTL_DAYS}::int)
    LIMIT 1
  `) as unknown as ProductRow[];

  if (!rows || rows.length === 0) return null;
  const result = rowToDecodeResult(rows[0]);
  if (!result) return null;
  return { result, slug: rows[0].slug };
}

export interface ProductPageData {
  model: string;
  slug: string;
  result: DecodeResult;
  searchCount: number;
  createdAt: string;
  updatedAt: string;
  /** True when the row is older than the refresh window (emitted as noindex). */
  isStale: boolean;
}

const STALE_AFTER_MS = PRODUCT_TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Per-request memoized: `generateMetadata` and the page component would
 * otherwise each issue the same query.
 */
export const getProductBySlug = cache(async (slug: string): Promise<ProductPageData | null> => {
  const rows = (await getSql()`
    SELECT * FROM products
    WHERE slug = ${slug.toLowerCase().trim()}
    LIMIT 1
  `) as unknown as ProductRow[];

  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const result = rowToDecodeResult(row);
  if (!result) return null;

  return {
    model: row.model_number,
    slug: row.slug,
    result,
    searchCount: row.search_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isStale: Date.now() - new Date(row.updated_at).getTime() > STALE_AFTER_MS,
  };
});

/** Slug of a cached product, used to link alternatives to crawlable pages. */
export async function getProductSlugByModel(model: string): Promise<string | null> {
  const rows = (await getSql()`
    SELECT slug FROM products WHERE model_number = ${normalizeModelCode(model)} LIMIT 1
  `) as unknown as { slug: string }[];
  return rows?.[0]?.slug ?? null;
}

/**
 * Sitemap source: only products with usable content, most-searched first.
 * Thin/unknown rows are excluded so the sitemap does not advertise empty pages.
 */
export async function getProductSlugs(limit = 1000): Promise<{ slug: string; updated_at: string }[]> {
  return (await getSql()`
    SELECT slug, updated_at FROM products
    WHERE brand <> 'Unknown'
      AND length(insight) >= 40
      AND jsonb_array_length(COALESCE(key_specs, '[]'::jsonb)) >= 1
    ORDER BY search_count DESC, updated_at DESC
    LIMIT ${limit}::int
  `) as unknown as { slug: string; updated_at: string }[];
}

export interface SavedProduct {
  id: string;
  slug: string;
}

/**
 * Persist a decoded product.
 *
 * The slug is deliberately not updated on conflict: SEO URLs must stay stable
 * even when a later decode renames the product. Because `slug` is a second
 * unique key, a different model number can still collide on it - that case is
 * retried with a short hash suffix instead of failing the request.
 */
export async function saveProduct(model: string, result: DecodeResult): Promise<SavedProduct> {
  const cleanModel = normalizeModelCode(model);
  const brand = result.identity?.brand || 'Unknown';
  const display = displayModel(cleanModel, brand);
  const baseSlug = toSlug(`${brand} ${display}`);

  const insert = async (slug: string): Promise<SavedProduct> => {
    const rows = (await getSql()`
      INSERT INTO products (
        model_number, slug, brand, category, key_specs, insight,
        price_indicator, release_window, year, amazon_link, alternatives
      ) VALUES (
        ${cleanModel},
        ${slug},
        ${brand},
        ${result.identity?.category || ''},
        ${JSON.stringify(result.identity?.keySpecs ?? [])}::jsonb,
        ${result.identity?.insight || ''},
        ${JSON.stringify(result.identity?.priceIndicator ?? null)}::jsonb,
        ${result.identity?.releaseWindow ?? null},
        ${result.identity?.year || null},
        ${result.identity?.amazonLink ?? null},
        ${JSON.stringify(result.alternatives ?? [])}::jsonb
      )
      ON CONFLICT (model_number) DO UPDATE SET
        brand = EXCLUDED.brand,
        category = EXCLUDED.category,
        key_specs = EXCLUDED.key_specs,
        insight = EXCLUDED.insight,
        price_indicator = EXCLUDED.price_indicator,
        release_window = EXCLUDED.release_window,
        year = EXCLUDED.year,
        amazon_link = EXCLUDED.amazon_link,
        alternatives = EXCLUDED.alternatives,
        updated_at = now()
      RETURNING id, slug
    `) as unknown as { id: string; slug: string }[];

    const saved = rows?.[0];
    if (!saved) throw new Error('Product upsert returned no row');
    return saved;
  };

  try {
    return await insert(baseSlug);
  } catch (error) {
    if (!isUniqueViolation(error, 'products_slug_key')) throw error;
    return await insert(`${baseSlug}-${shortHash(cleanModel)}`);
  }
}

/** Analytics only - deliberately does not touch `updated_at` (that drives staleness). */
export async function incrementSearchCount(model: string): Promise<void> {
  try {
    await getSql()`
      UPDATE products
      SET search_count = search_count + 1
      WHERE model_number = ${normalizeModelCode(model)}
    `;
  } catch (error) {
    console.error('Failed to increment search count:', error);
  }
}

/** Analytics only; quota accounting lives in `ai_quota`. */
export async function logSearch(
  query: string,
  productId: string | null,
  source: 'camera' | 'text',
  ipHash: string,
): Promise<void> {
  try {
    await getSql()`
      INSERT INTO search_history (query, product_id, source, ip_hash, outcome)
      VALUES (${normalizeModelCode(query)}, ${productId}, ${source}, ${ipHash}, 'ok')
    `;
  } catch (error) {
    console.error('Failed to log search:', error);
  }
}

/**
 * Atomically reserve one paid AI call for an IP in the current UTC day.
 *
 * The UPSERT-and-guard is a single statement, so concurrent requests cannot all
 * pass the check the way a read-then-write counter allows. Reserving before the
 * call means failed or slow calls are still counted - otherwise failures become
 * a free-retry channel.
 */
export async function reserveAiUnit(ipHash: string, limit: number): Promise<boolean> {
  const rows = (await getSql()`
    INSERT INTO ai_quota (ip_hash, window_start, used)
    VALUES (${ipHash}, date_trunc('day', now()), 1)
    ON CONFLICT (ip_hash, window_start)
    DO UPDATE SET used = ai_quota.used + 1
    WHERE ai_quota.used < ${limit}::int
    RETURNING used
  `) as unknown as { used: number }[];
  return rows.length > 0;
}

/** Global daily circuit breaker, same table with a reserved key. */
export async function reserveGlobalAiUnit(limit: number): Promise<boolean> {
  const rows = (await getSql()`
    INSERT INTO ai_quota (ip_hash, window_start, used)
    VALUES (${GLOBAL_QUOTA_KEY}, date_trunc('day', now()), 1)
    ON CONFLICT (ip_hash, window_start)
    DO UPDATE SET used = ai_quota.used + 1
    WHERE ai_quota.used < ${limit}::int
    RETURNING used
  `) as unknown as { used: number }[];
  return rows.length > 0;
}

export async function deleteProduct(model: string): Promise<number> {
  const rows = (await getSql()`
    DELETE FROM products WHERE model_number = ${normalizeModelCode(model)} RETURNING id
  `) as unknown as { id: string }[];
  return rows.length;
}

/**
 * Opportunistic retention cleanup. Serverless has no cron in this project, so
 * this runs on a small fraction of requests instead of adding infrastructure.
 */
export async function pruneExpiredData(): Promise<void> {
  try {
    await getSql()`
      DELETE FROM ai_quota WHERE window_start < now() - make_interval(days => ${QUOTA_RETENTION_DAYS}::int)
    `;
    await getSql()`
      DELETE FROM search_history
      WHERE created_at < now() - make_interval(days => ${SEARCH_HISTORY_RETENTION_DAYS}::int)
    `;
  } catch (error) {
    console.error('Retention cleanup failed:', error);
  }
}

/** Fire-and-forget retention cleanup, triggered on ~2% of requests. */
export function maybePruneExpiredData(): void {
  if (Math.random() < 0.02) {
    void pruneExpiredData();
  }
}
