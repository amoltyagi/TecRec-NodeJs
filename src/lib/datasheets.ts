import { priceLevelForPercent, normalizeModelCode } from '@/lib/validation';
import type { AlternativeModel, DecodeResult, TechIdentity } from '@/types';

/**
 * Curated, source-checked datasheets for high-traffic products.
 *
 * The decoder's answers otherwise come from a chat model's memory, which is
 * exactly how a page ends up claiming the wrong board power or quoting a launch
 * price as the current market price. A datasheet entry replaces the model's
 * figures for the fields listed here and stamps the result as verified, so the
 * numbers a shopper sees for these products are the ones a human checked.
 *
 * Rules for adding an entry:
 *   1. Every figure needs a source in `sourceUrl`, and `verifiedOn` records when
 *      it was last checked. Reviewers rely on both.
 *   2. Powers are board power (TGP/TBP) for the reference design - never the
 *      power-supply recommendation, the 16-pin connector rating or a partner
 *      card's overclocked BIOS limit.
 *   3. `msrp` is the official US launch list price, never a street price, and
 *      the price card labels it as such.
 *   4. `pricePercent` is an editorial position of that launch price within its
 *      category (0-100); the app derives the displayed tier from it.
 *   5. A figure you cannot confirm does not go in. An entry with a wrong number
 *      is worse than the model's guess, because it is labelled "verified".
 *   6. Every entry here is priced at MSRP, which is a launch fact and does not
 *      age. If you ever add a Street-basis entry, `verifiedOn` must be the date
 *      the price was observed and `source` must say which retailer.
 *   7. List the bare model code as an alias ('5090', not only 'RTX 5090'):
 *      shoppers type the number, and a miss sends the question to the model.
 *   6. Keep `insight` qualitative and durable: no "current fastest" claims that
 *      rot, and no numbers that are not also in `keySpecs`.
 */
export interface DatasheetEntry {
  /** Canonical product name, also used as a lookup alias. */
  name: string;
  /** Extra model codes callers may ask for (matched after normalization). */
  aliases: string[];
  brand: string;
  category: string;
  /** Three short specs: value + unit + basis wherever the basis is ambiguous. */
  keySpecs: string[];
  releaseWindow: string;
  year: string;
  /** Official US launch list price, formatted for display. */
  msrp: string;
  /** Editorial position of that price within its category, 0-100. */
  pricePercent: number;
  /**
   * Optional dated street observation. When present it becomes the headline
   * price (basis `Street`, shown with its observation date) and `msrp` is kept
   * as the small anchor line under it.
   *
   * Rules: only record a price a first-party US retailer actually lists (never
   * a marketplace, resale or tracker aggregate), name that retailer in
   * `source`, and set `observedOn` to when the price was reported. `percent` is
   * scored against current street prices, not launch MSRPs. A street price rots
   * fast - re-check it far more often than `verifiedOn`.
   */
  street?: {
    price: string;
    /** ISO date the price was reported; the card renders "as of <Mon YYYY>". */
    observedOn: string;
    /** First-party retailer behind the observation. */
    source: string;
    /** Tier position scored against current street prices, 0-100. */
    percent: number;
  };
  /** Qualitative one- or two-sentence verdict. */
  insight: string;
  /** Curated alternatives; qualitative only, so they cannot go stale as numbers. */
  alternatives: AlternativeModel[];
  /** Short provenance label shown in the UI. */
  source: string;
  /** ISO date (YYYY-MM-DD) this entry was last checked against the sources. */
  verifiedOn: string;
  /** Primary source for the figures above. Documentation only, never rendered. */
  sourceUrl: string;
}

