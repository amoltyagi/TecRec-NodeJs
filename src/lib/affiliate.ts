/**
 * Outbound product links are built server-side from validated fields, not taken
 * from AI output. An AI-supplied URL is an arbitrary-URL trust sink: a
 * prompt-injected decode could put a phishing host behind a link labelled
 * "Amazon".
 */

const AMAZON_BASE = 'https://www.amazon.com/s';

export interface AmazonLinkOptions {
  affiliateTag?: string;
}

/** Build a US Amazon search URL for a product. Returns undefined for empty input. */
export function buildAmazonSearchLink(
  brand: string,
  model: string,
  options: AmazonLinkOptions = {},
): string | undefined {
  const query = [brand, model]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!query) return undefined;

  const params = new URLSearchParams({ k: query });
  const tag = (options.affiliateTag ?? process.env.AMAZON_AFFILIATE_TAG ?? '').trim();
  if (tag) params.set('tag', tag);

  return `${AMAZON_BASE}?${params.toString()}`;
}
