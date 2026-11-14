import { describe, expect, it } from 'vitest';
import {
  base64SizeBytes,
  cleanText,
  detectImageMime,
  displayModel,
  isBase64String,
  normalizeAmazonLink,
  normalizeDecodeResult,
  normalizeModelCode,
} from '@/lib/validation';

const validPayload = {
  identity: {
    brand: 'Sony',
    category: 'Mirrorless Camera',
    keySpecs: ['33MP full-frame', '4K 60p', '5-axis IBIS'],
    year: '2022',
    releaseWindow: 'Q4 2022',
    insight: 'A well-rounded hybrid camera for stills and video.',
    priceIndicator: { level: 'Premium', percent: 72, estimatedPrice: '$2,499' },
  },
  alternatives: [
    { brand: 'Canon', model: 'EOS R6 II', why: 'Similar hybrid performance' },
    { brand: 'Nikon', model: 'Z6 III', why: 'Comparable price and specs' },
  ],
};

describe('cleanText', () => {
  it('collapses whitespace and trims', () => {
    expect(cleanText('  Sony   A7   IV  ', 100)).toBe('Sony A7 IV');
  });

  it('strips control and zero-width characters', () => {
    expect(cleanText('A7\u0000IV\u200b', 100)).toBe('A7 IV');
  });

  it('caps length', () => {
    expect(cleanText('x'.repeat(50), 10)).toHaveLength(10);
  });

  it('returns empty string for non-strings', () => {
    expect(cleanText({ a: 1 }, 10)).toBe('');
    expect(cleanText(null, 10)).toBe('');
  });
});

describe('normalizeModelCode', () => {
  it('uppercases and collapses internal whitespace', () => {
    expect(normalizeModelCode('  sony   a7  iv ')).toBe('SONY A7 IV');
  });
});

describe('displayModel', () => {
  it('strips a leading brand token', () => {
    expect(displayModel('SONY A7 IV', 'Sony')).toBe('A7 IV');
  });

  it('strips multi-word brands', () => {
    expect(displayModel('SAMSUNG ELECTRONICS 990 PRO', 'Samsung Electronics')).toBe('990 PRO');
  });

  it('keeps the model when the brand does not prefix it', () => {
    expect(displayModel('WGG24401GB', 'Bosch')).toBe('WGG24401GB');
  });

  it('does not reduce the model to a fragment', () => {
    expect(displayModel('LG', 'LG')).toBe('LG');
  });
});