export const DATASHEET_ENTRIES: DatasheetEntry[] = [
  {
    name: 'NVIDIA GeForce RTX 5090',
    aliases: ['RTX 5090', 'GeForce RTX 5090', 'NVIDIA RTX 5090', '5090'],
    brand: 'NVIDIA',
    category: 'Desktop Graphics Card',
    keySpecs: [
      '32 GB GDDR7 (512-bit, ~1,792 GB/s)',
      '21,760 CUDA cores (Blackwell, GB202)',
      '575 W TGP (reference design)',
    ],
    releaseWindow: 'January 2025',
    year: '2025',
    msrp: '$1,999',
    pricePercent: 98,
    // Shortage pricing: retailers list far above launch MSRP. Reported Oct-Nov 2026.
    street: { price: '$6,250', observedOn: '2026-11-01', source: 'Newegg first-party listing', percent: 100 },
    insight:
      'Flagship of the 50-series: 32 GB of GDDR7 on a 512-bit bus for 4K gaming and local AI workloads, with a 575 W board power and a 1,000 W-class power-supply recommendation.',
    alternatives: [
      { brand: 'NVIDIA', model: 'GeForce RTX 4090', why: 'Previous-generation flagship with 24 GB of memory and a 450 W board.' },
      { brand: 'NVIDIA', model: 'GeForce RTX 5080', why: 'Same generation at about half the launch price, with half the memory and a 360 W board.' },
      { brand: 'AMD', model: 'Radeon RX 7900 XTX', why: '24 GB of memory and strong rasterised performance at about half the launch price, with weaker ray tracing.' },
    ],
    source: 'Manufacturer spec page',
    verifiedOn: '2026-11-14',
    sourceUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/',
  },
  {
    name: 'NVIDIA GeForce RTX 5080',
    aliases: ['RTX 5080', 'GeForce RTX 5080', 'NVIDIA RTX 5080', '5080'],
    brand: 'NVIDIA',
    category: 'Desktop Graphics Card',
    keySpecs: ['16 GB GDDR7 (256-bit)', '10,752 CUDA cores (Blackwell, GB203)', '360 W TGP (reference design)'],
    releaseWindow: 'January 2025',
    year: '2025',
    msrp: '$999',
    pricePercent: 72,
    insight:
      'The 50-series high end: half the flagship’s memory and a 360 W board power, enough for high-refresh 4K gaming with upscaling.',
    alternatives: [
      { brand: 'NVIDIA', model: 'GeForce RTX 5090', why: 'The flagship of the same generation: twice the memory, a 575 W board and twice the launch price.' },
      { brand: 'NVIDIA', model: 'GeForce RTX 4090', why: 'Previous-generation flagship with 24 GB of memory, a higher board power and a higher launch price.' },
      { brand: 'AMD', model: 'Radeon RX 7900 XTX', why: '24 GB of memory at the same launch price, with weaker ray tracing and upscaling.' },
    ],
    source: 'Manufacturer spec page',
    verifiedOn: '2026-11-14',
    sourceUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5080/',
  },
  {
    name: 'NVIDIA GeForce RTX 4090',
    aliases: ['RTX 4090', 'GeForce RTX 4090', 'NVIDIA RTX 4090', '4090'],
    brand: 'NVIDIA',
    category: 'Desktop Graphics Card',
    keySpecs: [
      '24 GB GDDR6X (384-bit)',
      '16,384 CUDA cores (Ada Lovelace, AD102)',
      '450 W TGP (reference design)',
    ],
    releaseWindow: 'October 2022',
    year: '2022',
    msrp: '$1,599',
    pricePercent: 88,
    insight:
      'Previous-generation flagship: 24 GB of GDDR6X and enough performance for 4K gaming and large local models, at a 450 W board power and used-market prices.',
    alternatives: [
      { brand: 'NVIDIA', model: 'GeForce RTX 5090', why: 'Its successor: more memory, a higher board power and a higher launch price.' },
      { brand: 'NVIDIA', model: 'GeForce RTX 5080', why: 'Same brand at a lower launch price, with half the memory and a 360 W board.' },
      { brand: 'AMD', model: 'Radeon RX 7900 XTX', why: 'The same 24 GB of memory and strong rasterised performance, with weaker ray tracing.' },
    ],
    source: 'Manufacturer spec page',
    verifiedOn: '2026-11-14',
    sourceUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/',
  },
  {
    name: 'AMD Radeon RX 7900 XTX',
    aliases: ['RX 7900 XTX', 'Radeon RX 7900 XTX', 'AMD RX 7900 XTX', '7900 XTX'],
    brand: 'AMD',
    category: 'Desktop Graphics Card',
    keySpecs: ['24 GB GDDR6 (384-bit)', '6,144 stream processors (RDNA 3, Navi 31)', '355 W TBP (reference design)'],
    releaseWindow: 'December 2022',
    year: '2022',
    msrp: '$999',
    pricePercent: 68,
    insight:
      'AMD’s previous-generation flagship: 24 GB of GDDR6 and strong rasterised performance for the price, with ray tracing and upscaling a step behind the competition.',
    alternatives: [
      { brand: 'NVIDIA', model: 'GeForce RTX 5080', why: 'The same launch price, with less memory but stronger ray tracing and upscaling.' },
      { brand: 'NVIDIA', model: 'GeForce RTX 4090', why: 'Previous-generation flagship with the same 24 GB of memory, a higher board power and a higher launch price.' },
      { brand: 'AMD', model: 'Radeon RX 7900 XT', why: 'Same family for less money, with less memory and fewer stream processors.' },
    ],
    source: 'Manufacturer spec page',
    verifiedOn: '2026-11-14',
    sourceUrl:
      'https://www.amd.com/en/newsroom/press-releases/2022-11-3-amd-unveils-world-s-most-advanced-gaming-graphics-.html',
  },
  {
    name: 'NVIDIA GeForce RTX 5070 Ti',
    aliases: ['RTX 5070 Ti', 'GeForce RTX 5070 Ti', 'NVIDIA RTX 5070 Ti', '5070 Ti'],
    brand: 'NVIDIA',
    category: 'Desktop Graphics Card',
    keySpecs: ['16 GB GDDR7 (256-bit)', '8,960 CUDA cores (Blackwell)', '300 W TGP (reference, no Founders Edition)'],
    releaseWindow: 'February 2025',
    year: '2025',
    msrp: '$749',
    pricePercent: 62,
    insight:
      'The upper-mid 50-series card: 16 GB of GDDR7 and a 300 W reference board power. It launched without a reference design, so every card you can buy is a partner model with its own cooler and factory clock.',
    alternatives: [
      { brand: 'NVIDIA', model: 'GeForce RTX 5080', why: 'The next step up: more memory, a higher board power and a higher launch price.' },
      { brand: 'NVIDIA', model: 'GeForce RTX 5070', why: 'Same generation and architecture at a lower launch price, with less memory and fewer cores.' },
      { brand: 'AMD', model: 'Radeon RX 9070 XT', why: "AMD's competing card in the same class, with different ray-tracing and upscaling strengths." },
    ],
    source: 'Manufacturer spec page',
    verifiedOn: '2026-11-14',
    sourceUrl: 'https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/',
  },
  {
    name: 'Samsung 990 PRO',
    aliases: ['990 PRO', 'Samsung 990 PRO SSD', 'SAMSUNG 990 PRO'],
    brand: 'Samsung',
    category: 'Internal SSD',
    keySpecs: [
      'PCIe 4.0 x4 NVMe, M.2 2280',
      '7,450 / 6,900 MB/s sequential (1 TB and 2 TB)',
      '600 TBW (1 TB) / 1,200 TBW (2 TB)',
    ],
    releaseWindow: 'November 2022',
    year: '2022',
    msrp: '$169.99 (1 TB)',
    pricePercent: 70,
    insight:
      'A PCIe 4.0 drive aimed at gaming and creative work: sequential speeds sit close to what the interface allows. Write speed is identical across capacities, but endurance scales with size, so compare TBW and price per terabyte rather than the headline number.',
    alternatives: [
      { brand: 'Samsung', model: '990 EVO', why: "The same brand's mainstream drive: a step down in speed and endurance for less money." },
      { brand: 'Western Digital', model: 'Black SN850X', why: 'A competing PCIe 4.0 gaming drive in the same speed class.' },
      { brand: 'Samsung', model: '980 PRO', why: 'The previous generation of the same line, usually cheaper.' },
    ],
    source: 'Manufacturer datasheet',
    verifiedOn: '2026-11-14',
    sourceUrl: 'https://semiconductor.samsung.com/consumer-storage/internal-ssd/990-pro/',
  },
  {
    name: 'Sony Alpha 7 IV',
    aliases: ['A7 IV', 'Sony A7 IV', 'Alpha 7 IV', 'ILCE-7M4'],
    brand: 'Sony',
    category: 'Mirrorless Camera',
    keySpecs: ['33 MP full-frame BSI CMOS', '4K 60p in Super 35 crop, 10-bit 4:2:2', '5.5-stop IBIS (CIPA, stills)'],
    releaseWindow: 'December 2021',
    year: '2021',
    msrp: '$2,499.99 (body only)',
    pricePercent: 72,
    // Body-only price after the 2026 cut. Reported Oct 2026.
    street: { price: '$1,998', observedOn: '2026-10-01', source: 'B&H / Amazon first-party', percent: 65 },
    insight:
      'A hybrid full-frame body: 33 MP stills, 10-bit 4:2:2 video and 5.5 stops of stabilisation. Its 4K 60p mode crops to Super 35, so full-frame video tops out at 4K 30p.',
    alternatives: [
      { brand: 'Sony', model: 'Alpha 7 III', why: 'The previous generation: lower resolution and more basic video, for much less money.' },
      { brand: 'Sony', model: 'Alpha 7C II', why: 'A similar sensor and autofocus system in a much smaller body with a smaller viewfinder.' },
      { brand: 'Canon', model: 'EOS R6 Mark II', why: 'A competing hybrid with full-frame 4K 60p, at a lower resolution.' },
    ],
    source: 'Manufacturer spec page',
    verifiedOn: '2026-11-14',
    sourceUrl: 'https://electronics.sony.com/imaging/interchangeable-lens-cameras/all-interchangeable-lens-cameras/p/ilce7m4-b',
  },
];

