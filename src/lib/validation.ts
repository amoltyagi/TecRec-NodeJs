import type { AlternativeModel, DecodeResult, PriceIndicator, TechIdentity } from '@/types';

export const MAX_MODEL_LENGTH = 200;
const MAX_BRAND_LENGTH = 80;
const MAX_CATEGORY_LENGTH = 80;
const MAX_INSIGHT_LENGTH = 600;
const MAX_SPEC_LENGTH = 200;
const MAX_SPECS = 8;
const MAX_ALTERNATIVE_MODEL_LENGTH = 80;
const MAX_ALTERNATIVE_WHY_LENGTH = 240;
const MAX_ALTERNATIVES = 6;
const MAX_WINDOW_LENGTH = 60;
const MAX_PRICE_LENGTH = 40;

/**
 * Control characters plus zero-width / bidi formatting characters. These have no
 * legitimate place in a product code and are a common way to smuggle prompt
 * instructions or mangle logs.
 */
const UNSAFE_CHARACTERS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\uFEFF]/g;

/** Normalize text: NFC, strip control characters, collapse whitespace, cap length. */
export function cleanText(input: unknown, maxLength: number): string {
  if (typeof input !== 'string' && typeof input !== 'number') return '';
  return String(input)
    .normalize('NFC')
    .replace(UNSAFE_CHARACTERS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

/** Canonical cache key for a product code. */
export function normalizeModelCode(input: unknown): string {
  return cleanText(input, MAX_MODEL_LENGTH).toUpperCase();
}

/**
 * Strip a leading brand token from a stored model code so pages do not render
 * "Sony SONY A7 IV". Model codes are stored uppercased, so the comparison is
 * case-insensitive while the remainder keeps its stored casing.
 */
export function displayModel(model: string, brand: string): string {
  const cleanModelText = cleanText(model, MAX_MODEL_LENGTH);
  const cleanBrand = cleanText(brand, MAX_BRAND_LENGTH);
  if (!cleanBrand) return cleanModelText;

  const upperModel = cleanModelText.toUpperCase();
  const candidates = [cleanBrand.toUpperCase(), cleanBrand.toUpperCase().split(' ')[0]].filter(
    (candidate) => candidate.length >= 2,
  );

  for (const candidate of candidates) {
    if (upperModel.startsWith(`${candidate} `)) {
      const stripped = cleanModelText.slice(candidate.length).trim();
      if (stripped.length >= 2) return stripped;
    }
  }

  return cleanModelText;
}

type PriceLevel = 'Value' | 'Mid-Range' | 'Premium' | 'Elite';

function normalizePercent(raw: unknown): number {
  const numeric =
    typeof raw === 'number' ? raw : Number.parseFloat(cleanText(raw, 12).replace('%', ''));
  if (!Number.isFinite(numeric)) return 50;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function normalizeLevel(raw: unknown, percent: number): PriceLevel {
  const text = cleanText(raw, 40).toLowerCase().replace(/[\s_]+/g, '-');
  if (text === 'value' || text === 'budget') return 'Value';
  if (text === 'mid-range' || text === 'midrange' || text === 'mid') return 'Mid-Range';
  if (text === 'premium') return 'Premium';
  if (text === 'elite' || text === 'luxury') return 'Elite';
  if (percent <= 25) return 'Value';
  if (percent <= 50) return 'Mid-Range';
  if (percent <= 75) return 'Premium';
  return 'Elite';
}

function normalizePriceIndicator(raw: unknown): PriceIndicator | undefined {
  const record = asRecord(raw);
  if (!record) return undefined;

  const estimatedPrice = cleanText(record.estimatedPrice, MAX_PRICE_LENGTH);
  if (!estimatedPrice) return undefined;

  // A bare percentage is meaningless as a price; require a digit in the string.
  if (!/\d/.test(estimatedPrice)) return undefined;

  const percent = normalizePercent(record.percent);
  return { level: normalizeLevel(record.level, percent), percent, estimatedPrice };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeAlternatives(raw: unknown): AlternativeModel[] {
  if (!Array.isArray(raw)) return [];

  const alternatives: AlternativeModel[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;

    const model = cleanText(record.model, MAX_ALTERNATIVE_MODEL_LENGTH);
    if (!model) continue;

    alternatives.push({
      brand: cleanText(record.brand, MAX_BRAND_LENGTH) || 'Unknown',
      model,
      why: cleanText(record.why, MAX_ALTERNATIVE_WHY_LENGTH),
    });

    if (alternatives.length >= MAX_ALTERNATIVES) break;
  }
  return alternatives;
}

export interface NormalizeOptions {
  /** AI output must state an insight; rows already in the database may not. */
  requireInsight?: boolean;
}

/**
 * Validate and normalize an untrusted decode payload (AI response or a JSONB row
 * read back from Postgres).
 *
 * Returns `null` when the payload is structurally unusable, so callers can fall
 * back to the next model instead of persisting junk. The previous implementation
 * cast `JSON.parse` straight to `DecodeResult`, which let malformed AI output
 * crash the UI and stay in the cache forever.
 */
export function normalizeDecodeResult(raw: unknown, options: NormalizeOptions = {}): DecodeResult | null {
  const root = asRecord(raw);
  if (!root) return null;

  const identityRaw = asRecord(root.identity);
  if (!identityRaw) {
    const errorText = cleanText(root.error, 200);
    return errorText ? { error: errorText } : null;
  }

  const brand = cleanText(identityRaw.brand, MAX_BRAND_LENGTH);
  const insight = cleanText(identityRaw.insight, MAX_INSIGHT_LENGTH);
  if (!brand) return null;
  if (options.requireInsight && !insight) return null;

  const keySpecsRaw = Array.isArray(identityRaw.keySpecs) ? identityRaw.keySpecs : [];
  const keySpecs = keySpecsRaw
    .map((spec) => cleanText(spec, MAX_SPEC_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_SPECS);

  const identity: TechIdentity = {
    brand,
    category: cleanText(identityRaw.category, MAX_CATEGORY_LENGTH),
    keySpecs,
    year: '',
    insight,
  };

  const releaseWindow = cleanText(identityRaw.releaseWindow, MAX_WINDOW_LENGTH);
  if (releaseWindow) identity.releaseWindow = releaseWindow;

  const explicitYear = cleanText(identityRaw.year, 4);
  const derivedYear = releaseWindow.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? '';
  identity.year = /^(?:19|20)\d{2}$/.test(explicitYear) ? explicitYear : derivedYear;

  const amazonLink = normalizeAmazonLink(identityRaw.amazonLink);
  if (amazonLink) identity.amazonLink = amazonLink;

  const priceIndicator = normalizePriceIndicator(identityRaw.priceIndicator);
  if (priceIndicator) identity.priceIndicator = priceIndicator;

  return { identity, alternatives: normalizeAlternatives(root.alternatives) };
}

const AMAZON_HOST =
  /^(?:www\.|smile\.)?amazon\.(?:com|co\.uk|de|fr|it|es|ca|com\.au|co\.jp|in|nl|se|pl|sg|com\.br|com\.mx|ae|sa|eg|tr)$/i;

/**
 * Only Amazon storefront hosts are accepted for AI- or legacy-supplied links.
 * New links are built server-side, but rows created before that change may hold
 * arbitrary URLs, so this is also applied when reading from the database.
 */
export function normalizeAmazonLink(raw: unknown): string | undefined {
  const text = cleanText(raw, 500);
  if (!text) return undefined;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }

  if (url.protocol !== 'https:') return undefined;
  if (!AMAZON_HOST.test(url.hostname)) return undefined;
  return url.toString();
}

/** Base64 image detection: magic-byte check so non-images are rejected cheaply. */
export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export function isBase64String(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.length % 4 === 1) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function detectImageMime(base64: string): SupportedImageMime | null {
  if (!isBase64String(base64)) return null;

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64.slice(0, 32), 'base64');
  } catch {
    return null;
  }
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';

  return null;
}

/** Estimated decoded size of a base64 payload, in bytes. */
export function base64SizeBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