describe('normalizeDecodeResult', () => {
  it('accepts a valid payload', () => {
    const result = normalizeDecodeResult(validPayload, { requireInsight: true });
    expect(result?.identity?.brand).toBe('Sony');
    expect(result?.identity?.keySpecs).toHaveLength(3);
    expect(result?.identity?.priceIndicator?.percent).toBe(72);
    expect(result?.alternatives).toHaveLength(2);
  });

  it('rejects a payload without identity', () => {
    expect(normalizeDecodeResult({ alternatives: [] })).toBeNull();
    expect(normalizeDecodeResult('nope')).toBeNull();
    expect(normalizeDecodeResult(null)).toBeNull();
  });

  it('propagates an explicit model error', () => {
    expect(normalizeDecodeResult({ error: 'unknown product' })).toEqual({ error: 'unknown product' });
  });

  it('rejects AI output without an insight when required', () => {
    const noInsight = { identity: { brand: 'Sony', keySpecs: ['x'] } };
    expect(normalizeDecodeResult(noInsight, { requireInsight: true })).toBeNull();
    expect(normalizeDecodeResult(noInsight, { requireInsight: false })?.identity?.brand).toBe('Sony');
  });

  it('coerces a non-array keySpecs to an empty list instead of crashing the UI', () => {
    const result = normalizeDecodeResult({
      identity: { brand: 'Sony', insight: 'ok', keySpecs: 'not-an-array' },
    });
    expect(result?.identity?.keySpecs).toEqual([]);
  });

  it('caps spec and alternative counts', () => {
    const result = normalizeDecodeResult({
      identity: { brand: 'Sony', insight: 'ok', keySpecs: Array.from({ length: 20 }, (_, i) => `spec ${i}`) },
      alternatives: Array.from({ length: 20 }, (_, i) => ({ brand: 'B', model: `M${i}`, why: 'w' })),
    });
    expect(result?.identity?.keySpecs).toHaveLength(8);
    expect(result?.alternatives).toHaveLength(6);
  });

  it('keeps a legitimate 0 percent instead of defaulting to 50', () => {
    const result = normalizeDecodeResult({
      identity: {
        brand: 'Sony',
        insight: 'ok',
        priceIndicator: { level: 'Value', percent: 0, estimatedPrice: '$99' },
      },
    });
    expect(result?.identity?.priceIndicator?.percent).toBe(0);
    expect(result?.identity?.priceIndicator?.level).toBe('Value');
  });

  it('clamps out-of-range and string percents', () => {
    const high = normalizeDecodeResult({
      identity: { brand: 'B', insight: 'ok', priceIndicator: { percent: 250, estimatedPrice: '$1' } },
    });
    expect(high?.identity?.priceIndicator?.percent).toBe(100);

    const stringy = normalizeDecodeResult({
      identity: { brand: 'B', insight: 'ok', priceIndicator: { percent: '55', estimatedPrice: '$1' } },
    });
    expect(stringy?.identity?.priceIndicator?.percent).toBe(55);
    expect(stringy?.identity?.priceIndicator?.level).toBe('Premium');
  });

  it('drops a price indicator without a usable price', () => {
    const result = normalizeDecodeResult({
      identity: { brand: 'B', insight: 'ok', priceIndicator: { percent: 30, estimatedPrice: 'unknown' } },
    });
    expect(result?.identity?.priceIndicator).toBeUndefined();
  });

  it('derives the tier from the percentage so the label and the bar cannot disagree', () => {
    const result = normalizeDecodeResult({
      identity: {
        brand: 'NVIDIA',
        insight: 'ok',
        priceIndicator: { level: 'Value', percent: 96, estimatedPrice: '$1,999', basis: 'MSRP' },
      },
    });
    expect(result?.identity?.priceIndicator?.percent).toBe(96);
    expect(result?.identity?.priceIndicator?.level).toBe('Elite');
  });

  it('places a tier-only payload at the bottom of that tier band', () => {
    const result = normalizeDecodeResult({
      identity: { brand: 'B', insight: 'ok', priceIndicator: { level: 'Elite', estimatedPrice: '$1,999' } },
    });
    expect(result?.identity?.priceIndicator?.level).toBe('Elite');
    expect(result?.identity?.priceIndicator?.percent).toBe(76);
  });

  it('records whether the price is a launch MSRP or a street price', () => {
    const msrp = normalizeDecodeResult({
      identity: { brand: 'B', insight: 'ok', priceIndicator: { percent: 90, estimatedPrice: '$1,999', basis: 'msrp' } },
    });
    expect(msrp?.identity?.priceIndicator?.basis).toBe('MSRP');

    const street = normalizeDecodeResult({
      identity: {
        brand: 'B',
        insight: 'ok',
        priceIndicator: { percent: 90, estimatedPrice: '$2,700-$2,800', basis: 'Street price' },
      },
    });
    expect(street?.identity?.priceIndicator?.basis).toBe('Street');
    expect(street?.identity?.priceIndicator?.estimatedPrice).toBe('$2,700-$2,800');
  });

  it('keeps a street observation date and its MSRP anchor', () => {
    const result = normalizeDecodeResult({
      identity: {
        brand: 'B',
        insight: 'ok',
        priceIndicator: {
          percent: 100,
          estimatedPrice: '$6,250',
          basis: 'Street',
          observedOn: '2026-11-01',
          listPrice: '$1,999',
        },
      },
    });
    expect(result?.identity?.priceIndicator?.basis).toBe('Street');
    expect(result?.identity?.priceIndicator?.observedOn).toBe('2026-11-01');
    expect(result?.identity?.priceIndicator?.listPrice).toBe('$1,999');
  });

  it('drops an impossible date and a redundant anchor', () => {
    const result = normalizeDecodeResult({
      identity: {
        brand: 'B',
        insight: 'ok',
        priceIndicator: {
          percent: 50,
          estimatedPrice: '$999',
          basis: 'Street',
          observedOn: '2026-13-45',
          listPrice: '$999',
        },
      },
    });
    expect(result?.identity?.priceIndicator?.observedOn).toBeUndefined();
    expect(result?.identity?.priceIndicator?.listPrice).toBeUndefined();
  });

  it('omits an unrecognised price basis instead of guessing one', () => {
    const result = normalizeDecodeResult({
      identity: { brand: 'B', insight: 'ok', priceIndicator: { percent: 40, estimatedPrice: '$399', basis: 'recommended' } },
    });
    expect(result?.identity?.priceIndicator?.basis).toBeUndefined();
  });

  it('ignores a verification stamp supplied by the model or a stored row', () => {
    const result = normalizeDecodeResult({
      identity: {
        brand: 'NVIDIA',
        insight: 'ok',
        verified: { asOf: '2026-01-01', source: 'claimed by the model' },
      },
    });
    // Verification is derived server-side from the curated datasheet only.
    expect(result?.identity?.verified).toBeUndefined();
  });

  it('still renders a cached price that has no basis field', () => {
    const result = normalizeDecodeResult({
      identity: { brand: 'B', insight: 'ok', priceIndicator: { level: 'Premium', percent: 65, estimatedPrice: '$399' } },
    });
    expect(result?.identity?.priceIndicator).toEqual({ level: 'Premium', percent: 65, estimatedPrice: '$399' });
  });

  it('derives the year from the release window when missing', () => {
    const result = normalizeDecodeResult({
      identity: { brand: 'B', insight: 'ok', releaseWindow: 'Late 2024' },
    });
    expect(result?.identity?.year).toBe('2024');
  });
});