/**
 * Words that carry no identifying information in a model code. Removing them
 * makes "NVIDIA GEFORCE RTX 5090" and "RTX 5090" the same key, so a datasheet
 * matches however the shopper (or the vision model) spelled the request.
 */
const GENERIC_TOKENS = new Set([
  'NVIDIA',
  'AMD',
  'INTEL',
  'GEFORCE',
  'RADEON',
  'GRAPHICS',
  'CARD',
  'DESKTOP',
  'GPU',
  'SSD',
  'NVME',
  'MIRRORLESS',
  'CAMERA',
  'BODY',
  'ONLY',
  'EDITION',
  'FOUNDERS',
  'FE',
  'SERIES',
]);

/** Canonical lookup key for a model code or datasheet alias. */
export function datasheetKey(model: string): string {
  return normalizeModelCode(model)
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 0 && !GENERIC_TOKENS.has(token))
    .join(' ');
}

const INDEX: Map<string, DatasheetEntry> = (() => {
  const index = new Map<string, DatasheetEntry>();
  for (const entry of DATASHEET_ENTRIES) {
    for (const alias of [entry.name, ...entry.aliases]) {
      for (const key of lookupKeys(alias)) {
        const existing = index.get(key);
        if (existing && existing !== entry) {
          // A silent collision would serve one product's specs for another; make
          // it a loud failure instead (the unit test covers this too).
          throw new Error(`Datasheet key collision on "${key}"`);
        }
        index.set(key, entry);
      }
    }
  }
  return index;
})();

