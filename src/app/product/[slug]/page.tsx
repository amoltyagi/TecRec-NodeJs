import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Cpu, Layers, ScanSearch } from 'lucide-react';
import { getProductBySlug } from '@/lib/db/neon';
import { ProductIdentity } from '@/components/results/ProductIdentity';
import { PriceMeter } from '@/components/results/PriceMeter';

// ISR: product pages are generated on first request, cached at the CDN, and
// regenerated at most once per day. New products get pages automatically
// (dynamicParams defaults to true).
export const revalidate = 86400;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug).catch(() => null);
  if (!product) return { title: 'Product Not Found — TecRec Universal' };

  const { model, result } = product;
  const brand = result.identity?.brand || '';
  const title = `${brand} ${model}: Specs, Price & Alternatives — TecRec Universal`;
  const description = (result.identity?.insight || `Decode the ${brand} ${model}: specs, release date, market pricing and alternatives.`).slice(0, 160);

  return {
    title,
    description,
    alternates: { canonical: `${siteUrl}/product/${slug}` },
    openGraph: { title, description, type: 'article' },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug).catch(() => null);
  if (!product) notFound();

  const { model, result } = product;
  const { identity, alternatives } = result;
  if (!identity) notFound();
  const priceIndicator = identity.priceIndicator;

  // Structured data for Google rich results. JSON-LD injection is safe here:
  // content is JSON.stringify'd and `<` escaped (standard Next.js pattern).
  const numericPrice = priceIndicator
    ? parseFloat(priceIndicator.estimatedPrice.replace(/[^0-9.]/g, ''))
    : NaN;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${identity.brand} ${model}`,
    brand: { '@type': 'Brand', name: identity.brand },
    category: identity.category,
    description: identity.insight,
    ...(identity.amazonLink && Number.isFinite(numericPrice)
      ? {
          offers: {
            '@type': 'Offer',
            price: numericPrice,
            priceCurrency: 'USD',
            url: identity.amazonLink,
            availability: 'https://schema.org/InStock',
          },
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
        {/* Top bar */}
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

        {/* Product card */}
        <article className="liquid-glass specular-highlight w-full rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 text-white relative overflow-hidden">
          <header className="mb-6">
            <Link href="/" className="inline-flex items-center gap-1.5 text-white/30 hover:text-white/70 transition-colors text-[10px] font-bold uppercase tracking-widest mb-4">
              <ArrowLeft className="w-3.5 h-3.5" /> Decoder
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
              {identity.brand} <span className="text-emerald-400">{model}</span>
            </h1>
            <p className="text-sm sm:text-base text-white/40 mt-2 font-light">
              {identity.category}
              {identity.releaseWindow ? ` · Released ${identity.releaseWindow}` : ''}
            </p>
          </header>

          <div className="space-y-4">
            <ProductIdentity identity={identity} />
            {priceIndicator && <PriceMeter indicator={priceIndicator} delay={0.2} />}
          </div>

          {alternatives && alternatives.length > 0 && (
            <section className="pt-6 mt-6 border-t border-white/10">
              <h2 className="text-[10px] uppercase tracking-[0.3em] font-black text-white/20 mb-4 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Alternatives to consider
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {alternatives.map((alt, i) => (
                  <Link
                    key={i}
                    href={`/?q=${encodeURIComponent(`${alt.brand} ${alt.model}`)}`}
                    className="p-4 sm:p-5 text-left rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all group block"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                        {alt.brand}
                      </span>
                      <span className="text-sm font-bold text-white/90 truncate">{alt.model}</span>
                    </div>
                    <p className="text-xs text-white/40 leading-snug line-clamp-2">{alt.why}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <p className="text-[10px] text-white/20 mt-8 leading-relaxed">
            Specs, release timing and pricing are estimated by AI from public web sources and may
            be outdated or inaccurate — verify before purchasing.
          </p>
        </article>
      </div>
    </div>
  );
}
