import { getProductSlugs } from '@/lib/db/neon';
import { getSiteUrl } from '@/lib/env';

/**
 * Served as a route handler rather than `sitemap.ts` because a static metadata
 * file is generated once at build time: products decoded after deployment would
 * never appear until the next deploy. This stays dynamic and lets the CDN hold
 * the result for an hour.
 */
export const dynamic = 'force-dynamic';

const MAX_PRODUCTS = 1000;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const base = getSiteUrl();
  let products: { slug: string; updated_at: string }[] = [];

  try {
    products = await getProductSlugs(MAX_PRODUCTS);
  } catch (error) {
    // Degrade to the home page rather than serving a 500 to crawlers, but make
    // the failure visible in logs instead of silently baking an empty sitemap.
    console.error('Sitemap: failed to load products:', error);
  }

  const urls = [
    `  <url><loc>${escapeXml(base)}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    ...products.map((product) => {
      const lastModified = new Date(product.updated_at);
      const lastmod = Number.isNaN(lastModified.getTime())
        ? ''
        : `<lastmod>${lastModified.toISOString()}</lastmod>`;
      return `  <url><loc>${escapeXml(`${base}/product/${encodeURIComponent(product.slug)}`)}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.7</priority></url>`;
    }),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
