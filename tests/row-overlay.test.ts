import { describe, expect, it } from 'vitest';
import { rowToDecodeResult, type ProductRow } from '@/lib/db/neon';

/**
 * The read path is where a wrong figure that was already cached meets the
 * corrected datasheet. This is the regression test for the bug that started
 * this work: a row stored with "600W TGP" and an unlabelled price.
 */
const storedRow = (overrides: Partial<ProductRow> = {}): ProductRow => ({
  id: 'row-1',
  model_number: 'RTX 5090',
  slug: 'nvidia-geforce-rtx-5090',
  brand: 'NVIDIA',
  category: 'Desktop Graphics Card',
  key_specs: ['32 GB GDDR7 VRAM', 'NVIDIA Blackwell Architecture', '21,760 CUDA Cores / 600W TGP'],
  insight: 'Stored verdict that repeats the wrong figure.',
  price_indicator: { level: 'Elite', percent: 100, estimatedPrice: '$1,999' },
  release_window: 'January 2025',
  year: '2025',
  amazon_link: null,
  alternatives: [{ brand: 'NVIDIA', model: 'GeForce RTX 5080', why: 'stored text' }],
  search_count: 4,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('rowToDecodeResult', () => {
  it('corrects a stale verified-product row on read instead of serving it', () => {
    const result = rowToDecodeResult(storedRow());

    expect(result?.identity?.keySpecs.join(' ')).not.toMatch(/600\s?W/i);
    expect(result?.identity?.keySpecs.join(' ')).toMatch(/575 W TGP \(reference design\)/);
    expect(result?.identity?.insight).not.toMatch(/wrong figure/);
    expect(result?.identity?.priceIndicator?.basis).toBe('Street');
    expect(result?.identity?.priceIndicator?.estimatedPrice).toBe('$6,250');
    expect(result?.identity?.priceIndicator?.listPrice).toBe('$1,999');
    expect(result?.identity?.verified?.source).toBe('Manufacturer spec page');
    expect(result?.alternatives?.[0]?.why).not.toBe('stored text');
  });

  it('leaves rows for uncovered products as stored, without a verification stamp', () => {
    const result = rowToDecodeResult(
      storedRow({ model_number: 'RTX 5060', slug: 'nvidia-geforce-rtx-5060', brand: 'NVIDIA' }),
    );

    expect(result?.identity?.verified).toBeUndefined();
    expect(result?.identity?.keySpecs[2]).toMatch(/600W TGP/);
  });

  it('drops rows that cannot be normalized at all', () => {
    expect(rowToDecodeResult(storedRow({ brand: '' }))).toBeNull();
  });
});
