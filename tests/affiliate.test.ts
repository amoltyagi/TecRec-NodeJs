import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAmazonSearchLink } from '@/lib/affiliate';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildAmazonSearchLink', () => {
  it('builds an encoded search URL from brand and model', () => {
    const link = buildAmazonSearchLink('Sony', 'A7 IV');
    expect(link).toBe('https://www.amazon.com/s?k=Sony+A7+IV');
  });

  it('trims and skips empty parts', () => {
    expect(buildAmazonSearchLink('', ' WGG24401GB ')).toBe('https://www.amazon.com/s?k=WGG24401GB');
  });

  it('returns undefined when there is nothing to search for', () => {
    expect(buildAmazonSearchLink('', '   ')).toBeUndefined();
  });

  it('appends an affiliate tag when configured', () => {
    const link = buildAmazonSearchLink('Bosch', 'WGG24401GB', { affiliateTag: 'tecrec-20' });
    expect(link).toBe('https://www.amazon.com/s?k=Bosch+WGG24401GB&tag=tecrec-20');
  });

  it('escapes characters that would break the query string', () => {
    const link = buildAmazonSearchLink('A&B', 'X=1');
    expect(link).toContain('A%26B+X%3D1');
  });
});