describe('normalizeAmazonLink', () => {
  it('accepts Amazon storefront URLs', () => {
    expect(normalizeAmazonLink('https://www.amazon.com/s?k=sony+a7')).toBe(
      'https://www.amazon.com/s?k=sony+a7',
    );
    expect(normalizeAmazonLink('https://amazon.de/s?k=sony')).toContain('amazon.de');
  });

  it('rejects non-Amazon hosts and non-https schemes', () => {
    expect(normalizeAmazonLink('https://evil.example/s?k=sony')).toBeUndefined();
    expect(normalizeAmazonLink('https://amazon.com.evil.example/s?k=x')).toBeUndefined();
    expect(normalizeAmazonLink('http://www.amazon.com/s?k=sony')).toBeUndefined();
    expect(normalizeAmazonLink('javascript:alert(1)')).toBeUndefined();
    expect(normalizeAmazonLink('')).toBeUndefined();
  });
});

describe('image helpers', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]).toString('base64');
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64');
  const webp = Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('WEBP'),
  ]).toString('base64');

  it('detects image magic bytes', () => {
    expect(detectImageMime(jpeg)).toBe('image/jpeg');
    expect(detectImageMime(png)).toBe('image/png');
    expect(detectImageMime(webp)).toBe('image/webp');
  });

  it('rejects non-image payloads', () => {
    expect(detectImageMime(Buffer.from('this is not an image').toString('base64'))).toBeNull();
    expect(detectImageMime('not base64!!')).toBeNull();
    expect(detectImageMime('')).toBeNull();
  });

  it('validates base64 shape', () => {
    expect(isBase64String('abcd')).toBe(true);
    // Three characters is legal unpadded base64; one leftover character is not.
    expect(isBase64String('abc')).toBe(true);
    expect(isBase64String('a')).toBe(false);
    expect(isBase64String(42)).toBe(false);
  });

  it('estimates decoded size', () => {
    expect(base64SizeBytes(Buffer.alloc(1024).toString('base64'))).toBe(1024);
  });
});
