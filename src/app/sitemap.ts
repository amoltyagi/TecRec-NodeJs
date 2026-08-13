import { MetadataRoute } from 'next';
import { getProductSlugs } from '@/lib/db/neon';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  // DB may be unreachable at build time locally — sitemap degrades to home-only
  const products = await getProductSlugs(1000).catch(() => []);

  return [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...products.map((p) => ({
      url: `${base}/product/${p.slug}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
