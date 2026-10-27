import { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  // robots.txt `Host` takes a bare hostname, not a full URL.
  let host = base;
  try {
    host = new URL(base).host;
  } catch {
    /* keep the raw value if it cannot be parsed */
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
    host,
  };
}
