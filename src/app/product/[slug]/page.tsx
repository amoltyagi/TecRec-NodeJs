import { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ArrowLeft, Cpu, Layers, ScanSearch } from 'lucide-react';
import { getProductBySlug, getProductSlugByModel } from '@/lib/db/neon';
import { getSiteUrl } from '@/lib/env';
import { displayModel } from '@/lib/validation';
import { ProductIdentity } from '@/components/results/ProductIdentity';
import { PriceMeter } from '@/components/results/PriceMeter';

// ISR: built on first request, cached at the CDN, regenerated at most once a day.
export const revalidate = 86400;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 90;

interface PageProps {
  params: Promise<{ slug: string }>;
}

function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = rawSlug.trim().toLowerCase();
  if (!isValidSlug(slug)) {
    return { title: 'Product Not Found - TecRec Universal', robots: { index: false, follow: false } };
  }

  const product = await getProductBySlug(slug);
  if (!product) {
    return { title: 'Product Not Found - TecRec Universal', robots: { index: false, follow: false } };
  }

  const identity = product.result.identity;
  if (!identity) {
    return { title: 'Product Not Found - TecRec Universal', robots: { index: false, follow: false } };
  }

  const brand = identity.brand;
  const model = displayModel(product.model, brand);
  const title = `${brand} ${model}: Specs, Price & Alternatives - TecRec Universal`;
  const description = (
    identity.insight ||
    `Decode the ${brand} ${model}: specs, release date, market pricing and alternatives.`
  ).slice(0, 160);
  const canonical = `/product/${product.slug}`;

  const indexable =
    brand !== 'Unknown' &&
    identity.insight.length >= 40 &&
    identity.keySpecs.length > 0 &&
    !product.isStale;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, type: 'article', url: canonical },
    robots: indexable ? undefined : { index: false, follow: true },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug: rawSlug } = await params;
  const slug = rawSlug.trim();

  // Canonicalise case variants instead of serving the same product at many URLs.
  if (slug !== slug.toLowerCase()) {
    permanentRedirect(`/product/${encodeURIComponent(slug.toLowerCase())}`);
  }
  if (!isValidSlug(slug)) notFound();

  // DB errors are allowed to throw so the error boundary renders a retryable 500
  // rather than a 404 that search engines read as "this page was removed".
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const { identity, alternatives } = product.result;
  if (!identity) notFound();

  const siteUrl = getSiteUrl();
  const brand = identity.brand;
  const model = displayModel(product.model, brand);
  const priceIndicator = identity.priceIndicator;
  const stale = product.isStale;

  // Alternatives link to their own cached page when one exists: a crawlable
  // internal link instead of a client-rendered deep link that can cost an AI call.
  const alternativeLinks = await Promise.all(
    (alternatives ?? []).map(async (alternative) => ({
      alternative,
      slug: await getProductSlugByModel(`${alternative.brand} ${alternative.model}`).catch(() => null),
    })),
  );

  // Product structured data intentionally omits `offers`: the price is an AI
  // estimate, not a merchant offer, and publishing invented prices as structured
  // data violates search-engine guidance and invites manual actions.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${brand} ${model}`,
    url: `${siteUrl}/product/${product.slug}`,
    ...(identity.category ? { category: identity.category } : {}),
    description: identity.insight,
    sku: product.model,
    brand: { '@type': 'Brand', name: brand },
    ...(identity.keySpecs.length > 0
      ? {
          additionalProperty: identity.keySpecs.map((spec) => ({
            '@type': 'PropertyValue',
            name: 'Key specification',
            value: spec,
          })),
        }
      : {}),
  };

  return (
    <div className="relative min-h-dvh w-full flex flex-col items-center px-safe pt-safe pb-safe sm:p-6 lg:p-10 font-sans antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <div className="w-full max-w-3xl z-10 flex flex-col">
        <header className="flex items-center justify-between py-5 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm font-bold"
          >
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400">
              <Cpu className="w-4 h-4" />
            </span>
            TecRec <span className="text-emerald-400">Universal</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all text-xs font-bold uppercase tracking-widest"
          >
            <ScanSearch className="w-4 h-4" />
            Decode a model
          </Link>
        </header>

        <article className="liquid-glass specular-highlight w-full rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 text-white relative overflow-hidden">
          <header className="mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/70 transition-colors text-[10px] font-bold uppercase tracking-widest mb-4"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Decoder
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              {brand} <span className="text-emerald-400">{model}</span>
            </h1>
            <p className="text-sm sm:text-base text-white/50 mt-2 font-light">
              {identity.category}
              {identity.releaseWindow ? ` - Released ${identity.releaseWindow}` : ''}
            </p>
          </header>

          <div className="space-y-4">
            <ProductIdentity identity={identity} entrance={false} />
            {priceIndicator && <PriceMeter indicator={priceIndicator} entrance={false} />}
          </div>

          {alternativeLinks.length > 0 && (
            <section className="pt-6 mt-6 border-t border-white/10">
              <h2 className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40 mb-4 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Alternatives to consider
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {alternativeLinks.map(({ alternative, slug: alternativeSlug }, index) => (
                  <Link
                    key={`${alternative.brand}-${alternative.model}-${index}`}
                    href={
                      alternativeSlug
                        ? `/product/${alternativeSlug}`
                        : `/?q=${encodeURIComponent(`${alternative.brand} ${alternative.model}`)}`
                    }
                    className="p-4 sm:p-5 text-left rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group block"
                  >
                    <div className="flex items-center gap-2 mb-1.5 min-w-0">
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded-md shrink-0">
                        {alternative.brand}
                      </span>
                      <span className="text-sm font-bold text-white/90 truncate">{alternative.model}</span>
                    </div>
                    <p className="text-xs text-white/50 leading-snug line-clamp-2">{alternative.why}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <p className="text-[11px] text-white/40 mt-8 leading-relaxed">
            Specs, release timing and pricing are AI-estimated from public web sources and may be
            outdated or inaccurate - verify before purchasing.
            {stale ? ' This entry has not been refreshed recently.' : ''}
          </p>
        </article>
      </div>
    </div>
  );
}
