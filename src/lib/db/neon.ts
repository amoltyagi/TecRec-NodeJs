import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { DecodeResult } from '@/types';

interface ProductRow {
  id: string;
  model_number: string;
  slug: string;
  brand: string;
  category: string;
  key_specs: string[];
  insight: string;
  price_indicator: {
    level: string;
    percent: number;
    estimatedPrice?: string;
    estimated_price?: string;
  } | null;
  release_window: string | null;
  amazon_link: string | null;
  alternatives: { brand: string; model: string; why: string }[];
  search_count: number;
  created_at: string;
  updated_at: string;
}

let sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (sql) return sql;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL must be set in environment');
  }
  sql = neon(url);
  return sql;
}

function slugify(model: string, brand: string): string {
  return `${brand.toLowerCase().replace(/\s+/g, '-')}-${model.toLowerCase().replace(/\s+/g, '-')}`;
}

function rowToDecodeResult(row: ProductRow): DecodeResult {
  const priceIndicator = row.price_indicator;
  return {
    identity: {
      brand: row.brand,
      category: row.category,
      keySpecs: row.key_specs || [],
      year: row.release_window?.match(/\d{4}/)?.[0] || '',
      releaseWindow: row.release_window || undefined,
      amazonLink: row.amazon_link || undefined,
      insight: row.insight,
      priceIndicator: priceIndicator
        ? {
            level: (priceIndicator.level || 'Mid-Range') as 'Value' | 'Mid-Range' | 'Premium' | 'Elite',
            percent: priceIndicator.percent || 50,
            estimatedPrice: priceIndicator.estimatedPrice || priceIndicator.estimated_price || '',
          }
        : undefined,
    },
    alternatives: row.alternatives || [],
  };
}

export async function getProductByModel(model: string): Promise<DecodeResult | null> {
  const rows = (await getSql()`
    SELECT * FROM products
    WHERE model_number = ${model.toUpperCase().trim()}
    LIMIT 1
  `) as unknown as ProductRow[];

  if (!rows || rows.length === 0) return null;
  return rowToDecodeResult(rows[0]);
}

export interface ProductPageData {
  model: string;
  result: DecodeResult;
  searchCount: number;
  updatedAt: string;
}

export async function getProductBySlug(slug: string): Promise<ProductPageData | null> {
  const rows = (await getSql()`
    SELECT * FROM products
    WHERE slug = ${slug.toLowerCase().trim()}
    LIMIT 1
  `) as unknown as ProductRow[];

  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  return {
    model: row.model_number,
    result: rowToDecodeResult(row),
    searchCount: row.search_count,
    updatedAt: row.updated_at,
  };
}

/** For sitemap generation: most-searched products first. */
export async function getProductSlugs(limit = 1000): Promise<{ slug: string; updated_at: string }[]> {
  return (await getSql()`
    SELECT slug, updated_at FROM products
    ORDER BY search_count DESC
    LIMIT ${limit}
  `) as unknown as { slug: string; updated_at: string }[];
}

export async function saveProduct(model: string, result: DecodeResult): Promise<void> {
  const cleanModel = model.toUpperCase().trim();
  const brand = result.identity?.brand || 'Unknown';

  await getSql()`
    INSERT INTO products (
      model_number, slug, brand, category, key_specs, insight,
      price_indicator, release_window, amazon_link, alternatives
    ) VALUES (
      ${cleanModel},
      ${slugify(cleanModel, brand)},
      ${brand},
      ${result.identity?.category || 'Unknown'},
      ${JSON.stringify(result.identity?.keySpecs || [])}::jsonb,
      ${result.identity?.insight || ''},
      ${JSON.stringify(result.identity?.priceIndicator || null)}::jsonb,
      ${result.identity?.releaseWindow || null},
      ${result.identity?.amazonLink || null},
      ${JSON.stringify(result.alternatives || [])}::jsonb
    )
    ON CONFLICT (model_number) DO UPDATE SET
      slug = EXCLUDED.slug,
      brand = EXCLUDED.brand,
      category = EXCLUDED.category,
      key_specs = EXCLUDED.key_specs,
      insight = EXCLUDED.insight,
      price_indicator = EXCLUDED.price_indicator,
      release_window = EXCLUDED.release_window,
      amazon_link = EXCLUDED.amazon_link,
      alternatives = EXCLUDED.alternatives,
      updated_at = now()
  `;
}

export async function incrementSearchCount(model: string): Promise<void> {
  try {
    await getSql()`
      UPDATE products
      SET search_count = search_count + 1, updated_at = now()
      WHERE model_number = ${model.toUpperCase().trim()}
    `;
  } catch (error) {
    console.error('Failed to increment search count:', error);
  }
}

export async function logSearch(
  query: string,
  productId: string | null,
  source: 'camera' | 'text',
  ipHash: string
): Promise<void> {
  try {
    await getSql()`
      INSERT INTO search_history (query, product_id, source, ip_hash)
      VALUES (${query.toUpperCase().trim()}, ${productId}, ${source}, ${ipHash})
    `;
  } catch (error) {
    console.error('Failed to log search:', error);
  }
}

export async function getDailySearchCount(ipHash: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const rows = (await getSql()`
    SELECT count(*)::int AS count FROM search_history
    WHERE ip_hash = ${ipHash} AND created_at >= ${today}
  `) as unknown as { count: number }[];

  return rows?.[0]?.count || 0;
}
