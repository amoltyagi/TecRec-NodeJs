import { describe, expect, it } from 'vitest';
import { shortHash, toSlug } from '@/lib/slug';

describe('toSlug', () => {
  it('slugifies product names', () => {
    expect(toSlug('Sony A7 IV')).toBe('sony-a7-iv');
    expect(toSlug('Samsung 990 Pro')).toBe('samsung-990-pro');
  });

  it('strips characters that would break a route', () => {
    expect(toSlug('XPS 13/14?')).toBe('xps-13-14');
    expect(toSlug('A#B & C')).toBe('a-b-c');
    expect(toSlug('50% off!')).toBe('50-off');
  });

  it('removes diacritics', () => {
    expect(toSlug('Café Crème')).toBe('cafe-creme');
  });

  it('never returns an empty slug', () => {
    expect(toSlug('')).toBe('product');
    expect(toSlug('///')).toBe('product');
    expect(toSlug('!!!')).toBe('product');
  });

  it('trims dashes and caps length', () => {
    const slug = toSlug(`---${'a'.repeat(200)}---`, 80);
    expect(slug).toHaveLength(80);
    expect(slug.startsWith('-')).toBe(false);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('shortHash', () => {
  it('is deterministic and 8 chars', () => {
    expect(shortHash('RTX 5090')).toBe(shortHash('RTX 5090'));
    expect(shortHash('RTX 5090')).toHaveLength(8);
    expect(shortHash('RTX 5090')).not.toBe(shortHash('RTX-5090'));
  });
});
