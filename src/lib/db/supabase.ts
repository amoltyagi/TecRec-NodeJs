import { createClient } from '@supabase/supabase-js';
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

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set in environment');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

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
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('model_number', model.toUpperCase().trim())
    .single();

  if (error || !data) return null;
  return rowToDecodeResult(data as ProductRow);
}

export async function saveProduct(model: string, result: DecodeResult): Promise<void> {
  const cleanModel = model.toUpperCase().trim();
  const existing = await supabase
    .from('products')
    .select('id')
    .eq('model_number', cleanModel)
    .maybeSingle();

  const row = {
    model_number: cleanModel,
    slug: slugify(cleanModel, result.identity?.brand || 'unknown'),
    brand: result.identity?.brand || 'Unknown',
    category: result.identity?.category || 'Unknown',
    key_specs: result.identity?.keySpecs || [],
    insight: result.identity?.insight || '',
    price_indicator: result.identity?.priceIndicator || null,
    release_window: result.identity?.releaseWindow || null,
    amazon_link: result.identity?.amazonLink || null,
    alternatives: result.alternatives || [],
  };

  if (existing?.data) {
    await supabase.from('products').update(row).eq('model_number', cleanModel);
  } else {
    await supabase.from('products').insert({ ...row, search_count: 1 });
  }
}

export async function incrementSearchCount(model: string): Promise<void> {
  const { error } = await supabase.rpc('increment_search', {
    target_model: model.toUpperCase().trim(),
  });
  if (error) {
    console.error('Failed to increment search count:', error);
  }
}

export async function logSearch(
  query: string,
  productId: string | null,
  source: 'camera' | 'text',
  ipHash: string
): Promise<void> {
  const { error } = await supabase.from('search_history').insert({
    query: query.toUpperCase().trim(),
    product_id: productId,
    source,
    ip_hash: ipHash,
  });
  if (error) {
    console.error('Failed to log search:', error);
  }
}

export async function getDailySearchCount(ipHash: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const { count, error } = await supabase
    .from('search_history')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', today);

  if (error) return 0;
  return count || 0;
}