/**
 * Board power, memory and price differ sharply between a desktop card and the
 * laptop part that shares its name. A label reading "RTX 5090 Laptop GPU" must
 * never inherit the desktop datasheet, so mobile wording disqualifies a match
 * instead of being normalized away.
 */
const MOBILE_TOKENS = new Set(['LAPTOP', 'MOBILE', 'NOTEBOOK', 'MAXQ', 'MAX-Q']);

function isMobileVariant(model: string): boolean {
  return normalizeModelCode(model)
    .split(/[^A-Z0-9]+/)
    .some((token) => MOBILE_TOKENS.has(token));
}

/** Spaced and compact forms, so "RTX 5090", "RTX5090" and "RTX 5070Ti" all hit. */
function lookupKeys(model: string): string[] {
  const key = datasheetKey(model);
  if (!key) return [];
  const compact = key.replace(/ /g, '');
  return compact === key ? [key] : [key, compact];
}

export function lookupDatasheet(model: string): DatasheetEntry | undefined {
  if (isMobileVariant(model)) return undefined;
  for (const key of lookupKeys(model)) {
    const entry = INDEX.get(key);
    if (entry) return entry;
  }
  return undefined;
}

/**
 * Canonical cache key for a verified product, or `null` when no datasheet
 * covers it.
 *
 * Without this, "RTX 5090", "nvidia geforce rtx 5090" and "RTX 5090 FE" would
 * each be stored as a separate row (the cache is keyed on the caller's string),
 * creating duplicate SEO pages for the same product.
 */
export function datasheetCanonicalModel(model: string): string | null {
  return lookupDatasheet(model)?.name ?? null;
}

/**
 * Replace every field the datasheet covers and stamp the result as verified.
 *
 * Called both for fresh decodes and for rows read back from the cache, so a
 * wrong figure that was stored before its datasheet existed is corrected on
 * read instead of being served until the TTL expires.
 */
export function applyDatasheet(model: string, result: DecodeResult): DecodeResult {
  const entry = lookupDatasheet(model);
  if (!entry || !result.identity) return result;

  const identity: TechIdentity = {
    ...result.identity,
    brand: entry.brand,
    category: entry.category,
    keySpecs: [...entry.keySpecs],
    insight: entry.insight,
    releaseWindow: entry.releaseWindow,
    year: entry.year,
    // A dated street observation wins as the headline; the launch MSRP stays
    // visible as `listPrice` so the card never hides what it cost at launch.
    priceIndicator: entry.street
      ? {
          level: priceLevelForPercent(entry.street.percent),
          percent: entry.street.percent,
          estimatedPrice: entry.street.price,
          basis: 'Street',
          observedOn: entry.street.observedOn,
          listPrice: entry.msrp,
        }
      : {
          level: priceLevelForPercent(entry.pricePercent),
          percent: entry.pricePercent,
          estimatedPrice: entry.msrp,
          basis: 'MSRP',
        },
    verified: { asOf: entry.verifiedOn, source: entry.source },
  };

  // Alternatives are curated too: their "why" sentences carry spec claims, and a
  // model-written alternative next to verified specs would reintroduce exactly
  // the drift this layer exists to remove.
  return { ...result, identity, alternatives: entry.alternatives.map((alternative) => ({ ...alternative })) };
}
