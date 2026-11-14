import { buildAmazonSearchLink } from '@/lib/affiliate';
import { decodeModel } from '@/lib/ai/provider';
import { applyDatasheet, lookupDatasheet } from '@/lib/datasheets';
import { displayModel, normalizeDecodeResult } from '@/lib/validation';
import type { DecodeResult } from '@/types';

/**
 * Answer a model code from a curated datasheet alone.
 *
 * Returns `null` when no entry covers the code, so callers can fall through to
 * the paid path. The payload is built here rather than in `datasheets.ts` so it
 * still passes through the same normalizer as AI output: one shape, one set of
 * length limits, no second validation path to keep in sync.
 */
export function datasheetDecode(model: string): DecodeResult | null {
  const entry = lookupDatasheet(model);
  if (!entry) return null;

  const normalized = normalizeDecodeResult(
    {
      identity: {
        brand: entry.brand,
        category: entry.category,
        keySpecs: entry.keySpecs,
        insight: entry.insight,
        releaseWindow: entry.releaseWindow,
        year: entry.year,
        priceIndicator: {
          percent: entry.pricePercent,
          estimatedPrice: entry.msrp,
          basis: 'MSRP',
        },
      },
      alternatives: entry.alternatives,
    },
    { requireInsight: true },
  );
  if (!normalized?.identity) return null;

  const amazonLink = buildAmazonSearchLink(entry.brand, displayModel(model, entry.brand));
  if (amazonLink) normalized.identity.amazonLink = amazonLink;

  return applyDatasheet(model, normalized);
}

/**
 * Decode a model code: verified datasheet first, AI provider for everything else.
 *
 * Datasheet hits skip the model entirely — they cost nothing, answer instantly
 * and cannot hallucinate. AI results are still passed through the datasheet
 * merge afterwards, so a curated product can never display a model's figure for
 * a field the datasheet covers.
 */
export async function decodeProduct(model: string): Promise<DecodeResult> {
  const curated = datasheetDecode(model);
  if (curated) return curated;

  const decoded = await decodeModel(model);
  if (decoded.error || !decoded.identity) return decoded;

  return applyDatasheet(model, decoded);
}
